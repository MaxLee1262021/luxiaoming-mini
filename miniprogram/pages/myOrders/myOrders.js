const app = getApp()
const demoData = require('../../utils/demoData')
const orderApi = require('../../api/order')
const { buildUrlWithSource } = require('../../utils/query')
const { normalizeOrder, normalizeCustomerStatus } = require('../../utils/order')
const { isExplicitDemoMode } = require('../../config/env')

Page({
  data: {
    shopId: '',
    scene: '',
    currentStatus: '',
    tabs: [
      { key: '', text: '全部' },
      { key: 'pending', text: '待确认' },
      { key: 'confirmed', text: '已确认' },
      { key: 'shooting', text: '拍摄中' },
      { key: 'editing', text: '修片中' },
      { key: 'completed', text: '已完成' }
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
      const res = await orderApi.getMyOrders({
        status: this.data.currentStatus || undefined,
        page: this.data.page,
        pageSize: this.data.pageSize
      })
      // 仅当云函数调用失败（未部署/网络异常）才用演示数据兜底；
      // 调用成功但返回空（真实用户确实无订单）时展示真实空列表，绝不显示假订单
      if (!res || !res.success) {
        if (isExplicitDemoMode()) this.applyOrders(this.getDemoOrders(), reset, true)
        else {
          if (reset) this.setData({ orders: [] })
          this.setData({ error: '订单暂时无法加载，请重试' })
        }
      } else {
        this.applyOrders(res.data || [], reset, false)
        this.setData({ error: '' })
      }
    } catch (err) {
      console.error('getMyOrders error', err)
      if (isExplicitDemoMode()) this.applyOrders(this.getDemoOrders(), reset, true)
      else {
        if (reset) this.setData({ orders: [] })
        this.setData({ error: '订单暂时无法加载，请重试' })
      }
    } finally {
      this.setData({ loading: false, refreshing: false })
    }
  },

  getDemoOrders() {
    if (!this.data.currentStatus) return demoData.orders
    if (this.data.currentStatus === 'confirmed') {
      return demoData.orders.filter(item => ['confirmed', 'deposit_paid', 'assigned'].includes(normalizeCustomerStatus(item.status)))
    }
    return demoData.orders.filter(item => normalizeCustomerStatus(item.status) === this.data.currentStatus)
  },

  applyOrders(data = [], reset = true, isDemo = false) {
    const list = data
      .map(item => normalizeOrder(item))
      .filter(item => this.matchCurrentStatus(item))
    this.setData({
      orders: reset ? list : [...this.data.orders, ...list],
      hasMore: !isDemo && list.length >= this.data.pageSize,
      page: this.data.page + 1,
      isDemo
    })
    if (isDemo && reset) {
    }
  },

  matchCurrentStatus(order = {}) {
    const currentStatus = this.data.currentStatus
    if (!currentStatus) return true
    const status = normalizeCustomerStatus(order.status)
    const groups = {
      pending: ['pending', 'new'],
      confirmed: ['confirmed', 'deposit_paid', 'assigned'],
      shooting: ['shooting'],
      editing: ['editing', 'final_pending'],
      completed: ['completed', 'delivered']
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
