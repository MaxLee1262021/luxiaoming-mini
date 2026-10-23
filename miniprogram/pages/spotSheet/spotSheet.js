const app = getApp()
const demoData = require('../../utils/demoData')
const spotApi = require('../../api/spot')
const bookingApi = require('../../api/booking')
const peripheralApi = require('../../api/peripheral')
const guideApi = require('../../api/guide')
const spotFilter = require('../../service/spotFilter')
const { hasCoordinates } = require('../../service/citySpot')
const { isExplicitDemoMode } = require('../../config/env')
const { buildUrlWithSource } = require('../../utils/query')
const { isVideo, isVideoSingle, isPublicProduct, normalizePackage } = require('../../utils/product')

Page({
  data: {
    id: '',
    shopId: '',
    scene: '',
    loading: true,
    error: '',

    selectedSpot: {},
    canNavigate: false,
    openingLocation: false,
    selectedSpotProducts: { photoSingles: [], videos: [], peripherals: [], photoPackages: [] },
    selectedSpotGuides: [],
    _spotList: [],
    catalog: { allSeries: [], allAlbums: [], allPackages: [], peripherals: [], guides: [] },
    catalogReady: false,
    spotNoMedia: false,
    relatedRecs: [],

    photoDots: [],
    packageDots: [],
    videoDots: [],
    peripheralDots: [],
    photoDotActive: 0,
    packageDotActive: 0,
    videoDotActive: 0,
    peripheralDotActive: 0
  },

  onLoad(options = {}) {
    const source = app.captureSource ? app.captureSource(options) : {}
    this.setData({
      id: options.id || '',
      shopId: options.shopId || source.shopId || '',
      scene: options.scene || source.scene || ''
    })
    this.loadSpots()
  },

  buildUrl(path, params = {}) {
    return buildUrlWithSource(path, params, this.data)
  },

  async loadSpots() {
    this.setData({ loading: true, error: '' })
    const spotRequest = spotApi.getSpots({ shopId: this.data.shopId, limit: 100 }).catch(error => ({ error }))
    const bookingRequest = bookingApi.getBookingData({ shopId: this.data.shopId }).catch(error => ({ error }))
    const peripheralRequest = peripheralApi.getPeripherals({}).catch(error => ({ error }))
    const guideRequest = guideApi.getGuides({}).catch(error => ({ error }))
    const [spotResult, bookingResult, peripheralResult, guideResult] = await Promise.all([spotRequest, bookingRequest, peripheralRequest, guideRequest])
    try {
      const hasRealSpots = !!(spotResult && spotResult.success && Array.isArray(spotResult.data))
      const useDemoSpots = !hasRealSpots && isExplicitDemoMode()
      const list = hasRealSpots
        ? spotResult.data.map(item => spotFilter.normalizeSpot(item))
        : (useDemoSpots ? demoData.spots.map(item => spotFilter.normalizeSpot(item)) : [])
      const hasRealCatalog = !!(bookingResult && bookingResult.success)
      const useDemoCatalog = isExplicitDemoMode() && !hasRealSpots && !hasRealCatalog && !(peripheralResult && peripheralResult.success)
      const loadError = hasRealSpots ? '' : '打卡点数据加载失败，请返回探索页重试'
      this.applyCatalog(bookingResult, peripheralResult, guideResult, useDemoCatalog, () => this.applySpotList(list, loadError))
    } catch (err) {
      console.error('spotSheet loadSpots error', err)
      const useDemo = isExplicitDemoMode()
      this.applyCatalog(null, null, null, useDemo, () => this.applySpotList(
        useDemo ? demoData.spots.map(item => spotFilter.normalizeSpot(item)) : [],
        useDemo ? '' : '打卡点数据加载失败，请返回探索页重试'
      ))
    } finally {
      this.setData({ loading: false })
    }
  },

  applyCatalog(bookingResult, peripheralResult, guideResult, useDemoFallback = false, done) {
    const bookingData = bookingResult && bookingResult.success ? (bookingResult.data || {}) : {}
    const rawPackages = bookingData.allPackages || bookingData.packages || bookingData.hotPackages || []
    const rawSeries = bookingData.allSeries || bookingData.series || []
    const rawAlbums = bookingData.allAlbums || bookingData.albums || []
    const peripheralData = peripheralResult && peripheralResult.success
      ? (Array.isArray(peripheralResult.data) ? peripheralResult.data : [])
      : (bookingData.allPeripherals || bookingData.peripherals || [])
    const source = useDemoFallback
      ? {
          allSeries: demoData.series || [],
          allAlbums: demoData.albums || [],
          allPackages: [...(demoData.packages || []), ...(demoData.videoProducts || [])],
          peripherals: demoData.peripherals || [],
          guides: Array.isArray(guideResult) && guideResult.length ? guideResult : (demoData.guides || [])
        }
      : {
          allSeries: Array.isArray(rawSeries) ? rawSeries : [],
          allAlbums: Array.isArray(rawAlbums) ? rawAlbums.filter(isPublicProduct) : [],
          allPackages: Array.isArray(rawPackages)
            ? rawPackages.filter(isPublicProduct).map(item => {
                const normalized = normalizePackage(item)
                return { ...normalized, _id: normalized._id || normalized.id || item.packageId || item.id }
              })
            : [],
          peripherals: Array.isArray(peripheralData) ? peripheralData.filter(isPublicProduct) : [],
          guides: Array.isArray(guideResult)
            ? guideResult.filter(isPublicProduct)
            : (Array.isArray(bookingData.guides) ? bookingData.guides.filter(isPublicProduct) : [])
        }
    this.setData({ catalog: source, catalogReady: !!(bookingResult && bookingResult.success) }, done)
  },

  applyDemoSpots() {
    const list = demoData.spots.map(item => spotFilter.normalizeSpot(item))
    this.applySpotList(list)
  },

  applySpotList(list = [], failureMessage = '') {
    const normalized = (list || []).filter(Boolean)
    const requestedId = String(this.data.id || '')
    const spot = normalized.find(item => String(item._id || item.id || '') === requestedId)
    this.setData({ _spotList: normalized }, () => {
      if (!spot) {
        this.setData({ error: failureMessage || '打卡点不存在', loading: false })
        return
      }
      this.applySpot(spot)
    })
  },

  // 原探索页底部弹窗内容，这里作为整页渲染（系统返回键原生关闭本页）
  applySpot(spot = {}) {
    const products = this.resolveSpotProducts(spot)
    const spotNoMedia = !products.photoSingles.length && !products.photoPackages.length && !products.videos.length
    const relatedRecs = spotNoMedia ? this.buildRelatedRecs(spot) : []
    const range = n => Array.from({ length: n }, (_, i) => i)
    this.setData({
      selectedSpot: spot,
      canNavigate: hasCoordinates(spot),
      selectedSpotProducts: products,
      selectedSpotGuides: this.resolveSpotGuides(spot),
      spotNoMedia,
      relatedRecs,
      photoDots: range(products.photoSingles.length),
      packageDots: range(products.photoPackages.length),
      videoDots: range(products.videos.length),
      peripheralDots: range(products.peripherals.length),
      photoDotActive: 0,
      packageDotActive: 0,
      videoDotActive: 0,
      peripheralDotActive: 0
    })
  },

  resolveSpotGuides(spot = {}) {
    const spotId = String(spot._id || '')
    const guides = (this.data.catalog && this.data.catalog.guides) || []
    return guides.filter(guide => {
      const ids = Array.isArray(guide.spotIds) ? guide.spotIds.map(String) : []
      return String(guide.spotId || '') === spotId || ids.includes(spotId)
    })
  },

  onPackageTap(e) {
    const d = (e && e.detail) || {}
    const packageId = d.id || (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id)
    const pkg = (this.data.selectedSpotProducts.photoPackages || []).find(p => p._id === packageId || p.id === packageId)
      || (this.data.catalog.allPackages || []).find(p => p._id === packageId || p.id === packageId)
    if (!pkg) {
      wx.showToast({ title: '旅拍套餐不存在', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: this.buildUrl('/pages/photoPackageDetail/photoPackageDetail', {
        id: pkg.seriesId,
        packageId,
        productId: packageId,
        spotId: pkg.spotId
      })
    })
  },

  resolveSpotProducts(spot = {}) {
    const spotId = String(spot._id || spot.id || '')
    const catalog = this.data.catalog || {}
    const series = catalog.allSeries || []
    const albums = catalog.allAlbums || []
    const products = catalog.allPackages || []
    const belongsToSpot = item => {
      if (!spotId) return true
      if (String(item.spotId || '') === String(spotId) || (Array.isArray(item.spotIds) && item.spotIds.map(String).includes(String(spotId)))) return true
      if (!item.spotId && !(Array.isArray(item.spotIds) && item.spotIds.length)) return true
      const seriesId = item.seriesId
      const owner = series.find(entry => entry._id === seriesId || entry.id === seriesId)
      return !!(owner && (String(owner.spotId || '') === String(spotId) || (Array.isArray(owner.spotIds) && owner.spotIds.map(String).includes(String(spotId)))))
    }
    const photoSingles = albums.filter(belongsToSpot).map(album => ({
      ...album,
      _id: album._id || album.id || album.albumId,
      spotId,
      cover: album.cover || album.coverImage || (album.sampleUrls && album.sampleUrls[0]) || '/images/placeholder.png'
    }))
    const videos = products.filter(item => isVideoSingle(item) && belongsToSpot(item))
    const peripherals = (catalog.peripherals || []).filter(item => {
      const relatedSpotIds = [
        ...(Array.isArray(item.spotIds) ? item.spotIds : []),
        item.spotId
      ].filter(value => value !== undefined && value !== null && String(value).trim()).map(String)
      const isGlobal = !relatedSpotIds.length || item.mode === '全城通用'
      return !spotId || isGlobal || relatedSpotIds.includes(spotId)
    }).slice(0, 10)
    const photoPackages = products.filter(item => !isVideo(item) && !isVideoSingle(item) && belongsToSpot(item))
    const unique = list => list.filter((item, index, rows) => {
      const id = item && (item._id || item.id || item.name)
      return id && rows.findIndex(other => (other && (other._id || other.id || other.name)) === id) === index
    })
    return {
      photoSingles: unique(photoSingles),
      videos: unique(videos),
      peripherals: unique(peripherals),
      photoPackages: unique(photoPackages)
    }
  },

  onPhotoScroll(e) { this.updateDot('photo', e) },
  onPackageScroll(e) { this.updateDot('package', e) },
  onVideoScroll(e) { this.updateDot('video', e) },
  onPeripheralScroll(e) { this.updateDot('peripheral', e) },

  // 横滑进度圆点：用 scrollLeft / (scrollLeft + scrollRight) 比例映射到当前索引，无需测量宽度
  updateDot(prefix, e) {
    const d = e.detail || {}
    const count = (this.data[prefix + 'Dots'] || []).length
    if (count <= 1) return
    const scrollable = (d.scrollLeft || 0) + (d.scrollRight || 0)
    const idx = scrollable > 0 ? Math.round((d.scrollLeft || 0) / scrollable * (count - 1)) : 0
    const key = prefix + 'DotActive'
    if (this.data[key] !== idx) this.setData({ [key]: idx })
  },

  goGuideList() {
    const spot = this.data.selectedSpot || {}
    wx.navigateTo({
      url: this.buildUrl('/pages/guideList/guideList', { spotId: spot._id, spotName: spot.name || '' })
    })
  },

  onNavigate() {
    if (this.data.openingLocation) return
    const spot = this.data.selectedSpot || {}
    if (!hasCoordinates(spot)) {
      wx.showToast({ title: '该地点暂未配置位置', icon: 'none' })
      return
    }
    if (typeof wx.openLocation !== 'function') {
      wx.showToast({ title: '请升级微信后使用导航', icon: 'none' })
      return
    }
    const showFailure = () => wx.showToast({ title: '地图打开失败，请稍后重试', icon: 'none' })
    this.setData({ openingLocation: true })
    try {
      // selectedSpot 已在加载时转换为 GCJ-02，直接复用，避免重复转换造成偏移。
      wx.openLocation({
        latitude: Number(spot.latitude),
        longitude: Number(spot.longitude),
        name: String(spot.name || '打卡点'),
        address: String(spot.address || ''),
        scale: 16,
        fail: error => {
          if (error && /cancel/i.test(error.errMsg || '')) return
          showFailure()
        },
        complete: () => this.setData({ openingLocation: false })
      })
    } catch (error) {
      this.setData({ openingLocation: false })
      showFailure()
    }
  },

  // Legacy alias kept for the route action in the spot sheet header.
  goNavigation() {
    return this.onNavigate()
  },

  goCustomBooking(e) {
    const d = (e && e.detail) || {}
    const spot = this.data.selectedSpot || {}
    const spotId = d.spotId || spot._id || ''
    const spotName = d.spotName || spot.name || ''
    wx.navigateTo({
      url: this.buildUrl('/pages/bookingInfo/bookingInfo', { spotId, spotName })
    })
  },

  buildRelatedRecs(currentSpot = {}) {
    const currentId = currentSpot._id
    const recs = []
    for (const s of (this.data._spotList || [])) {
      if (!s || s._id === currentId) continue
      const p = this.resolveSpotProducts(s)
      if (p.photoSingles.length || p.photoPackages.length || p.videos.length) {
        recs.push({ _id: s._id, name: s.name, district: s.district || '' })
        if (recs.length >= 6) break
      }
    }
    return recs
  },

  // 相关推荐：同页内直接切换展示，避免反复压栈
  onRecTap(e) {
    const id = e.currentTarget.dataset.id
    const spot = (this.data._spotList || []).find(s => String(s._id || s.id || '') === String(id || ''))
    if (!spot) return
    this.setData({ id })
    this.applySpot(spot)
  },

  onPhotoTap(e) {
    const d = e.detail || {}
    const albumId = d.albumId || d.id
    const seriesId = d.seriesId
    const spotId = d.spotId || this.data.selectedSpot._id
    if (!albumId) return
    wx.navigateTo({
      url: this.buildUrl('/pages/photoCollection/photoCollection', { albumId, seriesId, spotId })
    })
  },

  onVideoTap(e) {
    const item = (e.detail && e.detail.item) || {}
    const id = e.detail.id || item._id
    const seriesId = item.seriesId
    const spotId = item.spotId || this.data.selectedSpot._id
    if (!id) return
    const path = '/pages/videoProductDetail/videoProductDetail'
    wx.navigateTo({
      url: this.buildUrl(path, {
        productId: id,
        packageId: id,
        id: seriesId,
        spotId
      })
    })
  },

  onPeripheralTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: this.buildUrl('/pages/peripheralDetail/peripheralDetail', { id }) })
  },

  retry() {
    this.setData({ loading: true, error: '' })
    this.loadSpots()
  },

  noop() {}
})
