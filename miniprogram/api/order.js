const { callCloud } = require('./client')

function getMyOrders(params = {}) {
  return callCloud('getMyOrders', params)
}

function getOrderDetail(params = {}) {
  return callCloud('getOrderDetail', params)
}

function updateOrderStatus(params = {}) {
  return callCloud('updateOrderStatus', params)
}

function getOrderStatusCount(params = {}) {
  return callCloud('getOrderStatusCount', params)
}

function submitAfterSale(params = {}) {
  return callCloud('submitAfterSale', params)
}

module.exports = {
  getMyOrders,
  getOrderDetail,
  updateOrderStatus,
  getOrderStatusCount,
  submitAfterSale
}
