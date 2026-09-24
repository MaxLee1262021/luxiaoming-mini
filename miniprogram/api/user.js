const { callCloud } = require('./client')

function bindPhone(data = {}) {
  return callCloud('bindPhone', data)
}

function getMyProfile() {
  return callCloud('getMyProfile')
}

module.exports = {
  bindPhone,
  getMyProfile
}
