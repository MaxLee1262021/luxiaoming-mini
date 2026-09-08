function normalizeCustomerStatus(status = '') {
  if (!status) return 'pending'
  // 历史云库数据可能混用英式 cancelled，统一收敛为美式 canceled，消除双拼写隐患
  if (status === 'cancelled') return 'canceled'
  if (status === 'delivered') return 'completed'
  if (status === 'paid') return 'paid'
  return status
}

function getOrderStatusText(status = '') {
  const normalized = normalizeCustomerStatus(status)
  const map = {
    pending: '待确认',
    new: '待确认',
    contacted: '待确认',
    deposit_pending: '待付定金',
    confirmed: '已确认',
    deposit_paid: '已确认',
    assigned: '已接单',
    shooting: '拍摄中',
    editing: '修片中',
    final_pending: '修片中',
    awaiting_final_payment: '待付尾款',
    paid: '已支付待交付',
    delivered: '已交付',
    completed: '已完成',
    canceled: '已取消',
    cancelled: '已取消'
  }
  return map[normalized] || '预约处理中'
}

function getOrderStatusDesc(status = '') {
  const normalized = normalizeCustomerStatus(status)
  const map = {
    pending: '预约已提交，客服会尽快与你确认档期、路线和拍摄需求。',
    new: '预约已提交，客服会尽快与你确认档期、路线和拍摄需求。',
    contacted: '客服正在与你确认预约信息，请留意微信或电话。',
    deposit_pending: '请按客服指引完成定金支付，支付后将锁定拍摄档期。',
    confirmed: '预约已确认，请按约定时间到达拍摄地点。',
    deposit_paid: '预约已确认，请按约定时间到达拍摄地点。',
    assigned: '摄影师已安排，请留意客服通知。',
    shooting: '订单正在拍摄中，祝你拥有一组好看的长沙旅行封面。',
    editing: '成片正在后期处理中，请耐心等待交付。',
    final_pending: '成片正在做最终确认，请耐心等待交付。',
    awaiting_final_payment: '线下选片已确认，请按客服指引支付尾款。',
    paid: '尾款已确认到账，等待照片交付。',
    delivered: '照片已交付，请查看交付记录或联系客服。',
    completed: '订单已完成，感谢选择鹿小鸣城市旅拍。',
    canceled: '订单已取消，如有退款或售后问题请联系客服。',
    cancelled: '订单已取消，如有退款或售后问题请联系客服。'
  }
  return map[normalized] || '订单正在处理中。'
}

function getOrderStatusIndex(status = '') {
  const normalized = normalizeCustomerStatus(status)
  if (['pending', 'new', 'contacted', 'deposit_pending'].includes(normalized)) return 0
  if (['confirmed', 'deposit_paid', 'assigned'].includes(normalized)) return 1
  if (normalized === 'shooting') return 2
  if (['editing', 'final_pending', 'awaiting_final_payment'].includes(normalized)) return 3
  if (['paid', 'completed'].includes(normalized)) return 4
  if (['canceled', 'cancelled'].includes(normalized)) return 0
  return 0
}

function canCancelOrder(status = '') {
  // 首期取消只能由授权后台人员处理，小程序不提供自助入口。
  return false
}

function canApplyAfterSale(status = '') {
  // 首期不开放游客售后，异常由客服后台登记处理。
  return false
}

function normalizeOrder(order = {}) {
  const items = order.productItems || order.items || []
  const firstItem = items[0] || {}
  const status = normalizeCustomerStatus(order.status || 'pending')
  const isAfterSale = order.afterSaleStatus === 'pending' || order.afterSaleStatus === 'processing'
  const statusText = isAfterSale ? '售后中' : (order.customerStatus || order.statusText || getOrderStatusText(status))
  return {
    ...order,
    status,
    statusText,
    customerStatus: statusText,
    statusIndex: getOrderStatusIndex(status),
    bookingMode: order.bookingMode || 'consult',
    isAfterSale,
    canCancel: isAfterSale ? false : canCancelOrder(status),
    canAfterSale: isAfterSale ? false : canApplyAfterSale(status),
    packageName: order.packageName || firstItem.packageName || firstItem.albumName || '预约项目',
    packagePrice: order.packagePrice || order.totalPrice || order.price || firstItem.price || 0,
    spotName: order.spotName || firstItem.spotName || '',
    seriesName: order.seriesName || firstItem.seriesName || '',
    date: order.date || order.bookingDate || '',
    timePeriod: order.timePeriod || order.time || order.bookingTime || '',
    type: order.type || firstItem.type || 'photo',
    contactName: order.contactName || order.name || '',
    contactPhone: order.contactPhone || order.phone || '',
    contactWechat: order.contactWechat || order.wechat || '',
    message: order.message || order.remark || '',
    deliverFiles: order.deliverFiles || order.photos || []
  }
}

module.exports = {
  normalizeCustomerStatus,
  getOrderStatusText,
  getOrderStatusDesc,
  getOrderStatusIndex,
  canCancelOrder,
  canApplyAfterSale,
  normalizeOrder
}
