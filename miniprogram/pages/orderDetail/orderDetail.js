const app = getApp()
const orderApi = require('../../api/order')
const { buildUrlWithSource } = require('../../utils/query')
const { normalizeOrder, getOrderStatusDesc } = require('../../utils/order')
const orderFiles = require('../../service/orderFileActions')
const { normalizeFile } = require('../../service/mediaFiles')

function requestWechatPayment(paymentParams = {}) {
  const { timeStamp, nonceStr, package: packageValue, signType, paySign } = paymentParams
  if (!timeStamp || !nonceStr || !packageValue || !signType || !paySign) {
    return Promise.reject(new Error('支付参数不完整，请重新发起支付'))
  }
  if (!wx.requestPayment) return Promise.reject(new Error('当前微信版本不支持支付，请升级后重试'))
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      timeStamp: String(timeStamp),
      nonceStr: String(nonceStr),
      package: String(packageValue),
      signType: String(signType),
      paySign: String(paySign),
      success: resolve,
      fail: reject
    })
  })
}

function paymentWasCancelled(error) {
  return /cancel/i.test(String(error && error.errMsg || error && error.message || ''))
}

function isSimulatedPaymentOrder(order = {}) {
  return order.paymentSimulationEnabled === true
    || String(order.paymentMode || '').trim().toLowerCase() === 'mock'
}

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

  onShow() {
    const order = this.data.order || {}
    if (order._id && this.data.paymentStatus === 'pending' && !this.data.paymentSubmitting) {
      this.refreshPaymentStatus({ silent: true })
    }
  },

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
    const paymentName = isSimulatedPaymentOrder(order) ? '模拟支付' : '微信支付'
    this.setData({
      order,
      deliveryFiles: (order.deliverFiles || []).map(normalizeFile),
      statusDesc: getOrderStatusDesc(order.customerStatusKey || order.workflowStage || order.status, order),
      error: '',
      isDemo,
      paymentStatus: order.paymentStatus || (pending ? 'pending' : 'not_created'),
      paymentMessage: pending ? (this.data.paymentMessage || `${paymentName}订单处理中，请完成支付或刷新支付状态。`) : ''
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
    const paymentName = isSimulatedPaymentOrder(order) ? '模拟支付' : '微信支付'
    if (!phase || !order._id || this.data.paymentSubmitting) return
    if (!order.canPay || phase !== order.paymentPhase) {
      wx.showToast({ title: `当前阶段暂不能发起${paymentName}`, icon: 'none' })
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
      const result = await orderApi.createPayment({ orderId: order._id || order.id, phase, idempotencyKey })
      if (!result || !result.success) {
        wx.removeStorageSync(storageKey)
        wx.showToast({ title: (result && result.error) || `${paymentName}单创建失败，请联系客服`, icon: 'none' })
        return
      }
      const payment = result.data || result
      this.setData({
        paymentStatus: payment.status || 'pending',
        paymentMessage: payment.status === 'confirmed'
          ? (payment.simulatedPayment ? '模拟支付已确认到账。' : '支付已确认到账。')
          : '正在调起微信支付...'
      })
      if (payment.status === 'confirmed') {
        wx.removeStorageSync(storageKey)
        wx.showToast({ title: payment.simulatedPayment ? '模拟支付成功' : '支付已确认', icon: 'success' })
        await this.loadOrder()
        return
      }
      const latest = await this.invokeWechatPayment(payment, { silent: false })
      if (latest && ['confirmed', 'failed'].includes(latest.status)) wx.removeStorageSync(storageKey)
    } catch (err) {
      console.error('create payment failed', err)
      wx.removeStorageSync(`lxm_payment_intent_${order._id}_${phase}`)
      wx.showToast({ title: (err && err.message) || `${paymentName}服务暂不可用，请联系客服`, icon: 'none' })
    } finally {
      this.setData({ paymentSubmitting: false })
    }
  },

  async invokeWechatPayment(payment = {}, { silent = false } = {}) {
    if (!payment.paymentParams) {
      if (!silent) wx.showToast({ title: '支付参数准备中，请稍后重试', icon: 'none' })
      return payment
    }
    try {
      await requestWechatPayment(payment.paymentParams)
      this.setData({ paymentMessage: '微信支付已完成，正在确认订单状态...' })
      if (!silent) wx.showToast({ title: '支付结果确认中', icon: 'none' })
    } catch (err) {
      if (!silent) {
        wx.showToast({ title: paymentWasCancelled(err) ? '已取消支付' : '支付未完成，请重试', icon: 'none' })
      }
    }
    return this.refreshPaymentStatus({ silent: true })
  },

  handlePaymentTap(e) {
    if (isSimulatedPaymentOrder(this.data.order)) return this.createPayment(e)
    if (this.data.paymentStatus === 'pending') return this.continueWechatPayment()
    return this.createPayment(e)
  },

  async continueWechatPayment() {
    if (this.data.paymentSubmitting) return
    this.setData({ paymentSubmitting: true })
    try {
      const payment = await this.refreshPaymentStatus({ silent: true })
      if (!payment) {
        wx.showToast({ title: '支付状态暂时无法查询，请稍后重试', icon: 'none' })
        return
      }
      if (payment.status === 'confirmed') {
        wx.showToast({ title: '支付已确认', icon: 'success' })
        return
      }
      if (payment.status === 'failed') {
        const order = this.data.order || {}
        const phase = order.paymentPhase || order.paymentStage || 'deposit'
        wx.removeStorageSync(`lxm_payment_intent_${order._id}_${phase}`)
        wx.showToast({ title: '支付单已失效，请重新发起支付', icon: 'none' })
        return
      }
      await this.invokeWechatPayment(payment, { silent: false })
    } finally {
      this.setData({ paymentSubmitting: false })
    }
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

  async refreshPaymentStatus(options = {}) {
    const silent = !!options.silent
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
        const message = payment.status === 'confirmed'
          ? (payment.simulatedPayment ? '模拟支付已确认到账。' : '支付已确认到账。')
          : payment.status === 'pending'
            ? (payment.syncPending ? '支付结果同步中，可稍后刷新或继续支付。' : '微信支付订单处理中，可继续完成支付。')
            : payment.status === 'failed'
              ? '支付未完成，请重新发起支付。'
              : ''
        this.setData({ paymentStatus: payment.status || 'not_created', paymentMessage: message })
        await this.loadOrder()
        return payment
      }
    } catch (err) {
      if (!silent) wx.showToast({ title: '支付状态暂时无法查询，请稍后重试', icon: 'none' })
    }
  },

})
