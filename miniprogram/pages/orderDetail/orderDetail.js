const app = getApp()
const orderApi = require('../../api/order')
const { buildUrlWithSource } = require('../../utils/query')
const { normalizeOrder, getOrderStatusDesc, buildReservationBill } = require('../../utils/order')
const { ORDER_STATUS_FILTERS } = require('../../utils/orderStatusFilters')
const orderFiles = require('../../service/orderFileActions')
const { normalizeFile } = require('../../service/mediaFiles')
const { paymentFailure, logPaymentFailure } = require('../../utils/paymentFeedback')
const { openCustomerService } = require('../../service/customerService')
const { orderItemDisplay } = require('../../utils/productDisplay')
const { openOrderProduct } = require('../../service/orderProductNavigation')
const { orderView: physicalOrderView } = require('../../utils/physical')

async function requestWechatPayment(paymentParams = {}) {
  const { timeStamp, nonceStr, package: packageValue, signType, paySign } = paymentParams
  if (!timeStamp || !nonceStr || !packageValue || !signType || !paySign) {
    return Promise.reject(new Error('支付参数不完整，请重新发起支付'))
  }
  if (!wx.requestPayment) return Promise.reject(new Error('当前微信版本不支持支付，请升级后重试'))
  await require('../../service/merchantShare').ensureScanSynced()
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

function paymentQueryErrorMessage(error = {}) {
  return /^WECHAT_PAY_[A-Z0-9_]{1,96}$/.test(String(error && error.code || '')) && error.message
    ? error.message
    : '支付状态暂时无法查询，请稍后重试'
}


Page({
  ...orderFiles.actions,
  data: {
    ...orderFiles.data,
    id: '',
    outTradeNo: '',
    shopId: '',
    scene: '',
    order: {},
    reservationBill: {},
    productItemsDisplay: [],
    physicalOrdersDisplay: [],
    productTypeSummary: '',
    orderStatusFilters: ORDER_STATUS_FILTERS,
    statusDesc: '',
    error: '',
    loading: true,
    paymentSubmitting: false,
    paymentStatus: 'not_created',
    paymentMessage: '',
    arrivalConfirming: false,
    arrivalSubmitting: false,
    arrivalError: '',
    cancelVisible: false,
    cancelFormReason: '',
    cancelSubmitting: false,
    cancelError: '',
    refundRetrySubmitting: false,
    refundRetryError: ''
  },

  onLoad(options = {}) {
    this._hasShown = false
    const source = app.captureSource ? app.captureSource(options) : {}
    this.setData({
      id: options.id || options.orderId || options.orderNo || '',
      outTradeNo: options.out_trade_no || options.outTradeNo || '',
      shopId: options.shopId || source.shopId || '',
      scene: options.scene || source.scene || ''
    })
    return this.loadOrder()
  },


  onUnload() { this.cancelFileDownload() },

  onShow() {
    if (!this._hasShown) {
      this._hasShown = true
      return
    }
    const order = this.data.order || {}
    if (!order._id || this.data.paymentSubmitting || this.data.arrivalConfirming || this.data.arrivalSubmitting) return
    if (this.data.paymentStatus === 'pending') return this.refreshPaymentStatus({ silent: true })
    return this.loadOrder()
  },

  async loadOrder() {
    const requestId = this._orderRequestId = (this._orderRequestId || 0) + 1
    if (!this.data.id && !this.data.outTradeNo) {
      this.setData({ loading: false, error: '缺少订单信息' })
      return false
    }

    this.setData({ loading: true, error: '' })
    try {
      const isOrderNo = /^(LXM|LS)/.test(this.data.id)
      const query = {
        ...(this.data.id ? (isOrderNo ? { orderNo: this.data.id } : { orderId: this.data.id }) : {}),
        ...(this.data.outTradeNo ? { outTradeNo: this.data.outTradeNo } : {})
      }
      const res = await orderApi.getOrderDetail(query)
      if (requestId !== this._orderRequestId) return false
      // Never replace a failed customer-order request with a sample order.
      if (!res || !res.success) {
        this.setData({ error: '订单暂时无法加载，请重试' })
      } else if (res.data) {
        this.applyOrder(normalizeOrder(res.data), false)
        return true
      } else {
        this.setData({ error: '订单不存在' })
      }
    } catch (err) {
      if (requestId !== this._orderRequestId) return false
      console.error('getOrderDetail error', err)
      this.setData({ error: '订单暂时无法加载，请重试' })
    } finally {
      if (requestId === this._orderRequestId) this.setData({ loading: false })
    }
    return false
  },

  applyOrder(order = {}) {
    const productItemsDisplay = orderItemDisplay(order.productItems)
    const pending = order.paymentPending || order.paymentStatus === 'pending'
    const paymentName = '微信支付'
    this.setData({
      order,
      reservationBill: buildReservationBill(order),
      productItemsDisplay,
      physicalOrdersDisplay: (Array.isArray(order.physicalOrders) ? order.physicalOrders : []).map(physicalOrderView).filter(item => item.id),
      productTypeSummary: Array.from(new Set(productItemsDisplay.map(item => item.typeLabel))).join('、'),
      deliveryFiles: (order.deliverFiles || []).map(normalizeFile),
      statusDesc: getOrderStatusDesc(order.customerStatusKey || order.workflowStage || order.status, order),
      error: '',
      paymentStatus: order.paymentStatus || (pending ? 'pending' : 'not_created'),
      paymentMessage: pending ? (this.data.paymentMessage || `${paymentName}订单处理中，请完成支付或刷新支付状态。`) : ''
    })
    this.loadAfterSales()
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

  async goOrderProduct(e) {
    const item = this.data.productItemsDisplay[Number(e.currentTarget.dataset.index)]
    if (!item || this._openingOrderProduct) return
    this._openingOrderProduct = true
    try {
      await openOrderProduct(item, this.data)
    } finally {
      this._openingOrderProduct = false
    }
  },

  openPhysicalOrder(e) {
    const order = this.data.physicalOrdersDisplay[Number(e.currentTarget.dataset.index)]
    if (!order || !order.id) return
    wx.navigateTo({ url: buildUrlWithSource('/pages/physicalOrderDetail/physicalOrderDetail', { id: order.id }, this.data) })
  },

  contactService() {
    openCustomerService()
  },

  goBookingAgain() {
    wx.switchTab({ url: '/pages/explore/explore' })
  },

  retry() {
    return this.loadOrder()
  },

  async confirmArrival() {
    const order = this.data.order || {}
    if (!order._id || order.canConfirmArrival !== true || this.data.loading
      || this.data.arrivalConfirming || this.data.arrivalSubmitting) return
    const orderId = order._id
    this.setData({ arrivalConfirming: true, arrivalError: '' })
    try {
      const choice = await new Promise((resolve, reject) => {
        wx.showModal({
          title: '确认到达',
          content: '请确认您已到达约定的拍摄地点，确认后订单将进入“拍摄中”。',
          cancelText: '暂未到达',
          confirmText: '确认到达',
          success: resolve,
          fail: () => reject(new Error('暂时无法打开确认窗口，请重试'))
        })
      })
      if (!choice || choice.confirm !== true) return
      // The order may have refreshed while the confirmation dialog was open.
      const current = this.data.order || {}
      if (current._id !== orderId || current.canConfirmArrival !== true) return
      this.setData({ arrivalConfirming: false, arrivalSubmitting: true })
      const result = await orderApi.confirmOrderArrival({ orderId })
      const updated = result && result.data && normalizeOrder(result.data)
      if (!result || result.success !== true || !updated || updated._id !== orderId || !updated.customerArrivedAt) {
        throw new Error(result && (result.error || result.message) || '到达状态尚未确认，请刷新后重试')
      }
      // Apply only server-confirmed facts and invalidate any earlier read.
      this._orderRequestId = (this._orderRequestId || 0) + 1
      this.applyOrder(updated)
      const refreshed = await this.loadOrder()
      wx.showToast({ title: refreshed ? '已确认到达' : '到达已确认，请刷新订单', icon: refreshed ? 'success' : 'none' })
    } catch (err) {
      const message = err.message || '确认到达失败，请稍后重试'
      this.setData({ arrivalError: message })
      wx.showToast({ title: message, icon: 'none' })
    } finally {
      this.setData({ arrivalConfirming: false, arrivalSubmitting: false })
    }
  },

  async confirmCompletion() {
    const order = this.data.order || {}
    if (!order._id || !order.canConfirmCompletion || Number(order.finalDue) !== 0 || this.data.paymentSubmitting) return
    const storageKey = `lxm_completion_intent_${order._id}`
    this.setData({ paymentSubmitting: true })
    try {
      let idempotencyKey = wx.getStorageSync(storageKey)
      if (!idempotencyKey) {
        idempotencyKey = `mini-complete-${order._id}-${Date.now()}`
        wx.setStorageSync(storageKey, idempotencyKey)
      }
      const result = await orderApi.createPayment({
        orderId: order._id, phase: 'final', confirmCompletion: true,
        selectionAccepted: true, idempotencyKey
      })
      const completion = result && result.data
      if (!result || !result.success || !completion || completion.provider !== 'zero_balance'
        || completion.status !== 'confirmed' || completion.invokeWeChatPay === true) {
        throw new Error(result && result.error || '订单状态暂未确认，请刷新后重试')
      }
      wx.removeStorageSync(storageKey)
      await this.loadOrder()
      wx.showToast({ title: '订单已完成', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: err.message || '确认失败，请稍后重试', icon: 'none' })
    } finally {
      this.setData({ paymentSubmitting: false })
    }
  },

  async createPayment(e) {
    const phase = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.phase) || this.data.order.paymentPhase
    const order = this.data.order || {}
    const paymentName = '微信支付'
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
      const result = await orderApi.createPayment({
        orderId: order._id || order.id, phase, idempotencyKey,
        ...(phase === 'final' ? { selectionAccepted: true } : {})
      })
      if (!result || !result.success) {
        const message = (result && result.error) || `${paymentName}单创建失败，请联系客服`
        // A failed response does not prove that the server never created the
        // intent. Keep its request key and query the original payment on retry.
        this.setData({ paymentStatus: 'pending', paymentMessage: message })
        wx.showToast({ title: message, icon: 'none' })
        return
      }
      const payment = result.data || result
      if (payment.simulatedPayment || /mock|test/.test(String(payment.provider || payment.paymentMode || ''))) throw new Error('支付通道不可用，请联系客服')
      this.setData({
        paymentStatus: payment.status || 'pending',
        paymentMessage: payment.status === 'confirmed'
          ? '支付已确认到账。'
          : '正在调起微信支付...'
      })
      if (payment.status === 'confirmed') {
        wx.removeStorageSync(storageKey)
        wx.showToast({ title: '支付已确认', icon: 'success' })
        await this.loadOrder()
        return
      }
      const latest = await this.invokeWechatPayment(payment, { silent: false })
      if (latest && ['confirmed', 'failed'].includes(latest.status)) wx.removeStorageSync(storageKey)
    } catch (err) {
      console.error('create payment failed', err)
      const message = (err && err.message) || `${paymentName}服务暂不可用，请联系客服`
      this.setData({ paymentStatus: 'pending', paymentMessage: message })
      wx.showToast({ title: message, icon: 'none' })
    } finally {
      this.setData({ paymentSubmitting: false })
    }
  },

  async invokeWechatPayment(payment = {}, { silent = false } = {}) {
    if (!payment.paymentParams) {
      if (!silent) wx.showToast({ title: '支付参数准备中，请稍后重试', icon: 'none' })
      return payment
    }
    let invokeFailure = null
    try {
      await requestWechatPayment(payment.paymentParams)
      this.setData({ paymentMessage: '微信支付已完成，正在确认订单状态...' })
      if (!silent) wx.showToast({ title: '支付结果确认中', icon: 'none' })
    } catch (err) {
      invokeFailure = paymentFailure(err)
      logPaymentFailure(err, 'order_payment')
      if (!silent) {
        wx.showToast({ title: invokeFailure.toast, icon: 'none' })
      }
    }
    const latest = await this.refreshPaymentStatus({ silent: true })
    if (invokeFailure && (!latest || latest.status !== 'confirmed')) {
      this.setData({ paymentMessage: invokeFailure.message })
    }
    return latest
  },

  handlePaymentTap(e) {
    if (this.data.paymentStatus === 'pending') return this.continueWechatPayment()
    return this.createPayment(e)
  },

  async continueWechatPayment() {
    if (this.data.paymentSubmitting) return
    const order = this.data.order || {}
    const phase = order.paymentPhase
    const storageKey = `lxm_payment_intent_${order._id}_${phase}`
    let createRequired = false
    this.setData({ paymentSubmitting: true })
    try {
      const payment = await this.refreshPaymentStatus({ silent: true, throwOnError: true })
      if (!payment) {
        wx.showToast({ title: '支付状态暂时无法查询，请稍后重试', icon: 'none' })
        return
      }
      if (payment.status === 'confirmed') {
        wx.removeStorageSync(storageKey)
        wx.showToast({ title: '支付已确认', icon: 'success' })
        return
      }
      if (payment.status === 'not_created' || payment.status === 'failed'
        || (payment.status === 'pending' && !payment.paymentParams)) {
        if (payment.status === 'failed') wx.removeStorageSync(storageKey)
        // Reuse the request key while the result is uncertain. The server
        // reuses a live intent or creates the missing one after checking it.
        createRequired = true
      } else if (payment.status === 'pending') {
        const currentOrder = this.data.order || {}
        if (!currentOrder.canPay || currentOrder.paymentPhase !== phase) {
          wx.showToast({ title: '当前阶段暂不能发起微信支付', icon: 'none' })
          return
        }
        const latest = await this.invokeWechatPayment(payment, { silent: false })
        if (latest && ['confirmed', 'failed'].includes(latest.status)) wx.removeStorageSync(storageKey)
      } else {
        wx.showToast({ title: '当前支付状态已变化，请刷新订单', icon: 'none' })
      }
    } catch (err) {
      const message = paymentQueryErrorMessage(err)
      this.setData({ paymentMessage: message })
      wx.showToast({ title: message, icon: 'none' })
    } finally {
      this.setData({ paymentSubmitting: false })
    }
    if (createRequired) return this.createPayment({ currentTarget: { dataset: { phase } } })
  },


  openCancel() {
    if (!this.data.order.canCancel || this.data.cancelSubmitting) return
    this.setData({ cancelVisible: true, cancelFormReason: '', cancelError: '' })
  },

  async retryCancelRefund() {
    const order = this.data.order || {}
    if (!order.canRetryCancelRefund || this.data.refundRetrySubmitting) return
    this.setData({ refundRetrySubmitting: true, refundRetryError: '' })
    try {
      const result = await orderApi.cancelOrder({ orderId: order._id, reason: '重试取消订单退款', idempotencyKey: `mini-cancel-refund-${order._id}` })
      if (!result || result.success !== true) throw new Error(result && (result.error || result.message) || '退款暂未完成，请重试')
      await this.loadOrder()
    } catch (error) {
      this.setData({ refundRetryError: error.message || '退款暂未完成，请重试' })
    } finally {
      this.setData({ refundRetrySubmitting: false })
    }
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
      const cachedIntent = wx.getStorageSync(storageKey)
      let idempotencyKey = typeof cachedIntent === 'string' ? cachedIntent : cachedIntent && cachedIntent.key
      if (!idempotencyKey) {
        idempotencyKey = `mini-cancel-${order._id}-${Date.now()}`
        wx.setStorageSync(storageKey, idempotencyKey)
      }
      const result = await orderApi.cancelOrder({ orderId: order._id, reason, idempotencyKey })
      if (!result || !result.success) throw new Error((result && (result.error || result.message)) || '取消预约失败')
      this.setData({ cancelVisible: false, cancelFormReason: '' })
      wx.showToast({ title: '订单已取消', icon: 'success' })
      wx.removeStorageSync(storageKey)
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
          ? '支付已确认到账。'
          : payment.status === 'pending'
            ? (payment.syncPending ? '支付结果同步中，可稍后刷新或继续支付。' : '微信支付订单处理中，可继续完成支付。')
            : payment.status === 'failed'
              ? '支付未完成，请重新发起支付。'
              : ''
        this.setData({ paymentStatus: payment.status || 'not_created', paymentMessage: message })
        await this.loadOrder()
        return payment
      }
      const error = new Error((result && result.error) || '支付状态暂时无法查询，请稍后重试')
      if (result && result.code) error.code = result.code
      throw error
    } catch (err) {
      const message = paymentQueryErrorMessage(err)
      this.setData({ paymentMessage: message })
      if (options.throwOnError) throw err
      if (!silent) wx.showToast({ title: message, icon: 'none' })
    }
  },

})
