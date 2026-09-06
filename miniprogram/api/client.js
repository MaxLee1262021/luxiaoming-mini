// 网络传输层：小程序所有后台请求统一走这里。
// 通过 wx.request 请求自托管后台的 POST /api/rpc/{name}（后台地址见 config/env.js）。
// openid：由 login() 获取（wx.login 换取，开发期用本地匿名 openid），
//         之后每次请求自动注入请求体，后台据此判定订单归属与权限。
const { API_BASE } = require('../config/env')

let _openid = ''
let _userToken = ''
let _loginPromise = null
const OPENID_KEY = 'lxm_openid'
const TOKEN_KEY = 'lxm_user_token'

function getOpenid() { return _openid }
function getToken() { return _userToken }

function clearSession() {
  _openid = ''
  _userToken = ''
  _loginPromise = null
  try {
    wx.removeStorageSync(OPENID_KEY)
    wx.removeStorageSync(TOKEN_KEY)
  } catch (e) {}
}

// 确保已登录（返回 openid）。同一会话只登录一次，并发请求复用同一个 Promise。
function ensureLogin(force = false) {
  if (!force && _openid && _userToken) return Promise.resolve(_openid)
  if (_loginPromise) return _loginPromise
  _loginPromise = doLogin(force)
    .then((oid) => { _openid = oid; return oid })
    .catch((e) => { _loginPromise = null; throw e })
  return _loginPromise
}

// 小程序启动登录：会话令牌和 openid 成对缓存；服务端令牌是订单访问的唯一身份凭据。
function doLogin(force = false) {
  if (!force) {
    const cachedToken = wx.getStorageSync(TOKEN_KEY)
    const cachedOpenid = wx.getStorageSync(OPENID_KEY)
    if (cachedToken && cachedOpenid) {
      _userToken = String(cachedToken)
      return Promise.resolve(String(cachedOpenid))
    }
  }
  return new Promise((resolve, reject) => {
    wx.login({
      success: async (res) => {
        try {
          const devOpenid = 'dev_' + Math.random().toString(36).slice(2, 14)
          const r = await callRaw('login', { code: res.code, openid: devOpenid }, { skipAuth: true })
          if (!r || r.success === false || !(r.openid || (r.user && r.user.openid))) {
            throw new Error((r && (r.error || r.message)) || '微信登录失败')
          }
          const oid = String(r.openid || (r.user && r.user.openid))
          const token = String(r.token || r.userToken || '')
          if (!token) throw new Error('登录服务未返回会话令牌')
          _userToken = token
          wx.setStorageSync(OPENID_KEY, oid)
          wx.setStorageSync(TOKEN_KEY, token)
          resolve(oid)
        } catch (e) { reject(e) }
      },
      fail: (err) => reject(new Error((err && err.errMsg) || 'wx.login 失败'))
    })
  })
}

// 原始请求：POST /api/rpc/{name}。身份只通过 Authorization Bearer 传递；
// 不再把可伪造的裸 openid 放进请求体。
function callRaw(name, data, options = {}) {
  return new Promise((resolve, reject) => {
    const header = { 'Content-Type': 'application/json' }
    if (_userToken && !options.skipAuth) header.Authorization = `Bearer ${_userToken}`
    wx.request({
      url: `${API_BASE}/rpc/${name}`,
      method: 'POST',
      header,
      data: { data: data || {} },
      success: (res) => {
        const result = res.data
        if (res.statusCode && res.statusCode >= 400) {
          const error = new Error((result && (result.error || result.message)) || ('服务器错误 ' + res.statusCode))
          error.status = res.statusCode
          if (res.statusCode === 401) clearSession()
          return reject(error)
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
  await ensureLogin()
  try {
    return await callRaw(name, data)
  } catch (err) {
    // 令牌过期时只重登一次，避免并发请求形成无限重试；登录失败原样交给页面处理。
    if (err && err.status === 401 && name !== 'login') {
      await ensureLogin(true)
      return await callRaw(name, data)
    }
    throw err
  }
}

// 主动登录（app onLaunch 调一次即可，后续请求自动复用 openid）。
function login() { return ensureLogin() }

module.exports = { callCloud, login, getOpenid, getToken, clearSession }
