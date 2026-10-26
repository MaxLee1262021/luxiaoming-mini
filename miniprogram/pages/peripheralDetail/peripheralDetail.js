const app = getApp()
const demoData = require('../../utils/demoData')
const peripheralApi = require('../../api/peripheral')
const { backOrSwitchTab } = require('../../utils/navigation')
const { openCustomerService } = require('../../service/customerService')
const { STORE_APP_ID } = require('../../config/store')
const { hasStoreProductId } = require('../../utils/product')
Page({
  data: {
    id: '',
    shopId: '',
    scene: '',
    loading: true,
    error: '',
    item: {},
    storeAppId: STORE_APP_ID,
    storeProductSupported: false,
    storeProductUnavailableText: '请在手机微信中打开小店'
  },

  onLoad(options) {
    const source = app.captureSource ? app.captureSource(options) : {}
    this.setData({
      id: options.id || '',
      shopId: options.shopId || source.shopId || '',
      scene: options.scene || source.scene || ''
    })
    this.initStoreProduct()
    this.loadDetail()
  },

  initStoreProduct() {
    try {
      const device = typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : wx.getSystemInfoSync()
      const platform = String(device.platform || '').toLowerCase()
      const isDesktop = platform === 'windows' || platform === 'mac'
      const supported = typeof wx.canIUse === 'function' && wx.canIUse('store-product')
      this.setData({
        storeProductSupported: !!STORE_APP_ID && supported && !isDesktop,
        storeProductUnavailableText: isDesktop ? '请在手机微信中打开小店' : '请更新微信后打开小店'
      })
    } catch (err) {
      console.warn('init store product failed', err)
      this.setData({ storeProductSupported: false })
    }
  },

  async loadDetail() {
    if (!this.data.id) {
      this.setData({ loading: false, error: '缺少周边ID' })
      return
    }

    try {
      const res = await peripheralApi.getPeripherals()
      let item = null
      if (res && res.success) {
        item = (res.data || []).find(data => data._id === this.data.id && hasStoreProductId(data)) || null
      } else {
        item = demoData.peripherals.find(data => data._id === this.data.id && hasStoreProductId(data)) || {}
      }
      if (!item || !item._id) {
        this.setData({ error: '周边不存在' })
        return
      }
      this.applyDetailItem(item)
    } catch (err) {
      console.error('peripheral detail error', err)
      const fallback = demoData.peripherals.find(data => data._id === this.data.id && hasStoreProductId(data)) || null
      if (fallback) this.applyDetailItem(fallback)
      else this.setData({ error: '周边不存在' })
    } finally {
      this.setData({ loading: false })
    }
  },

  applyDetailItem(item = {}) {
    const imageList = item.images || item.gallery || item.photos || item.sampleUrls || []
    const images = Array.from(new Set([
      ...(Array.isArray(imageList) ? imageList : []),
      item.cover,
      item.coverUrl,
      item.image
    ].filter(Boolean)))
    this.setData({
      item: {
        ...item,
        storeProductId: String(item.storeProductId || '').trim(),
        storeProductPromotionLink: String(item.storeProductPromotionLink || '').trim(),
        cover: item.cover || item.coverUrl || item.image || '/images/placeholder.png',
        images: images.length ? images : ['/images/placeholder.png']
      },
      error: ''
    })
  },

  retry() {
    this.setData({ loading: true, error: '' })
    this.loadDetail()
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({ current: url, urls: this.data.item.images || [url] })
  },

  onStoreProductError(e) {
    console.warn('store product unavailable', e && e.detail ? e.detail : e)
    this.setData({
      storeProductSupported: false,
      storeProductUnavailableText: '微信小店商品暂时无法打开，请联系客服'
    })
  },

  contactService() {
    openCustomerService()
  },

  goBack() {
    backOrSwitchTab('/pages/index/index')
  }
})
