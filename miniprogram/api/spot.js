const { callCloud } = require('./client')

function getSpots(params = {}) {
  return callCloud('getSpots', params)
}

function getBookingData(params = {}) {
  return callCloud('getBookingData', params)
}

module.exports = {
  getSpots,
  getBookingData
}
