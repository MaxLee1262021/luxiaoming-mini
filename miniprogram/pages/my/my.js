const app = getApp()
const demoData = require('../../utils/demoData')
const orderApi = require('../../api/order')
const sourceStore = require('../../store/sourceStore')
const userStore = require('../../store/userStore')
const footprintService = require('../../service/footprint')
const { buildUrlWithSource } = require('../../utils/query')
const favorite = require('../../utils/favorite')

Page({
  data: {
    shopId: '',
    scene: '',
    userInfo: {},
    roleType: 'visitor',
    roleLabel: '游客',
    role: null,
    authReady: false,
    authLoading: false,
    phone: '',
    orderCounts: { pending: 0, deposit: 0, confirmed: 0, shooting: 0, editing: 0, final: 0, completed: 0 },
    footprint: footprintService.getEmptyFootprint({ authReady: false }),
    navTopPx: 26,
    capsuleSafeRightPx: 104,
    favoriteCount: 0
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
    try {
      await userStore.syncUserProfile()
      this.loadUserInfo()
    } catch (err) {
      console.warn('sync user profile failed', err)
    }
    this.loadOrderStatusCount()
    this.loadFootprint()
    this.loadFavoriteCount()
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

  maskPhone(phone = '') {
    if (!phone || phone.length < 7) return phone || ''
    return phone.slice(0, 3) + '****' + phone.slice(-4)
  },

  loadUserInfo() {
    // 登录态即可读取本人订单；手机号是联系人资料，不应成为订单查询的额外门槛。
    const authenticated = userStore.isAuthed()
    const bound = userStore.hasBoundPhone()
    const rawInfo = userStore.getDisplayUserInfo() || {}
    const displayPhone = userStore.getBoundPhone() || userStore.getLastContactPhone()
    const nickName = rawInfo.nickName || (displayPhone ? this.maskPhone(displayPhone) : '')
    this.setData({
      userInfo: { ...rawInfo, nickName: nickName || '鹿小鸣游客' },
      phone: displayPhone,
      authReady: authenticated,
      roleType: bound ? 'member' : 'visitor',
      roleLabel: bound ? '会员' : authenticated ? '已登录' : '游客'
    })
  },

  async onGetPhoneNumber(e) {
    if (!e.detail || !e.detail.code) {
      wx.showToast({ title: '需要授权手机号后才能使用个人功能', icon: 'none' })
      return
    }
    this.setData({ authLoading: true })
    try {
      const user = await userStore.bindPhoneByCode(e.detail.code)
      this.setData({ authReady: true })
      this.loadUserInfo()
      wx.showToast({ title: '授权成功', icon: 'success' })
      this.loadOrderStatusCount()
      this.loadFootprint()
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

  async loadOrderStatusCount() {
    if (!userStore.isAuthed()) {
      this.setData({ orderCounts: { pending: 0, deposit: 0, confirmed: 0, shooting: 0, editing: 0, final: 0, completed: 0 } })
      return
    }
    try {
      const res = await orderApi.getOrderStatusCount()
      if (res && res.success) {
        this.setData({ orderCounts: this.normalizeOrderCounts(res.data || {}) })
      } else {
        this.applyDemoOrderCounts()
      }
    } catch (e) {
      console.error('get order status count failed', e)
      this.applyDemoOrderCounts()
    }
  },

  applyDemoOrderCounts() {
    this.setData({
      orderCounts: this.normalizeOrderCounts({
        pending: demoData.orders.filter(item => item.status === 'pending').length,
        confirmed: demoData.orders.filter(item => ['confirmed', 'deposit_paid', 'assigned'].includes(item.status)).length,
        shooting: demoData.orders.filter(item => item.status === 'shooting').length,
        editing: demoData.orders.filter(item => item.status === 'editing').length,
        final: demoData.orders.filter(item => item.status === 'final_pending' || item.workflowStage === 'awaiting_final_payment').length,
        completed: demoData.orders.filter(item => ['delivered', 'completed'].includes(item.status)).length
      })
    })
  },

  // 我的旅拍足迹：章册来自后台配置（远程 getFootprintConfig > siteConfig > 默认），点亮状态由真实订单推导，不写死
  async loadFootprint() {
    // 先确保远程章册配置就绪（幂等：仅首次真正请求，失败静默回退默认章册）
    if (typeof footprintService.ensureLoaded === 'function') {
      await footprintService.ensureLoaded()
    }
    const authReady = userStore.isAuthed()
    if (!authReady) {
      this.setData({ footprint: footprintService.getEmptyFootprint({ authReady: false }) })
      return
    }
    try {
      const res = await orderApi.getMyOrders({ page: 1, pageSize: 100 })
      if (res && res.success) {
        const list = Array.isArray(res.data) ? res.data : (res.data && res.data.list) || []
        this.setData({ footprint: footprintService.buildFootprint(list, { authReady: true }) })
      } else {
        // 云函数未部署/异常时用演示订单兜底，保证界面不空白
        this.applyDemoFootprint()
      }
    } catch (err) {
      console.error('load footprint failed', err)
      this.applyDemoFootprint()
    }
  },

  applyDemoFootprint() {
    this.setData({
      footprint: footprintService.buildFootprint(demoData.orders, { authReady: true })
    })
  },

  normalizeOrderCounts(counts = {}) {
    return {
      pending: counts.pending || 0,
      deposit: counts.deposit || counts.awaiting_deposit || counts.deposit_pending || 0,
      confirmed: (counts.confirmed || 0) + (counts.deposit_paid || 0) + (counts.assigned || 0),
      shooting: counts.shooting || 0,
      editing: counts.editing || 0,
      final: counts.final || counts.awaiting_final_payment || 0,
      completed: (counts.completed || 0) + (counts.delivered || 0)
    }
  },

  goToOrders(e) {
    if (!this.ensureAuth()) return
    const status = e.currentTarget.dataset.status
    wx.navigateTo({ url: this.buildUrl('/pages/myOrders/myOrders', { status }) })
  },

  goToMyBookings() {
    if (!this.ensureAuth()) return
    wx.navigateTo({ url: this.buildUrl('/pages/myOrders/myOrders') })
  },

  goToPeripherals() {
    wx.navigateTo({ url: this.buildUrl('/pages/peripherals/peripherals') })
  },

  loadFavoriteCount() {
    this.setData({ favoriteCount: favorite.count() })
  },

  goToFavorites() {
    wx.navigateTo({ url: this.buildUrl('/pages/myFavorites/myFavorites') })
  },

  goToNotice() {
    if (!this.ensureAuth()) return
    wx.showModal({
      title: '预约须知',
      content: '1. 建议提前预约，方便安排摄影师和拍摄路线。\n2. 拍摄当天请准时到达约定地点。\n3. 如遇天气原因，可联系客服协商改期。\n4. 照片和短视频交付周期以旅拍套餐详情为准。',
      showCancel: false
    })
  },


  goToPrivacy() {
    wx.navigateTo({ url: this.buildUrl('/pages/privacy/privacy') })
  },

  openCustomerService() {
    if (!this.ensureAuth()) return
    wx.openCustomerServiceChat({
      extInfo: {},
      corpId: (getApp().globalData && getApp().globalData.corpId) || '',
      fail(err) {
        console.error('open customer service failed', err)
        wx.showToast({ title: '客服暂未配置，请稍后再试', icon: 'none' })
      }
    })
  }
})
