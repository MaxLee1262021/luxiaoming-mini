const app = getApp()
const { openCustomerService } = require('../../service/customerService')
const { logout, getOpenid } = require('../../api/client')
const orderApi = require('../../api/order')
const sourceStore = require('../../store/sourceStore')
const userStore = require('../../store/userStore')
const { buildUrlWithSource } = require('../../utils/query')

Page({
  data: {
    shopId: '',
    scene: '',
    roleType: 'visitor',
    roleLabel: '游客',
    role: null,
    authReady: false,
    authLoading: false,
    phone: '',
    orderCounts: {
      pendingConfirmation: 0,
      awaitingShoot: 0,
      shooting: 0,
      completed: 0
    },
    navTopPx: 26,
    capsuleSafeRightPx: 104
  },

  initNavMetrics() {
    try {
      const menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null
      const system = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const windowWidth = system.windowWidth || 375
      const statusBarHeight = system.statusBarHeight || 20
      const navTopPx = menu && menu.top ? menu.top : statusBarHeight + 8
      const capsuleSafeRightPx = menu && menu.left ? windowWidth - menu.left + 12 : 104
      this.setData({ navTopPx, capsuleSafeRightPx })
    } catch (err) {
      console.warn('my init nav metrics fallback', err)
    }
  },

  onLoad(options = {}) {
    this.initNavMetrics()
    this.captureSource(options)
    this.refreshUserState()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.captureSource()
    this.refreshUserState()
  },

  async refreshUserState() {
    this.loadUserInfo()
    if (!userStore.isAuthed()) {
      this.setData({ orderCounts: { pendingConfirmation: 0, awaitingShoot: 0, shooting: 0, completed: 0 } })
      return
    }
    try {
      await userStore.syncUserProfile()
      this.loadUserInfo()
    } catch (err) {
      console.warn('sync user profile failed', err)
    }
    this.loadOrderCounts()
  },

  async loadOrderCounts() {
    try {
      const result = await orderApi.getOrderStatusCount({})
      const data = (result && result.success && result.data) || result && result.data || result || {}
      const business = data.businessStatus || data.publicStatus || {}
      const pick = (...values) => {
        const value = values.find(item => item !== undefined && item !== null && item !== '')
        const number = Number(value)
        return Number.isFinite(number) && number >= 0 ? number : 0
      }
      this.setData({
        orderCounts: {
          pendingConfirmation: pick(business.pending_payment, data.pending_payment, data.pending, data.deposit),
          awaitingShoot: pick(business.reserved, business.awaiting_shoot, data.awaiting_photographer, data.confirmed, data.awaiting_shoot),
          shooting: pick(business.shooting, data.shooting, data.shot),
          completed: pick(business.completed, data.completed, data.delivered, data.paid)
        }
      })
    } catch (err) {
      console.warn('load order status count failed', err)
    }
  },

  captureSource(options = {}) {
    const source = options && Object.keys(options).length
      ? sourceStore.captureSource(options)
      : (app.getSource ? app.getSource() : sourceStore.getSource())
    this.setData({
      shopId: options.shopId || source.shopId || this.data.shopId || '',
      scene: options.scene || source.scene || this.data.scene || ''
    })
  },

  buildUrl(path, params = {}) {
    return buildUrlWithSource(path, params, this.data)
  },

  loadUserInfo() {
    // 登录态即可读取本人订单；手机号是联系人资料，不应成为订单查询的额外门槛。
    const authenticated = userStore.isAuthed()
    const bound = userStore.hasBoundPhone()
    const displayPhone = userStore.getBoundPhone() || userStore.getLastContactPhone()
    this.setData({
      phone: displayPhone,
      authReady: authenticated,
      roleType: bound ? 'member' : 'visitor',
      roleLabel: bound ? '会员' : authenticated ? '已登录' : '游客'
    })
  },

  async onGetPhoneNumber(e) {
    if (!e.detail || !e.detail.code) {
      const detail = e.detail || {}
      const errMsg = String(detail.errMsg || '')
      if (detail.errno === 112 || /api scope is not declared in the privacy agreement/i.test(errMsg)) {
        wx.showModal({
          title: '隐私指引未配置',
          content: '请在微信公众平台进入“设置-服务内容声明-用户隐私保护指引”，声明“手机号”信息类型并保存。配置生效后重新编译小程序。',
          showCancel: false,
          confirmText: '知道了'
        })
        return
      }
      wx.showToast({ title: '需要授权手机号后才能使用个人功能', icon: 'none' })
      return
    }
    this.setData({ authLoading: true })
    try {
      await userStore.bindPhoneByCode(e.detail.code)
      if (!userStore.isAuthed()) return
      const appInstance = getApp()
      if (appInstance && appInstance.globalData) {
        appInstance.globalData.openid = getOpenid()
        appInstance.globalData.userInfo = null
      }
      this.loadUserInfo()
      wx.showToast({ title: '授权成功', icon: 'success' })
    } catch (err) {
      console.error('bind phone failed', err)
      wx.showToast({ title: err.message || '手机号绑定失败', icon: 'none' })
    } finally {
      this.setData({ authLoading: false })
    }
  },

  ensureAuth() {
    if (userStore.isAuthed()) {
      this.loadUserInfo()
      return true
    }
    wx.showToast({ title: '请先授权微信并绑定手机号', icon: 'none' })
    return false
  },

  goToOrders(e) {
    if (!this.ensureAuth()) return
    const status = e.currentTarget.dataset.status
    wx.navigateTo({ url: this.buildUrl('/pages/myOrders/myOrders', status ? { status } : {}) })
  },

  goToMyBookings() {
    if (!this.ensureAuth()) return
    wx.navigateTo({ url: this.buildUrl('/pages/myOrders/myOrders') })
  },

  goToMyFavorites() {
    if (!this.ensureAuth()) return
    wx.navigateTo({ url: this.buildUrl('/pages/myFavorites/myFavorites') })
  },

  goToPeripherals() {
    wx.navigateTo({ url: this.buildUrl('/pages/peripherals/peripherals') })
  },

  goToNotice() {
    if (!this.ensureAuth()) return
    wx.showModal({
      title: '预约须知',
      content: '1. 建议提前预约，方便安排摄影师和拍摄路线。\n2. 拍摄当天请准时到达约定地点。\n3. 如遇天气原因，可联系客服协商改期。\n4. 照片和短视频交付周期以旅拍套餐详情为准。',
      showCancel: false
    })
  },

  onLogout() {
    if (!userStore.isAuthed()) return
    wx.showModal({
      title: '退出登录',
      content: '退出后需重新授权手机号才能查看个人订单和预约。',
      confirmText: '退出登录',
      confirmColor: '#EE2C2C',
      success: (result) => {
        if (!result || !result.confirm) return
        logout()
        userStore.clearUser()
        const appInstance = getApp()
        if (appInstance && appInstance.globalData) {
          appInstance.globalData.openid = null
          appInstance.globalData.userInfo = null
        }
        this.setData({
          roleType: 'visitor',
          roleLabel: '游客',
          role: null,
          authReady: false,
          authLoading: false,
          phone: ''
        })
        wx.showToast({ title: '已退出登录', icon: 'success' })
      }
    })
  },


  goToPrivacy() {
    wx.navigateTo({ url: this.buildUrl('/pages/privacy/privacy') })
  },

  openCustomerService() {
    if (!this.ensureAuth()) return
    openCustomerService()
  }
})
