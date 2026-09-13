function normalizeCustomerStatus(status = '') {
  if (!status) return 'pending'
  // 历史云库数据可能混用英式 cancelled，统一收敛为美式 canceled，消除双拼写隐患
  if (status === 'cancelled') return 'canceled'
  if (status === 'paid') return 'paid'
  return status
}

const WORKFLOW_STAGES = {
  AWAITING_DEPOSIT: 'awaiting_deposit',
  AWAITING_DISPATCH: 'awaiting_dispatch',
  AWAITING_SHOOT: 'awaiting_shoot',
  SHOOTING: 'shooting',
  SELECTION_PENDING: 'selection_pending',
  AWAITING_FINAL_PAYMENT: 'awaiting_final_payment',
  PAID: 'paid',
  DELIVERED: 'delivered',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
}

function moneyValue(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.round((number + Number.EPSILON) * 100) / 100 : 0
}

function orderTotal(order = {}) {
  return moneyValue(order.totalAmount !== undefined ? order.totalAmount : (order.totalPrice !== undefined ? order.totalPrice : order.price))
}

function paymentStatus(value) {
  const text = String(value || '').trim().toLowerCase()
  if (['confirmed', 'paid', 'success', 'succeeded', 'approved', 'passed', '已审', '已审核', '已通过', '已到账', '到账', '财务已核对', '财务已核对到账'].includes(text)) return 'confirmed'
  if (['failed', 'rejected', 'denied', 'refunded', '已驳', '已驳回', '失败', '已退款'].includes(text)) return 'failed'
  if (['pending', 'processing', '待审', '待审核', '待确认', '待支付', '支付中'].includes(text)) return 'pending'
  return text || 'pending'
}

function paymentConfirmed(order = {}, phase = 'deposit') {
  const due = phase === 'deposit' ? depositDue(order) : finalDue(order)
  if (due <= 0) return phase === 'deposit' || order.selectionStatus === 'confirmed' || !!order.selectionConfirmedAt
  const field = phase === 'deposit' ? 'depositPaid' : 'finalPaid'
  const statusField = phase === 'deposit' ? 'depositFinanceStatus' : 'finalFinanceStatus'
  if (moneyValue(order[field]) >= due && paymentStatus(order[statusField]) === 'confirmed') return true
  return (Array.isArray(order.paymentRecords) ? order.paymentRecords : []).some(record =>
    String(record && record.phase || '') === phase && paymentStatus(record.status) === 'confirmed' && moneyValue(record.amount) >= due)
}

function depositDue(order = {}) {
  if (order.depositDue !== undefined && order.depositDue !== null && order.depositDue !== '') return moneyValue(order.depositDue)
  const ratioRaw = order.depositRatio !== undefined ? order.depositRatio : (order.depositRate !== undefined ? order.depositRate : (order.packageSnapshot && order.packageSnapshot.depositRatio))
  const ratio = Number(ratioRaw)
  if (!Number.isFinite(ratio) || ratio < 0) return 0
  return moneyValue(orderTotal(order) * (ratio > 1 ? ratio / 100 : ratio))
}

function finalDue(order = {}) {
  if (order.finalDue !== undefined && order.finalDue !== null && order.finalDue !== '') return moneyValue(order.finalDue)
  const hasDepositSnapshot = order.depositDue !== undefined || order.depositAmount !== undefined
  const deposit = hasDepositSnapshot ? moneyValue(order.depositDue !== undefined ? order.depositDue : order.depositAmount) : moneyValue(order.depositPaid)
  return moneyValue(Math.max(orderTotal(order) - deposit - moneyValue(order.finalDiscountAmount), 0))
}

function deriveWorkflowStage(order = {}) {
  const status = String(order.status || '').trim().toLowerCase()
  if (['canceled', 'cancelled', 'terminated', 'deleted', '已取消', '已中止'].includes(status) || order.deleted || order.isDeleted) return WORKFLOW_STAGES.CANCELLED
  if (['completed', 'done', '已完成', '已完'].includes(status) || order.completedAt) return WORKFLOW_STAGES.COMPLETED
  if (['delivered', '已交付'].includes(status) || order.deliveryRecord || order.deliveredAt) {
    return finalDue(order) > 0 && !paymentConfirmed(order, 'final')
      ? WORKFLOW_STAGES.AWAITING_FINAL_PAYMENT
      : WORKFLOW_STAGES.DELIVERED
  }
  const selectionConfirmed = String(order.selectionStatus || '').toLowerCase() === 'confirmed' || !!order.selectionConfirmedAt
  if (selectionConfirmed && paymentConfirmed(order, 'final')) return WORKFLOW_STAGES.PAID
  if (selectionConfirmed || status === 'final_pending' || status === 'awaiting_final_payment') return WORKFLOW_STAGES.AWAITING_FINAL_PAYMENT
  if (order.shootingCompletedAt || ['editing', 'retouching'].includes(status)) return WORKFLOW_STAGES.SELECTION_PENDING
  if (status === 'shooting' || order.shootingStartedAt) return WORKFLOW_STAGES.SHOOTING
  if (order.dispatchRecord || order.dispatchStatus === 'assigned' || order.photographerId || status === 'assigned') return WORKFLOW_STAGES.AWAITING_SHOOT
  if (paymentConfirmed(order, 'deposit') || depositDue(order) <= 0 || status === 'deposit_paid') return WORKFLOW_STAGES.AWAITING_DISPATCH
  return WORKFLOW_STAGES.AWAITING_DEPOSIT
}

function stageStatusText(stage) {
  return {
    awaiting_deposit: '待支付订金',
    awaiting_dispatch: '待安排摄影师',
    awaiting_shoot: '已安排待拍摄',
    shooting: '拍摄中',
    selection_pending: '待线下选片确认',
    awaiting_final_payment: '待支付尾款',
    paid: '已支付待交付',
    delivered: '已交付',
    completed: '已完成',
    cancelled: '已取消'
  }[stage] || '处理中'
}

function getOrderStatusText(status = '') {
  if (Object.values(WORKFLOW_STAGES).includes(status)) return stageStatusText(status)
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
    delivered: '已交付待确认',
    completed: '已完成',
    canceled: '已取消',
    cancelled: '已取消'
  }
  return map[normalized] || '预约处理中'
}

function getOrderStatusDesc(status = '') {
  if (Object.values(WORKFLOW_STAGES).includes(status)) {
    const stageDesc = {
      awaiting_deposit: '订单已生成，请先生成支付单；当前版本不会唤起微信支付，支付到账由客服/财务确认。',
      awaiting_dispatch: '定金已确认，客服正在安排摄影师并确认拍摄信息。',
      awaiting_shoot: '摄影师已安排，请按客服确认的时间和地点到达。',
      shooting: '订单正在拍摄中，成片完成后会进入选片确认。',
      selection_pending: '拍摄已完成，等待线下选片确认后开放尾款。',
      awaiting_final_payment: '选片已确认，请生成尾款支付单；到账以客服/财务核对结果为准。',
      paid: '尾款已确认到账，等待团队完成交付。',
      delivered: '成片已交付，感谢选择鹿小鸣城市旅拍。',
      completed: '订单已完成，感谢选择鹿小鸣城市旅拍。',
      cancelled: '订单已取消，如有疑问请联系客服。'
    }
    return stageDesc[status] || '订单正在处理中。'
  }
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
  const stageIndex = {
    awaiting_deposit: 0,
    awaiting_dispatch: 1,
    awaiting_shoot: 1,
    shooting: 2,
    selection_pending: 3,
    awaiting_final_payment: 4,
    paid: 4,
    delivered: 5,
    completed: 5,
    cancelled: 0
  }
  if (Object.prototype.hasOwnProperty.call(stageIndex, status)) return stageIndex[status]
  const normalized = normalizeCustomerStatus(status)
  if (['pending', 'new', 'contacted', 'deposit_pending'].includes(normalized)) return 0
  if (['confirmed', 'deposit_paid', 'assigned'].includes(normalized)) return 1
  if (normalized === 'shooting') return 2
  if (['editing', 'retouching'].includes(normalized)) return 3
  if (['final_pending', 'awaiting_final_payment', 'paid'].includes(normalized)) return 4
  if (['delivered', 'completed'].includes(normalized)) return 5
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
  const items = Array.isArray(order.productItems) ? order.productItems : (Array.isArray(order.items) ? order.items : (Array.isArray(order.products) ? order.products : []))
  const firstItem = items[0] || {}
  const status = normalizeCustomerStatus(order.status || 'pending')
  const workflowStage = order.workflowStage || deriveWorkflowStage(order)
  const afterSaleValue = String(order.afterSaleStatus || '').trim().toLowerCase()
  const isAfterSale = ['pending', 'processing', '待处理', '处理中', '待处', '处理'].includes(afterSaleValue)
  const statusText = isAfterSale ? '售后中' : stageStatusText(workflowStage)
  const total = orderTotal(order)
  const deposit = moneyValue(order.depositPaid)
  const final = moneyValue(order.finalPaid)
  const depositAmount = depositDue(order)
  const finalAmount = finalDue(order)
  const records = Array.isArray(order.paymentRecords) ? order.paymentRecords : []
  const providedPhase = order.paymentPhase === 'deposit' || order.paymentPhase === 'final'
    ? order.paymentPhase
    : (order.paymentStage === 'deposit' || order.paymentStage === 'final' ? order.paymentStage : '')
  const currentPhase = providedPhase || (workflowStage === WORKFLOW_STAGES.AWAITING_DEPOSIT
    ? 'deposit'
    : (workflowStage === WORKFLOW_STAGES.AWAITING_FINAL_PAYMENT ? 'final' : ''))
  const latestPayment = currentPhase ? records.filter(record => String(record && record.phase || '') === currentPhase).slice(-1)[0] : null
  const serverPaymentStatus = order.paymentStatus ? paymentStatus(order.paymentStatus) : ''
  const resolvedPaymentStatus = latestPayment ? paymentStatus(latestPayment.status) : (serverPaymentStatus || 'not_created')
  const timeline = Array.isArray(order.statusTimeline) ? order.statusTimeline : (Array.isArray(order.statusLogs) ? order.statusLogs : [])
  return {
    ...order,
    id: order.id || order._id || '',
    _id: order._id || order.id || '',
    items,
    productItems: items,
    workflowStage,
    status,
    statusText,
    customerStatus: statusText,
    statusIndex: getOrderStatusIndex(workflowStage),
    bookingMode: order.bookingMode || 'consult',
    isAfterSale,
    canCancel: isAfterSale ? false : canCancelOrder(status),
    canAfterSale: isAfterSale ? false : canApplyAfterSale(status),
    packageName: order.packageName || firstItem.packageName || firstItem.albumName || '预约项目',
    packagePrice: order.packagePrice || total || firstItem.price || 0,
    spotName: order.spotName || firstItem.spotName || '',
    seriesName: order.seriesName || firstItem.seriesName || '',
    date: order.date || order.bookingDate || '',
    timePeriod: order.timePeriod || order.time || order.bookingTime || '',
    type: order.type || firstItem.type || 'photo',
    contactName: order.contactName || order.name || '',
    contactPhone: order.contactPhone || order.phone || '',
    contactWechat: order.contactWechat || order.wechat || '',
    message: order.message || order.remark || '',
    deliverFiles: order.deliverFiles || order.photos || [],
    totalAmount: total,
    totalPrice: total,
    depositDue: depositAmount,
    depositPaid: deposit,
    finalDue: finalAmount,
    finalPaid: final,
    paidAmount: moneyValue(deposit + final),
    dueAmount: moneyValue(Math.max(total - deposit - final, 0)),
    paymentPhase: currentPhase,
    paymentStatus: resolvedPaymentStatus,
    paymentPending: order.paymentPending === true || resolvedPaymentStatus === 'pending',
    canPay: !!currentPhase && ((currentPhase === 'deposit' ? depositAmount : finalAmount) > 0),
    nextAction: currentPhase ? (currentPhase === 'deposit' ? '生成订金支付单' : '生成尾款支付单') : (workflowStage === WORKFLOW_STAGES.AWAITING_DISPATCH ? '等待客服安排摄影师' : workflowStage === WORKFLOW_STAGES.AWAITING_SHOOT ? '按确认时间完成拍摄' : workflowStage === WORKFLOW_STAGES.SELECTION_PENDING ? '等待选片确认' : workflowStage === WORKFLOW_STAGES.PAID ? '等待成片交付' : ''),
    statusLogs: timeline,
    statusTimeline: timeline,
  }
}

module.exports = {
  normalizeCustomerStatus,
  getOrderStatusText,
  getOrderStatusDesc,
  getOrderStatusIndex,
  WORKFLOW_STAGES,
  deriveWorkflowStage,
  depositDue,
  finalDue,
  paymentStatus,
  paymentConfirmed,
  canCancelOrder,
  canApplyAfterSale,
  normalizeOrder
}
