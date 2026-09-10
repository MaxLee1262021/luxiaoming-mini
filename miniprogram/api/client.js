// 网络传输层：小程序所有后台请求统一走这里。
// 通过 wx.request 请求自托管后台的 POST /api/rpc/{name}（后台地址见 config/env.js）。
// openid：由 login() 获取（wx.login 换取，开发期用本地匿名 openid），
//         之后每次请求自动注入请求体，后台据此判定订单归属与权限。
const { API_BASE } = require('../config/env')

let _openid = ''
let _token = ''
let _loginPromise = null

// Browsing content is intentionally public on the server. Requiring a WeChat
// session before these calls makes the storefront silently fall back to demo
// data whenever login is not configured, even though the package catalog is
// available. Stateful customer operations remain outside this allowlist.
const PUBLIC_BROWSING_RPCS = new Set([
  'getHomeData', 'getSpots', 'getBookingData', 'getSeriesList',
  'getSeriesDetail', 'getPhotoCollection', 'getPeripherals', 'getGuides',
  'listGuides', 'getGuide', 'resolveMerchantCode', 'getCities',
  'getPrivacyPolicy', 'getSearchConfig', 'getBookingConfig',
  'getFootprintConfig', 'getCorpConfig', 'getVideoSingles'
])

function getOpenid() { return _openid }

function clearSession() {
  _openid = ''
  _token = ''
  try {
    wx.removeStorageSync('lxm_openid')
    wx.removeStorageSync('lxm_public_token')
  } catch (e) {}
}

// 确保已登录（返回 openid）。同一会话只登录一次，并发请求复用同一个 Promise。
function ensureLogin() {
  if (_openid) return Promise.resolve(_openid)
  if (_loginPromise) return _loginPromise
  _loginPromise = doLogin()
    .then((oid) => { _openid = oid; return oid })
    .catch((e) => { _loginPromise = null; throw e })
  return _loginPromise
}

// 小程序启动登录：优先用本地缓存的 openid；否则 wx.login 换（生产）或生成本地匿名 openid（开发期）。
function doLogin() {
  const cached = wx.getStorageSync('lxm_openid')
  const cachedToken = wx.getStorageSync('lxm_public_token')
  if (cached && cachedToken) {
    _openid = cached
    _token = cachedToken
    return Promise.resolve(cached)
  }
  if (cached || cachedToken) clearSession()
  return new Promise((resolve, reject) => {
    wx.login({
      success: async (res) => {
        try {
          const devOpenid = 'dev_' + Math.random().toString(36).slice(2, 14)
          const r = await callRaw('login', { code: res.code, openid: devOpenid })
          const oid = (r && r.openid) || devOpenid
          const token = r && (r.token || r.userToken)
          if (!token) throw new Error('公共会话令牌获取失败')
          _openid = oid
          _token = token
          wx.setStorageSync('lxm_openid', oid)
          wx.setStorageSync('lxm_public_token', token)
          resolve(oid)
        } catch (e) { reject(e) }
      },
      fail: (err) => reject(new Error((err && err.errMsg) || 'wx.login 失败'))
    })
  })
}

// 原始请求：POST /api/rpc/{name}，请求体 { data, openid }。
function callRaw(name, data, { clearOnUnauthorized = true } = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}/rpc/${name}`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        ...(_token ? { Authorization: `Bearer ${_token}` } : {})
      },
      data: { data: data || {}, openid: _openid },
      success: (res) => {
        const result = res.data
        if (res.statusCode && res.statusCode >= 400) {
          if (res.statusCode === 401 && clearOnUnauthorized) clearSession()
          return reject(new Error((result && (result.error || result.message)) || ('服务器错误 ' + res.statusCode)))
        }
        if (result && result.success === false) {
          return reject(new Error(result.message || result.error || (name + ' 请求失败')))
        }
        resolve(result)
      },
      fail: (err) => reject(new Error((err && err.errMsg) || '网络请求失败'))
    })
  })
}

// 对外统一接口：callCloud(name, data)
//   内部会先确保已登录，再请求后台 POST /api/rpc/{name}；
//   成功返回结果对象（含 success/data 等）；
//   服务器返回 success===false 时 reject，调用方 catch 即可拿到 message。
async function callCloud(name, data = {}) {
  const isPublicBrowse = PUBLIC_BROWSING_RPCS.has(name)
  if (!isPublicBrowse) await ensureLogin()
  return await callRaw(name, data, { clearOnUnauthorized: !isPublicBrowse })
}

// 主动登录（app onLaunch 调一次即可，后续请求自动复用 openid）。
function login() { return ensureLogin() }

module.exports = { callCloud, login, getOpenid, PUBLIC_BROWSING_RPCS }
