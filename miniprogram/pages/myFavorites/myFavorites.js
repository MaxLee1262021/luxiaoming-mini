const favorites = require('../../service/favorites')
const { buildUrlWithSource } = require('../../utils/query')

Page({
  data: {
    shopId: '',
    scene: '',
    items: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false,
    error: '',
    removingKey: ''
  },

  onLoad(options = {}) {
    const app = getApp()
    const source = app.captureSource ? app.captureSource(options) : {}
    this.setData({ shopId: options.shopId || source.shopId || '', scene: options.scene || source.scene || '' })
  },

  onShow() {
    this.loadFavorites(true)
  },

  async onPullDownRefresh() {
    try { await this.loadFavorites(true) } finally { wx.stopPullDownRefresh() }
  },

  onReachBottom() {
    this.loadFavorites(false)
  },

  async loadFavorites(reset = true) {
    if (!reset && (this.data.loading || !this.data.hasMore)) return
    const version = this._loadVersion = (this._loadVersion || 0) + 1
    const page = reset ? 1 : this.data.page
    this.setData({ loading: true, error: '' })
    try {
      const result = await favorites.getMyFavorites(page, this.data.pageSize)
      if (version !== this._loadVersion) return
      const previous = reset ? [] : this.data.items
      const items = [...previous, ...result.items].filter((item, index, list) =>
        list.findIndex(other => other.key === item.key) === index)
      this.setData({ items, hasMore: result.hasMore, page: page + 1 })
    } catch (err) {
      if (version === this._loadVersion) this.setData({ error: err.message || '收藏加载失败，请重试' })
    } finally {
      if (version === this._loadVersion) this.setData({ loading: false })
    }
  },

  retry() {
    return this.loadFavorites(true)
  },

  openFavorite(e) {
    const item = this.data.items.find(row => row.key === e.currentTarget.dataset.key)
    const url = favorites.getFavoriteUrl(item, this.data)
    if (!url) return
    wx.navigateTo({ url })
  },

  async removeFavorite(e) {
    if (this.data.removingKey) return
    const key = e.currentTarget.dataset.key
    const item = this.data.items.find(row => row.key === key)
    if (!item) return
    this.setData({ removingKey: key })
    try {
      await favorites.setFavorite(item.type, item.itemId, false)
      this.setData({ items: this.data.items.filter(row => row.key !== key) })
      wx.showToast({ title: '已取消收藏', icon: 'none' })
      // Refresh the first page because removing a row shifts subsequent offsets.
      await this.loadFavorites(true)
    } catch (err) {
      wx.showToast({ title: err.message || '取消收藏失败，请重试', icon: 'none' })
    } finally {
      this.setData({ removingKey: '' })
    }
  },

  goExplore() {
    wx.switchTab({ url: '/pages/explore/explore' })
  },

  buildUrl(path, params = {}) {
    return buildUrlWithSource(path, params, this.data)
  }
})
