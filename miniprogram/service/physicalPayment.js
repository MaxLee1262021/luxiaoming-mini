const api = require('../api/physical')
async function requestPayment(params) {
  const p = params || {}
  if (!p.timeStamp || !p.nonceStr || !p.package || !p.paySign) return Promise.reject(new Error('支付参数不完整，请重试'))
  await require('./merchantShare').ensureScanSynced()
  return new Promise((resolve, reject) => wx.requestPayment({ timeStamp: String(p.timeStamp), nonceStr: p.nonceStr, package: p.package, signType: p.signType || 'RSA', paySign: p.paySign, success: resolve, fail: reject }))
}
function confirmed(result) { return !!result && (result.status === 'confirmed' || result.paymentStatus === 'paid' || result.paymentStatus === 'confirmed') }
async function payPhysicalOrder(orderId) {
  const payment = await api.createPhysicalPayment({ orderId })
  if (confirmed(payment)) return { status: 'confirmed', payment }
  let cancelled = false
  try { await requestPayment(payment.paymentParams || payment.payParams || payment.params) }
  catch (error) {
    cancelled = /cancel/i.test(String(error && (error.errMsg || error.message) || ''))
    if (!cancelled) {
      // Even a client error can follow an actual charge. Query before surfacing it.
      try { const result = await api.getPhysicalPaymentStatus({ orderId }); if (confirmed(result)) return { status: 'confirmed', payment: result } } catch (_) {}
      throw new Error(error.message || error.errMsg || '支付未完成，请查询订单支付结果')
    }
  }
  const result = await api.getPhysicalPaymentStatus({ orderId })
  return { status: confirmed(result) ? 'confirmed' : cancelled ? 'cancelled' : 'pending', payment: result }
}
module.exports = { payPhysicalOrder, requestPayment, confirmed }
