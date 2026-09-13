const app = getApp()
const demoData = require('../../utils/demoData')
const packageApi = require('../../api/package')
const spotApi = require('../../api/spot')
const { buildUrlWithSource } = require('../../utils/query')
const { buildVideoProductDetail } = require('../../service/videoProductDetail')
const { getPageModuleConfig, isPageModuleVisible } = require('../../service/siteConfig')
const favorite = require('../../utils/favorite')
const { isExplicitDemoMode } = require('../../config/env')

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
    recommendations: [],
    videoFields: [],
    packageBenefits: [],
    // 拍摄说明：优先使用数据（将来由后台/商品字段覆盖），兜底用统一默认值
    instructions: demoData.DEFAULT_SHOOTING_INSTRUCTIONS,
    collected: false,
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
        : (isExplicitDemoMode() ? demoData.spots : [])
      if (!packageRes || !packageRes.success) {
        if (isExplicitDemoMode()) this.applyDemoDetail()
        else this.setData({ error: '视频摄像内容暂不可用，请稍后重试' })
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
      if (isExplicitDemoMode()) this.applyDemoDetail()
      else this.setData({ error: '视频摄像内容暂不可用，请稍后重试' })
    } finally {
      this.setData({ loading: false })
    }
  },

  applyDemoDetail() {
    const data = demoData.getBookingData()
    const detail = buildVideoProductDetail({
      ...data,
      spots: demoData.spots,
      videos: demoData.videos,
      videoProducts: demoData.videoProducts
    }, {
      productId: this.data.productId,
      spotId: this.data.spotId
    })
    if (!detail) {
      this.setData({ error: '视频摄像商品不存在' })
      return
    }
    this.applyDetail(detail)
  },

  applyDetail(detail) {
    this.setData({
      product: detail.product,
      spot: detail.spot,
      spots: (detail.spot && detail.spot._id) ? [{ _id: detail.spot._id, name: detail.spot.name }] : [],
      samples: detail.samples,
      recommendations: detail.recommendations,
      videoFields: detail.videoFields,
      packageBenefits: detail.packageBenefits,
      error: '',
      collected: detail.product && detail.product._id ? favorite.has(detail.product._id) : false
    })
  },

  retry() {
    this.loadData()
  },

  previewVideo(e) {
    const index = Number(e.currentTarget.dataset.index || 0)
    const sources = (this.data.samples || [])
      .filter(item => item.url || item.cover)
      .map(item => ({
        url: item.url || item.cover,
        type: item.url && item.url !== item.cover ? 'video' : 'image',
        poster: item.cover
      }))
    if (!sources.length) return
    if (wx.previewMedia) {
      wx.previewMedia({ current: index, sources })
      return
    }
    wx.previewImage({
      current: sources[index] && sources[index].poster,
      urls: sources.map(item => item.poster || item.url).filter(Boolean)
    })
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
    wx.openCustomerServiceChat({
      extInfo: {},
      corpId: (getApp().globalData && getApp().globalData.corpId) || '',
      fail() {
        wx.showToast({ title: '请联系客服咨询', icon: 'none' })
      }
    })
  },

  toggleCollect() {
    const product = this.data.product || {}
    const id = product._id
    if (!id) {
      wx.showToast({ title: '该内容暂不支持收藏', icon: 'none' })
      return
    }
    const next = favorite.toggle({
      type: 'video_single',
      typeLabel: '视频摄像',
      id,
      title: product.name || '视频摄像',
      cover: product.cover || '',
      price: product.price || 0,
      spot: product.spotName || '',
      spotId: product.spotId || this.data.spotId || '',
      url: '/pages/videoProductDetail/videoProductDetail?productId=' + id + '&spotId=' + (product.spotId || this.data.spotId || '')
    })
    this.setData({ collected: next })
    wx.showToast({ title: next ? '已收藏' : '已取消收藏', icon: 'none' })
  },

})
