const app = getApp()
const orderApi = require('../../api/order')
const { buildUrlWithSource } = require('../../utils/query')
const { normalizeOrder, getOrderStatusDesc } = require('../../utils/order')
const orderFiles = require('../../service/orderFileActions')
const { normalizeFile } = require('../../service/mediaFiles')

Page({
  ...orderFiles.actions,
  data: {
    ...orderFiles.data,
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
    paymentMessage: '',
    testPaymentSubmitting: false,
    cancelVisible: false,
    cancelFormReason: '',
    cancelSubmitting: false,
    cancelError: ''
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


  onUnload() { this.cancelFileDownload() },

  async loadOrder() {
    if (!this.data.id) {
      this.setData({ loading: false, error: '缺少订单信息' })
      return
    }

    try {
      const isOrderNo = /^(LXM|LS)/.test(this.data.id)
      const res = await orderApi.getOrderDetail(isOrderNo ? { orderNo: this.data.id } : { orderId: this.data.id })
      // Never replace a failed customer-order request with a sample order.
      if (!res || !res.success) {
        this.setData({ error: '订单暂时无法加载，请重试', isDemo: false })
      } else if (res.data) {
        this.applyOrder(normalizeOrder(res.data), false)
      } else {
        this.setData({ error: '订单不存在', isDemo: false })
      }
    } catch (err) {
      console.error('getOrderDetail error', err)
      this.setData({ error: '订单暂时无法加载，请重试', isDemo: false })
    } finally {
      this.setData({ loading: false })
    }
  },

  applyOrder(order = {}, isDemo = false) {
    const pending = order.paymentPending || Number(order.pendingPaymentAmount || 0) > 0 || order.paymentStatus === 'pending'
    this.setData({
      order,
      deliveryFiles: (order.deliverFiles || []).map(normalizeFile),
      statusDesc: getOrderStatusDesc(order.customerStatusKey || order.workflowStage || order.status, order),
      error: '',
      isDemo,
      paymentStatus: order.paymentStatus || (pending ? 'pending' : 'not_created'),
      paymentMessage: pending ? (this.data.paymentMessage || '收款核对单已生成，等待客服/财务确认到账。') : ''
    })
    if (!isDemo) this.loadAfterSales()
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
    if (!order.canPay || phase !== order.paymentPhase) {
      wx.showToast({ title: '当前阶段不能创建支付核对单', icon: 'none' })
      return
    }
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
        paymentMessage: payment.status === 'confirmed' ? '支付已由财务确认到账。' : '待核对收款申请已生成，请按客服指引完成线下收款，到账后由财务确认。'
      })
      wx.showToast({ title: payment.status === 'confirmed' ? '到账已确认' : '核对单已生成', icon: 'none', duration: 2600 })
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

  async runTestPayment() {
    const order = this.data.order || {}
    const phase = order.paymentPhase
    if (!order.canRunTestPayment || !order._id || !phase || this.data.testPaymentSubmitting) return
    this.setData({ testPaymentSubmitting: true })
    try {
      const storageKey = `lxm_test_payment_${order._id}_${phase}`
      let idempotencyKey = wx.getStorageSync(storageKey)
      if (!idempotencyKey) {
        idempotencyKey = `mini-test-${phase}-${order._id}-${Date.now()}`
        wx.setStorageSync(storageKey, idempotencyKey)
      }
      const result = await orderApi.testPayment({ orderId: order._id, phase, idempotencyKey })
      if (!result || !result.success) throw new Error((result && (result.error || result.message)) || '测试支付失败')
      wx.showToast({ title: '测试支付已确认', icon: 'success' })
      await this.loadOrder()
    } catch (err) {
      console.error('test payment failed', err)
      wx.showToast({ title: (err && err.message) || '测试支付失败，请重试', icon: 'none' })
    } finally {
      this.setData({ testPaymentSubmitting: false })
    }
  },

  openCancel() {
    if (!this.data.order.canCancel || this.data.cancelSubmitting) return
    this.setData({ cancelVisible: true, cancelFormReason: '', cancelError: '' })
  },

  closeCancel() {
    if (this.data.cancelSubmitting) return
    this.setData({ cancelVisible: false, cancelError: '' })
  },

  onCancelReason(e) { this.setData({ cancelFormReason: e.detail.value }) },

  async submitCancel() {
    const order = this.data.order || {}
    const reason = String(this.data.cancelFormReason || '').trim()
    if (this.data.cancelSubmitting || !order.canCancel) return
    if (reason.length < 2) {
      this.setData({ cancelError: '请填写至少 2 个字的取消原因' })
      return
    }
    this.setData({ cancelSubmitting: true, cancelError: '' })
    try {
      const storageKey = `lxm_cancel_order_${order._id}`
      let idempotencyKey = wx.getStorageSync(storageKey)
      if (!idempotencyKey) {
        idempotencyKey = `mini-cancel-${order._id}-${Date.now()}`
        wx.setStorageSync(storageKey, idempotencyKey)
      }
      const result = await orderApi.cancelOrder({ orderId: order._id, reason, idempotencyKey })
      if (!result || !result.success) throw new Error((result && (result.error || result.message)) || '取消预约失败')
      this.setData({ cancelVisible: false, cancelFormReason: '' })
      wx.showToast({ title: '预约已取消', icon: 'success' })
      await this.loadOrder()
    } catch (err) {
      console.error('cancel order failed', err)
      this.setData({ cancelError: (err && err.message) || '取消预约失败，请重试' })
    } finally {
      this.setData({ cancelSubmitting: false })
    }
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
