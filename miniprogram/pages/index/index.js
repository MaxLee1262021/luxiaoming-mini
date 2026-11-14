const app = getApp()
const homeApi = require('../../api/home')
const searchApi = require('../../api/search')
const bookingApi = require('../../api/booking')
const peripheralApi = require('../../api/peripheral')
const { loadLegacyHomeCatalog } = require('../../service/homeSpotProducts')
const { parseScene, buildUrlWithSource } = require('../../utils/query')
const { buildModuleConfigMap, normalizeModuleConfig } = require('../../service/pageConfig')
const { HOME_SPOT_PAGE_SIZE, buildHomeSpots, buildHomeSpotShelf, buildHomeViewData, getBannerTarget, mergePreviewList } = require('../../service/homeData')
const { setSitePageConfig } = require('../../service/siteConfig')
const { routeSearchSuggestion } = require('../../utils/searchNav')
const { buildSearchSuggestions } = require('../../utils/searchSuggestions')
const cityStore = require('../../store/cityStore')

const defaultHomeModules = normalizeModuleConfig()

function isSpotCatalog(catalog, spotId) {
  return catalog && String(catalog.spotId || '') === String(spotId)
    && ['albums', 'packages', 'videoSingles', 'peripherals'].every(key => Array.isArray(catalog[key]))
}

Page({
  onShow() {
    this._pageHidden = false
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    // Tab 页面会被微信缓存，切回时 onLoad 不会再次触发；复用同一刷新入口同步最新内容。
    this.refreshOnTabShow()
    if (this._resumeSearchKeywordLoop) {
      this._resumeSearchKeywordLoop = false
      this.startSearchKeywordLoop()
    }
  },
  data: {
    loading: true,
    error: '',
    shopId: '',
    cityId: '',
    city: '',
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
    spotTabs: [],
    spotLoadingMore: false,
    spotHasMore: false,
    spotLoadError: '',
    activeSpotId: '',
    activeSpotName: '',
    filteredAlbums: [],
    filteredVideos: [],
    filteredPackages: [],
    filteredPeripherals: [],
    spotProductLoading: false,
    spotProductError: '',
    homeModules: defaultHomeModules,
    moduleConfig: buildModuleConfigMap(defaultHomeModules),
    bannerAutoplay: true,
    bannerIndex: 0,
    searchKeywords: [],
    activeSearchKeyword: '',
    searchKeyword: '',
    searchFocused: false,
    searchHistory: [],
    searchDropdownTop: 150,
    searchHasInput: false,
    searchSuggestions: [],
    hotSearchKeywords: [],
    headerCompact: false,
    navTopPx: 26,
    capsuleSafeRightPx: 104
  },

  async onLoad(options = {}) {
    this._unloaded = false
    this._pageHidden = false
    this.initNavMetrics()
    const source = app.captureSource ? app.captureSource(options) : {}
    const sceneParams = parseScene(options.scene)
    const shopId = options.shopId || source.shopId || sceneParams.shopId || ''
    const scene = options.sceneName || source.scene || sceneParams.scene || options.scene || ''

    this.setData({
      shopId,
      scene,
      spot: options.spot || ''
    })
    if (options.cityId || options.city) cityStore.setCity(options)
    // 首次加载与首个 onShow 共用刷新 Promise，避免重复请求。
    await this.refreshOnTabShow()
    this.startSearchKeywordLoop()
  },

  onHide() {
    this._pageHidden = true
    this._resumeSearchKeywordLoop = true
    this.stopSearchKeywordLoop()
    if (this.searchBlurTimer) {
      clearTimeout(this.searchBlurTimer)
      this.searchBlurTimer = null
    }
  },

  onUnload() {
    this._unloaded = true
    this._homeLoadRequest = null
    this._spotLoadRequest = null
    this._spotProductRequest = null
    this._spotProductPending = null
    this._searchConfigRequest = null
    this.onHide()
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
    if (this._unloaded || this._pageHidden || this.data.searchFocused) return
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
  // 搜索框占位词轮播 + 下拉热门搜索同源更新；未配置时不展示热词。
  async loadSearchConfig() {
    const request = {}
    this._searchConfigRequest = request
    try {
      const res = await searchApi.getSearchConfig()
      if (this._searchConfigRequest !== request) return
      const cfg = (res && res.success && res.data) || {}
      const hotWords = Array.isArray(cfg.hotWords) ? cfg.hotWords.filter(w => w && String(w).trim()) : []
      this.setData({
        searchKeywords: hotWords.slice(0, 4),
        activeSearchKeyword: hotWords[0] || '',
        hotSearchKeywords: hotWords
      })
    } catch (err) {
      if (this._searchConfigRequest !== request) return
      console.warn('loadSearchConfig failed', err)
    }
  },

  buildUrl(path, params = {}) {
    return buildUrlWithSource(path, params, this.data)
  },

  async loadHomeData() {
    const request = {}
    this._homeLoadRequest = request
    // 刷新使旧的追加请求失效，旧响应不能混入新排名。
    this._spotLoadRequest = null
    const loadedCount = Math.max(HOME_SPOT_PAGE_SIZE, (this.data.spots || []).length)
    this.setData({ spotLoadingMore: false, spotLoadError: '' })
    try {
      const selectedCity = cityStore.getCity()
      const source = app.getSource ? app.getSource() : (app.captureSource ? app.captureSource({}) : {})
      const cityContext = selectedCity.cityId || selectedCity.city ? selectedCity : source
      const res = await homeApi.getHomeData({
        shopId: source.shopId || this.data.shopId, codeId: source.codeId || '', spot: this.data.spot,
        cityId: cityContext.cityId || '', city: cityContext.city || '',
        includeSpotProducts: true, spotId: this.data.activeSpotId || '',
        spotOffset: 0, spotLimit: HOME_SPOT_PAGE_SIZE
      })
      if (this._homeLoadRequest !== request) return
      if (!res || !res.success) throw new Error('首页内容加载失败')
      let homeData = res.data || {}
      // Tab 返回刷新时恢复已加载的窗口，避免第 21 名以后的选中点被重置。
      while ((homeData.spots || []).length < loadedCount && homeData.spotPagination && homeData.spotPagination.hasMore) {
        const offset = homeData.spotPagination.nextOffset
        const next = await this.requestHomeSpotPage(offset, homeData)
        if (this._homeLoadRequest !== request) return
        homeData = {
          ...homeData,
          spots: mergePreviewList(homeData.spots, next.spots),
          spotPagination: next.spotPagination
        }
      }
      await this.applyHomeData(homeData)
    } catch (err) {
      if (this._homeLoadRequest !== request) return
      console.error('getHomeData error', err)
      if ((this.data.spots || []).length) {
        // 刷新后续页失败时保留已加载窗口、游标和选中点，下次仍可刷新或继续横滑。
        this.setData({ error: '首页内容刷新失败，请稍后重试' })
      }
      else {
        this.applyHomeData({})
        this.setData({ error: '首页内容加载失败，请稍后重试' })
      }
    } finally {
      if (this._homeLoadRequest === request) {
        this._homeLoadRequest = null
        this.setData({ loading: false })
      }
    }
  },

  applyHomeData(data = {}) {
    setSitePageConfig(data.pageConfig || {})
    this._spotLoadRequest = null
    this._spotProductRequest = null
    this._spotProductPending = null
    this._spotProductCache = new Map()
    this._legacyHomeCatalogPromise = null
    this._spotProductsSupported = data.spotProductsAvailable === true
    this._spotPagingContext = { cityId: data.cityId || '', city: data.city || '' }
    this._spotNextOffset = data.spotPagination ? data.spotPagination.nextOffset : (data.spots || []).length
    this.setData({
      ...buildHomeViewData(data),
      bannerIndex: 0,
      cityId: data.cityId || '', city: data.city || '',
      error: '', spotLoadingMore: false, spotLoadError: '',
      spotHasMore: !!(data.spotPagination && data.spotPagination.hasMore)
    })
    this.initSpotTabs()
    const catalog = data.spotProducts
    if (catalog && isSpotCatalog(catalog, catalog.spotId)) {
      this._spotProductCache.set(String(catalog.spotId), catalog)
    }
    return this.loadSpotProducts()
  },

  async requestHomeSpotPage(offset, context = this._spotPagingContext || {}) {
    const res = await homeApi.getHomeData({
      shopId: this.data.shopId, spot: this.data.spot,
      cityId: context.cityId || '', city: context.city || '',
      spotOffset: offset, spotLimit: HOME_SPOT_PAGE_SIZE, spotsOnly: true
    })
    const data = res && res.success && res.data
    const pagination = data && data.spotPagination
    if (!data || !Array.isArray(data.spots) || !pagination || pagination.offset !== offset
      || !Number.isSafeInteger(pagination.nextOffset) || pagination.nextOffset < offset
      || pagination.hasMore && (!data.spots.length || pagination.nextOffset <= offset)) {
      throw new Error('打卡点分页数据加载失败')
    }
    return data
  },

  async onSpotReachEnd() {
    if (this.data.loading || this._homeLoadRequest || this._spotLoadRequest || !this.data.spotHasMore) return
    const request = {}
    this._spotLoadRequest = request
    this.setData({ spotLoadingMore: true, spotLoadError: '' })
    try {
      const offset = this._spotNextOffset
      const page = await this.requestHomeSpotPage(offset)
      if (this._spotLoadRequest !== request) return
      const spots = mergePreviewList(this.data.spots, buildHomeSpots(page.spots))
      this._spotNextOffset = page.spotPagination.nextOffset
      this.setData({ spots, hotSpots: spots, spotHasMore: !!page.spotPagination.hasMore })
      this.initSpotTabs()
    } catch (err) {
      if (this._spotLoadRequest === request) {
        this.setData({ spotLoadError: '加载失败，点击重试' })
      }
    } finally {
      if (this._spotLoadRequest === request) {
        this._spotLoadRequest = null
        this.setData({ spotLoadingMore: false })
      }
    }
  },

  // 构建首页「打卡点热榜」：刷新保留当前选中点，首次进入或点位已移除时选中第 1 名。
  initSpotTabs() {
    const spots = this.data.spots || []
    const spotTabs = spots.map((s, i) => ({
      _id: s._id,
      name: s.name,
      cover: s.cover,
      cardGradient: s.cardGradient,
      rank: i + 1
    }))
    const activeSpot = spotTabs.find(spot => String(spot._id) === String(this.data.activeSpotId)) || spotTabs[0] || {}
    this.setData({
      spotTabs,
      activeSpotId: activeSpot._id || '',
      activeSpotName: activeSpot.name || ''
    })
  },

  onSpotTabTap(e) {
    const id = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id
    const spot = (this.data.spots || []).find(item => String(item._id) === String(id))
    if (!spot) return
    this.setData({ activeSpotId: spot._id, activeSpotName: spot.name || '' })
    return this.loadSpotProducts()
  },

  applySpotProducts(catalog = {}, scoped = false) {
    // 完整目录先按点位筛选，不能再受首页推荐数量的限制。
    const shelf = buildHomeSpotShelf({ ...catalog, cityId: this.data.cityId, city: this.data.city }, this.data.activeSpotId, scoped, true)
    this.setData({
      filteredAlbums: shelf.albums,
      filteredVideos: shelf.videos,
      filteredPackages: shelf.packages,
      filteredPeripherals: shelf.peripherals,
      spotProductLoading: false,
      spotProductError: ''
    })
  },

  loadSpotProducts() {
    const spotId = String(this.data.activeSpotId || '')
    if (this._unloaded) return Promise.resolve()
    if (this._spotProductPending && this._spotProductPending.spotId === spotId) return this._spotProductPending.promise
    const request = {}
    this._spotProductRequest = request
    this._spotProductPending = null
    const cached = this._spotProductCache && this._spotProductCache.get(spotId)
    if (!spotId || cached) {
      this.applySpotProducts(cached || {}, true)
      return Promise.resolve()
    }
    // 切换时清空旧商品，避免新点位标题下面短暂出现上一个点位的商品。
    this.setData({ filteredAlbums: [], filteredVideos: [], filteredPackages: [], filteredPeripherals: [],
      spotProductLoading: true, spotProductError: '' })
    const context = { shopId: this.data.shopId, cityId: this.data.cityId, city: this.data.city }
    const supported = this._spotProductsSupported
    const promise = (async () => {
      try {
        let catalog
        if (supported) {
          const res = await homeApi.getHomeData({ ...context, spotId, spotProductsOnly: true })
          catalog = res && res.success && res.data && res.data.spotProducts
          if (!isSpotCatalog(catalog, spotId)) throw new Error('打卡点商品加载失败')
        } else {
          // 兼容现网旧服务：推荐列表有数量上限，必须补取完整商品目录后再筛选。
          if (!this._legacyHomeCatalogPromise) {
            const pending = loadLegacyHomeCatalog(context, {
              getBookingData: bookingApi.getBookingData, getPeripherals: peripheralApi.getPeripherals
            }).catch(error => {
              if (this._legacyHomeCatalogPromise === pending) this._legacyHomeCatalogPromise = null
              throw error
            })
            this._legacyHomeCatalogPromise = pending
          }
          catalog = await this._legacyHomeCatalogPromise
        }
        if (this._spotProductRequest !== request || this._unloaded) return
        if (supported) this._spotProductCache.set(spotId, catalog)
        this.applySpotProducts(catalog, supported)
      } catch (err) {
        if (this._spotProductRequest !== request || this._unloaded) return
        this.setData({ spotProductLoading: false, spotProductError: '商品加载失败，点击重试' })
      } finally {
        if (this._spotProductRequest === request) this._spotProductPending = null
      }
    })()
    this._spotProductPending = { spotId, promise }
    return promise
  },

  retrySpotProducts() {
    return this.loadSpotProducts()
  },

  goCustomBooking() {
    if (!this.data.activeSpotId || this.data.spotProductLoading || this.data.spotProductError) return
    wx.navigateTo({ url: this.buildUrl('/pages/bookingInfo/bookingInfo', {
      spotId: this.data.activeSpotId, spotName: this.data.activeSpotName
    }) })
  },

  onAlbumTap(e) {
    const detail = e && e.detail || {}
    const albumId = detail.albumId || detail.id
    const album = this.data.filteredAlbums.find(item => String(item.albumId || item._id) === String(albumId))
    if (!album) return
    wx.navigateTo({ url: this.buildUrl('/pages/photoCollection/photoCollection', {
      albumId, seriesId: album.seriesId || '', spotId: this.data.activeSpotId
    }) })
  },

  onVideoTap(e) {
    const detail = e && e.detail || {}
    const id = detail.id || detail.item && detail.item._id
    const video = this.data.filteredVideos.find(item => String(item._id) === String(id))
    if (!video) return
    wx.navigateTo({ url: this.buildUrl('/pages/videoProductDetail/videoProductDetail', {
      productId: id, packageId: id, id: video.seriesId || '', spotId: this.data.activeSpotId
    }) })
  },

  onPackageTap(e) {
    const id = e && e.detail && e.detail.id
    const pkg = this.data.filteredPackages.find(item => String(item._id) === String(id))
    if (!pkg) return
    wx.navigateTo({ url: this.buildUrl('/pages/photoPackageDetail/photoPackageDetail', {
      packageId: id, productId: id, id: pkg.seriesId || '', spotId: this.data.activeSpotId
    }) })
  },

  onPeripheralTap(e) {
    const id = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id
    if (!this.data.filteredPeripherals.some(item => String(item._id) === String(id))) return
    wx.navigateTo({ url: this.buildUrl('/pages/peripherals/peripherals', { id, spotId: this.data.activeSpotId }) })
  },

  onBannerChange(e) {
    const current = Number(e && e.detail && e.detail.current)
    if (!Number.isInteger(current)) return
    // Swiper keeps its current autoplay state after a manual swipe. Video
    // slides only need their own playback context paused/resumed; they must
    // not disable the carousel itself.
    this.setData({ bannerIndex: current })
    this.pauseAllVideos()
    const banners = this.data.banners
    if (banners[current] && banners[current].type === 'video') {
      this.playCurrentVideo(current)
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
    this.setData({
      searchFocused: false,
      // Search focus is the only intentional home-page pause. Resume the
      // carousel for every media type when the dropdown is closed.
      bannerAutoplay: true
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


  goGuideList() {
    wx.navigateTo({ url: this.buildUrl('/pages/guideList/guideList') })
  },

  goPeripheralList() {
    wx.navigateTo({ url: this.buildUrl('/pages/peripherals/peripherals') })
  },


})
