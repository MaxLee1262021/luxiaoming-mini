const app = getApp()
const demoData = require('../../utils/demoData')
const spotApi = require('../../api/spot')
const spotFilter = require('../../service/spotFilter')
const { buildUrlWithSource } = require('../../utils/query')
const { isVideoSingle } = require('../../utils/product')

Page({
  data: {
    id: '',
    shopId: '',
    scene: '',
    loading: true,
    error: '',

    selectedSpot: {},
    selectedSpotProducts: { photoSingles: [], videos: [], peripherals: [], photoPackages: [] },
    selectedSpotGuides: [],
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
    try {
      const res = await spotApi.getSpots({ shopId: this.data.shopId, limit: 100 })
      if (!res || !res.success) {
        this.applyDemoSpots()
      } else {
        const list = (res.data || []).map(item => spotFilter.normalizeSpot(item))
        this.applySpotList(list)
      }
    } catch (err) {
      console.error('spotSheet loadSpots error', err)
      this.applyDemoSpots()
    } finally {
      this.setData({ loading: false })
    }
  },

  applyDemoSpots() {
    const list = demoData.spots.map(item => spotFilter.normalizeSpot(item))
    this.applySpotList(list)
  },

  applySpotList(list = []) {
    const spot = list.find(item => item._id === this.data.id)
    if (!spot) {
      this.setData({ error: '打卡点不存在', loading: false })
      return
    }
    this.applySpot(spot)
  },

  // 原探索页底部弹窗内容，这里作为整页渲染（系统返回键原生关闭本页）
  applySpot(spot = {}) {
    const products = this.resolveSpotProducts(spot)
    const spotNoMedia = !products.photoSingles.length && !products.photoPackages.length && !products.videos.length
    const relatedRecs = spotNoMedia ? this.buildRelatedRecs(spot) : []
    const range = n => Array.from({ length: n }, (_, i) => i)
    this.setData({
      selectedSpot: spot,
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
    const spotId = spot._id
    return (demoData.guides || []).filter(g => g.spotId === spotId)
  },

  onPackageTap(e) {
    const d = (e && e.detail) || {}
    const packageId = d.id || (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id)
    const pkg = (demoData.packages || []).find(p => p._id === packageId)
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
    const spotId = spot._id
    const photoSingles = (demoData.albums || []).filter(album => {
      const series = (demoData.series || []).find(s => s._id === album.seriesId)
      return series && Array.isArray(series.spotIds) && series.spotIds.includes(spotId)
    }).map(album => ({ ...album, spotId }))

    const videos = (demoData.videoProducts || []).filter(item => item.spotId === spotId)
    const peripherals = (demoData.peripherals || []).slice(0, 10)

    const photoPackages = (demoData.packages || []).filter(p => p.productType === 'photo' && Array.isArray(p.spotIds) && p.spotIds.includes(spotId))

    return { photoSingles, videos, peripherals, photoPackages }
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
    for (const s of demoData.spots) {
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
    const spot = (demoData.spots || []).find(s => s._id === id)
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
