const app = getApp()
const demoData = require('../../utils/demoData')
const orderApi = require('../../api/order')
const { buildUrlWithSource } = require('../../utils/query')
const { normalizeOrder, getOrderStatusDesc } = require('../../utils/order')
const afterSaleService = require('../../service/afterSale')

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
    afterSaleVisible: false,
    afterSaleReason: '',
    afterSaleOrder: null,
    afterSaleSubmitting: false
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
        this.applyDemoOrder()
      } else if (res.data) {
        this.applyOrder(normalizeOrder(res.data), false)
      } else {
        this.setData({ error: '订单不存在', isDemo: false })
      }
    } catch (err) {
      console.error('getOrderDetail error', err)
      this.applyDemoOrder()
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

  // —— 订单操作：取消 / 申请售后（与我的订单页一致）——
  cancelOrder() {
    const order = this.data.order
    if (!order || !order.canCancel) {
      wx.showToast({ title: '当前状态不可取消', icon: 'none' })
      return
    }
    wx.showModal({
      title: '确认取消',
      content: '待确认订单尚未进入客服确认流程，确认后将取消这笔预约。',
      confirmText: '取消订单',
      cancelText: '再想想',
      success: res => {
        if (!res.confirm) return
        if (this.data.isDemo) {
          this.setData({ order: { ...order, status: 'canceled', statusText: '已取消', canCancel: false, canAfterSale: true } })
          wx.showToast({ title: '订单已取消', icon: 'success' })
          return
        }
        orderApi.updateOrderStatus({ orderId: order._id, orderNo: order.orderNo, newStatus: 'canceled' })
          .then(result => {
            if (result && result.success) {
              wx.showToast({ title: '订单已取消', icon: 'success' })
              this.loadOrder()
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

  openAfterSale() {
    const order = this.data.order
    if (!order || !order.canAfterSale) return
    this.setData({ afterSaleVisible: true, afterSaleReason: '', afterSaleOrder: order })
  },

  closeAfterSale() {
    if (this.data.afterSaleSubmitting) return
    this.setData({ afterSaleVisible: false, afterSaleReason: '', afterSaleOrder: null })
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
      this.setData({ afterSaleVisible: false, afterSaleReason: '', afterSaleOrder: null })
      this.loadOrder()
    } catch (err) {
      console.error('submit after sale failed', err)
      wx.showToast({ title: '提交失败，请稍后再试', icon: 'none' })
    } finally {
      this.setData({ afterSaleSubmitting: false })
    }
  }
})
