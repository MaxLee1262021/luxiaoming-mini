const app = getApp()
const guideApi = require('../../api/guide')
const { buildUrlWithSource } = require('../../utils/query')
const { guideContentBlocks, isPublicGuide } = require('../../utils/guideContent')
const { isPublicProduct } = require('../../utils/product')
const guideAttachments = require('../../service/guideAttachments')

Page({
  data: {
    loading: true,
    error: '',
    guide: {},
    relatedSpot: {},
    relatedSpots: [],
    contentBlocks: [],
    attachmentBusyKey: '',
    attachmentStatus: '',
    hasRichContent: false,
    mediaUrls: [],
    mediaItems: [],
    bookingProduct: null,
    shopId: '',
    scene: ''
  },

  onLoad(options = {}) {
    const id = options.id || ''
    const source = app.captureSource ? app.captureSource(options) : {}
    this.setData({ id, shopId: options.shopId || source.shopId || '', scene: options.scene || source.scene || '' })
    this.loadDetail()
  },

  buildUrl(path, params = {}) {
    return buildUrlWithSource(path, params, this.data)
  },

  async loadDetail() {
    try {
      const guide = await guideApi.getGuideDetail({ id: this.data.id })
      if (!guide || !guide._id || !isPublicGuide(guide)) {
        this.setData({ loading: false, error: '旅拍灵感不存在或已下架', bookingProduct: null })
        return
      }
      const relatedSpot = { ...this.resolveSpot(guide.spotId, guide.spotName), cover: guide.spotCover || '' }
      const content = Array.isArray(guide.content) ? guide.content : String(guide.content || guide.description || '').split(/\n+/).map(item => item.trim()).filter(Boolean)
      const mediaUrls = Array.isArray(guide.mediaUrls) ? guide.mediaUrls.filter(Boolean) : []
      const mediaItems = guide.mediaItems || []
      const relatedSpots = Array.isArray(guide.spots) && guide.spots.length ? guide.spots : (relatedSpot.id ? [relatedSpot] : [])
      const contentBlocks = guideContentBlocks(guide.contentHtml || '')
      const hasRichContent = !!String(guide.contentHtml || '').trim()
      const targetSpotId = guide.targetProductSpotId || (guide.bookingProduct && guide.bookingProduct.spotId) || guide.spotId || ''
      const bookingProduct = guide.bookingProduct && isPublicProduct(guide.bookingProduct) && (!(guide.spotIds || []).length || guide.spotIds.includes(String(targetSpotId)))
        ? guide.bookingProduct : null
      this.setData({ guide: { ...guide, content }, relatedSpot, relatedSpots, contentBlocks, hasRichContent, mediaUrls, mediaItems, bookingProduct, loading: false, error: '' })
    } catch (err) {
      console.error('guide detail error', err)
      this.setData({ loading: false, error: '加载失败', bookingProduct: null })
    }
  },

  // 解析关联打卡点（用于"看打卡点"跳转）
  resolveSpot(spotId = '', spotName = '') {
    return { id: spotId, name: spotName || '', cover: '' }
  },

  goSpot(event) {
    const id = event && event.currentTarget && event.currentTarget.dataset.id
    const spot = id ? this.data.relatedSpots.find(item => String(item.id) === String(id)) : this.data.relatedSpot
    if (!spot || !spot.id) return
    wx.navigateTo({ url: this.buildUrl('/pages/spotSheet/spotSheet', { id: spot.id }) })
  },

  previewImage(event) {
    const urls = this.data.hasRichContent
      ? [...new Set(this.data.contentBlocks.filter(item => item.type === 'image').map(item => item.url))]
      : this.data.mediaItems.filter(item => item.type === 'image').map(item => item.url)
    if (urls.length) wx.previewImage({ current: event.currentTarget.dataset.url || urls[0], urls })
  },

  async openGuideAttachment(event) {
    if (this._attachmentBusy) {
      wx.showToast({ title: '附件处理中，请稍候', icon: 'none' })
      return
    }
    const key = event && event.currentTarget && event.currentTarget.dataset.key
    const attachment = this.data.contentBlocks.find(block => block.key === key && block.type === 'attachment')
    if (!attachment) {
      wx.showToast({ title: '附件不可用，请刷新后重试', icon: 'none' })
      return
    }
    this._attachmentBusy = true
    this.setData({ attachmentBusyKey: key, attachmentStatus: '正在下载 0%' })
    try {
      await guideAttachments.openAttachment(attachment, (phase, progress) => {
        this.setData({ attachmentStatus: phase === 'opening' ? '正在打开' : (phase === 'downloaded' ? '下载完成' : `正在下载 ${progress}%`) })
      })
    } catch (error) {
      if (error.downloadUrl) {
        try {
          const answer = await new Promise((resolve, reject) => wx.showModal({
            title: '附件打开失败', content: '可以重试打开，或复制下载链接在浏览器中打开并保存。',
            confirmText: '复制链接', cancelText: '关闭', success: resolve, fail: reject
          }))
          if (answer.confirm) await guideAttachments.copyDownloadLink(error.downloadUrl)
        } catch (_) { wx.showToast({ title: '下载链接复制失败，请重试', icon: 'none' }) }
      } else wx.showToast({ title: error.message || '附件下载失败，请重试', icon: 'none' })
    } finally {
      this._attachmentBusy = false
      this.setData({ attachmentBusyKey: '', attachmentStatus: '' })
    }
  },

  goBookingProduct() {
    const product = this.data.bookingProduct
    if (!product || !product.id) return
    const spotId = this.data.guide.targetProductSpotId || product.spotId || this.data.guide.spotId || ''
    let path = ''
    let params = { spotId }
    if (product.type === 'album') {
      path = '/pages/photoCollection/photoCollection'
      params = { ...params, albumId: product.id, seriesId: product.seriesId || '' }
    } else if (product.type === 'video') {
      path = '/pages/videoProductDetail/videoProductDetail'
      params = { ...params, productId: product.id }
    } else if (product.type === 'package') {
      path = '/pages/photoPackageDetail/photoPackageDetail'
      params = { ...params, packageId: product.id, seriesId: product.seriesId || '' }
    }
    if (path) wx.navigateTo({ url: this.buildUrl(path, params) })
  },

  retry() {
    this.setData({ loading: true, error: '' })
    this.loadDetail()
  }
})
