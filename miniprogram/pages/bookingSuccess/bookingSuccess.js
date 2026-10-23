const app = getApp()
const orderApi = require('../../api/order')
const { buildUrlWithSource, decodeQueryFields, decodeQueryValue } = require('../../utils/query')
const { normalizeOrder } = require('../../utils/order')
const { openCustomerService } = require('../../service/customerService')

const SUCCESS_QUERY_FIELDS = [
  'packageName',
  'packagePrice',
  'spotName',
  'seriesName',
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
    seriesName: '',
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
    loading: false,
    loadError: ''
  },

  onLoad(options = {}) {
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

  async loadOrderDetail(orderNo, orderId = '') {
    this.setData({ loading: true })
    try {
      const res = await orderApi.getOrderDetail(orderId ? { orderId } : { orderNo })
      if (res && res.success && res.data) {
        const normalized = normalizeOrder(res.data || {})
        this.setData({
          orderNo: normalized.orderNo || orderNo || this.data.orderNo,
          orderId: normalized._id || orderId || this.data.orderId,
          ...this.pickSuccessOrderFields(normalized)
        })
      } else {
        this.setData({ loadError: '订单详情暂未同步，可在“我的订单”中稍后刷新。' })
      }
    } catch (err) {
      console.error('bookingSuccess loadOrderDetail failed', err)
      this.setData({ loadError: '订单详情暂未同步，可在“我的订单”中稍后刷新。' })
    } finally {
      this.setData({ loading: false })
    }
  },

  pickSuccessOrderFields(order = {}) {
    return {
      orderId: order._id || order.id || '',
      orderNo: order.orderNo || this.data.orderNo || '',
      packageName: decodeQueryValue(order.packageName) || '预约项目',
      packagePrice: order.packagePrice || 0,
      spotName: decodeQueryValue(order.spotName) || '客服确认中',
      seriesName: decodeQueryValue(order.seriesName) || '旅拍服务',
      date: decodeQueryValue(order.date),
      timePeriod: decodeQueryValue(order.timePeriod),
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
    openCustomerService()
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
