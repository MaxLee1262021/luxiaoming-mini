const { getBookingData } = require('./spot')

function getPackageBaseData(params = {}) {
  return getBookingData(params)
}

module.exports = {
  getPackageBaseData
}
