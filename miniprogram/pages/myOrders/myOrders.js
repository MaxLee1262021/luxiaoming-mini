const app = getApp()
const orderApi = require('../../api/order')
const { buildUrlWithSource } = require('../../utils/query')
const { normalizeOrder } = require('../../utils/order')
const { openCustomerService } = require('../../service/customerService')
const { ORDER_STATUS_FILTERS, normalizeOrderFilter, orderListStatus } = require('../../utils/orderStatusFilters')
const physicalApi = require('../../api/physical')
const { PHYSICAL_FILTERS, orderView, rows: physicalRows } = require('../../utils/physical')
const AFTER_SALE_STATUS = 'after_sale'
const ORDER_SYNC_INTERVAL = 15000

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
    orderType: 'service',
    tabs: [
      { key: '', text: '全部订单' },
      ...ORDER_STATUS_FILTERS
    ],
    orders: [],
    actionOrder: {},
    orderAction: '',
    page: 1,
    pageSize: 10,
    hasMore: true,
    refreshing: false,
    loading: false,
    error: ''
  },

  onLoad(options = {}) {
    this._unloaded = false
    this._hasShown = false
    const source = app.captureSource ? app.captureSource(options) : {}
    this.setData({
      shopId: options.shopId || source.shopId || '',
      scene: options.scene || source.scene || '',
      orderType: options.orderType === 'physical' ? 'physical' : 'service',
      currentStatus: options.orderType === 'physical' ? (options.status || '') : normalizeOrderFilter(options.businessStatus || options.status),
      tabs: options.orderType === 'physical' ? this.physicalTabs() : [{ key: '', text: '全部订单' }, ...ORDER_STATUS_FILTERS]
    })
    return this.loadOrders(true)
  },

  onShow() {
    this._visible = true
    // onLoad already starts the first request. Returning from a detail page or
    // the background must fetch the current server state again.
    const refresh = this._hasShown ? this.loadOrders(true) : undefined
    this._hasShown = true
    this.scheduleOrderSync()
    return refresh
  },

  onHide() {
    this._visible = false
    clearTimeout(this._syncTimer)
    this._syncTimer = null
  },

  onUnload() {
    this.onHide()
    this._unloaded = true
    this._requestId = (this._requestId || 0) + 1
  },

  scheduleOrderSync() {
    clearTimeout(this._syncTimer)
    if (!this._visible) return
    this._syncTimer = setTimeout(async () => {
      if (!this._visible) return
      await this.loadOrders(true, { silent: true })
      this.scheduleOrderSync()
    }, ORDER_SYNC_INTERVAL)
  },

  buildUrl(path, params = {}) {
    return buildUrlWithSource(path, params, this.data)
  },

  async loadOrders(reset = true, { silent = false } = {}) {
    if (this.data.orderType === 'physical') return this.loadPhysicalOrders(reset, { silent })
    if (this._unloaded) return
    if ((!reset || silent) && (this.data.loading || this._syncing)) return
    if (!reset && !this.data.hasMore) return

    const requestId = (this._requestId || 0) + 1
    this._requestId = requestId
    const currentStatus = normalizeOrderFilter(this.data.currentStatus)
    const isAfterSaleFilter = currentStatus === AFTER_SALE_STATUS
    const pageSize = isAfterSaleFilter ? 100 : this.data.pageSize
    const firstPage = reset ? 1 : this.data.page
    // Keep every loaded page during a quiet refresh, so scrolling through a
    // longer list does not lose rows whenever a background status changes.
    const lastPage = silent && !isAfterSaleFilter ? Math.max(1, this.data.page - 1) : firstPage
    this._syncing = silent
    if (!silent) {
      this.setData({ loading: true, ...(reset ? { page: 1, orders: [], hasMore: true } : {}) })
    }
    try {
      const rows = []
      let nextPage = firstPage
      let hasMore = false
      for (let page = firstPage; page <= lastPage; page += 1) {
        const query = { page, pageSize }
        if (currentStatus && !isAfterSaleFilter) query.businessStatus = currentStatus
        const res = await orderApi.getMyOrders(query)
        if (this._unloaded || requestId !== this._requestId) return
        // A failed request must remain an error, never local sample orders.
        const hasOrderPayload = Array.isArray(res) || !!(res && typeof res === 'object'
          && ['data', 'list', 'rows', 'items', 'orders', 'records', 'result', 'payload'].some(key => Object.prototype.hasOwnProperty.call(res, key)))
        if (!res || res.success === false || (!hasOrderPayload && res.success !== true)) {
          throw new Error('订单暂时无法加载，请重试')
        }
        const payload = Array.isArray(res) ? res : (Object.prototype.hasOwnProperty.call(res, 'data') ? res.data : res)
        const pageRows = extractOrderRows(payload)
        rows.push(...pageRows)
        nextPage = page + 1
        hasMore = !isAfterSaleFilter && pageRows.length >= pageSize
        if (!hasMore) break
      }
      this.applyOrders(rows, reset, isAfterSaleFilter, { nextPage, hasMore })
      this.setData({ error: '' })
    } catch (err) {
      if (this._unloaded || requestId !== this._requestId) return
      console.error('getMyOrders error', err)
      if (!silent) {
        if (reset) this.setData({ orders: [] })
        this.setData({ error: '订单暂时无法加载，请重试' })
      }
    } finally {
      if (!this._unloaded && requestId === this._requestId) {
        this._syncing = false
        this.setData({ loading: false, refreshing: false })
      }
    }
  },

  physicalTabs() { return [{ key: '', text: '全部' }, ...PHYSICAL_FILTERS, { key: 'closed', text: '已关闭' }, { key: 'after_sale', text: '退款/售后' }] },

  switchType(e) {
    const orderType = e.currentTarget.dataset.type === 'physical' ? 'physical' : 'service'
    if (orderType === this.data.orderType) return
    this._requestId = (this._requestId || 0) + 1
    this._syncing = false
    this.setData({ orderType, currentStatus: '', page: 1, hasMore: true, loading: false, orders: [], error: '', tabs: orderType === 'physical' ? this.physicalTabs() : [{ key: '', text: '全部订单' }, ...ORDER_STATUS_FILTERS] })
    return this.loadOrders(true)
  },

  async loadPhysicalOrders(reset = true, { silent = false } = {}) {
    if (this._unloaded || ((!reset || silent) && (this.data.loading || this._syncing)) || (!reset && !this.data.hasMore)) return
    const requestId = this._requestId = (this._requestId || 0) + 1
    const page = reset ? 1 : this.data.page
    const lastPage = silent ? Math.max(1, this.data.page - 1) : page
    this._syncing = silent
    if (!silent) this.setData({ loading: true, ...(reset ? { page: 1, orders: [], hasMore: true } : {}) })
    try {
      const list = []; let nextPage = page, hasMore = false
      for (let currentPage = page; currentPage <= lastPage; currentPage++) {
        const response = await physicalApi.getPhysicalOrders({ orderType: 'physical', status: this.data.currentStatus === 'after_sale' ? undefined : this.data.currentStatus || undefined, afterSale: this.data.currentStatus === 'after_sale', page: currentPage, pageSize: this.data.pageSize })
        if (this._unloaded || requestId !== this._requestId) return
        const currentRows = physicalRows(response).map(orderView), total = Number(response.total)
        list.push(...currentRows); nextPage = currentPage + 1
        hasMore = Number.isFinite(total) ? currentPage * this.data.pageSize < total : currentRows.length >= this.data.pageSize
        if (!hasMore) break
      }
      this.setData({ orders: reset ? list : [...this.data.orders, ...list], page: nextPage, hasMore, error: '' })
    } catch (error) { if (requestId === this._requestId && !silent) this.setData({ error: error.message || '订单暂时无法加载，请重试' }) }
    finally { if (requestId === this._requestId) { this._syncing = false; this.setData({ loading: false, refreshing: false }) } }
  },

  applyOrders(data = [], reset = true, isAfterSaleFilter = false, pagination = {}) {
    const rows = extractOrderRows(data)
    const list = rows
      .filter(item => item && typeof item === 'object' && !Array.isArray(item))
      .map(item => {
        try {
          const order = normalizeOrder(item)
          return { ...order, listStatusKey: orderListStatus(order) }
        } catch (err) {
          console.warn('skip invalid order row', err)
          return null
        }
      })
      .filter(Boolean)
      .filter(item => this.matchCurrentStatus(item))
    this.setData({
      orders: reset ? list : [...this.data.orders, ...list],
      ...(this.data.orderAction && list.some(item => item._id === this.data.actionOrder._id)
        ? { actionOrder: list.find(item => item._id === this.data.actionOrder._id) } : {}),
      hasMore: pagination.hasMore !== undefined ? pagination.hasMore : !isAfterSaleFilter && rows.length >= this.data.pageSize,
      page: pagination.nextPage || this.data.page + 1
    })
  },

  matchCurrentStatus(order = {}) {
    const currentStatus = normalizeOrderFilter(this.data.currentStatus)
    if (!currentStatus) return true
    if (currentStatus === AFTER_SALE_STATUS) return order.isAfterSale === true
    return orderListStatus(order) === currentStatus
  },

  filterOrders(e) {
    const status = this.data.orderType === 'physical' ? e.currentTarget.dataset.status || '' : normalizeOrderFilter(e.currentTarget.dataset.status)
    if (this.data.currentStatus === status) return
    this.setData({ currentStatus: status })
    return this.loadOrders(true)
  },

  contactService() {
    openCustomerService()
  },

  goDetail(e) {
    const id = (e.detail && e.detail.id) || e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: this.buildUrl(this.data.orderType === 'physical' ? '/pages/physicalOrderDetail/physicalOrderDetail' : '/pages/orderDetail/orderDetail', { id }) })
  },

  openReschedule(e) { this.openOrderAction(e, 'reschedule') },
  openRefund(e) { this.openOrderAction(e, 'refund') },
  openCancel(e) { this.openOrderAction(e, 'cancel') },
  openOrderAction(e, action) {
    if (this.data.orderType !== 'service' || this.data.orderAction) return
    const id = e.detail && e.detail.id
    const order = this.data.orders.find(item => item._id === id)
    const allowed = order && (action === 'reschedule' ? order.canReschedule : action === 'refund' ? order.canApplyRefund : order.canCancel)
    if (!allowed) return
    this.setData({ actionOrder: order, orderAction: action })
  },
  closeOrderAction() { this.setData({ orderAction: '' }) },
  onOrderActionUpdated() {
    this.closeOrderAction()
    return this.loadOrders(true)
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  goAllPackages() {
    if (this.data.orderType === 'physical') return wx.navigateTo({ url: '/pages/peripherals/peripherals' })
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
