const app = getApp()
const demoData = require('../../utils/demoData')
const collectionApi = require('../../api/collection')
const { buildUrlWithSource } = require('../../utils/query')
const { isVideoSingle } = require('../../service/videoProductDetail')
const favorite = require('../../utils/favorite')

Page({
  data: {
    shopId: '',
    scene: '',
    series: {},
    photos: [],
    packages: [],
    featuredPackages: [],
    featuredPackage: null,
    spotPackages: [],
    videos: [],
    peripherals: [],
    collections: [],
    currentCollection: null,
    activeCollectionId: '',
    relatedCollections: [],
    pendingAlbumId: '',
    focusAlbumId: '',
    currentSpotId: '',
    isAlbumDetail: false,
    spots: [],
    loading: true,
    degraded: false, // 照片留影数据拉取失败、正在展示预览数据时置 true（降级提示条）
    collected: false
  },

  onLoad(options = {}) {
    const seriesId = options.seriesId
    const source = app.captureSource ? app.captureSource(options) : {}
    this.setData({
      shopId: options.shopId || source.shopId || '',
      scene: options.scene || source.scene || '',
      pendingAlbumId: options.albumId || '',
      focusAlbumId: options.focusAlbumId || '',
      currentSpotId: options.spotId || ''
    })
    if (seriesId || options.albumId) {
      this.loadCollection(seriesId, options.albumId)
    } else {
      this.applyCollectionData(demoData.getPhotoCollection(), true)
    }
  },

  buildUrl(path, params = {}) {
    return buildUrlWithSource(path, params, this.data)
  },

  async loadCollection(seriesId, albumId) {
    this._lastLoadArgs = [seriesId, albumId] // 记住加载参数，供降级提示条重试复用
    try {
      const res = await collectionApi.getPhotoCollection({ seriesId, albumId, spotId: this.data.currentSpotId })
      if (res && res.success) {
        this.applyCollectionData(res.data || {})
        this.setData({ degraded: false })
      } else {
        // 后台响应缺少成功标记（罕见，防御分支）：回退演示数据，不算失败
        this.applyCollectionData(demoData.getPhotoCollection({ seriesId, albumId, spotId: this.data.currentSpotId }), true)
        this.setData({ degraded: false })
      }
    } catch (err) {
      console.error('load photo collection failed', err)
      // 请求失败（网络异常或后台未接通）：回退预览数据兜底 + 顶部降级提示条，客人可重试
      this.applyCollectionData(demoData.getPhotoCollection({ seriesId, albumId, spotId: this.data.currentSpotId }), true)
      this.setData({ degraded: true })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 降级提示条「重新加载」：重新拉真实照片留影数据，成功后提示条自动消失
  onRetryLoad() {
    if (!this._lastLoadArgs) return
    this.setData({ loading: true })
    this.loadCollection(this._lastLoadArgs[0], this._lastLoadArgs[1])
  },

  applyCollectionData(data = {}, isDemo = false) {
    const fallback = demoData.getPhotoCollection({
      seriesId: data.series && data.series._id,
      albumId: this.data.pendingAlbumId,
      spotId: this.data.currentSpotId || data.currentSpotId || ''
    })
    const packages = (data.packages && data.packages.length) ? data.packages : (fallback.packages || [])
    const featuredPackages = (data.featuredPackages && data.featuredPackages.length) ? data.featuredPackages : (fallback.featuredPackages || [])
    const spotPackages = (data.spotPackages && data.spotPackages.length) ? data.spotPackages : (fallback.spotPackages || packages)
    const currentSpotId = this.data.currentSpotId || data.currentSpotId || (data.currentCollection && data.currentCollection.spotId) || fallback.currentSpotId || ''
    const filterVideosBySpot = (list = []) => {
      if (!currentSpotId) return list
      return (list || []).filter(item => item.spotId === currentSpotId || (Array.isArray(item.spotIds) && item.spotIds.includes(currentSpotId)))
    }
    const videos = filterVideosBySpot(Array.isArray(data.videos) ? data.videos : (fallback.videos || []))
    const rawCollections = (data.collections && data.collections.length) ? data.collections : (fallback.collections || [])
    const collections = rawCollections.map(item => ({
      ...item,
      collectionKey: this.getCollectionKey(item)
    }))
    const pending = this.data.pendingAlbumId
    const focusAlbumId = this.data.focusAlbumId
    const activeCollection = pending
      ? collections.find(item => item.collectionKey === pending || item.albumId === pending)
      : null
    const focusCollection = focusAlbumId
      ? collections.find(item => item.collectionKey === focusAlbumId || item.albumId === focusAlbumId || item._id === focusAlbumId)
      : null
    const fallbackCollectionId = fallback.currentCollection && (fallback.currentCollection._id || fallback.currentCollection.albumId)
    const detailCollection = activeCollection ||
      (fallbackCollectionId ? collections.find(item => item.collectionKey === fallbackCollectionId || item.albumId === fallbackCollectionId || item._id === fallbackCollectionId) : null) ||
      data.currentCollection ||
      fallback.currentCollection ||
      null
    const isAlbumDetail = !!(pending && detailCollection)
    const collectionFavId = isAlbumDetail ? this.getCollectionKey(detailCollection) : ''
    // 拍摄说明：album 数据优先（shootingNotes 字符串拆成数组），没数据时用统一默认值兜底
    const shootingNotesRaw = detailCollection ? (detailCollection.shootingNotes || '') : ''
    const fromData = shootingNotesRaw
      ? shootingNotesRaw.split(/[；;\n]/).map(s => s.trim()).filter(Boolean)
      : []
    const instructions = fromData.length > 0 ? fromData : demoData.DEFAULT_SHOOTING_INSTRUCTIONS
    const normalizedCollection = detailCollection
      ? Object.assign({}, detailCollection, { shootingNotes: shootingNotesRaw, instructions })
      : null
    // 适用打卡点：单品详情时取该照片单品绑定的打卡点（自动汇总为纯文字 pill 列表）
    const albumSpots = (isAlbumDetail && normalizedCollection && normalizedCollection.spotId)
      ? [{ _id: normalizedCollection.spotId, name: normalizedCollection.spotName || '' }]
      : []
    // 相关推荐：同系列其它照片单品（剔除当前查看的这一个）
    const relatedCollections = (collections || []).filter(
      item => item.collectionKey && detailCollection && item.collectionKey !== detailCollection.collectionKey
    )

    this.setData({
      series: data.series || {},
      photos: data.photos || [],
      packages,
      featuredPackages,
      featuredPackage: featuredPackages.length ? featuredPackages[0] : null,
      spotPackages,
      videos,
      peripherals: data.peripherals || [],
      collections,
      currentCollection: normalizedCollection,
      currentSpotId,
      isAlbumDetail,
      spots: albumSpots,
      relatedCollections,
      instructions,
      activeCollectionId: activeCollection ? activeCollection.collectionKey : (focusCollection ? focusCollection.collectionKey : (collections[0] ? collections[0].collectionKey : '')),
      collected: collectionFavId ? favorite.has(collectionFavId) : false,
      loading: false
    })
    if (!isAlbumDetail && focusCollection) this.scrollToFocusedCollection(focusCollection.collectionKey)
  },

  scrollToFocusedCollection(collectionKey = '') {
    if (!collectionKey) return
    setTimeout(() => {
      wx.pageScrollTo({
        selector: `#collection-${collectionKey}`,
        duration: 320,
        offsetTop: 88
      })
    }, 260)
  },

  getCollectionKey(collection = {}) {
    return collection._id || collection.albumId || collection.seriesId || collection.name || ''
  },


  goCollectionDetail(e) {
    const dataset = e.detail || e.currentTarget.dataset || {}
    const id = dataset.albumId || dataset.id || ''
    const collection = (this.data.collections || []).find(item => this.getCollectionKey(item) === id || item.albumId === id || item._id === id)
    const seriesId = dataset.seriesId || (collection && collection.seriesId) || this.data.series._id || ''
    const albumId = dataset.albumId || (collection && (collection.albumId || collection._id)) || ''
    const spotId = dataset.spotId || (collection && collection.spotId) || ''
    if (!albumId) {
      wx.showToast({ title: '照片留影不存在', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: this.buildUrl('/pages/photoCollection/photoCollection', {
        seriesId,
        albumId,
        spotId
      })
    })
  },

  previewMedia(e) {
    const url = e.currentTarget.dataset.url
    const type = e.currentTarget.dataset.type || 'image'
    if (!url) {
      wx.showToast({ title: '暂无样片可预览', icon: 'none' })
      return
    }
    if (type === 'video') {
      wx.showToast({ title: '视频样片请点击播放', icon: 'none' })
      return
    }
    const urls = (this.data.photos || [])
      .filter(item => (item.type || item.mediaType || 'image') === 'image')
      .map(item => item.url)
      .filter(Boolean)
    wx.previewImage({ current: url, urls: urls.length ? urls : [url] })
  },

  goVideoSampleDetail(e) {
    const dataset = e.currentTarget.dataset || {}
    const id = dataset.productId || dataset.packageId || dataset.id || ''
    if (!id) {
      wx.showToast({ title: '视频商品不存在', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: this.buildUrl('/pages/videoProductDetail/videoProductDetail', {
        productId: id,
        packageId: dataset.packageId || id,
        spotId: this.data.spotId || '',
        seriesId: this.data.series && this.data.series._id
      })
    })
  },

  previewCollection(e) {
    const id = e.currentTarget.dataset.id || e.currentTarget.dataset.seriesId
    const collection = (this.data.collections || []).find(item => this.getCollectionKey(item) === id || item.seriesId === id) || {}
    const urls = (collection.sampleUrls || []).filter(Boolean)
    if (!urls.length && collection.coverImage) urls.push(collection.coverImage)
    if (!urls.length && collection.cover) urls.push(collection.cover)
    if (!urls.length) {
      wx.showToast({ title: '暂无样片可预览', icon: 'none' })
      return
    }
    wx.previewImage({ current: e.currentTarget.dataset.url || urls[0], urls })
  },

  goPackageDetail(e) {
    const packageId = e.detail.id
    const packages = [
      this.data.featuredPackage,
      ...(this.data.featuredPackages || []),
      ...(this.data.packages || []),
      ...(this.data.spotPackages || [])
    ].filter(Boolean)
    const pkg = packages.find(item => item._id === packageId) || {}
    const seriesId = pkg.seriesId || this.data.series._id
    if (!packageId) {
      wx.showToast({ title: '旅拍套餐不存在', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: this.buildUrl('/pages/photoPackageDetail/photoPackageDetail', {
        id: seriesId,
        packageId,
        productId: packageId,
        spotId: pkg.spotId
      })
    })
  },


  goSpot(e) {
    const spotId = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id)
      || (this.data.currentCollection && this.data.currentCollection.spotId)
      || this.data.currentSpotId
      || ''
    if (!spotId) return
    wx.navigateTo({ url: this.buildUrl('/pages/spotSheet/spotSheet', { id: spotId, spotId }) })
  },

  goBookingFromCollectionBottom() {    const c = this.data.currentCollection || {}
    const seriesId = c.seriesId || (this.data.series && this.data.series._id) || ''
    const spotId = c.spotId || this.data.currentSpotId || ''
    const albumId = c._id || c.albumId || ''
    const albumPrice = c.price || 0
    if (!albumId) {
      wx.showToast({ title: '照片留影不存在', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: this.buildUrl('/pages/bookingInfo/bookingInfo', {
        seriesId,
        albumId,
        albumPrice,
        spotId
      })
    })
  },

  goPeripheralDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: this.buildUrl('/pages/peripheralDetail/peripheralDetail', { id }) })
  },

  contactService() {
    wx.openCustomerServiceChat({
      extInfo: {},
      corpId: (getApp().globalData && getApp().globalData.corpId) || '',
      fail() {
        wx.showToast({ title: '请联系客服咨询', icon: 'none' })
      }
    })
  },

  toggleCollect() {
    const c = this.data.currentCollection || {}
    const id = this.getCollectionKey(c)
    if (!id) {
      wx.showToast({ title: '该内容暂不支持收藏', icon: 'none' })
      return
    }
    const next = favorite.toggle({
      type: 'photo_single',
      typeLabel: '照片留影',
      id,
      title: c.name || c.seriesName || '照片留影',
      cover: c.coverImage || c.cover || '',
      price: c.price || 0,
      spot: c.spotName || '长沙',
      spotId: c.spotId || '',
      url: '/pages/photoCollection/photoCollection?seriesId=' + (c.seriesId || this.data.series._id || '') + '&albumId=' + (c._id || c.albumId || '') + '&spotId=' + (c.spotId || this.data.currentSpotId || '')
    })
    this.setData({ collected: next })
    wx.showToast({ title: next ? '已收藏' : '已取消收藏', icon: 'none' })
  },

})
