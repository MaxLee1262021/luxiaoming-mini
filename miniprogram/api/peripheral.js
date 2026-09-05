const { callCloud } = require('./client')

function getPeripherals(params = {}) {
  return callCloud('getPeripherals', params)
}

module.exports = {
  getPeripherals
}
