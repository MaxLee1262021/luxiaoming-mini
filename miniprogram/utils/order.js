function normalizeCustomerStatus(status = '') {
  if (!status) return 'pending'
  // 历史云库数据可能混用英式 cancelled，统一收敛为美式 canceled，消除双拼写隐患
  if (status === 'cancelled') return 'canceled'
  if (status === 'paid') return 'paid'
  return status
}

const WORKFLOW_STAGES = {
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  AWAITING_DEPOSIT: 'awaiting_deposit',
  AWAITING_DISPATCH: 'awaiting_dispatch',
  AWAITING_SHOOT: 'awaiting_shoot',
  SHOOTING: 'shooting',
  SELECTION_PENDING: 'selection_pending',
  AWAITING_DELIVERY: 'awaiting_delivery',
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

function isDeliveryPublished(order = {}) {
  const status = String(order.status || '').trim().toLowerCase()
  const stage = String(order.workflowStage || '').trim().toLowerCase()
  return order.deliveryPublished === true
    || order.deliveryStatus === 'published'
    || ['delivered', 'completed'].includes(status)
    || ['delivered', 'completed'].includes(stage)
}

function deriveWorkflowStage(order = {}) {
  const status = String(order.status || '').trim().toLowerCase()
  if (['canceled', 'cancelled', 'terminated', 'deleted', '已取消', '已中止'].includes(status) || order.deleted || order.isDeleted) return WORKFLOW_STAGES.CANCELLED
  if (['completed', 'done', '已完成', '已完'].includes(status) || order.completedAt) return WORKFLOW_STAGES.COMPLETED
  if (isDeliveryPublished(order)) {
    return finalDue(order) > 0 && !paymentConfirmed(order, 'final')
      ? WORKFLOW_STAGES.AWAITING_FINAL_PAYMENT
      : WORKFLOW_STAGES.DELIVERED
  }
  if (order.deliveryRecord || order.deliveredAt) return WORKFLOW_STAGES.AWAITING_DELIVERY
  const selectionConfirmed = String(order.selectionStatus || '').toLowerCase() === 'confirmed' || !!order.selectionConfirmedAt
  if (selectionConfirmed && paymentConfirmed(order, 'final')) return WORKFLOW_STAGES.PAID
  if (isDeliveryPublished(order)) return WORKFLOW_STAGES.AWAITING_FINAL_PAYMENT
  if (selectionConfirmed || ['final_pending', 'awaiting_final_payment', 'awaiting_delivery'].includes(status)) return WORKFLOW_STAGES.AWAITING_DELIVERY
  if (order.shootingCompletedAt || ['editing', 'retouching'].includes(status)) return WORKFLOW_STAGES.SELECTION_PENDING
  if (status === 'shooting' || order.shootingStartedAt) return WORKFLOW_STAGES.SHOOTING
  if (order.dispatchRecord || order.dispatchStatus === 'assigned' || order.photographerId || status === 'assigned') return WORKFLOW_STAGES.AWAITING_SHOOT
  // A booking is an application, not a payment order. The service team must
  // confirm its schedule and price snapshot before a deposit can be requested.
  if (['pending', 'new', 'contacted', 'awaiting_confirmation', 'submitted'].includes(status)
    || (!status && !order.serviceConfirmedAt && !order.confirmedAt)) {
    return WORKFLOW_STAGES.AWAITING_CONFIRMATION
  }
  if (paymentConfirmed(order, 'deposit') || depositDue(order) <= 0 || status === 'deposit_paid') return WORKFLOW_STAGES.AWAITING_DISPATCH
  return WORKFLOW_STAGES.AWAITING_DEPOSIT
}

function stageStatusText(stage) {
  return {
    awaiting_confirmation: '待客服联系确认',
    awaiting_deposit: '待支付订金',
    awaiting_dispatch: '待安排摄影师',
    awaiting_shoot: '已安排待拍摄',
    shooting: '拍摄中',
    selection_pending: '待线下选片确认',
    awaiting_delivery: '待成片发布',
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
    awaiting_confirmation: '待客服联系确认',
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
    awaiting_delivery: '待成片发布',
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
      awaiting_confirmation: '预约申请已提交，客服会确认期望档期、服务内容和成交金额后通知你。',
      awaiting_deposit: '客服已确认订单，请生成定金收款核对单；当前版本不提供微信支付，到账由客服/财务确认。',
      awaiting_dispatch: '定金已确认，客服正在安排摄影师并确认拍摄信息。',
      awaiting_shoot: '摄影师已安排，请按客服确认的时间和地点到达。',
      shooting: '订单正在拍摄中，成片完成后会进入选片确认。',
      selection_pending: '拍摄已完成，等待线下选片确认；确认后团队会先发布成片，发布后才会开放尾款。',
      awaiting_delivery: '选片已确认，团队正在发布成片；发布后才会开放尾款。',
      awaiting_final_payment: '成片已发布，请生成尾款收款核对单；到账以客服/财务核对结果为准。',
      paid: '尾款已确认到账，等待团队完成交付。',
      delivered: '成片已交付，感谢选择鹿小鸣城市旅拍。',
      completed: '订单已完成，感谢选择鹿小鸣城市旅拍。',
      cancelled: '订单已取消，如有疑问请联系客服。'
    }
    return stageDesc[status] || '订单正在处理中。'
  }
  const normalized = normalizeCustomerStatus(status)
  const map = {
    pending: '预约申请已提交，客服会尽快与你确认期望档期、路线和拍摄需求。',
    new: '预约申请已提交，客服会尽快与你确认期望档期、路线和拍摄需求。',
    contacted: '客服正在与你确认预约信息，请留意微信或电话。',
    deposit_pending: '请按客服指引完成定金支付，支付后将锁定拍摄档期。',
    confirmed: '预约已确认，请按约定时间到达拍摄地点。',
    deposit_paid: '预约已确认，请按约定时间到达拍摄地点。',
    assigned: '摄影师已安排，请留意客服通知。',
    shooting: '订单正在拍摄中，祝你拥有一组好看的长沙旅行封面。',
    editing: '成片正在后期处理中，请耐心等待交付。',
    final_pending: '成片正在做最终确认，请耐心等待交付。',
    awaiting_delivery: '选片已确认，团队正在发布成片；发布后才会开放尾款。',
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
    awaiting_confirmation: 0,
    awaiting_deposit: 0,
    awaiting_dispatch: 1,
    awaiting_shoot: 1,
    shooting: 2,
    selection_pending: 3,
    awaiting_delivery: 3,
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
  if (['editing', 'retouching', 'awaiting_delivery'].includes(normalized)) return 3
  if (['final_pending', 'awaiting_final_payment', 'paid'].includes(normalized)) return 4
  if (['delivered', 'completed'].includes(normalized)) return 5
  if (['canceled', 'cancelled'].includes(normalized)) return 0
  return 0
}

function hasPaymentIntent(order = {}) {
  if (!order || typeof order !== 'object') return false
  if (order.paymentPending === true) return true
  if (order.paymentStatus && ['pending', 'confirmed'].includes(paymentStatus(order.paymentStatus))) return true
  return (Array.isArray(order.paymentRecords) ? order.paymentRecords : []).some(record => {
    const status = paymentStatus(record && record.status)
    return status === 'pending' || status === 'confirmed'
  })
}

function isAfterSaleOpen(order = {}) {
  const value = String(order.afterSaleStatus || order.afterSaleState || '').trim().toLowerCase()
  return ['pending', 'processing', '待处理', '处理中', '待处', '处理'].includes(value)
}

function canCancelOrder(input = {}) {
  if (!input || typeof input !== 'object') return false
  const status = normalizeCustomerStatus(input.status)
  const stage = input.workflowStage || deriveWorkflowStage(input)
  if (['canceled', 'cancelled', 'deleted', 'completed'].includes(status)
    || stage === WORKFLOW_STAGES.CANCELLED || stage === WORKFLOW_STAGES.COMPLETED
    || isAfterSaleOpen(input) || hasPaymentIntent(input)) return false
  if (stage !== WORKFLOW_STAGES.AWAITING_CONFIRMATION) return false
  return input.canCancel === true
}

function canApplyAfterSale(input = {}) {
  if (!input || typeof input !== 'object') {
    return !['deleted', 'canceled', 'cancelled', '已取消', '已删除'].includes(input)
  }
  const status = normalizeCustomerStatus(input.status)
  const stage = input.workflowStage || deriveWorkflowStage(input)
  if (['deleted', 'canceled', 'cancelled'].includes(status) || stage === WORKFLOW_STAGES.CANCELLED || isAfterSaleOpen(input)) return false
  if (typeof input.canAfterSale === 'boolean') return input.canAfterSale
  // Before service confirmation, the only self-service off-ramp is the
  // cancellation contract. Once work or payment has begun, use after-sale.
  return stage !== WORKFLOW_STAGES.AWAITING_CONFIRMATION
}

function canCreatePayment(order = {}, phase = '') {
  if (!order || typeof order !== 'object' || isAfterSaleOpen(order)) return false
  const stage = order.workflowStage || deriveWorkflowStage(order)
  if (stage === WORKFLOW_STAGES.CANCELLED || stage === WORKFLOW_STAGES.COMPLETED) return false
  const resolvedPhase = phase || order.paymentPhase
  if (!['deposit', 'final'].includes(resolvedPhase)) return false
  if (stage !== (resolvedPhase === 'deposit' ? WORKFLOW_STAGES.AWAITING_DEPOSIT : WORKFLOW_STAGES.AWAITING_FINAL_PAYMENT)) return false
  if (resolvedPhase === 'final' && !isDeliveryPublished(order)) return false
  if (typeof order.canCreatePayment === 'boolean' && !order.canCreatePayment) return false
  if (typeof order.canPay === 'boolean' && !order.canPay) return false
  const due = resolvedPhase === 'deposit' ? depositDue(order) : finalDue(order)
  return due > 0
}

function orderSnapshot(order = {}) {
  const candidates = [
    order.confirmationSnapshot,
    order.confirmedSnapshot,
    order.serviceSnapshot,
    order.orderSnapshot,
    order.packageSnapshot
  ]
  return candidates.find(item => item && typeof item === 'object' && !Array.isArray(item)) || {}
}

function normalizeOrder(order = {}) {
  const items = Array.isArray(order.productItems) ? order.productItems : (Array.isArray(order.items) ? order.items : (Array.isArray(order.products) ? order.products : []))
  const snapshot = orderSnapshot(order)
  const snapshotItems = Array.isArray(snapshot.items) ? snapshot.items : []
  const displayItems = snapshotItems.length ? snapshotItems : items
  const firstItem = displayItems[0] || {}
  const status = normalizeCustomerStatus(order.status || 'pending')
  const workflowStage = order.workflowStage || deriveWorkflowStage(order)
  const isAfterSale = isAfterSaleOpen(order)
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
  const confirmed = !!(order.confirmationSnapshot || order.confirmedSnapshot || order.serviceSnapshot || order.serviceConfirmedAt || order.confirmedAt || order.pricingConfirmed || workflowStage !== WORKFLOW_STAGES.AWAITING_CONFIRMATION)
  const deliveryPublished = isDeliveryPublished({ ...order, workflowStage })
  const normalizedForActions = { ...order, workflowStage, paymentPhase: currentPhase }
  const canPay = !!currentPhase && !isAfterSale && canCreatePayment(normalizedForActions, currentPhase)
  const canCancel = !isAfterSale && canCancelOrder(normalizedForActions)
  const canAfterSale = !isAfterSale && canApplyAfterSale(normalizedForActions)
  const canRunTestPayment = canPay && order.paymentTestModeEnabled === true && order.canRunTestPayment === true
  return {
    ...order,
    id: order.id || order._id || '',
    _id: order._id || order.id || '',
    items: displayItems,
    productItems: displayItems,
    packageSnapshot: snapshot,
    snapshotItems: displayItems,
    hasConfirmedSnapshot: confirmed,
    snapshotLabel: confirmed ? '服务确认快照' : '预约申请信息',
    workflowStage,
    status,
    statusText,
    customerStatus: statusText,
    statusIndex: getOrderStatusIndex(workflowStage),
    bookingMode: order.bookingMode || 'consult',
    isAfterSale,
    canCancel,
    cancelRule: order.cancelRule || '',
    cancelReason: order.cancelReason || order.cancelUnavailableReason || '',
    canAfterSale,
    packageName: snapshot.name || snapshot.packageName || order.packageName || firstItem.packageName || firstItem.albumName || '预约项目',
    packagePrice: snapshot.price !== undefined ? moneyValue(snapshot.price) : (order.packagePrice || total || firstItem.price || 0),
    spotName: snapshot.spotName || order.confirmedSpotName || order.spotName || firstItem.spotName || '',
    seriesName: snapshot.seriesName || order.confirmedSeriesName || order.seriesName || firstItem.seriesName || '',
    date: snapshot.date || snapshot.bookingDate || order.confirmedDate || order.date || order.bookingDate || '',
    timePeriod: snapshot.timePeriod || snapshot.time || order.confirmedTimePeriod || order.timePeriod || order.time || order.bookingTime || '',
    scheduleLabel: confirmed ? '确认拍摄时间' : '期望拍摄时间',
    scheduleHint: confirmed ? '实际安排以客服确认记录为准。' : '这是你的期望档期，客服确认后会更新实际安排。',
    type: order.type || firstItem.type || 'photo',
    contactName: order.contactName || order.name || '',
    contactPhone: order.contactPhone || order.phone || '',
    contactWechat: order.contactWechat || order.wechat || '',
    message: order.message || order.remark || '',
    deliveryPublished,
    deliveryVisible: deliveryPublished,
    deliverFiles: deliveryPublished ? (order.deliverFiles || order.photos || []) : [],
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
    canPay,
    paymentTestModeEnabled: order.paymentTestModeEnabled === true,
    canRunTestPayment,
    nextAction: workflowStage === WORKFLOW_STAGES.AWAITING_CONFIRMATION
      ? '等待客服确认预约'
      : (canPay ? (currentPhase === 'deposit' ? '生成订金核对单' : '生成尾款核对单') : (workflowStage === WORKFLOW_STAGES.AWAITING_DISPATCH ? '等待客服安排摄影师' : workflowStage === WORKFLOW_STAGES.AWAITING_SHOOT ? '按确认时间完成拍摄' : [WORKFLOW_STAGES.SELECTION_PENDING, WORKFLOW_STAGES.AWAITING_DELIVERY].includes(workflowStage) ? '等待成片发布' : workflowStage === WORKFLOW_STAGES.PAID ? '等待订单完成' : '')),
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
  hasPaymentIntent,
  isDeliveryPublished,
  canCancelOrder,
  canApplyAfterSale,
  canCreatePayment,
  normalizeOrder
}
