const userApi = require('../api/user')
const { isLoggedOut, clearLogoutMarker } = require('../api/client')

const USER_KEY = 'lxm_user_profile_live_v2'
let profileSyncPromise = null
let userStateVersion = 0

function getUser() {
  if (isLoggedOut()) return {}
  return wx.getStorageSync(USER_KEY) || {}
}

function saveUser(user = {}) {
  const nextUser = { ...getUser(), ...user }
  // The mini program uses a fixed brand avatar/name. Do not persist or
  // rehydrate legacy WeChat profile fields from older sessions.
  delete nextUser.userInfo
  delete nextUser.avatarFileId
  delete nextUser.avatarUrl
  wx.setStorageSync(USER_KEY, nextUser)
  wx.setStorageSync('userInfo', nextUser)
  return nextUser
}

function isAuthed() {
  if (isLoggedOut()) return false
  const user = getUser()
  let hasToken = false
  try { hasToken = !!wx.getStorageSync('lxm_public_token') } catch (e) {}
  return !!(user.openid || user._openid || user.phone || hasToken)
}

function hasBoundPhone() {
  return !!getUser().phone
}

function getBoundPhone() {
  return getUser().phone || ''
}

function getLastContactPhone() {
  return getUser().lastContactPhone || ''
}

function getDisplayUserInfo() {
  return {}
}

async function bindPhoneByCode(code, extra = {}) {
  const requestVersion = userStateVersion
  const res = await userApi.bindPhone({ code, ...extra })
  // A logout that happened while WeChat was returning the authorization code
  // wins over this stale response and must not restore the profile.
  if (requestVersion !== userStateVersion) return {}
  if (!res || res.success !== true || !res.data || typeof res.data !== 'object') throw new Error('手机号绑定未被服务端确认，请重试')
  const data = res.data
  clearLogoutMarker()
  return saveUser({
    ...data,
    phone: data.phone || ''
  })
}

function syncUserProfile() {
  if (isLoggedOut()) return Promise.resolve({})
  if (profileSyncPromise) return profileSyncPromise
  const requestVersion = userStateVersion
  const sync = userApi.getMyProfile()
    .then((res) => {
      if (requestVersion !== userStateVersion || isLoggedOut()) return {}
      if (!res || res.success !== true || !res.data || typeof res.data !== 'object') throw new Error('用户资料加载失败，请重试')
      const data = res.data
      if (!data.openid) throw new Error('用户资料未被服务端确认，请重试')
      return saveUser({
        openid: data.openid,
        phone: data.phone || ''
      })
    })
  profileSyncPromise = sync
  sync.then(
    () => { if (profileSyncPromise === sync) profileSyncPromise = null },
    () => { if (profileSyncPromise === sync) profileSyncPromise = null }
  )
  return sync
}

function clearUser() {
  userStateVersion += 1
  profileSyncPromise = null
  try {
    wx.removeStorageSync(USER_KEY)
    wx.removeStorageSync('userInfo')
  } catch (e) {}
}

module.exports = {
  bindPhoneByCode,
  getBoundPhone,
  getLastContactPhone,
  getDisplayUserInfo,
  getUser,
  hasBoundPhone,
  isAuthed,
  isLoggedOut,
  saveUser,
  clearUser,
  syncUserProfile
}
