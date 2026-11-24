const app = getApp()
const packageApi = require('../../api/package')
const spotApi = require('../../api/spot')
const { buildUrlWithSource } = require('../../utils/query')
const { buildVideoProductDetail } = require('../../service/videoProductDetail')
const { getPageModuleConfig, isPageModuleVisible } = require('../../service/siteConfig')
const { openCustomerService } = require('../../service/customerService')

Page({
  data: {
    loading: true,
    error: '',
    productId: '',
    spotId: '',
    shopId: '',
    scene: '',
    product: null,
    spot: {},
    spots: [],
    samples: [],
    currentSample: 0,
    isVideoPlaying: false,
    isVideoFullscreen: false,
    recommendations: [],
    videoFields: [],
    packageBenefits: [],
    displayTags: [],
    // 商品拍摄说明优先，未配置时使用统一默认说明。
    instructions: [],
    pageConfig: {},
    moduleVisible: {
      video: true,
      shootingNote: true,
      recommendVideos: true,
      recommendContent: true
    }
  },

  onLoad(options = {}) {
    const source = app.captureSource ? app.captureSource(options) : {}
    this.setData({
      productId: options.productId || options.packageId || options.id || '',
      spotId: options.spotId || '',
      shopId: options.shopId || source.shopId || '',
      scene: options.scene || source.scene || ''
    })
    this.applyPageConfig()
    this.loadData()
  },

  applyPageConfig() {
    const pageKey = 'videoDetail'
    this.setData({
      pageConfig: getPageModuleConfig(pageKey),
      moduleVisible: {
        video: isPageModuleVisible(pageKey, 'video'),
        shootingNote: isPageModuleVisible(pageKey, 'shootingNote'),
        recommendVideos: isPageModuleVisible(pageKey, 'recommendVideos'),
        recommendContent: isPageModuleVisible(pageKey, 'recommendContent')
      }
    })
  },

  buildUrl(path, params = {}) {
    return buildUrlWithSource(path, params, this.data)
  },

  onPullDownRefresh() {
    this.loadData(true).finally(() => wx.stopPullDownRefresh())
  },

  onShow() {
    this._pageHidden = false
  },

  onHide() {
    this._pageHidden = true
    this.pauseCurrentVideo()
  },

  onUnload() {
    this._pageHidden = true
    this.pauseCurrentVideo()
  },

  async loadData(refresh = false) {
    if (!this.data.productId) {
      this.setData({ loading: false, error: '缺少视频摄像商品信息' })
      return
    }
    if (!refresh) this.setData({ loading: true, error: '' })

    try {
      const [packageRes, spotRes] = await Promise.all([
        packageApi.getPackageBaseData({ shopId: this.data.shopId }),
        spotApi.getSpots()
      ])
      const spots = (spotRes && spotRes.success && Array.isArray(spotRes.data))
        ? spotRes.data
        : []
      if (!packageRes || !packageRes.success) {
        this.setData({ error: '视频摄像内容暂不可用，请稍后重试' })
        return
      }
      const packageData = packageRes.data || {}
      const detail = buildVideoProductDetail({
        ...packageData,
        spots,
        videos: packageData.videos || [],
        videoProducts: packageData.videoProducts || []
      }, {
        productId: this.data.productId,
        spotId: this.data.spotId
      })

      if (detail) {
        this.applyDetail(detail)
      } else {
        this.setData({ error: '视频摄像商品不存在' })
      }
    } catch (err) {
      console.error('videoProductDetail loadData error', err)
      this.setData({ error: '视频摄像内容暂不可用，请稍后重试' })
    } finally {
      this.setData({ loading: false })
    }
  },


  applyDetail(detail) {
    this.pauseCurrentVideo()
    const samples = detail.samples || []
    const firstVideo = samples.findIndex(item => item.type === 'video' && item.url)
    this.setData({
      product: detail.product,
      spot: detail.spot,
      spots: (detail.spot && detail.spot._id) ? [{ _id: detail.spot._id, name: detail.spot.name }] : [],
      samples,
      currentSample: firstVideo < 0 ? 0 : firstVideo,
      isVideoPlaying: false,
      isVideoFullscreen: false,
      recommendations: detail.recommendations,
      videoFields: detail.videoFields,
      packageBenefits: detail.packageBenefits,
      displayTags: detail.displayTags || [],
      instructions: detail.instructions && detail.instructions.length ? detail.instructions : [],
      error: ''
    })
  },

  retry() {
    this.loadData()
  },

  onSampleChange(e) {
    const currentSample = Number(e.detail.current)
    if (!Number.isInteger(currentSample) || !this.data.samples[currentSample] || currentSample === this.data.currentSample) return
    this.pauseCurrentVideo()
    this.setData({ currentSample, isVideoPlaying: false, isVideoFullscreen: false })
  },

  pauseCurrentVideo() {
    if (this.data.isVideoPlaying) wx.createVideoContext('detail-video', this).pause()
    this.setData({ isVideoPlaying: false })
  },

  toggleVideoPlayback() {
    const sample = this.data.samples[this.data.currentSample]
    if (this._pageHidden || !sample || sample.type !== 'video' || !sample.url) return
    const context = wx.createVideoContext('detail-video', this)
    if (this.data.isVideoPlaying) context.pause()
    else context.play()
    this.setData({ isVideoPlaying: !this.data.isVideoPlaying })
  },

  onVideoPlay(e) {
    if (Number(e.currentTarget.dataset.index) !== this.data.currentSample) return
    if (this._pageHidden) {
      wx.createVideoContext('detail-video', this).pause()
      return
    }
    this.setData({ isVideoPlaying: true })
  },

  onVideoPause(e) {
    if (Number(e.currentTarget.dataset.index) !== this.data.currentSample) return
    this.setData({ isVideoPlaying: false })
  },

  onVideoError(e) {
    if (Number(e.currentTarget.dataset.index) !== this.data.currentSample) return
    this.setData({ isVideoPlaying: false })
    wx.showToast({ title: '视频暂时无法播放，请稍后重试', icon: 'none' })
  },

  onVideoFullscreenChange(e) {
    if (Number(e.currentTarget.dataset.index) !== this.data.currentSample) return
    this.setData({ isVideoFullscreen: !!e.detail.fullScreen })
  },

  previewVideo(e) {
    const index = Number(e.currentTarget.dataset.index || 0)
    const sources = (this.data.samples || [])
      .filter(item => item.url || item.cover)
      .map(item => ({
        url: item.url || item.cover,
        type: item.type === 'video' && item.url ? 'video' : 'image',
        poster: item.cover
      }))
    if (!sources.length) return
    if (wx.previewMedia) {
      this.pauseCurrentVideo()
      wx.previewMedia({ current: index, sources })
      return
    }
    const selected = sources[index]
    if (selected && selected.type === 'video') {
      wx.createVideoContext('detail-video', this).requestFullScreen({})
      return
    }
    this.pauseCurrentVideo()
    wx.previewImage({ current: selected && selected.url, urls: sources.filter(item => item.type === 'image').map(item => item.url) })
  },

  goBookingInfo() {
    const product = this.data.product
    if (!product || !product._id) {
      wx.showToast({ title: '视频摄像商品不存在', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: this.buildUrl('/pages/bookingInfo/bookingInfo', {
        packageId: product._id,
        seriesId: product.seriesId || '',
        spotId: product.spotId || this.data.spotId || ''
      })
    })
  },

  goSpot(e) {
    const spotId = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id)
      || (this.data.spot && this.data.spot._id)
      || (this.data.product && this.data.product.spotId)
    if (!spotId) return
    wx.navigateTo({ url: this.buildUrl('/pages/spotSheet/spotSheet', { id: spotId }) })
  },

  goRecommend(e) {
    const detail = e.detail || {}
    const id = detail.id || (e.currentTarget.dataset && e.currentTarget.dataset.id) || ''
    if (!id) return
    wx.navigateTo({
      url: this.buildUrl('/pages/videoProductDetail/videoProductDetail', {
        productId: id,
        spotId: detail.spot || (e.currentTarget.dataset && e.currentTarget.dataset.spot) || ''
      })
    })
  },

  contactService() {
    openCustomerService()
  },

})
