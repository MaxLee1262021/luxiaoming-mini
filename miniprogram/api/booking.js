const { callCloud } = require('./client')
const { getBookingData } = require('./spot')

// A successful booking must be a persisted server-side order. Do not turn a
// transport failure into a local order, even in preview builds.
function createBooking(params = {}) {
  return callCloud('createBooking', params)
}

module.exports = {
  getBookingData,
  createBooking
}
