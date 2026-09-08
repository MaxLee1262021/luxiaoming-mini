const { callCloud } = require('./client')
const { getBookingData } = require('./spot')
const { isExplicitDemoMode } = require('../config/env')

async function createBooking(params = {}) {
  try {
    return await callCloud('createBooking', params)
  } catch (err) {
    if (isExplicitDemoMode()) {
      console.warn('[booking] explicit demo mode: createBooking is not persisted')
      return { success: true, orderNo: '', orderId: 'local-demo', demo: true }
    }
    throw err
  }
}

module.exports = {
  getBookingData,
  createBooking
}
