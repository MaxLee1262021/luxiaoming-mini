const STATUS_TEXT = { pending_payment: '待付款', awaiting_shipment: '待发货', awaiting_receipt: '待收货', completed: '已完成', closed: '已关闭' }
const PHYSICAL_FILTERS = [
  { key: 'pending_payment', text: '待付款', icon: 'order', countKey: 'pending_payment' },
  { key: 'awaiting_shipment', text: '待发货', icon: 'order', countKey: 'awaiting_shipment' },
  { key: 'awaiting_receipt', text: '待收货', icon: 'order', countKey: 'awaiting_receipt' },
  { key: 'completed', text: '已完成', icon: 'order', countKey: 'completed' }
]
function rows(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  for (const key of ['items', 'list', 'rows', 'orders', 'addresses', 'records', 'skus']) if (Array.isArray(value[key])) return value[key]
  return []
}
function money(value) { if (value === null || value === undefined || value === '') return '—'; const n = Number(value); return Number.isFinite(n) ? n.toFixed(2) : '—' }
function idOf(value) { return String(value && (value.id || value._id || value.orderId || value.lineId || value.skuId || value.productId) || '') }
function skuLabel(value = {}) {
  if (value.specLabel) return String(value.specLabel)
  const spec = String(value.spec || value.specSnapshot || '默认规格').trim()
  const style = String(value.style || value.skuStyle || '').trim()
  return style ? `${style} / ${spec}` : spec
}
function lineView(value = {}) {
  const quantity = Number(value.quantity) || 1
  return { ...value, id: idOf(value), lineId: String(value.lineId || value.id || ''), name: value.name || value.nameSnapshot || value.productName || '', spec: skuLabel(value), cover: value.cover || value.image || '', quantity, priceText: money(value.price ?? value.unitPrice), lineAmountText: money(value.lineAmount ?? Number(value.price ?? value.unitPrice) * quantity), valid: value.valid !== false && value.purchasable !== false }
}
function shipmentView(value) {
  if (!value) return null
  const labels = { awaiting_collection: '已出库，待快递揽收', collected: '快递已揽收', in_transit: '运输中', delivering: '派送中', out_for_delivery: '派送中', signed: '物流已签收', returned: '商品退回中', refused: '已拒收，待客服核实', exception: '物流异常，请联系客服' }
  return { ...value, statusText: value.statusText || value.logisticsStatusText || labels[value.logisticsStatus] || '物流更新中', updatedAt: value.lastSyncedAt || value.updatedAt || '', events: rows(value.events || value.tracking || value.traces) }
}
function orderView(value = {}) {
  const items = rows(value.items || value.products).map(lineView)
  return { ...value, id: idOf(value), _id: idOf(value), orderType: 'physical', status: value.status || value.publicStatus, statusText: value.publicStatusText || STATUS_TEXT[value.status || value.publicStatus] || '处理中', items, shipment: shipmentView(value.shipment), quantity: items.reduce((sum, row) => sum + row.quantity, 0), totalText: money(value.totalAmount), goodsText: money(value.goodsAmount), shippingText: money(value.shippingFee), refundedText: money(value.refundedAmount || 0) }
}
function checkoutItems(cart) {
  return rows(cart).filter(row => row.selected !== false).map(row => {
    if (row.valid === false || row.purchasable === false) throw new Error('选中商品已失效，请回购物车处理')
    return { productId: row.productId, skuId: row.skuId, quantity: Number(row.quantity), lineId: row.lineId || row.id, version: row.version }
  })
}
function addressText(address = {}) { return [address.province, address.city, address.district, address.detail || address.detailAddress].filter(Boolean).join(' ') }
function can(order, action, statuses) {
  if (Array.isArray(order.allowedActions)) return order.allowedActions.some(item => (typeof item === 'string' ? item : item.key || item.action) === action)
  return statuses.includes(order.status)
}
function newKey() { return 'pc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12) }
module.exports = { STATUS_TEXT, PHYSICAL_FILTERS, rows, money, idOf, skuLabel, lineView, shipmentView, orderView, checkoutItems, addressText, can, newKey }
