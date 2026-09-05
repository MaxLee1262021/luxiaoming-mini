const favorite = require('../../utils/favorite')

Page({
  data: {
    list: [],
    loading: true
  },

  onLoad() {
    this.loadList()
  },

  onShow() {
    // 从详情页收藏/取消后回到此页需实时刷新
    this.loadList()
  },

  loadList() {
    const list = (favorite.list() || []).map(item => ({
      ...item,
      priceText: item.price != null && item.price !== '' ? '¥' + item.price : ''
    }))
    this.setData({ list, loading: false })
  },

  goDetail(e) {
    const url = e.currentTarget.dataset.url || ''
    if (!url) {
      wx.showToast({ title: '该收藏暂无法打开', icon: 'none' })
      return
    }
    wx.navigateTo({ url: url })
  },

  removeFav(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    favorite.remove(id)
    this.loadList()
    wx.showToast({ title: '已取消收藏', icon: 'none' })
  },

  goDiscover() {
    wx.switchTab({ url: '/pages/explore/explore' })
  }
})
