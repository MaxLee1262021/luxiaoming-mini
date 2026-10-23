const app = getApp()
const demoData = require('../../utils/demoData')
const seriesApi = require('../../api/series')
const { buildUrlWithSource } = require('../../utils/query')
const { buildPhotoPackageDetail } = require('../../service/packageDetail')
const { getPageModuleConfig, isPageModuleVisible } = require('../../service/siteConfig')
const { isExplicitDemoMode } = require('../../config/env')
const { openCustomerService } = require('../../service/customerService')

Page({
  data: {
    loading: true,
    error: '',
    seriesId: '',
    packageId: '',
    spotId: '',
    shopId: '',
    scene: '',
    backToHome: false,
    seriesInfo: {},
    selectedPackage: null,
    packageDescription: '',
    serviceTags: [],
    packageBenefits: [],
    includedItems: [],
    spots: [],
    packageStats: {
      itemCount: 0,
      typeCount: 0,
      saveAmount: 0
    },
    instructions: demoData.DEFAULT_SHOOTING_INSTRUCTIONS,
    pageConfig: {},
    moduleVisible: {
      bookingRule: true
    },
    // 拍摄说明：优先使用数据（将来由后台/套餐字段覆盖），兜底用统一默认值
    instructions: demoData.DEFAULT_SHOOTING_INSTRUCTIONS
  },

  onLoad(options = {}) {
    const source = app.captureSource ? app.captureSource(options) : {}
    this.setData({
      seriesId: options.id || options.seriesId || '',
      packageId: options.packageId || '',
      spotId: options.spotId || '',
      shopId: options.shopId || source.shopId || '',
      scene: options.scene || source.scene || '',
      backToHome: options.from === 'home'
    })
    this.applyPageConfig()
    this.loadData()
  },

  applyPageConfig() {
    const pageKey = 'packageDetail'
    this.setData({
      pageConfig: getPageModuleConfig(pageKey),
      moduleVisible: {
        bookingRule: isPageModuleVisible(pageKey, 'bookingRule')
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
    if (!this.data.seriesId && !this.data.packageId) {
      this.setData({ loading: false, error: '缺少旅拍套餐信息' })
      return
    }
    if (!refresh) this.setData({ loading: true, error: '' })

    try {
      const res = await seriesApi.getSeriesDetail({
        seriesId: this.data.seriesId,
        packageId: this.data.packageId,
        spotId: this.data.spotId
      })
      if (!res || !res.success) {
        if (isExplicitDemoMode()) this.applyDemoDetail()
        else this.setData({ error: (res && (res.error || res.message)) || '套餐内容暂不可用，请稍后重试' })
      } else {
        this.applyDetailData(res.data || {})
      }
    } catch (err) {
      console.error('photoPackageDetail loadData error', err)
      if (isExplicitDemoMode()) this.applyDemoDetail()
      else this.setData({ error: '套餐内容暂不可用，请稍后重试' })
    } finally {
      this.setData({ loading: false })
    }
  },

  applyDetailData(data = {}) {
    const detail = buildPhotoPackageDetail(data, {
      seriesId: this.data.seriesId,
      packageId: this.data.packageId,
      spotId: this.data.spotId
    })
    if (!detail.selectedPackage) {
      this.setData({ error: '旅拍套餐不存在' })
      return
    }
    const includedItems = detail.includedItems || []
    const selectedPackage = detail.selectedPackage || {}
    const packageDescription = selectedPackage.description || selectedPackage.intro || ''
    const serviceTags = Array.isArray(selectedPackage.serviceTags)
      ? selectedPackage.serviceTags.filter(Boolean)
      : (Array.isArray(selectedPackage.tags) ? selectedPackage.tags.filter(Boolean) : [])
    const packageStats = {
      itemCount: includedItems.length,
      typeCount: new Set(includedItems.map(i => i.typeClass)).size,
      saveAmount: Math.max(0, (Number(selectedPackage.originalPrice) || 0) - (Number(selectedPackage.price) || 0))
    }
    const noteText = selectedPackage.shootingNotes || selectedPackage.shootingDescription || selectedPackage.shootingNote || ''
    const instructions = noteText
      ? String(noteText).split(/[；;\n]/).map(text => text.trim()).filter(Boolean)
      : demoData.DEFAULT_SHOOTING_INSTRUCTIONS
    this.setData({
      seriesId: detail.seriesId,
      spotId: detail.spotId,
      seriesInfo: detail.seriesInfo,
      selectedPackage,
      packageDescription,
      serviceTags,
      packageBenefits: detail.packageBenefits,
      includedItems,
      spots: detail.spots || [],
      packageStats,
      instructions,
      error: ''
    })
  },

  applyDemoDetail() {
    const data = demoData.getSeriesDetail({
      seriesId: this.data.seriesId,
      packageId: this.data.packageId,
      spotId: this.data.spotId
    })
    this.applyDetailData(data)
  },

  retry() {
    this.loadData()
  },

  goSpot(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({
      url: this.buildUrl('/pages/spotSheet/spotSheet', {
        id,
        scene: this.data.scene,
        shopId: this.data.shopId
      })
    })
  },

  goIncludedItem(e) {
    const index = Number(e.currentTarget.dataset.index || 0)
    const item = this.data.includedItems[index]
    if (!item) return
    const t = item.target || {}
    // 优先使用 target.page 指定的跳转目标；若 target 为空则按 type 兜底路由
    const page = t.page || (item.type === 'album' ? 'photoCollection'
      : item.type === 'video' ? 'videoProductDetail'
      : item.type === 'peripheral' ? 'peripheral'
      : '')
    if (page === 'photoCollection') {
      wx.navigateTo({
        url: this.buildUrl('/pages/photoCollection/photoCollection', {
          albumId: t.albumId || item.albumId || '',
          seriesId: t.seriesId || '',
          spotId: t.spotId || this.data.spotId
        })
      })
    } else if (page === 'videoProductDetail') {
      wx.navigateTo({
        url: this.buildUrl('/pages/videoProductDetail/videoProductDetail', {
          productId: t.productId || item.productId || '',
          seriesId: t.seriesId || '',
          spotId: t.spotId || this.data.spotId
        })
      })
    } else if (page === 'peripheral') {
      wx.navigateTo({
        url: this.buildUrl('/pages/peripheralDetail/peripheralDetail', {
          id: t.id || t.peripheralId || t.productId || item.peripheralId || item.productId || ''
        })
      })
    } else {
      wx.showToast({ title: '暂不支持查看', icon: 'none' })
    }
  },

  goBookingInfo() {
    if (!this.data.selectedPackage || !this.data.selectedPackage._id) {
      wx.showToast({ title: '旅拍套餐不存在', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: this.buildUrl('/pages/bookingInfo/bookingInfo', {
        packageId: this.data.selectedPackage._id,
        seriesId: this.data.seriesId,
        spotId: this.data.spotId
      })
    })
  },

  contactService() {
    openCustomerService()
  },

})
