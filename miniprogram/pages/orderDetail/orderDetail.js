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
    paymentSubmitting: false,
    paymentStatus: 'not_created',
    paymentMessage: ''
  },

  onLoad(options = {}) {
    const source = app.captureSource ? app.captureSource(options) : {}
    this.setData({
      id: options.id || options.orderId || options.orderNo || '',
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
    const pending = order.paymentPending || Number(order.pendingPaymentAmount || 0) > 0 || order.paymentStatus === 'pending'
    this.setData({
      order,
      statusDesc: getOrderStatusDesc(order.workflowStage || order.status),
      error: '',
      isDemo,
      paymentStatus: order.paymentStatus || (pending ? 'pending' : 'not_created'),
      paymentMessage: pending ? (this.data.paymentMessage || '支付单已生成，等待客服/财务确认到账。') : ''
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
    const phase = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.phase) || this.data.order.paymentPhase
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
      const result = await orderApi.createPayment({ orderId: order._id || order.id, phase, amount, idempotencyKey })
      if (!result || !result.success) {
        wx.removeStorageSync(storageKey)
        wx.showToast({ title: (result && result.error) || '支付单创建失败，请联系客服', icon: 'none' })
        return
      }
      const payment = result.data || result
      this.setData({
        paymentStatus: payment.status || 'pending',
        paymentMessage: payment.status === 'confirmed' ? '支付已确认到账。' : '支付单已生成，当前版本暂不唤起微信支付，请联系客服完成线下收款并由财务确认。'
      })
      wx.showToast({ title: payment.status === 'confirmed' ? '支付已确认' : '支付单已生成', icon: 'none', duration: 2600 })
      await this.loadOrder()
    } catch (err) {
      console.error('create payment failed', err)
      wx.removeStorageSync(`lxm_payment_intent_${order._id}_${phase}`)
      wx.showToast({ title: (err && err.message) || '支付服务暂不可用，请联系客服', icon: 'none' })
    } finally {
      this.setData({ paymentSubmitting: false })
    }
  },

  handlePaymentTap(e) {
    if (this.data.paymentStatus === 'pending') return this.refreshPaymentStatus()
    return this.createPayment(e)
  },

  async refreshPaymentStatus() {
    const order = this.data.order || {}
    const candidate = order.paymentPhase || order.paymentStage
    const phase = candidate === 'deposit' || candidate === 'final'
      ? candidate
      : (Number(order.pendingFinalAmount || 0) > 0 || order.workflowStage === 'awaiting_final_payment' ? 'final' : 'deposit')
    if (!order._id || !phase) return
    try {
      const result = await orderApi.getPaymentStatus({ orderId: order._id, phase })
      if (result && result.success) {
        const payment = result.data || result
        this.setData({ paymentStatus: payment.status || 'not_created', paymentMessage: payment.status === 'pending' ? '支付单处理中，到账后由客服/财务确认。' : '' })
        await this.loadOrder()
      }
    } catch (err) {
      wx.showToast({ title: '支付状态暂时无法查询，请稍后重试', icon: 'none' })
    }
  },

})
