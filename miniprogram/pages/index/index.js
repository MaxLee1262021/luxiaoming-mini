const app = getApp()
const demoData = require('../../utils/demoData')
const homeApi = require('../../api/home')
const collectionApi = require('../../api/collection')
const searchApi = require('../../api/search')
const { parseScene, buildUrlWithSource } = require('../../utils/query')
const { buildModuleConfigMap, normalizeModuleConfig } = require('../../service/pageConfig')
const { buildHomeViewData, findHomePackage, getBannerTarget, getHomePackageDetailPath, isGlobalPackage, isHomeDataEmpty } = require('../../service/homeData')
const { setSitePageConfig } = require('../../service/siteConfig')
const { routeSearchSuggestion } = require('../../utils/searchNav')
const { buildSearchSuggestions } = require('../../utils/searchSuggestions')
const { isExplicitDemoMode } = require('../../config/env')
const { STORE_APP_ID } = require('../../config/store')

const defaultHomeModules = normalizeModuleConfig()
// 当前基础库的官方小店卡片按 256px 宽渲染；仅缩放外包装，保留内部排版。
const storeHomeCardWidth = 256
const storeHomeLoadingHeight = 150

Page({
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    // 返回首页时允许再次打开套餐；导航进行中则由 goPackage 自己保持锁定。
    this._packageNavigationInFlight = false
    // Tab 页面会被微信缓存，切回时 onLoad 不会再次触发；复用同一刷新入口同步最新内容。
    this.refreshOnTabShow()
  },
  data: {
    loading: true,
    error: '',
    shopId: '',
    scene: '',
    spot: '',
    shopInfo: {},
    activityText: '',
    banners: [],
    spots: [],
    series: [],
    bookingAlbums: [],
    hotSpots: [],
    guides: [],
    packages: [],
    hotPackages: [],
    videoPackages: [],
    peripherals: [],
    storeAppId: STORE_APP_ID,
    storeHomeSupported: false,
    storeHomeUnavailableText: '请在手机微信中打开小店',
    storeHomeScale: 1,
    storeHomeHeight: storeHomeLoadingHeight,
    spotTabs: [],
    activeSpotId: '',
    activeSpotName: '',
    filteredAlbums: [],
    filteredVideos: [],
    filteredPackages: [],
    spotNoProducts: false,
    homeModules: defaultHomeModules,
    moduleConfig: buildModuleConfigMap(defaultHomeModules),
    bannerAutoplay: true,
    bannerIndex: 0,
    searchKeywords: ['打卡点', '旅拍套餐', '夜景视频摄像', '闺蜜旅拍', '亲子路线'],
    activeSearchKeyword: '打卡点',
    searchKeyword: '',
    searchFocused: false,
    searchHistory: [],
    searchDropdownTop: 150,
    searchHasInput: false,
    searchSuggestions: [],
    hotSearchKeywords: ['橘子洲头', '橘子洲头日落机位攻略', '旅拍帆布包', '橘洲日落写真', '长沙经典2小时旅拍套餐'],
    headerCompact: false,
    navTopPx: 26,
    capsuleSafeRightPx: 104
  },

  async onLoad(options = {}) {
    this._storeHomeUnloaded = false
    this.initNavMetrics()
    this.initStoreEntry()
    const source = app.captureSource ? app.captureSource(options) : {}
    const sceneParams = parseScene(options.scene)
    const shopId = options.shopId || source.shopId || sceneParams.shopId || ''
    const scene = options.sceneName || source.scene || sceneParams.scene || options.scene || ''

    this.setData({
      shopId,
      scene,
      spot: options.spot || ''
    })
    // 首次加载与首个 onShow 共用刷新 Promise，避免重复请求。
    await this.refreshOnTabShow()
    this.startSearchKeywordLoop()
  },

  onReady() {
    this.scheduleStoreHomeLayout()
  },

  onResize() {
    this.scheduleStoreHomeLayout()
  },

  onUnload() {
    this._storeHomeUnloaded = true
    this.clearStoreHomeLayoutTimers()
    this.stopSearchKeywordLoop()
  },

  // 首页专属分享：带上当前选中的打卡点，吸引好友点开
  onShareAppMessage() {
    const spotName = this.data.activeSpotName || ''
    return {
      title: spotName ? `麓小鸣旅拍｜${spotName}打卡点，把长沙拍成你的旅行封面` : '麓小鸣旅拍｜把城市拍成你的旅行封面',
      path: '/pages/index/index'
    }
  },

  onPageScroll(e) {
    const scrollTop = e.scrollTop || 0
    this._lastScrollTop = scrollTop
    const { headerCompact, searchFocused } = this.data

    // 搜索聚焦时：若用户主动滚动页面（超过阈值），自动收起下拉
    if (searchFocused) {
      const base = this.searchFocusScrollTop || 0
      if (Math.abs(scrollTop - base) > 15) {
        this.closeSearchDropdown()
      }
      return
    }

    // 迟滞：往上滚需要超过 104 才变紧凑，往下滚需要低于 60 才恢复
    // 避免在阈值附近反复切换导致闪跳
    if (!headerCompact && scrollTop > 104) {
      this.setData({ headerCompact: true })
    } else if (headerCompact && scrollTop < 60) {
      this.setData({ headerCompact: false })
    }
  },

  // 下拉刷新：重新拉取首页数据（不改业务逻辑，仅重新加载并收起刷新圈）
  async onPullDownRefresh() {
    try {
      await this.refreshOnTabShow()
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  refreshOnTabShow() {
    if (this._tabRefreshPromise) return this._tabRefreshPromise
    this._tabRefreshPromise = Promise.all([
      this.loadHomeData(),
      this.loadSearchConfig()
    ])
      .catch((err) => {
        // 两个加载方法各自有降级处理，这里只兜住意外异常，避免 onShow 产生未处理拒绝。
        console.warn('refresh home tab failed', err)
      })
      .finally(() => {
        this._tabRefreshPromise = null
      })
    return this._tabRefreshPromise
  },

  initStoreEntry() {
    try {
      const device = typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : wx.getSystemInfoSync()
      const platform = String(device.platform || '').toLowerCase()
      const isDesktop = platform === 'windows' || platform === 'mac'
      const supported = typeof wx.canIUse === 'function' && wx.canIUse('store-home')
      const windowInfo = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync()
      // 首帧按原双列卡片的内宽预估，渲染后再用实际宽高校准。
      const scale = ((windowInfo.windowWidth || 375) * 308 / 750) / storeHomeCardWidth
      this.setData({
        storeHomeSupported: !!STORE_APP_ID && supported && !isDesktop,
        storeHomeScale: scale,
        storeHomeHeight: storeHomeLoadingHeight * scale,
        storeHomeUnavailableText: isDesktop
          ? '请在手机微信中打开小店'
          : '请更新微信后打开小店'
      })
    } catch (err) {
      console.warn('init store entry failed', err)
      this.setData({ storeHomeSupported: false })
    }
  },

  clearStoreHomeLayoutTimers() {
    const timers = this._storeHomeLayoutTimers || []
    timers.forEach(timer => clearTimeout(timer))
    this._storeHomeLayoutTimers = []
  },

  scheduleStoreHomeLayout() {
    this.clearStoreHomeLayoutTimers()
    if (!this.data.storeHomeSupported || this._storeHomeUnloaded) return
    // 店铺信息异步加载后高度会变化，分次同步占位，避免覆盖后面的首页内容。
    this._storeHomeLayoutTimers = [0, 300, 1000, 3000, 7000, 15000].map(delay => (
      setTimeout(() => this.measureStoreHomeLayout(), delay)
    ))
  },

  measureStoreHomeLayout() {
    if (this._storeHomeUnloaded || this._storeHomeMeasuring || !this.data.storeHomeSupported || typeof wx.createSelectorQuery !== 'function') return
    this._storeHomeMeasuring = true
    try {
      const query = wx.createSelectorQuery().in(this)
      query.select('.goods-store-stage').boundingClientRect()
      query.select('.goods-store-natural').boundingClientRect()
      query.exec(rects => {
        this._storeHomeMeasuring = false
        if (this._storeHomeUnloaded) return
        const [stage, content] = rects || []
        if (!stage || !content || stage.width <= 0 || content.width <= 0 || content.height <= 0) return
        // boundingClientRect 已包含当前缩放；按新旧宽度之比调整，不能再重复乘 scale。
        const ratio = stage.width / content.width
        const scale = stage.width / storeHomeCardWidth
        const height = content.height * ratio
        if (!Number.isFinite(scale) || !Number.isFinite(height)) return
        if (Math.abs(scale - this.data.storeHomeScale) < 0.001 && Math.abs(height - this.data.storeHomeHeight) < 0.5) return
        this.setData({ storeHomeScale: scale, storeHomeHeight: height })
      })
    } catch (err) {
      this._storeHomeMeasuring = false
      console.warn('measure store entry failed', err)
    }
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
      console.warn('init nav metrics fallback', err)
    }
  },

  startSearchKeywordLoop() {
    this.stopSearchKeywordLoop()
    this.searchKeywordTimer = setInterval(() => {
      const keywords = this.data.searchKeywords || []
      if (!keywords.length) return
      const currentIndex = keywords.indexOf(this.data.activeSearchKeyword)
      const nextIndex = (currentIndex + 1) % keywords.length
      this.setData({ activeSearchKeyword: keywords[nextIndex] })
    }, 2400)
  },

  stopSearchKeywordLoop() {
    if (this.searchKeywordTimer) {
      clearInterval(this.searchKeywordTimer)
      this.searchKeywordTimer = null
    }
  },

  // 搜索热词接入后台配置（getSearchConfig）：配置就绪后，
  // 搜索框占位词轮播 + 下拉热门搜索同源更新；后台未接 / 失败时保留内置默认词，页面零回归。
  async loadSearchConfig() {
    try {
      const res = await searchApi.getSearchConfig()
      const cfg = (res && res.success && res.data) || {}
      const hotWords = Array.isArray(cfg.hotWords) ? cfg.hotWords.filter(w => w && String(w).trim()) : []
      if (!hotWords.length) return
      this.setData({
        searchKeywords: hotWords.slice(0, 4),
        activeSearchKeyword: hotWords[0],
        hotSearchKeywords: hotWords
      })
    } catch (err) {
      console.warn('loadSearchConfig fallback', err)
    }
  },

  buildUrl(path, params = {}) {
    return buildUrlWithSource(path, params, this.data)
  },

  async loadHomeData() {
    try {
      const res = await homeApi.getHomeData({ shopId: this.data.shopId, spot: this.data.spot })
      if (!res || !res.success) {
        if (isExplicitDemoMode()) this.applyDemoHomeData()
        else {
          this.applyHomeData({})
          this.setData({ error: '首页内容加载失败，请稍后重试' })
        }
      } else {
        const homeData = await this.hydrateHomeAlbumMetadata(res.data || {})
        this.applyHomeData(homeData)
      }
    } catch (err) {
      console.error('getHomeData error', err)
      if (isExplicitDemoMode()) this.applyDemoHomeData()
      else {
        this.applyHomeData({})
        this.setData({ error: '首页内容加载失败，请稍后重试' })
      }
    } finally {
      this.setData({ loading: false }, () => this.scheduleStoreHomeLayout())
    }
  },

  async hydrateHomeAlbumMetadata(data = {}) {
    const albums = Array.isArray(data.albums) ? data.albums : []
    if (!albums.length) return data
    if (!this._albumMetadataCache) this._albumMetadataCache = new Map()
    const unresolved = albums.filter(album => {
      const id = String(album._id || album.id || album.albumId || '')
      return id && !this._albumMetadataCache.has(id)
    })
    if (unresolved.length) {
      const results = await Promise.all(unresolved.map(async album => {
        const id = album._id || album.id || album.albumId || ''
        try {
          const response = await collectionApi.getPhotoCollection({
            seriesId: album.seriesId || '',
            albumId: id,
            spotId: album.spotId || ''
          })
          const rows = response && response.success && response.data && Array.isArray(response.data.collections)
            ? response.data.collections
            : []
          const detail = rows.find(item => String(item._id || item.id || item.albumId || '') === String(id)) || rows[0] || null
          return [String(id), detail]
        } catch (error) {
          return [String(id), null]
        }
      }))
      results.forEach(([id, detail]) => this._albumMetadataCache.set(id, detail))
    }
    return {
      ...data,
      albums: albums.map(album => {
        const id = String(album._id || album.id || album.albumId || '')
        const detail = this._albumMetadataCache.get(id)
        if (!detail) return album
        return {
          ...album,
          ...detail,
          _id: album._id || detail._id || detail.albumId,
          albumId: album.albumId || detail.albumId || detail._id,
          seriesId: album.seriesId || detail.seriesId,
          spotId: album.spotId || detail.spotId,
          spotName: detail.spotName || album.spotName,
          seriesName: detail.seriesName || album.seriesName,
          photoCount: detail.photoCount || album.photoCount || 0,
          sampleUrls: detail.sampleUrls || album.sampleUrls || [],
          intro: detail.intro || detail.description || album.intro || album.description || '',
          description: detail.description || detail.intro || album.description || album.intro || ''
        }
      })
    }
  },

  applyHomeData(data = {}) {
    const previewData = data
    setSitePageConfig(data.pageConfig || {})
    this.setData({ ...buildHomeViewData(data, previewData, isExplicitDemoMode() ? demoData : {}), error: '' })
    this.initSpotTabs()
  },

  // 构建首页「打卡点热榜」：热门前 8 打卡点（带排名），默认选中第 1 名，下方三分类按选中点过滤
  initSpotTabs() {
    const spots = this.data.spots || []
    const spotTabs = spots.map((s, i) => ({
      _id: s._id,
      name: s.name,
      cover: s.cover,
      cardGradient: s.cardGradient,
      rank: i + 1
    }))
    const first = spotTabs[0] || {}
    this.setData({
      spotTabs,
      activeSpotId: first._id || '',
      activeSpotName: first.name || ''
    })
    this.applySpotFilter()
  },

  // 按当前选中打卡点过滤三分类货架（照片留影按单个 spotId；视频/套餐支持 spotIds 数组）
  applySpotFilter() {
    const activeSpotId = this.data.activeSpotId || ''
    const albums = this.data.bookingAlbums || []
    const videos = this.data.videoPackages || []
    const packages = this.data.hotPackages || []
    const matchSingle = (item) => !activeSpotId || item.spotId === activeSpotId
    // 未绑定打卡点的全局套餐（通常是后台“主页主推”）应在每个点位货架可见。
    const matchMulti = (item) => !activeSpotId || isGlobalPackage(item) || item.spotId === activeSpotId || (Array.isArray(item.spotIds) && item.spotIds.includes(activeSpotId))
    const activeSpot = (this.data.spots || []).find(s => s._id === activeSpotId)
    const filteredAlbums = activeSpotId ? albums.filter(matchSingle) : albums
    const filteredVideos = activeSpotId ? videos.filter(matchMulti) : videos
    const filteredPackages = activeSpotId ? packages.filter(matchMulti) : packages
    const spotNoProducts = !!activeSpotId && !filteredAlbums.length && !filteredVideos.length && !filteredPackages.length
    this.setData({
      activeSpotName: activeSpot ? activeSpot.name : '',
      filteredAlbums,
      filteredVideos,
      filteredPackages,
      spotNoProducts
    })
  },

  onSpotTabTap(e) {
    const id = e.currentTarget.dataset.id || ''
    if (id === this.data.activeSpotId) return
    this.setData({ activeSpotId: id })
    this.applySpotFilter()
  },

  applyDemoHomeData() {
    this.applyHomeData(demoData.getHomeData())
  },

  onBannerChange(e) {
    const current = e.detail.current
    this.setData({ bannerIndex: current })
    this.pauseAllVideos()
    const banners = this.data.banners
    if (banners[current] && banners[current].type === 'video') {
      this.playCurrentVideo(current)
      this.setData({ bannerAutoplay: false })
    } else {
      this.setData({ bannerAutoplay: true })
    }
  },

  pauseAllVideos() {
    for (let i = 0; i < this.data.banners.length; i++) {
      if (this.data.banners[i].type === 'video') {
        const ctx = wx.createVideoContext(`video-${i}`)
        ctx.pause()
      }
    }
  },

  playCurrentVideo(index) {
    wx.createVideoContext(`video-${index}`).play()
  },

  onVideoPlay() {
    this.setData({ bannerAutoplay: false })
  },

  onVideoPause() {
    this.setData({ bannerAutoplay: true })
  },

  goAllSpots() {
    wx.switchTab({ url: '/pages/explore/explore' })
  },

  goExplore() {
    wx.switchTab({ url: '/pages/explore/explore' })
  },

  onSearchInput(e) {
    const kw = e.detail.value || ''
    this.setData({ searchKeyword: kw })
    this.updateSuggestions(kw)
  },

  updateSuggestions(kw) {
    const k = (kw || '').trim()
    const list = k ? buildSearchSuggestions(k, {
      spots: this.data.spots,
      packages: this.data.packages,
      videos: this.data.videoPackages,
      albums: this.data.bookingAlbums,
      guides: this.data.guides
    }) : []
    this.setData({
      searchHasInput: !!k,
      searchSuggestions: list
    })
  },

  onSearchFocus() {
    if (this.searchBlurTimer) {
      clearTimeout(this.searchBlurTimer)
      this.searchBlurTimer = null
    }
    this.stopSearchKeywordLoop()
    // 记录聚焦时的滚动位置，用于判断用户是否主动滚动页面来关闭下拉
    this.searchFocusScrollTop = this._lastScrollTop || 0
    this.setData({ searchFocused: true, bannerAutoplay: false })
    this.updateSuggestions(this.data.searchKeyword)
    wx.createSelectorQuery().in(this).select('.search-entry').boundingClientRect(rect => {
      if (rect) this.setData({ searchDropdownTop: rect.bottom + 6 })
    }).exec()
  },

  closeSearchDropdown() {
    if (this.searchBlurTimer) {
      clearTimeout(this.searchBlurTimer)
      this.searchBlurTimer = null
    }
    const banners = this.data.banners || []
    const current = banners[this.data.bannerIndex]
    this.setData({
      searchFocused: false,
      bannerAutoplay: !(current && current.type === 'video')
    })
    this.startSearchKeywordLoop()
  },

  onSearchBlur() {
    // 延迟隐藏，让下拉项 click 先触发
    this.searchBlurTimer = setTimeout(() => {
      this.closeSearchDropdown()
    }, 150)
  },

  onSearchBackdropTap() {
    this.closeSearchDropdown()
  },

  onHotSearchTap(e) {
    const keyword = e.detail.keyword
    this.setData({ searchKeyword: keyword, searchFocused: false })
    this.stopSearchKeywordLoop()
    wx.navigateTo({ url: this.buildUrl('/pages/search/search', { keyword }) })
  },

  onSearchItemTap(e) {
    const item = e.detail.item || {}
    this.setData({ searchKeyword: item.name || '', searchFocused: false })
    this.stopSearchKeywordLoop()
    // 与探索页统一：点下拉建议项直达对应详情页（找不到目标则兜底跳结果页）
    routeSearchSuggestion(item, this.buildUrl.bind(this))
  },

  onSearchBooking(e) {
    this.closeSearchDropdown()
    this.goCustomBookingByKeyword(e)
  },

  clearSearchKeyword() {
    this.setData({ searchKeyword: '', searchHasInput: false, searchSuggestions: [] })
  },

  onSearchConfirm() {
    const keyword = (this.data.searchKeyword || '').trim()
    if (!keyword) {
      wx.showToast({ title: '请输入搜索内容', icon: 'none' })
      return
    }
    this.setData({ searchFocused: false })
    this.stopSearchKeywordLoop()
    wx.navigateTo({
      url: this.buildUrl('/pages/search/search', { keyword })
    })
  },

  onSearchAction() {
    const keyword = (this.data.searchKeyword || '').trim()
    this.closeSearchDropdown()
    if (!keyword) {
      wx.showToast({ title: '请输入搜索内容', icon: 'none' })
      return
    }
    this.stopSearchKeywordLoop()
    wx.navigateTo({ url: this.buildUrl('/pages/search/search', { keyword }) })
  },

  // 从「打卡点热榜」空态卡或搜索入口发起约拍定制
  goCustomBooking() {
    const activeSpotId = this.data.activeSpotId || ''
    const activeSpotName = this.data.activeSpotName || ''
    wx.navigateTo({
      url: this.buildUrl('/pages/bookingInfo/bookingInfo', {
        spotId: activeSpotId,
        spotName: activeSpotName,
        requestedSpot: activeSpotName
      })
    })
  },

  goCustomBookingByKeyword(e) {
    const kw = ((e && e.detail && e.detail.keyword) || this.data.searchKeyword || '').trim()
    if (!kw) return
    wx.navigateTo({
      url: this.buildUrl('/pages/bookingInfo/bookingInfo', { requestedSpot: kw })
    })
  },


  goBanner(e) {
    const detail = (e && e.detail) || {}
    const dataset = (e && e.currentTarget && e.currentTarget.dataset) || {}
    const rawIndex = detail.index !== undefined ? detail.index : (dataset.index !== undefined ? dataset.index : this.data.bannerIndex)
    const parsedIndex = Number(rawIndex)
    const index = Number.isFinite(parsedIndex) ? parsedIndex : 0
    const banner = (this.data.banners || [])[index]
    if (!banner) {
      wx.showToast({ title: '首页内容暂未准备好', icon: 'none' })
      return
    }
    const target = getBannerTarget(banner)
    if (!target) {
      const configuredType = String(banner.targetType || banner.linkType || banner.jumpType || '').trim().toLowerCase()
      // targetType 为空代表旧版素材未配置跳转，给首页主视觉一个稳定的探索页兜底；
      // 明确配置 none/static 时保持后台“不跳转”语义，但给出轻量反馈。
      if (!configuredType) {
        wx.switchTab({ url: '/pages/explore/explore' })
      } else if (configuredType === 'none' || configuredType === 'static') {
        wx.showToast({ title: '该轮播为展示内容', icon: 'none' })
      } else {
        wx.showToast({ title: '该轮播入口暂未配置', icon: 'none' })
      }
      return
    }
    const url = target.url || this.buildUrl(target.path, target.params)
    if (!url) return
    if (target.method === 'switchTab') {
      wx.switchTab({ url: url.split('?')[0] })
      return
    }
    wx.navigateTo({ url })
  },


  goPackage(e) {
    // 支持两种事件格式：组件 triggerEvent('tap', {id}) → e.detail.id；原生 bindtap → e.currentTarget.dataset.id
    const detail = (e && e.detail) || {}
    const dataset = (e && e.currentTarget && e.currentTarget.dataset) || {}
    const item = detail.item || dataset.item || {}
    const packageId = detail.id || detail.packageId || detail.productId || dataset.id || dataset.packageId || dataset.productId || item._id || item.id
    if (!packageId) {
      wx.showToast({ title: '旅拍套餐不存在', icon: 'none' })
      return
    }
    const hasItemId = item && (item._id || item.id || item.packageId || item.productId)
    const pkg = hasItemId ? item : findHomePackage([this.data.hotPackages, this.data.packages], packageId)
    if (!pkg || !(pkg._id || pkg.id || pkg.packageId || pkg.productId)) {
      wx.showToast({ title: '旅拍套餐不存在', icon: 'none' })
      return
    }
    const id = String(pkg._id || pkg.id || pkg.packageId || pkg.productId || packageId)
    // 组件事件和快速连点都可能在页面切换完成前再次触发。只允许一次
    // 详情页入栈，避免返回时需要逐层退出重复的套餐详情页。
    if (this._packageNavigationInFlight) return
    this._packageNavigationInFlight = true

    wx.navigateTo({
      url: this.buildUrl(getHomePackageDetailPath(pkg), {
        id: pkg.seriesId,
        packageId: id,
        productId: id,
        spotId: pkg.spotId,
        from: 'home'
      }),
      fail: () => {
        // 导航失败时解除锁，保证用户可以立即重试。
        this._packageNavigationInFlight = false
      }
    })
  },

  goVideoProduct(e) {
    // lxm-video-card 组件 triggerEvent('tap', {id, spotId, item})
    const d = e && e.detail || {}
    const dataset = (e && e.currentTarget && e.currentTarget.dataset) || {}
    const item = d.item || dataset.item || {}
    const productId = d.id || d.productId || dataset.id || dataset.productId || item._id || item.id
    if (!productId) {
      wx.showToast({ title: '视频摄像商品不存在', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: this.buildUrl('/pages/videoProductDetail/videoProductDetail', {
        productId,
        spotId: d.spotId || dataset.spotId || item.spotId
      })
    })
  },

  goBookingAlbum(e) {
    // lxm-album-card 组件 triggerEvent('tap', {id, albumId, seriesId, spotId})
    const d = e && e.detail || {}
    const dataset = (e && e.currentTarget && e.currentTarget.dataset) || {}
    const item = d.item || dataset.item || {}
    const albumId = d.albumId || d.id || dataset.albumId || dataset.id || item.albumId || item._id || item.id
    if (!albumId) {
      wx.showToast({ title: '照片留影不存在', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: this.buildUrl('/pages/photoCollection/photoCollection', {
        albumId,
        seriesId: d.seriesId || dataset.seriesId || item.seriesId,
        spotId: d.spotId || dataset.spotId || item.spotId
      })
    })
  },

  goVideoExplore() {
    wx.switchTab({ url: '/pages/explore/explore' })
  },


  goGuideList() {
    wx.navigateTo({ url: this.buildUrl('/pages/guideList/guideList') })
  },

})
