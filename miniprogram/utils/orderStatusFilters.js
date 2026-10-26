// Personal-center entries and the order-list tabs share this customer-facing
// grouping. Payment actions and detailed order workflow remain independent.
const { businessStatusForOrder, BUSINESS_STATUS_TEXT } = require('./order')
const ORDER_STATUS_FILTERS = Object.freeze([
  { key: 'reserved', text: BUSINESS_STATUS_TEXT.reserved, icon: 'order', countKey: 'pendingConfirmation' },
  { key: 'awaiting_shoot', text: BUSINESS_STATUS_TEXT.awaiting_shoot, icon: 'service', countKey: 'awaitingShoot' },
  { key: 'shooting', text: BUSINESS_STATUS_TEXT.shooting, icon: 'photo', countKey: 'shooting' },
  { key: 'completed', text: BUSINESS_STATUS_TEXT.completed, icon: 'package', countKey: 'completed' }
])

const STATUS_ALIASES = Object.freeze({
  pending: 'reserved', deposit: 'reserved', pending_payment: 'reserved',
  awaiting_confirmation: 'reserved', awaiting_deposit: 'reserved', awaiting_dispatch: 'reserved', deposit_paid: 'reserved',
  confirmed: 'reserved', awaiting_photographer: 'reserved', assigned: 'awaiting_shoot',
  shot: 'shooting', editing: 'shooting', final: 'shooting', final_pending: 'shooting',
  selection_pending: 'shooting', awaiting_delivery: 'shooting', awaiting_final_payment: 'shooting', retouching: 'shooting',
  paid: 'completed', delivered: 'completed', final_paid: 'completed', done: 'completed'
})

function normalizeOrderFilter(value = '') {
  const key = String(value || '').trim().toLowerCase()
  if (key === 'after_sale' || ORDER_STATUS_FILTERS.some(item => item.key === key)) return key
  return STATUS_ALIASES[key] || ''
}

function orderListStatus(order = {}) {
  const business = businessStatusForOrder(order)
  return ORDER_STATUS_FILTERS.some(item => item.key === business) ? business : ''
}

function orderListStatusText(key = '') {
  const status = ORDER_STATUS_FILTERS.find(item => item.key === key)
  return status ? status.text : ''
}

module.exports = { ORDER_STATUS_FILTERS, normalizeOrderFilter, orderListStatus, orderListStatusText }
