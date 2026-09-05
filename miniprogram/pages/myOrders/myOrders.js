const app = getApp()
const demoData = require('../../utils/demoData')
const orderApi = require('../../api/order')
const { buildUrlWithSource } = require('../../utils/query')
const { normalizeOrder, normalizeCustomerStatus } = require('../../utils/order')
const afterSaleService = require('../../service/afterSale')

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
    afterSaleVisible: false,
    afterSaleReason: '',
    afterSaleOrder: null,
    afterSaleSubmitting: false
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
        this.applyOrders(this.getDemoOrders(), reset, true)
      } else {
        this.applyOrders(res.data || [], reset, false)
      }
    } catch (err) {
      console.error('getMyOrders error', err)
      this.applyOrders(this.getDemoOrders(), reset, true)
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

  cancelOrder(e) {
    const orderId = (e.detail && e.detail.id) || e.currentTarget.dataset.id
    if (!orderId) return
    const order = this.data.orders.find(item => item._id === orderId)
    if (order && !order.canCancel) {
      wx.showToast({ title: '当前状态请申请售后处理', icon: 'none' })
      return
    }
    wx.showModal({
      title: '确认取消',
      content: '待确认订单尚未进入客服确认流程，确认后将取消这笔预约。',
      confirmText: '取消订单',
      cancelText: '再想想',
      success: res => {
        if (!res.confirm) return
        // 演示模式：无真实云环境，直接本地更新状态
        if (this.data.isDemo) {
          this.patchOrderCanceled(orderId)
          wx.showToast({ title: '订单已取消', icon: 'success' })
          return
        }
        orderApi.updateOrderStatus({ orderId, newStatus: 'canceled' })
          .then(result => {
            if (result && result.success) {
              wx.showToast({ title: '订单已取消', icon: 'success' })
              this.loadOrders(true)
              return
            }
            wx.showToast({ title: (result && result.error) || '取消失败，请稍后再试', icon: 'none' })
          })
          .catch(err => {
            console.error('cancel order failed', err)
            wx.showToast({ title: '请求失败，请稍后再试', icon: 'none' })
          })
      }
    })
  },

  patchOrderCanceled(orderId) {
    this.setData({
      orders: this.data.orders.map(item => item._id === orderId
        ? { ...item, status: 'canceled', statusText: '已取消', canCancel: false, canAfterSale: true }
        : item)
    })
  },

  deleteOrder(e) {
    const orderId = (e.detail && e.detail.id) || e.currentTarget.dataset.id
    if (!orderId) return
    const order = this.data.orders.find(item => item._id === orderId)
    if (!order || order.status !== 'canceled') return
    wx.showModal({
      title: '删除订单',
      content: '删除后该订单将从「我的订单」移除，后台仍保留记录。确定删除吗？',
      confirmText: '删除',
      cancelText: '再想想',
      success: res => {
        if (!res.confirm) return
        if (this.data.isDemo) {
          this.setData({ orders: this.data.orders.filter(item => item._id !== orderId) })
          wx.showToast({ title: '已删除', icon: 'success' })
          return
        }
        orderApi.updateOrderStatus({ orderId, newStatus: 'deleted' })
          .then(result => {
            if (result && result.success) {
              this.setData({ orders: this.data.orders.filter(item => item._id !== orderId) })
              wx.showToast({ title: '已删除', icon: 'success' })
              return
            }
            wx.showToast({ title: (result && result.error) || '删除失败，请稍后再试', icon: 'none' })
          })
          .catch(err => {
            console.error('delete order failed', err)
            wx.showToast({ title: '删除失败，请稍后再试', icon: 'none' })
          })
      }
    })
  },

  openAfterSale(e) {
    const orderId = (e.detail && e.detail.id) || e.currentTarget.dataset.id
    const order = this.data.orders.find(item => item._id === orderId)
    if (!order) return
    this.setData({
      afterSaleVisible: true,
      afterSaleReason: '',
      afterSaleOrder: order
    })
  },

  closeAfterSale() {
    if (this.data.afterSaleSubmitting) return
    this.setData({
      afterSaleVisible: false,
      afterSaleReason: '',
      afterSaleOrder: null
    })
  },

  onAfterSaleReasonInput(e) {
    this.setData({ afterSaleReason: e.detail.value || '' })
  },

  async submitAfterSale() {
    const validation = afterSaleService.validateAfterSaleReason(this.data.afterSaleReason)
    if (!validation.valid) {
      wx.showToast({ title: validation.message, icon: 'none' })
      return
    }
    const order = this.data.afterSaleOrder
    if (!order) return

    this.setData({ afterSaleSubmitting: true })
    try {
      if (!this.data.isDemo) {
        const payload = afterSaleService.buildAfterSalePayload(order, validation.reason)
        const res = await orderApi.submitAfterSale(payload)
        if (!res || !res.success) {
          wx.showToast({ title: (res && res.error) || '提交失败，请稍后再试', icon: 'none' })
          return
        }
      }
      wx.showToast({ title: '售后申请已提交', icon: 'success' })
      this.setData({
        afterSaleVisible: false,
        afterSaleReason: '',
        afterSaleOrder: null
      })
    } catch (err) {
      console.error('submit after sale failed', err)
      wx.showToast({ title: '提交失败，请稍后再试', icon: 'none' })
    } finally {
      this.setData({ afterSaleSubmitting: false })
    }
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
