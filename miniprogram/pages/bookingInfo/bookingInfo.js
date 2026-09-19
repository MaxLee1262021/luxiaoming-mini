const app = getApp()
const demoData = require('../../utils/demoData')
const bookingApi = require('../../api/booking')
const { buildUrlWithSource } = require('../../utils/query')
const bookingUtils = require('../../utils/booking')
const bookingDataService = require('../../service/bookingData')
const bookingPicker = require('../../service/bookingPicker')
const bookingInfoActions = require('../../service/bookingInfoActions')
const bookingConfig = require('../../service/bookingConfig')
const userStore = require('../../store/userStore')
const { getPageModuleConfig, isPageModuleVisible } = require('../../service/siteConfig')
const analytics = require('../../utils/analytics')
const { isExplicitDemoMode } = require('../../config/env')

function getLocalDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

Page({
  data: {
    shopId: '',
    scene: '',
    name: '',
    phone: '',
    boundPhone: '',
    contactPhones: [],
    phoneMode: 'wechat',
    date: '',
    time: '',
    minDate: getLocalDate(),
    timeIndex: 0,
    timeOptions: ['上午 09:00-12:00', '下午 13:00-17:00', '晚上 18:00-21:00', '全天均可（客服确认）'],
    message: '',
    participantCount: 1,
    agreed: false,
    submitting: false,
    bookingRequestKey: '',
    items: [],
    totalPrice: 0,
    prefillSeriesId: '',
    prefillPackageId: '',
    prefillAlbumId: '',
    prefillSpotId: '',
    prefillAlbumPrice: '',
    prefillBasket: '',
    requestedSpot: '',
    spotOptions: [],
    allSeries: [],
    allAlbums: [],
    allPackages: [],
    allPeripherals: [],
    filteredSeries: [],
    filteredAlbums: [],
    filteredPackages: [],
    filteredPeripherals: [],
    currentSpotId: '',
    currentTab: 'package',
    pickerKeyword: '',
    pickerCart: [],
    selectedSeriesId: '',
    selectedSeriesName: '',
    activePickerAlbumId: '',
    activePickerPackageId: '',
    showPicker: false,
    showSheet: false,
    sheetProducts: [],
    authReady: false,
    authLoading: false,
    showDevBypass: false,
    userInfo: {},
    pageConfig: {},
    moduleVisible: {
      selectedItems: true,
      contact: true,
      basket: true,
      notice: true
    },
    loading: true,
    degraded: false,
    dataUnavailable: false,
    bookingMode: 'consult',
    // 约拍定制定价 / 预约须知：默认值与原硬编码一致，后台 getBookingConfig RPC 就绪后自动替换
    bookingConfig: bookingConfig.getConfig()
  },

  onLoad(options = {}) {
    const source = app.captureSource ? app.captureSource(options) : {}
    this.setData({
      shopId: options.shopId || source.shopId || '',
      scene: options.scene || source.scene || '',
      prefillSeriesId: options.seriesId || '',
      prefillPackageId: options.packageId || '',
      prefillAlbumId: options.albumId || '',
      prefillSpotId: options.spotId || '',
      prefillAlbumPrice: options.albumPrice || '',
      prefillBasket: options.basket || '',
      requestedSpot: options.requestedSpot || ''
    })
    this.applyPageConfig()
    this.refreshAuthState()
    this.loadBookingData()
    this.loadBookingConfig()
  },

  // 预约页专属分享：带上当前选中项目与打卡点，方便好友直接进入同款预约
  onShareAppMessage() {
    const { requestedSpot, prefillSpotId, prefillPackageId, prefillAlbumId, prefillSeriesId } = this.data
    const query = []
    if (prefillSpotId) query.push('spotId=' + prefillSpotId)
    if (prefillPackageId) query.push('packageId=' + prefillPackageId)
    if (prefillAlbumId) query.push('albumId=' + prefillAlbumId)
    if (prefillSeriesId) query.push('seriesId=' + prefillSeriesId)
    const queryStr = query.join('&')
    return {
      title: requestedSpot ? `鹿小鸣旅拍｜${requestedSpot}约拍预约进行中` : '鹿小鸣旅拍｜城市旅拍预约，欢迎来撩',
      path: '/pages/bookingInfo/bookingInfo' + (queryStr ? '?' + queryStr : '')
    }
  },

  applyPageConfig() {
    const pageKey = 'booking'
    this.setData({
      pageConfig: getPageModuleConfig(pageKey),
      moduleVisible: {
        selectedItems: isPageModuleVisible(pageKey, 'selectedItems'),
        contact: isPageModuleVisible(pageKey, 'contact'),
        basket: isPageModuleVisible(pageKey, 'basket'),
        notice: isPageModuleVisible(pageKey, 'notice')
      }
    })
  },

  onShow() {
    let env = ''
    try { env = (wx.getAccountInfoSync().miniProgram || {}).envVersion || '' } catch (e) {}
    this.setData({ showDevBypass: env === 'develop' })
    this.refreshAuthState()
  },

  buildUrl(path, params = {}) {
    return buildUrlWithSource(path, params, this.data)
  },

  refreshAuthState() {
    const userInfo = userStore.getDisplayUserInfo()
    const phone = userStore.getBoundPhone()
    this.setData({
      authReady: this.isPhoneReady(),
      userInfo,
      boundPhone: phone,
      contactPhones: bookingPicker.mergeContactPhones(this.data.contactPhones, phone ? [phone] : []),
      phoneMode: phone && (!this.data.phone || this.data.phone === phone) ? 'wechat' : 'custom',
      phone: phone || this.data.phone
    })
  },

  // 进门门槛：微信绑定手机号 或 手动填写的合法手机号，都算过关
  // 个人版没有微信一键手机号，手动填号即主路径
  isPhoneReady() {
    return userStore.hasBoundPhone() || this.isValidPhone(this.data.phone)
  },

  isValidPhone(phone) {
    return /^1[3-9]\d{9}$/.test(String(phone || '').trim())
  },

  async onGetPhoneNumber(e) {
    if (!e.detail || !e.detail.code) {
      wx.showToast({ title: '需要授权手机号后才能预约', icon: 'none' })
      return
    }
    this.setData({ authLoading: true })
    try {
      const user = await userStore.bindPhoneByCode(e.detail.code)
      this.setData({
        authReady: true,
        userInfo: user.userInfo || this.data.userInfo,
        boundPhone: user.phone || '',
        contactPhones: bookingPicker.mergeContactPhones(this.data.contactPhones, user.phone ? [user.phone] : []),
        phoneMode: 'wechat',
        phone: user.phone || this.data.phone
      })
      wx.showToast({ title: '授权成功', icon: 'success' })
    } catch (err) {
      console.error('bind phone failed', err)
      wx.showToast({ title: err.message || '手机号绑定失败', icon: 'none' })
    } finally {
      this.setData({ authLoading: false })
    }
  },

  onDevBypass() {
    userStore.saveUser({ phone: '13800000000', userInfo: { nickName: '测试用户' } })
    this.refreshAuthState()
    wx.showToast({ title: '已进入测试模式', icon: 'none' })
  },

  async loadBookingData() {
    try {
      const res = await bookingApi.getBookingData({ shopId: this.data.shopId })
      if (res && res.success) {
        this.applyBookingData(res.data || {}, false)
        this.setData({ degraded: false, dataUnavailable: false })
      } else {
        if (isExplicitDemoMode()) {
          this.applyBookingData(demoData.getBookingData(), true)
          this.setData({ degraded: true, dataUnavailable: false })
        } else {
          this.applyBookingData({}, false)
          this.setData({ degraded: true, dataUnavailable: true })
        }
      }
    } catch (err) {
      console.error('load booking data failed', err)
      this.applyBookingData(isExplicitDemoMode() ? demoData.getBookingData() : {}, isExplicitDemoMode())
      this.setData({ degraded: true, dataUnavailable: !isExplicitDemoMode() })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 降级提示条「重新加载」：重新拉真实预约数据，成功后提示条自动消失
  onRetryLoad() {
    this.setData({ loading: true })
    this.loadBookingData()
  },

  // 预约配置（约拍定价/须知）：拉真实配置，失败回退默认值（service 层已缓存，全站共享）
  async loadBookingConfig() {
    try {
      const cfg = await bookingConfig.ensureLoaded()
      this.setData({ bookingConfig: cfg }, () => {
        // 配置可能晚于 initPrefill 到达：就绪后重算约拍定制价与合计，保证展示与提交口径一致
        this.updateCustomItemPrice()
        this.updateTotalPrice()
      })
    } catch (err) {
      console.warn('booking config load fallback', err)
    }
  },

  applyBookingData(data = {}, allowFallback = false) {
    const bookingData = bookingDataService.mergeBookingData(data, { allowFallback })
    const spots = bookingData.spots
    const allSeries = bookingData.allSeries
    const allPackages = bookingData.allPackages
    const allAlbums = bookingData.allAlbums
    const allPeripherals = bookingData.allPeripherals || demoData.peripherals || []
    const currentSpotId = this.data.prefillSpotId || ''
    this.setData({
      spotOptions: spots,
      allSeries,
      allAlbums,
      allPackages,
      allPeripherals,
      currentSpotId
    })
    this.setData({ sheetProducts: this.buildSheetProducts({ allPackages, allSeries, allAlbums, allPeripherals, spotOptions: spots }) })
    this.updatePickerLists(currentSpotId)
    this.initPrefill()
  },

  // 把页面四类商品归一化为「添加拍摄项目」弹窗可选择的行（单一来源，组件内部只做分组展示）
  buildSheetProducts({ allPackages = [], allSeries = [], allAlbums = [], allPeripherals = [], spotOptions = [] } = {}) {
    const productUtils = require('../../utils/product')
    const itemId = item => String((item && (item._id || item.id || item.albumId)) || '')
    const findSeries = id => (allSeries || []).find(s => itemId(s) === String(id || '')) || {}
    const findSpot = id => (spotOptions || []).find(s => itemId(s) === String(id || '')) || {}
    const uniqueSpotIds = values => [...new Set((values || [])
      .filter(value => value !== undefined && value !== null && String(value).trim())
      .map(value => String(value)))]
    const spotIdsFor = (item = {}, series = {}, includeAllWhenGlobal = false) => {
      const direct = uniqueSpotIds([
        ...(Array.isArray(item.spotIds) ? item.spotIds : []),
        item.spotId
      ])
      if (direct.length) return direct
      const inherited = uniqueSpotIds([
        ...(Array.isArray(series.spotIds) ? series.spotIds : []),
        series.spotId
      ])
      if (inherited.length || !includeAllWhenGlobal) return inherited
      // 全局套餐没有点位字段时，也要能从任一已开通点位进入预约。
      return uniqueSpotIds((spotOptions || []).map(itemId))
    }
    const rows = []
    // 套餐 / 视频单品（均在 allPackages 中，按 isVideo 区分）
    ;(allPackages || []).forEach(pkg => {
      const isVid = productUtils.isVideo(pkg)
      const series = findSeries(pkg.seriesId)
      const meta = isVid
        ? [pkg.videoDuration, pkg.finishedVideoCount].filter(Boolean).join(' · ') || '短视频成片'
        : [pkg.duration ? pkg.duration + '分钟' : '', pkg.retouchCount ? '精修' + pkg.retouchCount + '张' : ''].filter(Boolean).join(' · ') || '旅拍套餐'
      spotIdsFor(pkg, series, true).forEach(spotId => {
        const spot = findSpot(spotId)
        rows.push({
          uid: `pkg_${itemId(pkg)}_${spotId}`,
          kind: 'package',
          cat: isVid ? 'video' : 'package',
          spotId,
          spotName: spot.name || pkg.spotName || '',
          name: pkg.name,
          cover: pkg.cover || pkg.coverUrl || pkg.image || '/images/placeholder.png',
          price: pkg.price || 0,
          meta,
          catLabel: isVid ? '视频摄像' : '旅拍套餐',
          src: { ...pkg, _id: itemId(pkg), spotId, spotName: spot.name || pkg.spotName || '' },
          series,
          spot
        })
      })
    })
    // 照片留影（album = photo_single）
    ;(allAlbums || []).forEach(album => {
      const series = findSeries(album.seriesId)
      spotIdsFor(album, series).forEach(spotId => {
        const spot = findSpot(spotId)
        rows.push({
          uid: `album_${itemId(album)}_${spotId}`,
          kind: 'album',
          cat: 'album',
          spotId,
          spotName: spot.name || '',
          name: album.name,
          cover: album.cover || album.coverImage || (album.sampleUrls && album.sampleUrls[0]) || '/images/placeholder.png',
          price: album.price || 0,
          meta: (album.photoCount || (album.sampleUrls && album.sampleUrls.length) || 0) + ' 张照片',
          catLabel: '照片留影',
          src: { ...album, _id: itemId(album), albumId: itemId(album), spotId },
          series,
          spot
        })
      })
    })
    // 影像周边（全城通用，spotId 留空，由组件在每个面板补充）
    ;(allPeripherals || []).forEach(per => {
      rows.push({
        uid: 'peri_' + per._id,
        kind: 'peripheral',
        cat: 'peripheral',
        spotId: '',
        spotName: '',
        name: per.name,
        cover: per.image || per.cover || '/images/placeholder.png',
        price: per.price || 0,
        meta: (per.specs && per.specs.join(' · ')) || per.description || '影像周边',
        catLabel: '影像周边',
        src: { _id: per._id, name: per.name, price: per.price },
        series: {},
        spot: {}
      })
    })
    return rows
  },

  initPrefill() {
    const { prefillPackageId, prefillAlbumId, prefillSeriesId, prefillSpotId, prefillAlbumPrice } = this.data
    if (this.data.prefillBasket === '1') {
      const basketItems = wx.getStorageSync('lxm_booking_basket') || []
      wx.removeStorageSync('lxm_booking_basket')
      if (basketItems.length) {
        this.setData({ items: basketItems })
        this.updateTotalPrice()
        return
      }
    }
    // 未收录点（客人搜索未建的点）发起约拍定制：纯文本期望拍摄地，自动预填「约拍定制」商品项
    if (!prefillPackageId && !prefillAlbumId && !prefillSeriesId && !prefillSpotId && this.data.requestedSpot) {
      const customItem = bookingConfig.buildCustomItem({
        count: this.data.participantCount || 1,
        spotName: this.data.requestedSpot,
        requestedSpot: this.data.requestedSpot
      })
      this.setData({ items: [customItem] })
      this.updateTotalPrice()
      return
    }
    // 仅带打卡点进入（点"约拍定制"兜底）：自动预填「约拍定制」商品项
    if (!prefillPackageId && !prefillAlbumId && !prefillSeriesId && prefillSpotId) {
      const spot = (this.data.spotOptions || []).find(s => s._id === prefillSpotId) || {}
      const customItem = bookingConfig.buildCustomItem({
        count: this.data.participantCount || 1,
        spotId: prefillSpotId,
        spotName: spot.name || '',
        requestedSpot: spot.name || ''
      })
      const items = [customItem]
      this.setData({ items })
      this.updateTotalPrice()
      return
    }
    if (!prefillPackageId && !prefillAlbumId && !prefillSeriesId) return
    const result = bookingDataService.findPrefillSelection({
      data: {
        spots: this.data.spotOptions,
        allSeries: this.data.allSeries,
        allPackages: this.data.allPackages,
        allAlbums: this.data.allAlbums
      },
      prefill: {
        packageId: prefillPackageId,
        albumId: prefillAlbumId,
        seriesId: prefillSeriesId,
        spotId: prefillSpotId,
        albumPrice: prefillAlbumPrice
      }
    })
    const item = result.item
    if (!item.packageId && !item.albumId && !item.seriesId) {
      wx.showToast({ title: '未找到预约商品，请重新选择', icon: 'none' })
      return
    }
    this.setData({ items: [item] })
    this.updateTotalPrice()
  },

  updatePickerLists(spotId = '') {
    const keyword = this.data.pickerKeyword
    const spotSeries = bookingUtils.filterSeriesBySpot(this.data.allSeries, spotId)
    let filteredPeripherals = this.data.allPeripherals || []
    if (keyword) {
      const kw = keyword.toLowerCase()
      filteredPeripherals = filteredPeripherals.filter(item =>
        (item.name || '').toLowerCase().includes(kw) ||
        (item.cate || '').toLowerCase().includes(kw) ||
        (item.description || '').toLowerCase().includes(kw)
      )
    }
    this.setData({
      filteredSeries: bookingPicker.enrichSeriesList(spotSeries, this.data.allAlbums, keyword),
      filteredAlbums: bookingPicker.filterAlbumsBySeries(this.data.allAlbums, this.data.selectedSeriesId, keyword),
      filteredPackages: bookingPicker.filterPackages({
        packages: this.data.allPackages,
        albums: this.data.allAlbums,
        spotId,
        keyword,
        type: this.data.currentTab === 'video' ? 'video' : 'photo'
      }),
      filteredPeripherals
    })
  },

  openPicker() { bookingInfoActions.openPicker(this) },
  closePicker() { bookingInfoActions.closePicker(this) },
  switchPickerTab(e) { bookingInfoActions.switchPickerTab(this, e) },
  onPickerSpotTap(e) { bookingInfoActions.onPickerSpotTap(this, e) },
  onPickerSearch(e) { bookingInfoActions.onPickerSearch(this, e) },
  onPickerSearchClear() { bookingInfoActions.onPickerSearch(this, { detail: { value: '' } }) },
  previewPickerPackage(e) { bookingInfoActions.previewPickerPackage(this, e) },
  previewPickerPackageSample(e) { bookingInfoActions.previewPickerPackageSample(this, e) },
  addPackage(e) { bookingInfoActions.addPackage(this, e) },
  addSeries(e) { bookingInfoActions.addSeries(this, e) },
  addAlbum(e) { bookingInfoActions.addAlbum(this, e) },
  addPeripheral(e) { bookingInfoActions.addPeripheral(this, e) },
  previewPickerAlbum(e) { bookingInfoActions.previewPickerAlbum(this, e) },
  previewPickerAlbumSample(e) { bookingInfoActions.previewPickerAlbumSample(this, e) },
  backToSeriesList() { bookingInfoActions.backToSeriesList(this) },
  removePickerCartItem(e) { bookingInfoActions.removePickerCartItem(this, e) },
  confirmPickerCart() {
    const itemsBefore = (this.data.items || []).length
    bookingInfoActions.confirmPickerCart(this)
    const itemsAfter = (this.data.items || []).length
    if (itemsAfter > itemsBefore) {
      analytics.track('booking_add_item', { itemCount: itemsAfter })
    }
  },
  removeItem(e) { bookingInfoActions.removeItem(this, e) },

  // ===== 添加拍摄项目弹窗（新组件 lxm-add-item-sheet）=====
  openSheet() { this.setData({ showSheet: true }) },
  onSheetClose() { this.setData({ showSheet: false }) },
  onSheetConfirm(e) {
    const selected = (e.detail && e.detail.items) || []
    if (!selected.length) return
    const bookingUtils = require('../../utils/booking')
    const bookingPicker = require('../../service/bookingPicker')
    const count = this.data.participantCount || 1
    const items = selected.map(row => {
      if (row.kind === 'custom') {
        return bookingConfig.buildCustomItem({
          count,
          spotId: row.spotId || '',
          spotName: row.spotName || '',
          requestedSpot: row.spotName || ''
        })
      }
      if (row.kind === 'peripheral') {
        return bookingUtils.buildItemFromPeripheral({ peripheral: row.src })
      }
      if (row.kind === 'album') {
        return bookingUtils.buildPrefillItem({ album: row.src, series: row.series, spot: row.spot })
      }
      return bookingUtils.buildItemFromPackage({ pkg: row.src, series: row.series, spot: row.spot })
    })
    const combined = [...(this.data.items || []), ...items]
    if (!bookingPicker.hasMainItem(combined)) {
      wx.showToast({ title: '影像周边需搭配拍摄项目一起预约', icon: 'none' })
      return
    }
    this.setData({
      items: bookingPicker.mergeCartItems(this.data.items, items),
      showSheet: false
    })
    this.updateTotalPrice()
  },

  updateTotalPrice() {
    this.setData({ totalPrice: bookingUtils.sumItemsPrice(this.data.items) })
  },

  onNameInput(e) { this.setData({ name: e.detail.value }) },

  onDateChange(e) { this.setData({ date: e.detail.value }) },

  onTimeChange(e) {
    const timeIndex = Number(e.detail.value) || 0
    this.setData({ timeIndex, time: this.data.timeOptions[timeIndex] || '' })
  },

  onPhoneInput(e) {
    const phone = e.detail.value
    const valid = this.isValidPhone(phone)
    this.setData({
      phone,
      phoneMode: phone && phone === this.data.boundPhone ? 'wechat' : 'custom',
      // 手动填的合法号即过关（个人版主路径）；过关后保持，避免用户清空时表单闪退
      authReady: this.data.authReady || valid || userStore.hasBoundPhone()
    })
  },

  useBoundPhone() { bookingInfoActions.useBoundPhone(this) },
  addNewPhone() { bookingInfoActions.addNewPhone(this) },
  addContactPhone() { bookingInfoActions.addContactPhone(this) },
  removeContactPhone(e) { bookingInfoActions.removeContactPhone(this, e) },
  useContactPhone(e) { bookingInfoActions.useContactPhone(this, e) },
  onMessageInput(e) { this.setData({ message: e.detail.value }) },
  changeParticipant(e) {
    const delta = Number(e.currentTarget.dataset.delta) || 0
    let next = (this.data.participantCount || 1) + delta
    if (next < 1) next = 1
    if (next > 10) next = 10
    this.setData({ participantCount: next }, () => {
      this.updateCustomItemPrice()
      this.updateTotalPrice()
    })
  },

  updateCustomItemPrice() {
    const count = this.data.participantCount || 1
    const items = (this.data.items || []).map(item => {
      if (!item.custom) return item
      return { ...item, price: bookingConfig.calcCustomPrice(count), participantCount: count }
    })
    this.setData({ items })
  },
  toggleAgree() { this.setData({ agreed: !this.data.agreed }) },

  showNotice() {
    wx.showModal({
      title: '预约须知',
      content: (this.data.bookingConfig && this.data.bookingConfig.bookingNotice) || bookingConfig.DEFAULT_CONFIG.bookingNotice,
      showCancel: false
    })
  },

  async submitBooking() {
    if (this.data.submitting) return
    if (this.data.dataUnavailable) {
      wx.showToast({ title: '拍摄项目暂不可用，请重试后再提交', icon: 'none' })
      return
    }
    if (!this.isPhoneReady()) {
      this.refreshAuthState()
      wx.showToast({ title: '请先填写手机号', icon: 'none' })
      return
    }
    const validation = bookingUtils.validateBookingForm(this.data)
    if (!validation.valid) {
      wx.showToast({ title: validation.message, icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      // Keep a manually entered contact phone as a convenience without
      // overwriting the verified WeChat phone stored on the profile.
      userStore.saveUser({ lastContactPhone: this.data.phone })
      // 下单前把实时来源（商家二维码扫码溯源）并入 payload
      const source = (app.getSource && app.getSource()) || {}
      this.setData({
        shopId: this.data.shopId || source.shopId || '',
        scene: this.data.scene || source.scene || '',
        codeId: source.codeId || '',
        placementType: source.placementType || '',
        placementLabel: source.placementLabel || ''
      })
      // 先建单：预约提交为待确认，绝不直接标已付
      let submitMessage = this.data.message || ''
      if (!submitMessage.includes('参与人数')) {
        submitMessage = (submitMessage ? submitMessage + '\n' : '') + '参与人数：' + (this.data.participantCount || 1) + ' 人'
      }
      const bookingRequestKey = this.data.bookingRequestKey || `booking-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      this.setData({ bookingRequestKey })
      const payload = { ...bookingUtils.buildBookingPayload({ ...this.data, message: submitMessage }), idempotencyKey: bookingRequestKey }
      const res = await bookingApi.createBooking(payload)
      if (res && res.success) {
        const created = (res.data && typeof res.data === 'object') ? res.data : res
        const orderId = created.orderId || created._id || created.id || res.orderId || res._id || ''
        const orderNo = created.orderNo || res.orderNo || ''
        if (!orderId && !orderNo) throw new Error('预约未被服务端确认，请勿重复提交，可联系客服核实')
        analytics.track('booking_submit', { orderNo, itemCount: (this.data.items || []).length })
        wx.redirectTo({
          url: this.buildUrl('/pages/bookingSuccess/bookingSuccess', {
            orderNo,
            orderId,
            workflowStage: created.workflowStage || 'awaiting_confirmation'
          })
        })
      } else {
        wx.showToast({ title: (res && res.error) || '提交失败', icon: 'none' })
      }
    } catch (err) {
      console.error('submit booking failed', err)
      wx.showToast({ title: (err && err.message) || '网络异常，请稍后再试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  noop() {}
})
