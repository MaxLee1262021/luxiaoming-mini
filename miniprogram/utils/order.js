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

const CANCEL_RULE_TEXT = Object.freeze({
  before_service_confirmation_and_payment_intent: '服务确认或收款核对开始前，可提交取消申请。'
})

function customerCancelRuleText(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (CANCEL_RULE_TEXT[raw]) return CANCEL_RULE_TEXT[raw]
  // Internal snake-case/camel-case rule identifiers must never be shown to
  // customers. Unknown natural-language server copy remains displayable.
  if (/^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+$/i.test(raw)) return ''
  return raw
}

// Formal customer orders share four business states across every page.
// Unpaid applications and cancelled orders remain separate from those states.
const BUSINESS_STATUS = Object.freeze({
  PENDING_PAYMENT: 'pending_payment',
  RESERVED: 'reserved',
  AWAITING_SHOOT: 'awaiting_shoot',
  SHOOTING: 'shooting',
  COMPLETED: 'completed',
  // Keep old imports compatible while returning the current public keys.
  AWAITING_PHOTOGRAPHER: 'reserved', SHOT: 'shooting', PAID: 'completed', DELIVERED: 'completed',
  CANCELLED: 'cancelled'
})

const BUSINESS_STATUS_TEXT = Object.freeze({
  [BUSINESS_STATUS.PENDING_PAYMENT]: '待支付',
  [BUSINESS_STATUS.RESERVED]: '待确认',
  [BUSINESS_STATUS.AWAITING_SHOOT]: '待拍摄',
  [BUSINESS_STATUS.SHOOTING]: '拍摄中',
  [BUSINESS_STATUS.COMPLETED]: '已完成',
  [BUSINESS_STATUS.CANCELLED]: '已取消'
})

function normalizeBusinessStatus(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  if (['已取消', '取消', 'canceled', 'cancelled', 'terminated', 'deleted'].includes(lower)) return BUSINESS_STATUS.CANCELLED
  if (['待支付', '待付款', '待付定金', '待支付订金', 'pending', 'new', 'contacted', 'submitted', 'awaiting_confirmation', 'awaiting_deposit', 'deposit_pending', 'awaiting_payment', 'pending_payment'].includes(lower)) return BUSINESS_STATUS.PENDING_PAYMENT
  if (['待确认', '已预约', '预约待确认', '待客服联系确认', '待安排摄影师', '已确认拍摄', '摄影师待安排', 'reserved', 'awaiting_dispatch', 'deposit_paid', 'confirmed', 'photographer_pending', 'awaiting_photographer'].includes(lower)) return BUSINESS_STATUS.RESERVED
  if (['待拍摄', '已安排待拍摄', 'awaiting_shoot', 'assigned'].includes(lower)) return BUSINESS_STATUS.AWAITING_SHOOT
  if (['拍摄中', 'shooting', '已拍摄', '待线下选片确认', '待发布成片', '待成片发布', '待支付尾款', '待付尾款', '修片/交付中', '选片中', '已选片', 'selection_pending', 'awaiting_delivery', 'awaiting_final_payment', 'final_pending', 'editing', 'retouching', 'shot'].includes(lower)) return BUSINESS_STATUS.SHOOTING
  if (['已支付', '已支付待交付', '尾款已支付', 'paid', 'final_paid', 'paid_pending_delivery', '已交付', '已完成', '交付/完成', 'delivered', 'completed', 'done'].includes(lower)) return BUSINESS_STATUS.COMPLETED
  return ''
}

function businessStatusForOrder(order = {}, stage = '') {
  const effectiveStage = stage || String(order.workflowStage || '').trim().toLowerCase()
  const rawStatus = String(order.status || '').trim().toLowerCase()
  if (['cancelled', 'canceled', 'terminated', 'deleted', '已取消', '已中止'].includes(rawStatus)
    || order.deleted || order.isDeleted || effectiveStage === WORKFLOW_STAGES.CANCELLED) return BUSINESS_STATUS.CANCELLED
  const explicitRaw = String(order.businessStatus || order.businessStatusCode || order.orderStatus || '').toLowerCase()
  const explicitBusiness = normalizeBusinessStatus(explicitRaw)
  if (explicitBusiness === BUSINESS_STATUS.CANCELLED) return BUSINESS_STATUS.CANCELLED
  const hasPaymentFacts = ['totalAmount', 'totalPrice', 'depositDue', 'depositPaid', 'finalDue', 'finalPaid',
    'depositFinanceStatus', 'finalFinanceStatus', 'depositPaymentStatus', 'finalPaymentStatus', 'paymentRecords']
    .some(field => Object.prototype.hasOwnProperty.call(order, field))
  // Completion follows the confirmed final payment, even before photo delivery.
  if (hasPaymentFacts && paymentConfirmed(order, 'final')
    && (finalDue(order) > 0 || hasShootingCompleted(order, effectiveStage))) return BUSINESS_STATUS.COMPLETED
  if (explicitRaw === BUSINESS_STATUS.COMPLETED && finalDue(order) <= 0) return BUSINESS_STATUS.COMPLETED
  const completedStage = [WORKFLOW_STAGES.PAID, WORKFLOW_STAGES.DELIVERED, WORKFLOW_STAGES.COMPLETED].includes(effectiveStage)
  if (!hasPaymentFacts && (completedStage || explicitBusiness === BUSINESS_STATUS.COMPLETED
    || normalizeBusinessStatus(rawStatus) === BUSINESS_STATUS.COMPLETED)) return BUSINESS_STATUS.COMPLETED
  if (order.shootingStartedAt || hasShootingCompleted(order, effectiveStage)
    || effectiveStage === WORKFLOW_STAGES.SHOOTING || completedStage || rawStatus === 'shooting'
    || explicitBusiness === BUSINESS_STATUS.SHOOTING) return BUSINESS_STATUS.SHOOTING
  if (hasCurrentPhotographerAssignment(order)) return BUSINESS_STATUS.AWAITING_SHOOT
  // Compact public projections deliberately omit private photographer IDs.
  // Only an exact public assignment state is sufficient in their place.
  const withdrawn = ['pending_reassignment', 'unassigned', 'unable'].includes(String(order.dispatchStatus || '').toLowerCase())
  if (explicitRaw === BUSINESS_STATUS.AWAITING_SHOOT && !withdrawn) return BUSINESS_STATUS.AWAITING_SHOOT
  if (explicitBusiness === BUSINESS_STATUS.RESERVED) return BUSINESS_STATUS.RESERVED
  if (effectiveStage === WORKFLOW_STAGES.AWAITING_SHOOT && !withdrawn) return BUSINESS_STATUS.AWAITING_SHOOT
  if (effectiveStage === WORKFLOW_STAGES.AWAITING_DISPATCH || paymentConfirmed(order, 'deposit')
    && (depositDue(order) > 0 || moneyValue(order.depositPaid) > 0)
    || rawStatus === 'deposit_paid') return BUSINESS_STATUS.RESERVED
  const legacy = normalizeBusinessStatus(order.customerStatus || order.customerVisibleStatus || order.statusText || rawStatus)
  // Legacy "confirmed"/"assigned" text is not evidence of an actual assignment.
  if (legacy === BUSINESS_STATUS.RESERVED || legacy === BUSINESS_STATUS.AWAITING_SHOOT) return BUSINESS_STATUS.RESERVED
  return legacy || explicitBusiness || BUSINESS_STATUS.PENDING_PAYMENT
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
  if (due <= 0) return phase === 'deposit' || hasShootingCompleted(order)
    && (paymentStatus(order.finalFinanceStatus || order.finalPaymentStatus) === 'confirmed'
      || (Array.isArray(order.paymentRecords) && order.paymentRecords.some(record => record.phase === 'final' && paymentStatus(record.status) === 'confirmed')))
  const field = phase === 'deposit' ? 'depositPaid' : 'finalPaid'
  const statusField = phase === 'deposit' ? 'depositFinanceStatus' : 'finalFinanceStatus'
  const publicStatusField = phase === 'deposit' ? 'depositPaymentStatus' : 'finalPaymentStatus'
  // Customer projections omit internal finance fields and payment records.
  // Their phase status carries the same confirmed-payment fact.
  const status = order[statusField] || order[publicStatusField]
  if (moneyValue(order[field]) >= due && paymentStatus(status) === 'confirmed') return true
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
  // Historical function name retained for callers. Final payment acknowledges
  // completed shooting; offline selection is not an additional payment gate.
  return hasShootingCompleted(order, stage)
}

function hasShootingCompleted(order = {}, stage = '') {
  if (order.shootingCompleted === true || order.shootingCompletedAt) return true
  if (order.shootingCompleted === false) return false
  return ['editing', 'retouching', 'final_pending', 'awaiting_final_payment', 'awaiting_delivery', 'delivered'].includes(String(order.status || '').toLowerCase())
    || [WORKFLOW_STAGES.SELECTION_PENDING, WORKFLOW_STAGES.AWAITING_DELIVERY, WORKFLOW_STAGES.AWAITING_FINAL_PAYMENT,
      WORKFLOW_STAGES.PAID, WORKFLOW_STAGES.DELIVERED, WORKFLOW_STAGES.COMPLETED].includes(stage || order.workflowStage)
}

function hasCurrentPhotographerAssignment(order = {}) {
  if (['pending_reassignment', 'unassigned', 'unable'].includes(String(order.dispatchStatus || '').toLowerCase())) return false
  const dispatch = order.dispatchRecord || {}
  return !!(String(order.photographerId || '').trim()
    || String(dispatch.next && dispatch.next.photographerId || dispatch.photographerId || '').trim())
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
  if (typeof order.deliveryPublished === 'boolean') return order.deliveryPublished
  return order.deliveryStatus === 'published' || status === 'delivered' || stage === 'delivered'
}

function deriveWorkflowStage(order = {}) {
  const status = String(order.status || '').trim().toLowerCase()
  if (['canceled', 'cancelled', 'terminated', 'deleted', '已取消', '已中止'].includes(status) || order.deleted || order.isDeleted) return WORKFLOW_STAGES.CANCELLED
  if (['completed', 'done', '已完成', '已完'].includes(status) || order.completedAt) return WORKFLOW_STAGES.COMPLETED
  const shootingCompleted = hasShootingCompleted(order)
  if (shootingCompleted && isDeliveryPublished(order)) {
    return finalDue(order) > 0 && !paymentConfirmed(order, 'final')
      ? WORKFLOW_STAGES.AWAITING_FINAL_PAYMENT
      : WORKFLOW_STAGES.DELIVERED
  }
  if (shootingCompleted && paymentConfirmed(order, 'final')) return WORKFLOW_STAGES.PAID
  if (shootingCompleted) return WORKFLOW_STAGES.AWAITING_FINAL_PAYMENT
  if (status === 'shooting' || order.shootingStartedAt) return WORKFLOW_STAGES.SHOOTING
  if (hasCurrentPhotographerAssignment(order)) return WORKFLOW_STAGES.AWAITING_SHOOT
  // A package already carries its deposit policy. The customer-facing flow
  // therefore enters "pending payment" even before the service team writes a
  // confirmation snapshot; the actual schedule is confirmed separately.
  const due = depositDue(order)
  if (paymentConfirmed(order, 'deposit') || status === 'deposit_paid') return WORKFLOW_STAGES.AWAITING_DISPATCH
  if (order.canPayDeposit === true || due > 0 || status === 'deposit_pending') return WORKFLOW_STAGES.AWAITING_DEPOSIT
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
  if (key === BUSINESS_STATUS.SHOOTING) {
    if (hasShootingCompleted(context)) return context.canPay
      ? '拍摄已完成，可支付尾款确认本次拍摄；尾款到账后订单完成。'
      : '拍摄已完成，等待尾款确认后完成订单。'
    return '摄影师正在拍摄，拍摄完成后可支付尾款确认本次拍摄。'
  }
  return {
    [BUSINESS_STATUS.PENDING_PAYMENT]: '预约已提交，具体拍摄时间由客服/摄影师与您沟通确认；订金待支付。',
    [BUSINESS_STATUS.RESERVED]: '定金已确认，等待客服安排摄影师；安排前可申请退定金。',
    [BUSINESS_STATUS.AWAITING_SHOOT]: '摄影师已安排，请按沟通确认的时间和地点准备拍摄。',
    [BUSINESS_STATUS.COMPLETED]: isDeliveryPublished(context) ? '尾款已确认，订单已完成，可查看照片交付记录。' : '尾款已确认，订单已完成；照片交付进度请查看交付记录。',
    [BUSINESS_STATUS.CANCELLED]: '订单已取消，如有疑问请联系客服。'
  }[key] || '订单正在处理中。'
}

function getOrderStatusIndex(status = '') {
  const key = normalizeBusinessStatus(Object.values(WORKFLOW_STAGES).includes(status)
    ? businessStatusForOrder({}, status)
    : status)
  return {
    [BUSINESS_STATUS.PENDING_PAYMENT]: 0,
    [BUSINESS_STATUS.RESERVED]: 0,
    [BUSINESS_STATUS.AWAITING_SHOOT]: 1,
    [BUSINESS_STATUS.SHOOTING]: 2,
    [BUSINESS_STATUS.COMPLETED]: 3,
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
  return order.afterSaleActive === true || ['pending', 'pending_review', 'processing', '待处理', '处理中', '待处', '处理'].includes(value)
}

function hasPhotographerAssignment(order = {}, stage = '') {
  const assignedRecord = record => record && (record.photographerId
    || (record.next && record.next.photographerId) || (record.previous && record.previous.photographerId)
    || (Array.isArray(record.photographerIds) && record.photographerIds.length))
  return !!(order.photographerId || assignedRecord(order.dispatchRecord)
    || (Array.isArray(order.dispatchRecords) && order.dispatchRecords.some(assignedRecord))
    || (Array.isArray(order.dispatchHistory) && order.dispatchHistory.some(assignedRecord))
    || ['pending_reassignment', 'unassigned', 'unable'].includes(String(order.dispatchStatus || '').toLowerCase())
    || [WORKFLOW_STAGES.AWAITING_SHOOT, WORKFLOW_STAGES.SHOOTING, WORKFLOW_STAGES.SELECTION_PENDING,
      WORKFLOW_STAGES.AWAITING_DELIVERY, WORKFLOW_STAGES.AWAITING_FINAL_PAYMENT, WORKFLOW_STAGES.PAID,
      WORKFLOW_STAGES.DELIVERED, WORKFLOW_STAGES.COMPLETED].includes(stage || order.workflowStage))
}

function canRefundDeposit(order = {}) {
  const stage = order.workflowStage || deriveWorkflowStage(order)
  // Refund eligibility is granted by the server. Local workflow facts can
  // only revoke a stale grant; they never create one or imply money moved.
  return order.canRefundDeposit === true && order.depositRefundable !== false
    && businessStatusForOrder(order, stage) === BUSINESS_STATUS.RESERVED
    && [WORKFLOW_STAGES.AWAITING_CONFIRMATION, WORKFLOW_STAGES.AWAITING_DEPOSIT, WORKFLOW_STAGES.AWAITING_DISPATCH].includes(stage)
    && !['canceled', 'cancelled', 'terminated', 'deleted'].includes(String(order.status || '').toLowerCase())
    && !order.deleted && !order.isDeleted && !hasPhotographerAssignment(order, stage)
    && !isAfterSaleOpen(order) && !order.paymentPending
    && moneyValue(order.depositPaid) > 0 && paymentConfirmed(order, 'deposit')
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
  if (resolvedPhase === 'final' && explicitGrant !== true) return false
  if (paymentConfirmed(order, resolvedPhase)) return false
  const expectedStage = resolvedPhase === 'deposit' ? WORKFLOW_STAGES.AWAITING_DEPOSIT : WORKFLOW_STAGES.AWAITING_FINAL_PAYMENT
  // A server grant is authoritative because the API may expose a compact
  // business status instead of the internal workflow stage. Without a grant,
  // retain the old stage guard for legacy records.
  const legacyFinalStages = [WORKFLOW_STAGES.SELECTION_PENDING, WORKFLOW_STAGES.AWAITING_FINAL_PAYMENT, WORKFLOW_STAGES.AWAITING_DELIVERY]
  const shootingReady = finalPaymentSelectionReady(order, stage)
  const stageAllowed = resolvedPhase === 'final' && shootingReady
    ? legacyFinalStages.includes(stage)
    : stage === expectedStage
  if (!stageAllowed && explicitGrant !== true) return false
  if (resolvedPhase === 'final' && !shootingReady) return false
  if (resolvedPhase === 'final' && depositDue(order) > 0 && !paymentConfirmed(order, 'deposit')) return false
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
  const selectionReady = isSelectionConfirmed(order)
  const shootingCompleted = hasShootingCompleted(order, workflowStage)
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
  const paymentSimulationEnabled = order.paymentSimulationEnabled === true
    || String(order.paymentMode || '').trim().toLowerCase() === 'mock'
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
  const assignmentStarted = hasPhotographerAssignment(order, workflowStage)
  const depositRefundable = !assignmentStarted && order.depositRefundable !== false
  const refundDepositAllowed = canRefundDeposit(normalizedForActions)
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
    cancelRuleText: customerCancelRuleText(order.cancelRule || ''),
    cancelReason: order.cancelReason || order.cancelUnavailableReason || '',
    cancelReasonText: customerCancelRuleText(order.cancelReason || order.cancelUnavailableReason || ''),
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
    canRefundDeposit: refundDepositAllowed,
    depositRefundHint: isAfterSale ? '售后申请处理中，请查看处理记录。'
      : assignmentStarted ? '摄影师已安排，退款问题请联系客服审核处理。'
        : '安排摄影师前可申请退定金，提交后等待审核处理。',
    finalDue: finalAmount,
    finalPaid: final,
    finalPaymentConfirmed: finalConfirmed,
    shootingCompleted,
    selectionConfirmed: selectionReady,
    paidAmount: moneyValue(deposit + final),
    dueAmount: moneyValue(Math.max(total - deposit - final, 0)),
    paymentPhase: currentPhase,
    paymentStatus: resolvedPaymentStatus,
    paymentPending: order.paymentPending === true || resolvedPaymentStatus === 'pending',
    canPay,
    canPayDeposit: canPay && currentPhase === 'deposit',
    canPayFinal: canPay && currentPhase === 'final',
    paymentMode: paymentSimulationEnabled ? 'mock' : 'wechat',
    paymentSimulationEnabled,
    paymentTestModeEnabled: order.paymentTestModeEnabled === true,
    canRunTestPayment,
    nextAction: canPay
      ? (currentPhase === 'deposit' ? '支付订金' : '支付尾款')
      : (businessStatusKey === BUSINESS_STATUS.PENDING_PAYMENT ? '等待客服确认并支付订金'
        : businessStatusKey === BUSINESS_STATUS.RESERVED ? '等待客服安排摄影师'
          : businessStatusKey === BUSINESS_STATUS.AWAITING_SHOOT ? '等待摄影师开始拍摄'
            : businessStatusKey === BUSINESS_STATUS.SHOOTING ? (shootingCompleted ? '等待尾款确认' : '等待拍摄完成')
              : businessStatusKey === BUSINESS_STATUS.COMPLETED ? '订单已完成' : ''),
    statusLogs: timeline,
    statusTimeline: timeline,
  }
}

module.exports = {
  normalizeCustomerStatus,
  customerCancelRuleText,
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
  hasShootingCompleted,
  hasCurrentPhotographerAssignment,
  hasPaymentIntent,
  isDeliveryPublished,
  canCancelOrder,
  canApplyAfterSale,
  canRefundDeposit,
  canCreatePayment,
  normalizeOrder
}
