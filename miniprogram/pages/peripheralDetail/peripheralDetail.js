const app = getApp()
const demoData = require('../../utils/demoData')
const peripheralApi = require('../../api/peripheral')
const { backOrSwitchTab } = require('../../utils/navigation')
const favorite = require('../../utils/favorite')
Page({
  data: {
    id: '',
    shopId: '',
    scene: '',
    loading: true,
    error: '',
    item: {},
    collected: false
  },

  onLoad(options) {
    const source = app.captureSource ? app.captureSource(options) : {}
    this.setData({
      id: options.id || '',
      shopId: options.shopId || source.shopId || '',
      scene: options.scene || source.scene || ''
    })
    this.loadDetail()
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
        item = (res.data || []).find(data => data._id === this.data.id) || null
      } else {
        item = demoData.peripherals.find(data => data._id === this.data.id) || demoData.peripherals[0] || {}
      }
      if (!item || !item._id) {
        this.setData({ error: '周边不存在' })
        return
      }
      this.applyDetailItem(item)
    } catch (err) {
      console.error('peripheral detail error', err)
      this.applyDetailItem(demoData.peripherals.find(data => data._id === this.data.id) || demoData.peripherals[0])
    } finally {
      this.setData({ loading: false })
    }
  },

  applyDetailItem(item = {}) {
    this.setData({
      item: {
        ...item,
        cover: item.cover || item.coverUrl || item.image || '/images/placeholder.png',
        images: item.images && item.images.length ? item.images : [item.cover || item.coverUrl || item.image || '/images/placeholder.png']
      },
      error: '',
      collected: item && item._id ? favorite.has(item._id) : false
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
    const item = this.data.item || {}
    const id = item._id
    if (!id) {
      wx.showToast({ title: '该内容暂不支持收藏', icon: 'none' })
      return
    }
    const next = favorite.toggle({
      type: 'peripheral',
      typeLabel: '影像周边',
      id,
      title: item.name || '影像周边',
      cover: item.cover || '',
      price: item.price || 0,
      spot: item.spotName || '',
      spotId: item.spotId || '',
      url: '/pages/peripheralDetail/peripheralDetail?id=' + id
    })
    this.setData({ collected: next })
    wx.showToast({ title: next ? '已收藏' : '已取消收藏', icon: 'none' })
  },

  goBack() {
    backOrSwitchTab('/pages/index/index')
  }
})
