const app = getApp()
const orderApi = require('../../api/order')
const { buildUrlWithSource } = require('../../utils/query')
const { normalizeOrder, normalizeCustomerStatus, BUSINESS_STATUS } = require('../../utils/order')
const AFTER_SALE_STATUS = 'after_sale'

// Older deployments wrap paginated RPC results in `list` or `rows`, while the
// current RPC returns the array directly. Keep the page tolerant of either
// shape so one response contract mismatch cannot blank the whole order page.
function extractOrderRows(value, depth = 0) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object' || depth > 3) return []
  for (const key of ['list', 'rows', 'items', 'orders', 'records', 'data', 'result', 'payload']) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue
    const candidate = value[key]
    if (Array.isArray(candidate)) return candidate
    const nested = extractOrderRows(candidate, depth + 1)
    if (nested.length) return nested
  }
  return []
}

Page({
  data: {
    shopId: '',
    scene: '',
    currentStatus: '',
    tabs: [
      { key: '', text: '全部订单' },
      { key: BUSINESS_STATUS.PENDING_PAYMENT, text: '待支付' },
      { key: BUSINESS_STATUS.AWAITING_PHOTOGRAPHER, text: '待安排' },
      { key: BUSINESS_STATUS.SHOT, text: '已拍摄' },
      { key: BUSINESS_STATUS.PAID, text: '已支付' },
      { key: BUSINESS_STATUS.DELIVERED, text: '已交付' }
    ],
    orders: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    refreshing: false,
    loading: false,
    isDemo: false,
    error: ''
  },

  onLoad(options = {}) {
    const source = app.captureSource ? app.captureSource(options) : {}
    this.setData({
      shopId: options.shopId || source.shopId || '',
      scene: options.scene || source.scene || '',
      currentStatus: options.status || ''
    })
    this.loadOrders(true)
  },

  buildUrl(path, params = {}) {
    return buildUrlWithSource(path, params, this.data)
  },

  async loadOrders(reset = true) {
    if (this.data.loading) return
    if (reset) {
      this.setData({ page: 1, orders: [], hasMore: true })
    }
    if (!this.data.hasMore) return

    this.setData({ loading: true })
    try {
      const isAfterSaleFilter = this.data.currentStatus === AFTER_SALE_STATUS
      const query = {
        page: this.data.page,
        pageSize: isAfterSaleFilter ? 100 : this.data.pageSize
      }
      // Keep the request on the long-lived `status` RPC field. The value is a
      // canonical business status understood by the current RPC handler.
      if (this.data.currentStatus && !isAfterSaleFilter) query.status = this.data.currentStatus
      const res = await orderApi.getMyOrders(query)
      // A failed order request must remain an error state. Do not show local
      // sample orders that could be mistaken for persisted customer orders.
      const hasOrderPayload = Array.isArray(res) || !!(res && typeof res === 'object'
        && ['data', 'list', 'rows', 'items', 'orders', 'records', 'result', 'payload'].some(key => Object.prototype.hasOwnProperty.call(res, key)))
      if (!res || res.success === false || (!hasOrderPayload && res.success !== true)) {
        if (reset) this.setData({ orders: [] })
        this.setData({ error: '订单暂时无法加载，请重试', isDemo: false })
      } else {
        const payload = Array.isArray(res) ? res : (Object.prototype.hasOwnProperty.call(res, 'data') ? res.data : res)
        this.applyOrders(payload, reset, isAfterSaleFilter)
        this.setData({ error: '' })
      }
    } catch (err) {
      console.error('getMyOrders error', err)
      if (reset) this.setData({ orders: [] })
      this.setData({ error: '订单暂时无法加载，请重试', isDemo: false })
    } finally {
      this.setData({ loading: false, refreshing: false })
    }
  },

  applyOrders(data = [], reset = true, isAfterSaleFilter = false) {
    const list = extractOrderRows(data)
      .filter(item => item && typeof item === 'object' && !Array.isArray(item))
      .map(item => {
        try {
          return normalizeOrder(item)
        } catch (err) {
          console.warn('skip invalid order row', err)
          return null
        }
      })
      .filter(Boolean)
      .filter(item => this.matchCurrentStatus(item))
    this.setData({
      orders: reset ? list : [...this.data.orders, ...list],
      hasMore: isAfterSaleFilter ? false : list.length >= this.data.pageSize,
      page: this.data.page + 1,
      isDemo: false
    })
  },

  matchCurrentStatus(order = {}) {
    const currentStatus = this.data.currentStatus
    if (!currentStatus) return true
    if (currentStatus === AFTER_SALE_STATUS) return order.isAfterSale === true
    const canonicalAliases = {
      pending: BUSINESS_STATUS.PENDING_PAYMENT,
      deposit: BUSINESS_STATUS.PENDING_PAYMENT,
      confirmed: BUSINESS_STATUS.AWAITING_PHOTOGRAPHER,
      shooting: BUSINESS_STATUS.AWAITING_PHOTOGRAPHER,
      editing: BUSINESS_STATUS.SHOT,
      final: BUSINESS_STATUS.SHOT,
      completed: BUSINESS_STATUS.DELIVERED
    }
    const expected = canonicalAliases[currentStatus] || currentStatus
    if (order.customerStatusKey) {
      // Keep old deep links such as `status=completed` useful while the
      // visible tabs use the stricter five-state vocabulary.
      if (currentStatus === 'completed' && order.customerStatusKey === BUSINESS_STATUS.PAID) return true
      return order.customerStatusKey === expected
    }
    const stage = order.workflowStage
    const stageGroups = {
      [BUSINESS_STATUS.PENDING_PAYMENT]: ['awaiting_confirmation', 'awaiting_deposit'],
      [BUSINESS_STATUS.AWAITING_PHOTOGRAPHER]: ['awaiting_dispatch', 'awaiting_shoot', 'shooting'],
      [BUSINESS_STATUS.SHOT]: ['selection_pending', 'awaiting_delivery', 'awaiting_final_payment'],
      [BUSINESS_STATUS.PAID]: ['paid'],
      [BUSINESS_STATUS.DELIVERED]: currentStatus === 'completed' ? ['paid', 'delivered', 'completed'] : ['delivered', 'completed']
    }
    if (stage && stageGroups[expected]) return stageGroups[expected].includes(stage)
    const status = normalizeCustomerStatus(order.status)
    const groups = {
      pending: ['pending', 'new', 'contacted'],
      deposit: ['deposit_pending'],
      confirmed: ['confirmed', 'deposit_paid', 'assigned'],
      shooting: ['shooting'],
      editing: ['editing', 'final_pending'],
      final: ['awaiting_final_payment'],
      completed: ['paid', 'completed', 'delivered']
    }
    return (groups[currentStatus] || [currentStatus]).includes(status)
  },

  filterOrders(e) {
    const status = e.currentTarget.dataset.status || ''
    if (this.data.currentStatus === status) return
    this.setData({ currentStatus: status })
    this.loadOrders(true)
  },

  goDetail(e) {
    const id = (e.detail && e.detail.id) || e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: this.buildUrl('/pages/orderDetail/orderDetail', { id }) })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  goAllPackages() {
    wx.switchTab({ url: '/pages/explore/explore' })
  },

  onRetryLoad() {
    this.setData({ error: '' })
    this.loadOrders(true)
  },

  onRefresh() {
    this.setData({ refreshing: true })
    this.loadOrders(true)
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadOrders(false)
    }
  },

  noop() {}
})
