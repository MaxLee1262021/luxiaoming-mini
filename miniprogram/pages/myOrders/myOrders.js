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
      { key: 'deposit', text: '待付定金' },
      { key: 'confirmed', text: '已确认' },
      { key: 'shooting', text: '拍摄中' },
      { key: 'editing', text: '修片中' },
      { key: 'final', text: '待付尾款' },
      { key: 'completed', text: '交付/完成' }
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
    if (this.data.currentStatus === 'deposit') {
      return demoData.orders.filter(item => item.status === 'deposit_pending' || item.workflowStage === 'awaiting_deposit')
    }
    if (this.data.currentStatus === 'final') {
      return demoData.orders.filter(item => item.status === 'final_pending' || item.workflowStage === 'awaiting_final_payment')
    }
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
    const stage = order.workflowStage
    const stageGroups = {
      pending: ['awaiting_dispatch'],
      deposit: ['awaiting_deposit'],
      confirmed: ['awaiting_shoot'],
      shooting: ['shooting'],
      editing: ['selection_pending'],
      final: ['awaiting_final_payment'],
      completed: ['paid', 'delivered']
    }
    if (currentStatus === 'final' && stage === 'delivered' && order.paymentPhase === 'final' && order.finalPaymentStatus !== 'confirmed') return true
    if (stage && stageGroups[currentStatus]) return stageGroups[currentStatus].includes(stage)
    const status = normalizeCustomerStatus(order.status)
    const groups = {
      pending: ['pending', 'new', 'contacted'],
      deposit: ['deposit_pending'],
      confirmed: ['confirmed', 'deposit_paid', 'assigned'],
      shooting: ['shooting'],
      editing: ['editing', 'final_pending'],
      final: ['awaiting_final_payment'],
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
