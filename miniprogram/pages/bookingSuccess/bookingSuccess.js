const app = getApp()
const orderApi = require('../../api/order')
const { buildUrlWithSource, decodeQueryFields, decodeQueryValue } = require('../../utils/query')
const { normalizeOrder } = require('../../utils/order')

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
    loading: false
  },

  onLoad(options = {}) {
    const source = app.captureSource ? app.captureSource(options) : {}
    const decodedOptions = decodeQueryFields(options, SUCCESS_QUERY_FIELDS)

    this.setData({
      orderNo: options.orderNo || '',
      shopId: options.shopId || source.shopId || '',
      scene: options.scene || source.scene || '',
      ...decodedOptions,
      bookingMode: options.bookingMode || 'consult'
    })

    if (options.orderNo) this.loadOrderDetail(options.orderNo)
  },

  async loadOrderDetail(orderNo) {
    this.setData({ loading: true })
    try {
      const res = await orderApi.getOrderDetail({ orderNo })
      if (res && res.success && res.data) {
        this.setData(this.pickSuccessOrderFields(normalizeOrder(res.data || {})))
      }
    } catch (err) {
      console.error('bookingSuccess loadOrderDetail failed', err)
    } finally {
      this.setData({ loading: false })
    }
  },

  pickSuccessOrderFields(order = {}) {
    return {
      orderId: order._id || '',
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
      bookingMode: order.bookingMode || 'consult'
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
    if (!wx.openCustomerServiceChat) {
      wx.showToast({ title: '客服暂未配置，请稍后再试', icon: 'none' })
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

  goMyOrders() {
    wx.navigateTo({ url: this.buildUrl('/pages/myOrders/myOrders') })
  },

  goBookingAgain() {
    wx.switchTab({ url: '/pages/explore/explore' })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
