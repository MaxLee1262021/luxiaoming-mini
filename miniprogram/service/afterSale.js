function normalizeReason(value = '') {
  return String(value || '').trim()
}

function validateAfterSaleReason(value = '') {
  const reason = normalizeReason(value)
  if (!reason) {
    return { valid: false, message: '请填写售后原因' }
  }
  if (reason.length < 5) {
    return { valid: false, message: '售后原因至少填写 5 个字' }
  }
  return { valid: true, reason }
}

function buildAfterSalePayload(order = {}, reason = '') {
  return {
    orderId: order._id || order.id || '',
    orderNo: order.orderNo || '',
    packageName: order.packageName || '',
    reason: normalizeReason(reason)
  }
}

module.exports = {
  validateAfterSaleReason,
  buildAfterSalePayload
}
