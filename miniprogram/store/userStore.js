const userApi = require('../api/user')

const USER_KEY = 'lxm_user_profile'
let profileSyncPromise = null

function getUser() {
  return wx.getStorageSync(USER_KEY) || {}
}

function saveUser(user = {}) {
  const nextUser = { ...getUser(), ...user }
  wx.setStorageSync(USER_KEY, nextUser)
  wx.setStorageSync('userInfo', nextUser.userInfo || nextUser)
  return nextUser
}

function isAuthed() {
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
  const user = getUser()
  return user.userInfo || user
}

async function bindPhoneByCode(code, extra = {}) {
  const res = await userApi.bindPhone({ code, ...extra })
  const data = (res && res.data) || res || {}
  return saveUser({
    ...data,
    phone: data.phone || extra.phone || '',
    userInfo: extra.userInfo || data.userInfo || getDisplayUserInfo()
  })
}

function syncUserProfile() {
  if (profileSyncPromise) return profileSyncPromise
  profileSyncPromise = userApi.getMyProfile()
    .then((res) => {
      const data = (res && res.data) || res || {}
      if (!data.openid) return getUser()
      return saveUser({
        openid: data.openid,
        phone: data.phone || getBoundPhone(),
        userInfo: data.userInfo || getDisplayUserInfo()
      })
    })
    .finally(() => { profileSyncPromise = null })
  return profileSyncPromise
}

module.exports = {
  bindPhoneByCode,
  getBoundPhone,
  getLastContactPhone,
  getDisplayUserInfo,
  getUser,
  hasBoundPhone,
  isAuthed,
  saveUser,
  syncUserProfile
}
