const { callCloud } = require('./client')

function bindPhone(data = {}) {
  return callCloud('bindPhone', data)
}

module.exports = {
  bindPhone
}
