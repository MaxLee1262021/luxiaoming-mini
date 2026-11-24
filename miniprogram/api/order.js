const { callCloud } = require('./client')

function requireRealPayment(result) {
  const payment = result && (result.data || result)
  if (payment && (payment.simulatedPayment || /mock|test/i.test(String(payment.provider || payment.paymentMode || '')))) throw new Error('支付通道不可用，请联系客服')
  return result
}

function getMyOrders(params = {}) {
  return callCloud('getMyOrders', params)
}

function getOrderDetail(params = {}) {
  return callCloud('getOrderDetail', params)
}

function getOrderStatusCount(params = {}) {
  return callCloud('getOrderStatusCount', params)
}

function confirmOrderArrival(params = {}) {
  return callCloud('confirmOrderArrival', params)
}

async function createPayment(params = {}) {
  await require('../service/merchantShare').ensureScanSynced()
  return callCloud('createPayment', params).then(requireRealPayment)
}

function getPaymentStatus(params = {}) {
  return callCloud('getPaymentStatus', params).then(requireRealPayment)
}

function cancelOrder(params = {}) { return callCloud('cancelOrder', params) }
function requestOrderRefund(params = {}) { return callCloud('requestOrderRefund', params) }
function requestOrderReschedule(params = {}) { return callCloud('requestOrderReschedule', params) }
function submitAfterSale(params) { return callCloud('submitAfterSale', params) }
function getMyAfterSales(params) { return callCloud('getMyAfterSales', params) }

module.exports = {
  getMyOrders,
  getOrderDetail,
  getOrderStatusCount,
  confirmOrderArrival,
  createPayment,
  getPaymentStatus,
  cancelOrder,
  requestOrderRefund,
  requestOrderReschedule,
  submitAfterSale,
  getMyAfterSales
}
