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

// The server keeps detailed workflow stages for operations, while customers
// only need the five business states agreed for the booking flow. Keep the
// keys stable in the mini program so old records and new projections render
// the same labels.
const BUSINESS_STATUS = Object.freeze({
  PENDING_PAYMENT: 'pending_payment',
  AWAITING_PHOTOGRAPHER: 'awaiting_photographer',
  SHOT: 'shot',
  PAID: 'paid',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled'
})

const BUSINESS_STATUS_TEXT = Object.freeze({
  [BUSINESS_STATUS.PENDING_PAYMENT]: '待支付',
  [BUSINESS_STATUS.AWAITING_PHOTOGRAPHER]: '待安排摄影师',
  [BUSINESS_STATUS.SHOT]: '已拍摄',
  [BUSINESS_STATUS.PAID]: '已支付',
  [BUSINESS_STATUS.DELIVERED]: '已交付',
  [BUSINESS_STATUS.CANCELLED]: '已取消'
})

function normalizeBusinessStatus(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  if (['已取消', '取消', 'canceled', 'cancelled', 'terminated', 'deleted'].includes(lower)) return BUSINESS_STATUS.CANCELLED
  if (['待支付', '待付款', '待付定金', '待支付订金', '待客服联系确认', '待确认', '预约待确认', 'pending', 'new', 'contacted', 'submitted', 'awaiting_confirmation', 'awaiting_deposit', 'deposit_pending', 'awaiting_payment', 'pending_payment', 'confirmed'].includes(lower)) return BUSINESS_STATUS.PENDING_PAYMENT
  if (['待安排摄影师', '已安排待拍摄', '已确认拍摄', '摄影师待安排', 'awaiting_dispatch', 'awaiting_shoot', 'assigned', 'shooting', 'photographer_pending', 'awaiting_photographer'].includes(lower)) return BUSINESS_STATUS.AWAITING_PHOTOGRAPHER
  if (['已拍摄', '待线下选片确认', '待发布成片', '待成片发布', '待支付尾款', '待付尾款', '修片/交付中', '选片中', '已选片', 'selection_pending', 'awaiting_delivery', 'awaiting_final_payment', 'final_pending', 'editing', 'retouching', 'shot'].includes(lower)) return BUSINESS_STATUS.SHOT
  if (['已支付', '已支付待交付', '尾款已支付', 'paid', 'final_paid', 'paid_pending_delivery'].includes(lower)) return BUSINESS_STATUS.PAID
  if (['已交付', '已完成', '交付/完成', 'delivered', 'completed', 'done'].includes(lower)) return BUSINESS_STATUS.DELIVERED
  return ''
}

function businessStatusForOrder(order = {}, stage = '') {
  // New API projections expose businessStatus. Prefer the internal stage when
  // present because legacy customerStatus text can lag one transition behind.
  const explicitBusiness = normalizeBusinessStatus(order.businessStatus || order.businessStatusCode || order.orderStatus)
  if (explicitBusiness) return explicitBusiness
  const effectiveStage = stage || String(order.workflowStage || '').trim().toLowerCase()
  const hasWorkflowFacts = ['totalAmount', 'totalPrice', 'price', 'depositDue', 'depositRatio', 'depositPaid',
    'finalDue', 'finalPaid', 'depositFinanceStatus', 'finalFinanceStatus', 'selectionStatus',
    'selectionConfirmedAt', 'shootingCompletedAt', 'deliveryRecord', 'deliveredAt', 'photographerId',
    'dispatchRecord'].some(field => Object.prototype.hasOwnProperty.call(order, field))
  if (!hasWorkflowFacts && effectiveStage) {
    return {
      [WORKFLOW_STAGES.AWAITING_CONFIRMATION]: BUSINESS_STATUS.PENDING_PAYMENT,
      [WORKFLOW_STAGES.AWAITING_DEPOSIT]: BUSINESS_STATUS.PENDING_PAYMENT,
      [WORKFLOW_STAGES.AWAITING_DISPATCH]: BUSINESS_STATUS.AWAITING_PHOTOGRAPHER,
      [WORKFLOW_STAGES.AWAITING_SHOOT]: BUSINESS_STATUS.AWAITING_PHOTOGRAPHER,
      [WORKFLOW_STAGES.SHOOTING]: BUSINESS_STATUS.AWAITING_PHOTOGRAPHER,
      [WORKFLOW_STAGES.SELECTION_PENDING]: BUSINESS_STATUS.SHOT,
      [WORKFLOW_STAGES.AWAITING_DELIVERY]: BUSINESS_STATUS.SHOT,
      [WORKFLOW_STAGES.AWAITING_FINAL_PAYMENT]: BUSINESS_STATUS.SHOT,
      [WORKFLOW_STAGES.PAID]: BUSINESS_STATUS.PAID,
      [WORKFLOW_STAGES.DELIVERED]: BUSINESS_STATUS.DELIVERED,
      [WORKFLOW_STAGES.COMPLETED]: BUSINESS_STATUS.DELIVERED,
      [WORKFLOW_STAGES.CANCELLED]: BUSINESS_STATUS.CANCELLED
    }[effectiveStage] || BUSINESS_STATUS.PENDING_PAYMENT
  }
  const rawStatus = String(order.status || '').trim().toLowerCase()
  if (['cancelled', 'canceled', 'terminated', 'deleted', '已取消', '已中止'].includes(rawStatus)
    || order.deleted || order.isDeleted || effectiveStage === WORKFLOW_STAGES.CANCELLED) return BUSINESS_STATUS.CANCELLED
  const selected = isSelectionConfirmed(order)
  const finalSettled = paymentConfirmed(order, 'final')
  const deliveryRecorded = !!(order.deliveryRecord || order.deliveredAt || order.deliveryPublished === true)
  if (deliveryRecorded && (finalSettled || finalDue(order) <= 0)) return BUSINESS_STATUS.DELIVERED
  if ((finalSettled && selected) || (['paid', 'final_paid'].includes(rawStatus) && selected)) return BUSINESS_STATUS.PAID
  if (selected && (order.shootingCompletedAt || finalDue(order) <= 0
    || [WORKFLOW_STAGES.AWAITING_DELIVERY, WORKFLOW_STAGES.AWAITING_FINAL_PAYMENT, WORKFLOW_STAGES.PAID].includes(effectiveStage))) return BUSINESS_STATUS.SHOT
  if (paymentConfirmed(order, 'deposit') || depositDue(order) <= 0
    || [WORKFLOW_STAGES.AWAITING_DISPATCH, WORKFLOW_STAGES.AWAITING_SHOOT, WORKFLOW_STAGES.SHOOTING].includes(effectiveStage)) return BUSINESS_STATUS.AWAITING_PHOTOGRAPHER
  // customerStatus and statusText are accepted for older snapshots that do
  // not expose workflowStage.
  for (const value of [order.customerStatus, order.customerVisibleStatus, order.statusText]) {
    const normalized = normalizeBusinessStatus(value)
    if (normalized) return normalized
  }
  return normalizeBusinessStatus(rawStatus) || BUSINESS_STATUS.PENDING_PAYMENT
}

function businessStatusText(value = '') {
  const key = normalizeBusinessStatus(value) || value
  return BUSINESS_STATUS_TEXT[key] || '处理中'
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

function isSelectionConfirmed(order = {}) {
  const value = String(order.selectionStatus || order.selectionState || '').trim().toLowerCase()
  return ['confirmed', 'selected', 'done', 'completed', '已确认', '已选片', '已完成'].includes(value)
    || order.selectionConfirmed === true
    || !!order.selectionConfirmedAt
}

function finalPaymentSelectionReady(order = {}, stage = '') {
  // The final-payment button is a server-confirmed gate. A technical stage
  // alone is insufficient because older records can reach it before the
  // offline selection record is written.
  return isSelectionConfirmed(order)
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
  const selectionConfirmed = isSelectionConfirmed(order)
  if (selectionConfirmed && paymentConfirmed(order, 'final')) return WORKFLOW_STAGES.PAID
  if (isDeliveryPublished(order)) return WORKFLOW_STAGES.AWAITING_FINAL_PAYMENT
  if (selectionConfirmed || ['final_pending', 'awaiting_final_payment', 'awaiting_delivery'].includes(status)) return WORKFLOW_STAGES.AWAITING_DELIVERY
  if (order.shootingCompletedAt || ['editing', 'retouching'].includes(status)) return WORKFLOW_STAGES.SELECTION_PENDING
  if (status === 'shooting' || order.shootingStartedAt) return WORKFLOW_STAGES.SHOOTING
  if (order.dispatchRecord || order.dispatchStatus === 'assigned' || order.photographerId || status === 'assigned') return WORKFLOW_STAGES.AWAITING_SHOOT
  // A package already carries its deposit policy. The customer-facing flow
  // therefore enters "pending payment" even before the service team writes a
  // confirmation snapshot; the actual schedule is confirmed separately.
  const due = depositDue(order)
  if (order.canPayDeposit === true || due > 0 || status === 'deposit_pending') return WORKFLOW_STAGES.AWAITING_DEPOSIT
  if (paymentConfirmed(order, 'deposit') || status === 'deposit_paid') return WORKFLOW_STAGES.AWAITING_DISPATCH
  if (['pending', 'new', 'contacted', 'awaiting_confirmation', 'submitted'].includes(status)
    || (!status && !order.serviceConfirmedAt && !order.confirmedAt)) return WORKFLOW_STAGES.AWAITING_CONFIRMATION
  if (due <= 0) return WORKFLOW_STAGES.AWAITING_DISPATCH
  return WORKFLOW_STAGES.AWAITING_DEPOSIT
}

function stageStatusText(stage) {
  return BUSINESS_STATUS_TEXT[businessStatusForOrder({ }, stage)] || '处理中'
}

function getOrderStatusText(status = '') {
  return businessStatusText(Object.values(WORKFLOW_STAGES).includes(status)
    ? businessStatusForOrder({}, status)
    : status) || '处理中'
}

function getOrderStatusDesc(status = '', context = {}) {
  const key = normalizeBusinessStatus(Object.values(WORKFLOW_STAGES).includes(status)
    ? businessStatusForOrder({}, status)
    : status)
  if (context && (context.shootingCompletedAt || context.workflowStage === WORKFLOW_STAGES.SELECTION_PENDING)
    && !context.selectionConfirmed) {
    return '拍摄已完成，等待客服/摄影师完成线下选片确认。'
  }
  if (key === BUSINESS_STATUS.SHOT && context && context.selectionConfirmed) {
    return context.canPay ? '线下选片已确认，请按客服指引支付尾款。' : '拍摄已完成，等待客服/摄影师完成线下选片确认。'
  }
  return {
    [BUSINESS_STATUS.PENDING_PAYMENT]: '预约已提交，具体拍摄时间由客服/摄影师与您沟通确认；订金待支付。',
    [BUSINESS_STATUS.AWAITING_PHOTOGRAPHER]: '订金已确认，客服正在安排摄影师；摄影师安排后订金不可退。',
    [BUSINESS_STATUS.SHOT]: '摄影师已完成拍摄，选片由客服/摄影师线下确认；确认后开放尾款。',
    [BUSINESS_STATUS.PAID]: '尾款已确认到账，等待照片交付。',
    [BUSINESS_STATUS.DELIVERED]: '照片已交付，可查看交付记录。',
    [BUSINESS_STATUS.CANCELLED]: '订单已取消，如有疑问请联系客服。'
  }[key] || '订单正在处理中。'
}

function getOrderStatusIndex(status = '') {
  const key = normalizeBusinessStatus(Object.values(WORKFLOW_STAGES).includes(status)
    ? businessStatusForOrder({}, status)
    : status)
  return {
    [BUSINESS_STATUS.PENDING_PAYMENT]: 0,
    [BUSINESS_STATUS.AWAITING_PHOTOGRAPHER]: 1,
    [BUSINESS_STATUS.SHOT]: 2,
    [BUSINESS_STATUS.PAID]: 3,
    [BUSINESS_STATUS.DELIVERED]: 4,
    [BUSINESS_STATUS.CANCELLED]: 0
  }[key] || 0
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
  if (![WORKFLOW_STAGES.AWAITING_CONFIRMATION, WORKFLOW_STAGES.AWAITING_DEPOSIT].includes(stage)) return false
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
  return ![WORKFLOW_STAGES.AWAITING_CONFIRMATION, WORKFLOW_STAGES.AWAITING_DEPOSIT].includes(stage)
}

function canCreatePayment(order = {}, phase = '') {
  if (!order || typeof order !== 'object' || isAfterSaleOpen(order)) return false
  const stage = order.workflowStage || deriveWorkflowStage(order)
  if (stage === WORKFLOW_STAGES.CANCELLED || stage === WORKFLOW_STAGES.COMPLETED) return false
  const resolvedPhase = phase || order.paymentPhase
  if (!['deposit', 'final'].includes(resolvedPhase)) return false
  const explicitGrant = resolvedPhase === 'deposit' ? order.canPayDeposit : order.canPayFinal
  if (explicitGrant === false) return false
  const expectedStage = resolvedPhase === 'deposit' ? WORKFLOW_STAGES.AWAITING_DEPOSIT : WORKFLOW_STAGES.AWAITING_FINAL_PAYMENT
  // A server grant is authoritative because the API may expose a compact
  // business status instead of the internal workflow stage. Without a grant,
  // retain the old stage guard for legacy records.
  const legacyFinalStages = [WORKFLOW_STAGES.SELECTION_PENDING, WORKFLOW_STAGES.AWAITING_FINAL_PAYMENT, WORKFLOW_STAGES.AWAITING_DELIVERY]
  const selectionReady = finalPaymentSelectionReady(order, stage)
  const stageAllowed = resolvedPhase === 'final' && selectionReady
    ? legacyFinalStages.includes(stage)
    : stage === expectedStage
  if (!stageAllowed && explicitGrant !== true) return false
  if (resolvedPhase === 'final' && !selectionReady) return false
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
  const businessStatusKey = businessStatusForOrder(order, workflowStage)
  const statusText = isAfterSale ? '售后中' : BUSINESS_STATUS_TEXT[businessStatusKey]
  const total = orderTotal(order)
  const deposit = moneyValue(order.depositPaid)
  const final = moneyValue(order.finalPaid)
  const depositAmount = depositDue(order)
  const finalAmount = finalDue(order)
  const depositConfirmed = paymentConfirmed(order, 'deposit')
  const finalConfirmed = paymentConfirmed(order, 'final')
  const selectionReady = finalPaymentSelectionReady(order, workflowStage)
  const records = Array.isArray(order.paymentRecords) ? order.paymentRecords : []
  const providedPhase = order.paymentPhase === 'deposit' || order.paymentPhase === 'final'
    ? order.paymentPhase
    : (order.paymentStage === 'deposit' || order.paymentStage === 'final' ? order.paymentStage : '')
  const currentPhase = providedPhase || (workflowStage === WORKFLOW_STAGES.AWAITING_DEPOSIT || order.canPayDeposit === true
    ? 'deposit'
    : (workflowStage === WORKFLOW_STAGES.AWAITING_FINAL_PAYMENT || workflowStage === WORKFLOW_STAGES.AWAITING_DELIVERY || order.canPayFinal === true ? 'final' : ''))
  const latestPayment = currentPhase ? records.filter(record => String(record && record.phase || '') === currentPhase).slice(-1)[0] : null
  const serverPaymentStatus = order.paymentStatus ? paymentStatus(order.paymentStatus) : ''
  const resolvedPaymentStatus = latestPayment ? paymentStatus(latestPayment.status) : (serverPaymentStatus || 'not_created')
  const timeline = Array.isArray(order.statusTimeline) ? order.statusTimeline : (Array.isArray(order.statusLogs) ? order.statusLogs : [])
  const confirmed = !!(order.confirmationSnapshot || order.confirmedSnapshot || order.serviceSnapshot || order.serviceConfirmedAt || order.confirmedAt || order.pricingConfirmed)
  const scheduleConfirmed = confirmed
    || !!(order.appointmentAt || order.confirmedDate || order.confirmedTimePeriod || order.appointmentLocation)
    || ![WORKFLOW_STAGES.AWAITING_CONFIRMATION, WORKFLOW_STAGES.AWAITING_DEPOSIT].includes(workflowStage)
  const deliveryPublished = isDeliveryPublished({ ...order, workflowStage })
  // Delivery is visible only after the balance has been confirmed. Older
  // projections may include a delivery draft before final payment; keep it
  // hidden in the customer app until the paid state is reached.
  const deliveryVisible = deliveryPublished && finalConfirmed
  const normalizedForActions = { ...order, workflowStage, paymentPhase: currentPhase }
  const canPay = !!currentPhase && !isAfterSale && canCreatePayment(normalizedForActions, currentPhase)
  const canCancel = !isAfterSale && canCancelOrder(normalizedForActions)
  const canAfterSale = !isAfterSale && canApplyAfterSale(normalizedForActions)
  const canRunTestPayment = canPay && order.paymentTestModeEnabled === true && order.canRunTestPayment === true
  const assignmentStarted = !!(order.photographerId || order.dispatchRecord || order.dispatchStatus === 'assigned'
    || [WORKFLOW_STAGES.AWAITING_SHOOT, WORKFLOW_STAGES.SHOOTING, WORKFLOW_STAGES.SELECTION_PENDING,
      WORKFLOW_STAGES.AWAITING_DELIVERY, WORKFLOW_STAGES.AWAITING_FINAL_PAYMENT, WORKFLOW_STAGES.PAID,
      WORKFLOW_STAGES.DELIVERED, WORKFLOW_STAGES.COMPLETED].includes(workflowStage))
  const depositRefundable = !assignmentStarted && order.depositRefundable !== false
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
    businessStatus: businessStatusKey,
    businessStatusCode: businessStatusKey,
    businessStatusKey,
    businessStatusText: BUSINESS_STATUS_TEXT[businessStatusKey] || '处理中',
    statusText,
    customerStatus: statusText,
    customerStatusKey: businessStatusKey,
    statusIndex: getOrderStatusIndex(businessStatusKey),
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
    date: scheduleConfirmed ? (snapshot.date || snapshot.bookingDate || order.confirmedDate || order.appointmentAt || order.date || order.bookingDate || '') : '',
    timePeriod: scheduleConfirmed ? (snapshot.timePeriod || snapshot.time || order.confirmedTimePeriod || order.timePeriod || order.time || order.bookingTime || '') : '',
    scheduleLabel: '拍摄时间',
    scheduleHint: scheduleConfirmed ? '以客服/摄影师确认的时间和地点为准。' : '具体拍摄时间由客服/摄影师与您沟通确认。',
    type: order.type || firstItem.type || 'photo',
    contactName: order.contactName || order.name || '',
    contactPhone: order.contactPhone || order.phone || '',
    contactWechat: order.contactWechat || order.wechat || '',
    message: order.message || order.remark || '',
    deliveryPublished,
    deliveryVisible,
    deliverFiles: deliveryVisible ? (order.deliverFiles || order.photos || []) : [],
    totalAmount: total,
    totalPrice: total,
    depositDue: depositAmount,
    depositPaid: deposit,
    depositPaymentConfirmed: depositConfirmed,
    depositRefundable,
    depositRefundHint: depositRefundable ? '摄影师安排前可按客服规则申请退款。' : '摄影师安排后订金不可退。',
    finalDue: finalAmount,
    finalPaid: final,
    finalPaymentConfirmed: finalConfirmed,
    selectionConfirmed: selectionReady,
    paidAmount: moneyValue(deposit + final),
    dueAmount: moneyValue(Math.max(total - deposit - final, 0)),
    paymentPhase: currentPhase,
    paymentStatus: resolvedPaymentStatus,
    paymentPending: order.paymentPending === true || resolvedPaymentStatus === 'pending',
    canPay,
    canPayDeposit: canPay && currentPhase === 'deposit',
    canPayFinal: canPay && currentPhase === 'final',
    paymentTestModeEnabled: order.paymentTestModeEnabled === true,
    canRunTestPayment,
    nextAction: canPay
      ? (currentPhase === 'deposit' ? '生成订金核对单' : '生成尾款核对单')
      : (businessStatusKey === BUSINESS_STATUS.PENDING_PAYMENT ? '等待客服确认并支付订金'
        : businessStatusKey === BUSINESS_STATUS.AWAITING_PHOTOGRAPHER ? '等待客服安排摄影师'
          : businessStatusKey === BUSINESS_STATUS.SHOT ? (selectionReady ? '等待或支付尾款' : '等待线下选片确认')
            : businessStatusKey === BUSINESS_STATUS.PAID ? '等待照片交付' : ''),
    statusLogs: timeline,
    statusTimeline: timeline,
  }
}

module.exports = {
  normalizeCustomerStatus,
  normalizeBusinessStatus,
  businessStatusForOrder,
  businessStatusText,
  getOrderStatusText,
  getOrderStatusDesc,
  getOrderStatusIndex,
  BUSINESS_STATUS,
  BUSINESS_STATUS_TEXT,
  WORKFLOW_STAGES,
  deriveWorkflowStage,
  depositDue,
  finalDue,
  paymentStatus,
  paymentConfirmed,
  isSelectionConfirmed,
  finalPaymentSelectionReady,
  hasPaymentIntent,
  isDeliveryPublished,
  canCancelOrder,
  canApplyAfterSale,
  canCreatePayment,
  normalizeOrder
}
