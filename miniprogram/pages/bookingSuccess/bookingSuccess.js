const app = getApp()
const orderApi = require('../../api/order')
const bookingConfig = require('../../service/bookingConfig')
const { buildUrlWithSource, decodeQueryFields, decodeQueryValue } = require('../../utils/query')
const { normalizeOrder } = require('../../utils/order')
const { openCustomerService } = require('../../service/customerService')

const DEFAULT_BOOKING_SUCCESS_TIPS = '预约成功后订单为“已预约”，客服安排摄影师后进入“已定档”。到达约定拍摄地点后，在订单详情点击“到达点位”并确认，订单进入“拍摄中”并显示“支付尾款”；拍摄完成后支付尾款确认本次拍摄，到账后订单进入“已完成”。无需支付尾款的订单可在拍摄完成后确认完成。照片交付记录可在订单详情查看。'

const SUCCESS_QUERY_FIELDS = [
  'packageName',
  'packagePrice',
  'spotName',
  'date',
  'timePeriod',
  'contactName',
  'contactPhone',
  'contactWechat',
  'message'
]

Page({
  data: {
    orderNo: '',
    orderId: '',
    shopId: '',
    scene: '',
    packageName: '',
    packagePrice: '',
    spotName: '',
    date: '',
    timePeriod: '',
    contactName: '',
    contactPhone: '',
    contactWechat: '',
    message: '',
    bookingMode: 'consult',
    statusText: '待支付',
    businessStatusKey: 'pending_payment',
    workflowStage: 'awaiting_confirmation',
    depositDue: 0,
    finalDue: 0,
    showCustomerServiceModal: false,
    loading: false,
    loadError: '',
    bookingSuccessTips: DEFAULT_BOOKING_SUCCESS_TIPS
  },

  onLoad(options = {}) {
    this._pageUnloaded = false
    this._customerServicePromptShown = false
    const source = app.captureSource ? app.captureSource(options) : {}
    const decodedOptions = decodeQueryFields(options, SUCCESS_QUERY_FIELDS)

    this.setData({
      orderNo: options.orderNo || '',
      orderId: options.orderId || '',
      shopId: options.shopId || source.shopId || '',
      scene: options.scene || source.scene || '',
      ...decodedOptions,
      bookingMode: options.bookingMode || 'consult',
      workflowStage: options.workflowStage || 'awaiting_confirmation'
    })

    if (options.orderNo || options.orderId) this.loadOrderDetail(options.orderNo, options.orderId)
  },

  onShow() {
    this.refreshCustomerServiceConfig()
    return this.loadBookingSuccessTips()
  },

  onUnload() {
    this._pageUnloaded = true
    this._orderDetailRequestVersion = (this._orderDetailRequestVersion || 0) + 1
    this._successTipsRequestVersion = (this._successTipsRequestVersion || 0) + 1
  },

  async refreshCustomerServiceConfig() {
    const config = app.globalData || {}
    if (!String(config.corpId || '').trim() && typeof app.loadCustomerServiceConfig === 'function') {
      try { await app.loadCustomerServiceConfig() } catch (_) { /* The shared entry reports unavailable configuration. */ }
    }
  },

  async loadBookingSuccessTips() {
    const version = this._successTipsRequestVersion = (this._successTipsRequestVersion || 0) + 1
    this.setData({ bookingSuccessTips: DEFAULT_BOOKING_SUCCESS_TIPS })
    try {
      const config = await bookingConfig.ensureLoaded(true)
      if (version !== this._successTipsRequestVersion) return
      const tips = config && typeof config.bookingSuccessTips === 'string' ? config.bookingSuccessTips.trim() : ''
      this.setData({ bookingSuccessTips: tips || DEFAULT_BOOKING_SUCCESS_TIPS })
    } catch (error) {
      if (version !== this._successTipsRequestVersion) return
      this.setData({ bookingSuccessTips: DEFAULT_BOOKING_SUCCESS_TIPS })
    }
  },

  async loadOrderDetail(orderNo, orderId = '') {
    const version = this._orderDetailRequestVersion = (this._orderDetailRequestVersion || 0) + 1
    const isCurrent = () => !this._pageUnloaded && version === this._orderDetailRequestVersion
    this.setData({ loading: true, loadError: '' })
    try {
      const res = await orderApi.getOrderDetail(orderId ? { orderId } : { orderNo })
      if (!isCurrent()) return
      if (res && res.success && res.data) {
        const normalized = normalizeOrder(res.data || {})
        this.setData({
          orderNo: normalized.orderNo || orderNo || this.data.orderNo,
          orderId: normalized._id || orderId || this.data.orderId,
          ...this.pickSuccessOrderFields(normalized)
        })
        this.updateCustomerServicePrompt(normalized)
      } else {
        this.setData({ loadError: '订单详情暂未同步，可在“我的订单”中稍后刷新。' })
      }
    } catch (err) {
      if (!isCurrent()) return
      console.error('bookingSuccess loadOrderDetail failed', err)
      this.setData({ loadError: '订单详情暂未同步，可在“我的订单”中稍后刷新。' })
    } finally {
      if (isCurrent()) this.setData({ loading: false })
    }
  },

  updateCustomerServicePrompt(order) {
    const ready = order.orderType !== 'physical'
      && ['reserved', 'awaiting_shoot'].includes(order.businessStatusKey)
      && !order.isAfterSale && !order.paymentReviewRequired
    if (!ready) {
      if (this.data.showCustomerServiceModal) this.closeCustomerServiceModal()
      return
    }
    if (this._customerServicePromptShown) return
    this._customerServicePromptShown = true
    this.setData({ showCustomerServiceModal: true })
  },

  closeCustomerServiceModal() {
    this.setData({ showCustomerServiceModal: false })
  },

  noop() {},

  pickSuccessOrderFields(order = {}) {
    const reservation = order.reservationInfo || {}
    return {
      orderId: order._id || order.id || '',
      orderNo: order.orderNo || this.data.orderNo || '',
      packageName: decodeQueryValue(order.packageName) || '预约项目',
      packagePrice: order.packagePrice || 0,
      spotName: decodeQueryValue(reservation.spotNamesText),
      date: decodeQueryValue(reservation.date),
      timePeriod: decodeQueryValue(reservation.timePeriod),
      contactName: decodeQueryValue(order.contactName),
      contactPhone: decodeQueryValue(order.contactPhone),
      contactWechat: decodeQueryValue(order.contactWechat),
      message: decodeQueryValue(order.message),
      bookingMode: order.bookingMode || 'consult',
      statusText: order.businessStatusText || order.statusText || order.customerStatus || '待支付',
      businessStatusKey: order.businessStatusKey || 'pending_payment',
      workflowStage: order.workflowStage || 'awaiting_confirmation',
      depositDue: Number(order.depositDue || 0),
      finalDue: Number(order.finalDue || 0)
    }
  },

  buildUrl(path, params = {}) {
    return buildUrlWithSource(path, params, this.data)
  },

  copyOrderNo() {
    if (!this.data.orderNo) {
      wx.showToast({ title: '暂无预约编号', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: this.data.orderNo,
      success() {
        wx.showToast({ title: '已复制', icon: 'success' })
      }
    })
  },

  contactService() {
    this._customerServicePromptShown = true
    if (this.data.showCustomerServiceModal) this.closeCustomerServiceModal()
    return openCustomerService()
  },

  goMyOrders() {
    wx.navigateTo({ url: this.buildUrl('/pages/myOrders/myOrders') })
  },

  goOrderDetail() {
    const id = this.data.orderId || this.data.orderNo
    if (!id) return this.goMyOrders()
    wx.navigateTo({ url: this.buildUrl('/pages/orderDetail/orderDetail', { id }) })
  },

  goBookingAgain() {
    wx.switchTab({ url: '/pages/explore/explore' })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
