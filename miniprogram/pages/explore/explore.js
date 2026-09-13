const app = getApp()
const demoData = require('../../utils/demoData')
const spotApi = require('../../api/spot')
const citiesApi = require('../../api/cities')
const spotFilter = require('../../service/spotFilter')
const { buildUrlWithSource } = require('../../utils/query')
const { isVideoSingle } = require('../../utils/product')
const homeApi = require('../../api/home')
const { normalizeBanners, getBannerTarget } = require('../../service/homeData')
const { routeSearchSuggestion } = require('../../utils/searchNav')
const { buildSearchSuggestions } = require('../../utils/searchSuggestions')
const { isExplicitDemoMode } = require('../../config/env')
const { findCity, hasCoordinates, mapCenterForCity, normalizeCityOptions, spotMatchesCity } = require('../../service/citySpot')

const CHANGSHA_CENTER = { latitude: 28.195, longitude: 112.95 }
const DEFAULT_SCALE = 13
const PIN_ICON_DEFAULT = '/images/map-pin-default.png'
const PIN_ICON_ACTIVE = '/images/map-pin-active.png'
const HOT_SEARCH_KEYWORDS = ['橘子洲', '杜甫江阁', 'IFS国金中心', '太平老街', '黄兴路', '岳麓山', '谢子龙']

// 演示城市只在显式 demo 模式使用。正常开发、体验和正式环境只展示后台 cities 集合。
const FALLBACK_CITIES = [
  { name: '长沙', value: '长沙', count: 7 },
  { name: '北京（敬请期待）', value: '北京', disabled: true },
  { name: '上海（敬请期待）', value: '上海', disabled: true },
  { name: '广州（敬请期待）', value: '广州', disabled: true },
  { name: '杭州（敬请期待）', value: '杭州', disabled: true },
  { name: '张家界（敬请期待）', value: '张家界', disabled: true }
]

Page({
  data: {
    loading: true,
    error: '',
    degraded: false, // 真实打卡点拉取失败、正在展示预览数据时置 true（顶部降级提示条）
    shopId: '',
    scene: '',

    spots: [],
    filteredSpots: [],
    markers: [],

    searchKeyword: '',
    searchFocused: false,
    searchHasInput: false,
    searchSuggestions: [],
    searchDropdownTop: 180,
    searchCatalog: { packages: [], videos: [], albums: [], guides: [] },

    openPanel: '',
    cityOptions: isExplicitDemoMode() ? FALLBACK_CITIES : [],
    districtOptions: [{ name: '全部区域', value: '', count: 7 }],
    spotOptions: [],
    selectedCity: isExplicitDemoMode() ? FALLBACK_CITIES[0].value : '',
    selectedCityName: isExplicitDemoMode() ? FALLBACK_CITIES[0].name : '',
    selectedDistrict: '',
    selectedSpotId: '',
    selectedSpotName: '',

    // 探索页轮播：后台可配（与首页轮播「单独一套」），默认空，由 loadExploreBanners 拉取，失败回退 demoData
    exploreBanners: [],
    bannerIndex: 0,
    bannerAutoplay: true,
    filterPanelTop: 240,
    filterArrowLeft: 60,

    mapLatitude: CHANGSHA_CENTER.latitude,
    mapLongitude: CHANGSHA_CENTER.longitude,
    mapScale: DEFAULT_SCALE,
    includePoints: [],

    statusBarHeight: 20,
    safeBottom: 0,

    showGuideExplore: false,

    // 排序与筛选增强
    sortType: 'composite',          // composite | hot | distance
    onlyWithSample: false,
    userLocation: null,             // { latitude, longitude }
    resultCount: 0,                 // 当前筛选/搜索后的打卡点数量（用于 chip 徽章）
    districtCount: 0,               // 当前选中区域的数量（用于区域 chip 徽章）
    sortOptions: [
      { name: '综合推荐', value: 'composite' },
      { name: '热度优先', value: 'hot' },
      { name: '离我最近', value: 'distance' }
    ],

    hotSearchKeywords: HOT_SEARCH_KEYWORDS
  },

  async onLoad(options = {}) {
    this.initMetrics()
    const source = app.captureSource ? app.captureSource(options) : {}
    this.setData({
      shopId: options.shopId || source.shopId || '',
      scene: options.scene || source.scene || ''
    })
    this.requestedCity = String(options.cityId || options.city || '').trim()
    this.mapCtx = wx.createMapContext('exploreMap')
    // 晕动敏感：系统开启「减少动态效果」时暂停横幅自动轮播（属装饰性循环动效）
    try {
      const settings = wx.getSystemSetting ? wx.getSystemSetting() : {}
      if (settings.reducedMotion === 'enable') {
        this.setData({ bannerAutoplay: false })
      }
    } catch (e) {}
    // 首次加载与首个 onShow 共用刷新 Promise，避免重复请求。
    await this.refreshOnTabShow()
  },

  onUnload() {
    if (this.searchBlurTimer) {
      clearTimeout(this.searchBlurTimer)
      this.searchBlurTimer = null
    }
    if (this.guideHideTimer) {
      clearTimeout(this.guideHideTimer)
      this.guideHideTimer = null
    }
  },

  // 探索页专属分享：带上当前城市名，好友打开仍停留在该城市
  onShareAppMessage() {
    const cityOptions = this.data.cityOptions || []
    const current = cityOptions.find(c => c.value === this.data.selectedCity)
    const cityName = current ? current.name : (this.data.selectedCityName || '旅拍')
    return {
      title: `鹿小鸣旅拍｜${cityName}打卡点地图，来一场说走就走的城市旅拍`,
      path: this.data.selectedCity ? `/pages/explore/explore?cityId=${encodeURIComponent(this.data.selectedCity)}` : '/pages/explore/explore'
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    this.checkGuideExplore()
    // Tab 页面会被微信缓存，切回时 onLoad 不会再次触发；重新拉取可见内容。
    this.refreshOnTabShow()
  },

  refreshOnTabShow() {
    if (this._tabRefreshPromise) return this._tabRefreshPromise
    this._tabRefreshPromise = Promise.all([
      this.loadExploreBanners(),
      this.reloadContent()
    ])
      .catch((err) => {
        // 各加载方法已有降级处理，这里只兜住意外异常，避免 onShow 产生未处理拒绝。
        console.warn('refresh explore tab failed', err)
      })
      .finally(() => {
        this._tabRefreshPromise = null
      })
    return this._tabRefreshPromise
  },

  checkGuideExplore() {
    try {
      const seen = wx.getStorageSync('guide_explore_seen')
      if (seen) return
    } catch (e) {
      console.warn('guide storage read error', e)
    }
    this.setData({ showGuideExplore: true })
    this.guideHideTimer = setTimeout(() => {
      this.hideGuideExplore()
    }, 3000)
  },

  hideGuideExplore() {
    if (this.guideHideTimer) {
      clearTimeout(this.guideHideTimer)
      this.guideHideTimer = null
    }
    this.setData({ showGuideExplore: false })
    try {
      wx.setStorageSync('guide_explore_seen', true)
    } catch (e) {
      console.warn('guide storage write error', e)
    }
  },

  onGuideCardTap(e) {
    // 阻止冒泡，点击卡片本身不消失（点遮罩才消失）
    e.stopPropagation && e.stopPropagation()
  },

  initMetrics() {
    try {
      const system = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null
      this.setData({
        statusBarHeight: system.statusBarHeight || 20,
        safeBottom: system.safeAreaInsets ? (system.safeAreaInsets.bottom || 0) : 0,
        searchDropdownTop: (menu && menu.bottom ? menu.bottom : (system.statusBarHeight || 20) + 104) + 6
      })
    } catch (err) {
      console.warn('explore init metrics fallback', err)
    }
  },

  buildUrl(path, params = {}) {
    return buildUrlWithSource(path, params, this.data)
  },

  async loadSpots() {
    this.setData({ loading: true, error: '' })
    try {
      const res = await spotApi.getSpots({ shopId: this.data.shopId, limit: 100 })
      if (!res || !res.success) {
        if (isExplicitDemoMode()) this.applyDemoSpots()
        else {
          this.applySpotList([])
          this.setData({ error: '打卡点数据加载失败，请稍后重试', degraded: false })
        }
      } else {
        const list = (res.data || []).map(item => spotFilter.normalizeSpot(item))
        this.applySpotList(list)
      }
    } catch (err) {
      console.error('explore loadSpots error', err)
      if (isExplicitDemoMode()) this.applyDemoSpots()
      else {
        this.applySpotList([])
        this.setData({ error: '打卡点数据加载失败，请稍后重试', degraded: false })
      }
    } finally {
      this.setData({ loading: false })
    }
  },

  async reloadContent() {
    const hasActiveCity = await this.loadCities()
    if (hasActiveCity || isExplicitDemoMode()) {
      await this.loadSpots()
      return
    }
    this.setData({ spots: [], degraded: false })
    this.applyFilters()
    this.setData({ loading: false, degraded: false })
  },

  // 城市列表直接来自后台 cities 集合。筹备中城市保留在列表中并标记为不可选择。
  async loadCities() {
    try {
      const res = await citiesApi.getCities({})
      if (!res || !res.success) throw new Error((res && (res.error || res.message)) || '城市配置加载失败')
      const list = (res && res.success && Array.isArray(res.data)) ? res.data : []
      if (!list.length) {
        if (isExplicitDemoMode()) {
          const fallback = FALLBACK_CITIES.slice()
          this.setData({ cityOptions: fallback, selectedCity: fallback[0].value, selectedCityName: fallback[0].name })
          return true
        }
        this.setData({ cityOptions: [], selectedCity: '', selectedCityName: '', error: '暂无后台配置的城市' })
        return false
      }
      const cityOptions = normalizeCityOptions(list)
      // 当前选中城市仍在可用列表则保留，否则切到第一个可用城市
      const requested = this.requestedCity && cityOptions.find(c => (
        [c.value, c.cityId, c.code, c.name].filter(Boolean).map(String).includes(this.requestedCity)
      ) && !c.disabled)
      this.requestedCity = ''
      const keep = cityOptions.find(c => c.value === this.data.selectedCity && !c.disabled)
      const active = cityOptions.find(c => !c.disabled)
      const selected = requested || keep || active || null
      this.setData({
        cityOptions,
        selectedCity: selected ? selected.value : '',
        selectedCityName: selected ? selected.name : '',
        error: selected ? '' : '暂无已开通城市'
      })
      this.applyFilters()
      return !!selected
    } catch (err) {
      console.warn('explore loadCities error', err)
      if (isExplicitDemoMode()) {
        const fallback = FALLBACK_CITIES.slice()
        this.setData({ cityOptions: fallback, selectedCity: fallback[0].value, selectedCityName: fallback[0].name })
        return true
      }
      this.setData({ cityOptions: [], selectedCity: '', selectedCityName: '', error: '城市配置加载失败，请稍后重试' })
      return false
    }
  },

  applyDemoSpots() {
    const defaultCity = (FALLBACK_CITIES.find(item => !item.disabled) || {}).value || '长沙'
    const list = demoData.spots.map(item => spotFilter.normalizeSpot({ ...item, city: item.city || defaultCity }))
    this.applySpotList(list, true)
  },

  applySpotList(list = [], degraded = false) {
    this.setData({
      spots: list,
      error: '',
      degraded
    })
    this.applyFilters()
  },

  // 降级提示条「重新加载」：先刷新后台城市，再刷新当前可见点位。
  onRetryLoad() {
    this.reloadContent()
  },

  applyFilters() {
    const { spots, selectedCity, selectedDistrict, selectedSpotId, searchKeyword, onlyWithSample, sortType } = this.data
    const city = findCity(this.data.cityOptions, selectedCity)
    const citySpots = city
      ? (spots || []).filter(item => spotMatchesCity(item, city))
      : []
    const districtOptions = spotFilter.buildDistrictOptions(citySpots).map(item => {
      const count = item.value ? citySpots.filter(spot => spot.district === item.value).length : citySpots.length
      return { ...item, count }
    })
    const selectedDistrictAvailable = !selectedDistrict || districtOptions.some(item => item.value === selectedDistrict)
    const effectiveDistrict = selectedDistrictAvailable ? selectedDistrict : ''
    const citySpotOptions = citySpots.map(item => ({ name: item.name, value: item._id }))
    const selectedSpotAvailable = !selectedSpotId || citySpotOptions.some(item => item.value === selectedSpotId)
    const effectiveSpotId = selectedSpotAvailable ? selectedSpotId : ''
    let filtered = [...citySpots]

    if (effectiveDistrict) {
      filtered = filtered.filter(item => item.district === effectiveDistrict)
    }
    if (effectiveSpotId) {
      filtered = filtered.filter(item => item._id === effectiveSpotId)
    }
    const kw = (searchKeyword || '').trim().toLowerCase()
    if (kw) {
      filtered = filtered.filter(item => {
        const text = `${item.name || ''} ${item.address || ''} ${(item.tags || []).join(' ')}`.toLowerCase()
        return text.includes(kw)
      })
    }

    // 只看有样片的点（seriesCount > 0）
    if (onlyWithSample) {
      filtered = filtered.filter(item => Number(item.seriesCount || 0) > 0)
    }

    // 排序（热度 / 距离 / 综合）
    const sorted = this.sortFilteredSpots(filtered, sortType)

    const activeId = this.data.selectedSpot && this.data.selectedSpot._id
    const mappableSpots = sorted.filter(hasCoordinates)
    const markers = mappableSpots.map((item, index) => {
      const active = item._id === activeId
      const name = item.name || ''
      return {
        id: index,
        latitude: item.latitude,
        longitude: item.longitude,
        iconPath: active ? PIN_ICON_ACTIVE : PIN_ICON_DEFAULT,
        width: active ? 52 : 44,
        height: active ? 77 : 65,
        anchor: { x: 0.5, y: 1 },
        name: name,
        zIndex: active ? 10 : 1,
        callout: {
          content: name,
          color: '#2A211B',
          fontSize: 12,
          bgColor: '#FFFFFF',
          borderColor: active ? '#FFD36A' : '#F0D9C8',
          borderWidth: active ? 2 : 1,
          borderRadius: 14,
          padding: 6,
          display: 'ALWAYS',
          textAlign: 'center'
        }
      }
    })

    const center = this.computeCenter(mappableSpots, city)
    const scale = mappableSpots.length === 1 ? 16 : (effectiveDistrict ? 14 : DEFAULT_SCALE)
    const includePoints = mappableSpots.length > 1
      ? mappableSpots.map(item => ({ latitude: item.latitude, longitude: item.longitude }))
      : []

    const districtCount = effectiveDistrict
      ? (districtOptions.find(d => d.value === effectiveDistrict) || {}).count || sorted.length
      : sorted.length

    this.setData({
      filteredSpots: sorted,
      markers,
      mapLatitude: center.latitude,
      mapLongitude: center.longitude,
      mapScale: scale,
      includePoints,
      resultCount: sorted.length,
      districtCount,
      districtOptions,
      spotOptions: citySpotOptions,
      selectedDistrict: effectiveDistrict,
      selectedSpotId: effectiveSpotId,
      selectedSpotName: effectiveSpotId ? ((citySpotOptions.find(item => item.value === effectiveSpotId) || {}).name || '') : '',
      showArrowPhoto: true,
      showArrowVideo: true,
      showArrowPeripheral: true
    })
  },

  sortFilteredSpots(list = [], type = 'composite') {
    const arr = [...list]
    if (type === 'hot') {
      arr.sort((a, b) => Number(b.hotScore || 0) - Number(a.hotScore || 0))
    } else if (type === 'distance') {
      const loc = this.data.userLocation
      if (loc && loc.latitude) {
        arr.sort((a, b) => this.getDistance(loc, a) - this.getDistance(loc, b))
      }
    }
    return arr
  },

  getDistance(loc, spot) {
    if (!hasCoordinates(spot)) return Number.POSITIVE_INFINITY
    const R = 6371
    const toRad = d => d * Math.PI / 180
    const dLat = toRad(spot.latitude - loc.latitude)
    const dLng = toRad(spot.longitude - loc.longitude)
    const lat1 = toRad(loc.latitude)
    const lat2 = toRad(spot.latitude)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  },

  computeCenter(list = [], city = null) {
    if (!list.length) return mapCenterForCity(city, CHANGSHA_CENTER)
    if (list.length === 1) return { latitude: list[0].latitude, longitude: list[0].longitude }
    const lat = list.reduce((sum, item) => sum + item.latitude, 0) / list.length
    const lng = list.reduce((sum, item) => sum + item.longitude, 0) / list.length
    return { latitude: lat, longitude: lng }
  },

  updateMarkerActive(activeIndex) {
    const markers = this.data.markers.map(m => {
      const active = Number(m.id) === Number(activeIndex)
      return Object.assign({}, m, {
        iconPath: active ? PIN_ICON_ACTIVE : PIN_ICON_DEFAULT,
        width: active ? 52 : 44,
        height: active ? 77 : 65,
        anchor: { x: 0.5, y: 1 },
        zIndex: active ? 10 : 1,
        callout: Object.assign({}, m.callout, {
          color: '#2A211B',
          bgColor: '#FFFFFF',
          borderColor: active ? '#FFD36A' : '#F0D9C8',
          borderWidth: active ? 2 : 1
        })
      })
    })
    this.setData({ markers })
  },

  // ---------- 搜索 ----------
  onSearchInput(e) {
    const kw = e.detail.value || ''
    this.setData({ searchKeyword: kw })
    this.updateSearchSuggestions(kw)
  },

  updateSearchSuggestions(kw = '') {
    const k = (kw || '').trim()
    const catalog = this.data.searchCatalog || {}
    const hasRemoteCatalog = [catalog.packages, catalog.videos, catalog.albums, catalog.guides].some(list => Array.isArray(list) && list.length)
    const source = hasRemoteCatalog
      ? { ...catalog, spots: this.data.spots }
      : (isExplicitDemoMode() ? demoData.spots : { ...catalog, spots: this.data.spots })
    const list = k ? buildSearchSuggestions(k, source) : []
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
    this.setData({ searchFocused: true })
    this.updateSearchSuggestions(this.data.searchKeyword)
    wx.createSelectorQuery().in(this).select('.explore-searchbar').boundingClientRect(rect => {
      if (rect) this.setData({ searchDropdownTop: rect.bottom + 6 })
    }).exec()
  },

  onSearchBlur() {
    this.searchBlurTimer = setTimeout(() => this.closeSearch(), 150)
  },

  closeSearch() {
    if (this.searchBlurTimer) {
      clearTimeout(this.searchBlurTimer)
      this.searchBlurTimer = null
    }
    this.setData({ searchFocused: false })
  },

  clearSearch() {
    this.setData({ searchKeyword: '', searchHasInput: false, searchSuggestions: [] })
    this.applyFilters()
  },

  onSearchConfirm() {
    const kw = (this.data.searchKeyword || '').trim()
    this.closeSearch()
    if (!kw) {
      wx.showToast({ title: '请输入搜索内容', icon: 'none' })
      return
    }
    // 与「探索」按钮统一：键盘确认搜索也跳搜索结果页
    wx.navigateTo({ url: this.buildUrl('/pages/search/search', { keyword: kw }) })
  },

  onSuggestionTap(e) {
    const item = e.detail.item || {}
    this.setData({ searchHasInput: false, searchSuggestions: [] })
    this.closeSearch()
    // 与首页共用同一份直达路由：点下拉建议项直达对应详情页
    routeSearchSuggestion(item, this.buildUrl.bind(this))
  },

  onHotSearchTap(e) {
    const keyword = e.detail.keyword
    this.setData({ searchKeyword: keyword, searchFocused: false })
    this.closeSearch()
    // 与首页一致：点热门词跳搜索结果页（点搜索建议才直达具体页）
    wx.navigateTo({ url: this.buildUrl('/pages/search/search', { keyword }) })
  },

  // ---------- 筛选下拉 ----------
  togglePanel(e) {
    const type = e.currentTarget.dataset.type
    const next = this.data.openPanel === type ? '' : type
    this.setData({ openPanel: next }, () => {
      if (!next) return
      const query = wx.createSelectorQuery().in(this)
      query.select('.explore-filters').boundingClientRect()
      query.select('.filter-dropdown').boundingClientRect()
      query.select('#filter-' + type).boundingClientRect()
      query.exec(res => {
        const filtersRect = res[0]
        const ddRect = res[1]
        const btnRect = res[2]
        if (!filtersRect) return
        const patch = { filterPanelTop: filtersRect.bottom + 8 }
        if (ddRect && btnRect) {
          const screenW = (wx.getSystemInfoSync && wx.getSystemInfoSync().windowWidth) || 375
          const rpxPx = screenW / 750
          const panelLeftPx = ddRect.left + 24 * rpxPx
          patch.filterArrowLeft = btnRect.left + btnRect.width / 2 - panelLeftPx
        }
        this.setData(patch)
      })
    })
  },

  closePanel() {
    this.setData({ openPanel: '' })
  },

  selectCity(e) {
    const { value, disabled } = e.currentTarget.dataset
    if (disabled) {
      wx.showToast({ title: '该城市即将上线', icon: 'none' })
      return
    }
    const city = findCity(this.data.cityOptions, value)
    this.setData({ selectedCity: value, selectedCityName: (city && city.name) || '', openPanel: '' })
    this.applyFilters()
  },

  selectDistrict(e) {
    const value = e.currentTarget.dataset.value || ''
    this.setData({ selectedDistrict: value, openPanel: '' })
    this.applyFilters()
  },

  selectSpot(e) {
    const value = e.currentTarget.dataset.value || ''
    const spot = this.data.spots.find(item => String(item._id) === String(value))
    const nextId = this.data.selectedSpotId === value ? '' : value
    this.setData({
      selectedSpotId: nextId,
      selectedSpotName: nextId ? (spot && spot.name) : '',
      openPanel: ''
    })
    this.applyFilters()
    if (nextId && spot) {
      this.goSpotSheet(spot)
      const idx = this.data.filteredSpots.filter(hasCoordinates).findIndex(s => String(s._id) === String(spot._id))
      if (idx >= 0) this.updateMarkerActive(idx)
    }
  },

  selectSort(e) {
    const { value } = e.currentTarget.dataset
    // 「离我最近」需要定位授权；未授权则拉起授权，失败降级为综合推荐
    if (value === 'distance' && !this.data.userLocation) {
      this.requestLocation().then(loc => {
        this.setData({ userLocation: loc, sortType: value, openPanel: '' })
        this.applyFilters()
      }).catch(() => {
        wx.showToast({ title: '未授权定位，已用综合推荐', icon: 'none' })
        this.setData({ sortType: 'composite', openPanel: '' })
        this.applyFilters()
      })
      return
    }
    this.setData({ sortType: value, openPanel: '' })
    this.applyFilters()
  },

  toggleOnlySample() {
    this.setData({ onlyWithSample: !this.data.onlyWithSample, openPanel: '' })
    this.applyFilters()
  },

  requestLocation() {
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: res => resolve({ latitude: res.latitude, longitude: res.longitude }),
        fail: () => reject(new Error('location denied'))
      })
    })
  },

  resetFilters() {
    // 默认城市取后台第一个已开通城市；显式演示模式才回退长沙。
    const first = (this.data.cityOptions || []).find(c => !c.disabled) || null
    const firstCity = first ? first.value : (isExplicitDemoMode() ? '长沙' : '')
    this.setData({
      selectedCity: firstCity,
      selectedCityName: first ? first.name : (isExplicitDemoMode() ? '长沙' : ''),
      selectedDistrict: '',
      selectedSpotId: '',
      selectedSpotName: '',
      searchKeyword: '',
      searchHasInput: false,
      searchSuggestions: []
    })
    this.closeSheet()
    this.applyFilters()
  },

  // 点位详情已改为独立页面，这里只负责收起筛选与清除当前点位筛选。
  closeSheet() {
    const hasSelectedSpot = !!this.data.selectedSpotId
    this.setData({
      openPanel: '',
      selectedSpotId: '',
      selectedSpotName: ''
    })
    if (hasSelectedSpot) this.applyFilters()
  },

  // ---------- 地图交互 ----------
  onMarkerTap(e) {
    const markerId = parseInt(e.detail.markerId, 10)
    const spot = this.data.filteredSpots.filter(hasCoordinates)[markerId]
    if (!spot || isNaN(markerId)) return
    // 点击图钉时微信常会连带派发一次地图 tap，设标记避免底部面板被误关
    this._markerTapGuard = Date.now()
    this.updateMarkerActive(markerId)
    this.goSpotSheet(spot)
  },

  onMapTap() {
    // 屏蔽点击图钉后 400ms 内连带触发的地图 tap，防止面板一闪即关
    if (this._markerTapGuard && Date.now() - this._markerTapGuard < 400) return
    this.closeSheet()
  },

  zoomIn() {
    const next = Math.min(this.data.mapScale + 1, 20)
    this.setData({ mapScale: next })
  },

  zoomOut() {
    const next = Math.max(this.data.mapScale - 1, 5)
    this.setData({ mapScale: next })
  },

  locateMe() {
    if (this.mapCtx && this.mapCtx.moveToLocation) {
      this.mapCtx.moveToLocation()
    }
  },

  // ---------- 打卡点面板：改为独立页面（方案 B） ----------
  goSpotSheet(spot = {}) {
    if (!spot || !spot._id) return
    const shopId = spot.shopId || this.data.shopId || ''
    wx.navigateTo({ url: this.buildUrl('/pages/spotSheet/spotSheet', { id: spot._id, shopId }) })
  },

  // 搜索栏“探索”按钮：跳搜索结果页（与输入框确认同逻辑）
  onSearchAction() {
    const kw = (this.data.searchKeyword || '').trim()
    this.closeSearch()
    wx.navigateTo({ url: this.buildUrl('/pages/search/search', { keyword: kw }) })
  },

  // 探索页搜索未收录点：跳转预约页并带入搜索词（客人想拍的地方），无 _id 用纯文本
  goCustomBookingByKeyword(e) {
    const kw = ((e && e.detail && e.detail.keyword) || this.data.searchKeyword || '').trim()
    if (!kw) return
    wx.navigateTo({
      url: this.buildUrl('/pages/bookingInfo/bookingInfo', { requestedSpot: kw })
    })
  },

  // ---------- 探索页轮播（后台可配，与首页轮播单独一套） ----------
  async loadExploreBanners() {
    try {
      const res = await homeApi.getHomeData({ shopId: this.data.shopId, spot: this.data.spot })
      const payload = (res && res.success && res.data) || {}
      const list = payload.exploreBanners || []
      const banners = normalizeBanners(list).slice(0, 6)
      const searchCatalog = {
        packages: Array.isArray(payload.packages) ? payload.packages : [],
        videos: [
          ...(Array.isArray(payload.videoSingles) ? payload.videoSingles : []),
          ...(Array.isArray(payload.videoProducts) ? payload.videoProducts : [])
        ],
        albums: Array.isArray(payload.albums) ? payload.albums : [],
        guides: Array.isArray(payload.guides) ? payload.guides : []
      }
      if (!banners.length) {
        this.setData({
          exploreBanners: isExplicitDemoMode() ? normalizeBanners(demoData.exploreBanners || []) : [],
          searchCatalog
        })
      } else {
        this.setData({ exploreBanners: banners, searchCatalog })
      }
    } catch (err) {
      console.error('explore loadExploreBanners error', err)
      this.setData({ exploreBanners: isExplicitDemoMode() ? normalizeBanners(demoData.exploreBanners || []) : [] })
    }
  },

  onBannerChange(e) {
    const current = e.detail.current
    this.setData({ bannerIndex: current })
    const banners = this.data.exploreBanners || []
    if (banners[current] && banners[current].type === 'video') {
      this.setData({ bannerAutoplay: false })
    } else {
      this.setData({ bannerAutoplay: true })
    }
  },

  goBanner(e) {
    const index = Number(e.currentTarget.dataset.index || 0)
    const banner = (this.data.exploreBanners || [])[index]
    const target = getBannerTarget(banner)
    if (!target) return
    if (target.url) {
      if (target.method === 'switchTab') {
        wx.switchTab({ url: target.url.split('?')[0] })
      } else {
        wx.navigateTo({ url: target.url })
      }
      return
    }
    if (target.path) {
      const url = target.params ? this.buildUrl(target.path, target.params) : target.path
      if (target.method === 'switchTab') {
        wx.switchTab({ url: url.split('?')[0] })
      } else {
        wx.navigateTo({ url })
      }
    }
  },

  noop() {}
})
