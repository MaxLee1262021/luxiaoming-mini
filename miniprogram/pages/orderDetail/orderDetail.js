const app = getApp()
const demoData = require('../../utils/demoData')
const orderApi = require('../../api/order')
const { buildUrlWithSource } = require('../../utils/query')
const { normalizeOrder, getOrderStatusDesc } = require('../../utils/order')
const { isExplicitDemoMode } = require('../../config/env')

Page({
  data: {
    id: '',
    shopId: '',
    scene: '',
    order: {},
    statusDesc: '',
    error: '',
    loading: true,
    isDemo: false,
    paymentSubmitting: false
  },

  onLoad(options = {}) {
    const source = app.captureSource ? app.captureSource(options) : {}
    this.setData({
      id: options.id || options.orderNo || '',
      shopId: options.shopId || source.shopId || '',
      scene: options.scene || source.scene || ''
    })
    this.loadOrder()
  },


  async loadOrder() {
    if (!this.data.id) {
      this.setData({ loading: false, error: '缺少订单信息' })
      return
    }

    try {
      const isOrderNo = /^(LXM|LS)/.test(this.data.id)
      const res = await orderApi.getOrderDetail(isOrderNo ? { orderNo: this.data.id } : { orderId: this.data.id })
      // 仅云函数调用失败才用演示订单兜底；
      // 调用成功但无数据（订单不存在）时显示错误态，不展示假订单
      if (!res || !res.success) {
        if (isExplicitDemoMode()) this.applyDemoOrder()
        else this.setData({ error: '订单暂时无法加载，请重试', isDemo: false })
      } else if (res.data) {
        this.applyOrder(normalizeOrder(res.data), false)
      } else {
        this.setData({ error: '订单不存在', isDemo: false })
      }
    } catch (err) {
      console.error('getOrderDetail error', err)
      if (isExplicitDemoMode()) this.applyDemoOrder()
      else this.setData({ error: '订单暂时无法加载，请重试', isDemo: false })
    } finally {
      this.setData({ loading: false })
    }
  },

  applyOrder(order = {}, isDemo = false) {
    this.setData({
      order,
      statusDesc: getOrderStatusDesc(order.status),
      error: '',
      isDemo
    })
  },

  applyDemoOrder() {
    const demoOrder = demoData.orders.find(item => item._id === this.data.id || item.orderNo === this.data.id) || demoData.orders[0]
    this.applyOrder(normalizeOrder(demoOrder), true)
  },

  copyOrderNo() {
    const no = this.data.order.orderNo || this.data.order._id || ''
    if (!no) return
    wx.setClipboardData({
      data: no,
      success() {
        wx.showToast({ title: '已复制', icon: 'success' })
      }
    })
  },

  contactService() {
    if (!wx.openCustomerServiceChat) {
      wx.showToast({ title: '请在微信内联系客服', icon: 'none' })
      return
    }
    wx.openCustomerServiceChat({
      extInfo: {},
      corpId: (getApp().globalData && getApp().globalData.corpId) || '',
      fail() {
        wx.showToast({ title: '客服暂未配置，请稍后再试', icon: 'none' })
      }
    })
  },

  goBookingAgain() {
    wx.switchTab({ url: '/pages/explore/explore' })
  },

  retry() {
    this.setData({ error: '', loading: true })
    this.loadOrder()
  },

  async createPayment(e) {
    const phase = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.phase
    const order = this.data.order || {}
    if (!phase || !order._id || this.data.paymentSubmitting) return
    const amount = phase === 'deposit' ? Number(order.depositDue || 0) : Number(order.finalDue || 0)
    if (!(amount > 0)) {
      wx.showToast({ title: '当前没有待支付金额', icon: 'none' })
      return
    }
    this.setData({ paymentSubmitting: true })
    try {
      const storageKey = `lxm_payment_intent_${order._id}_${phase}`
      let idempotencyKey = wx.getStorageSync(storageKey)
      if (!idempotencyKey) {
        idempotencyKey = `mini-${phase}-${order._id}-${Date.now()}`
        wx.setStorageSync(storageKey, idempotencyKey)
      }
      const result = await orderApi.createPayment({ orderId: order._id, phase, amount, idempotencyKey })
      if (!result || !result.success) {
        wx.showToast({ title: (result && result.error) || '支付单创建失败，请联系客服', icon: 'none' })
        return
      }
      wx.showToast({ title: '支付单已生成，请联系客服完成支付', icon: 'none', duration: 2600 })
      this.loadOrder()
    } catch (err) {
      console.error('create payment failed', err)
      wx.showToast({ title: '支付服务暂不可用，请联系客服', icon: 'none' })
    } finally {
      this.setData({ paymentSubmitting: false })
    }
  },

})
