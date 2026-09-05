const userApi = require('../api/user')

const USER_KEY = 'lxm_user_profile'

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
  return !!(user.openid || user._openid || user.phone)
}

function hasBoundPhone() {
  return !!getUser().phone
}

function getBoundPhone() {
  return getUser().phone || ''
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

module.exports = {
  bindPhoneByCode,
  getBoundPhone,
  getDisplayUserInfo,
  getUser,
  hasBoundPhone,
  isAuthed,
  saveUser
}
