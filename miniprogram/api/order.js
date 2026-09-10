const { callCloud } = require('./client')

function getMyOrders(params = {}) {
  return callCloud('getMyOrders', params)
}

function getOrderDetail(params = {}) {
  return callCloud('getOrderDetail', params)
}

function getOrderStatusCount(params = {}) {
  return callCloud('getOrderStatusCount', params)
}

function createPayment(params = {}) {
  return callCloud('createPayment', params)
}

function getPaymentStatus(params = {}) {
  return callCloud('getPaymentStatus', params)
}

module.exports = {
  getMyOrders,
  getOrderDetail,
  getOrderStatusCount,
  createPayment,
  getPaymentStatus
}
