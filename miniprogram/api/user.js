const { callCloud } = require('./client')

function bindPhone(data = {}) {
  return callCloud('bindPhone', data)
}

function getMyProfile() {
  return callCloud('getMyProfile')
}

function updateMyProfile(data) { return callCloud('updateMyProfile', data) }

module.exports = {
  bindPhone,
  getMyProfile,
  updateMyProfile
}
