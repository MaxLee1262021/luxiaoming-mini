const app = getApp()
const searchApi = require('../../api/search')
const { buildUrlWithSource } = require('../../utils/query')
const { isVideoSingle } = require('../../service/videoProductDetail')

function decodeSearchKeyword(value = '') {
  let keyword = String(value || '')
  for (let index = 0; index < 2; index += 1) {
    if (!/%[0-9a-fA-F]{2}/.test(keyword)) break
    try {
      keyword = decodeURIComponent(keyword)
    } catch (err) {
      break
    }
  }
  return keyword.trim()
}

Page({
  data: {
    keyword: '',
    suggestedKeyword: '',
    searchPlaceholder: '搜索打卡点、旅拍套餐、照片留影、视频摄像',
    searchFocused: false,
    selStart: -1,
    selEnd: -1,
    shopId: '',
    scene: '',
    hotKeywords: [],
    routes: [],
    spots: [],
    packages: [],
    videos: [],
    guides: [],
    hasSearched: false,
    searching: false
  },

  async onLoad(options = {}) {
    const source = app.globalData && app.globalData.source ? app.globalData.source : {}
    const suggestedKeyword = decodeSearchKeyword(options.keyword || '')
    this.setData({
      keyword: suggestedKeyword,
      suggestedKeyword,
      searchPlaceholder: suggestedKeyword ? `搜索${suggestedKeyword}` : '搜索打卡点、旅拍套餐、照片留影、视频摄像',
      shopId: options.shopId || source.shopId || '',
      scene: options.scene || source.scene || ''
    })
    await this.loadRecommend()
    if (suggestedKeyword) {
      this.submitSearch()
    }
  },

  buildUrl(path, params = {}) {
    return buildUrlWithSource(path, params, this.data)
  },

  async loadRecommend() {
    try {
      const res = await searchApi.getSearchHome()
      const data = res.data || {}
      this.setData({
        hotKeywords: data.hotKeywords || [],
        routes: data.routes || [],
        spots: data.spots || [],
        packages: data.packages || [],
        videos: data.videos || [],
        guides: data.guides || []
      })
    } catch (err) {
      console.error('load search recommend error', err)
    }
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value, selStart: -1, selEnd: -1 })
  },

  onSearchFocus() {
    const len = (this.data.keyword || '').length
    this.setData({
      searchFocused: true,
      selStart: 0,
      selEnd: len > 0 ? len : -1
    })
  },

  onSearchBlur() {
    this.setData({ searchFocused: false, selStart: -1, selEnd: -1 })
  },

  clearKeyword() {
    this.setData({ keyword: '', selStart: -1, selEnd: -1 })
  },

  async submitSearch() {
    const keyword = (this.data.keyword || this.data.suggestedKeyword || '').trim()
    if (!keyword) {
      wx.showToast({ title: '请输入搜索内容', icon: 'none' })
      return
    }

    this.setData({ searching: true })
    try {
      const res = await searchApi.search({ keyword })
      const data = res.data || {}
      this.setData({
        hasSearched: true,
        spots: data.spots || [],
        packages: data.packages || [],
        videos: data.videos || [],
        guides: data.guides || []
      })
    } catch (err) {
      console.error('search error', err)
      wx.showToast({ title: '搜索失败，请稍后再试', icon: 'none' })
    } finally {
      this.setData({ searching: false })
    }
  },

  tapKeyword(e) {
    const keyword = e.currentTarget.dataset.keyword
    this.setData({ keyword })
    this.submitSearch()
  },

  goSpot(e) {
    wx.navigateTo({ url: this.buildUrl('/pages/spotSheet/spotSheet', { id: e.currentTarget.dataset.id }) })
  },

  goPackage(e) {
    const id = e.detail.id
    const item = (this.data.packages || []).find(pkg => pkg._id === id) || {}
    wx.navigateTo({
      url: this.buildUrl('/pages/photoPackageDetail/photoPackageDetail', {
        id: item.seriesId,
        packageId: item._id,
        spotId: item.spotId
      })
    })
  },

  goVideo(e) {
    const id = e.detail.id
    const item = (this.data.videos || []).find(video => video._id === id) || {}
    // 视频商品（单品/套餐）统一跳视频摄像详情页
    const path = isVideoSingle(item)
      ? '/pages/videoProductDetail/videoProductDetail'
      : '/pages/videoProductDetail/videoProductDetail'
    wx.navigateTo({
      url: this.buildUrl(path, {
        productId: id,
        packageId: id,
        id: item.seriesId,
        seriesId: item.seriesId,
        spotId: item.spotId
      })
    })
  },

  goCustomBooking(e) {
    const keyword = ((e && e.detail && e.detail.keyword) || this.data.keyword || this.data.suggestedKeyword || '').trim()
    wx.navigateTo({
      url: this.buildUrl('/pages/bookingInfo/bookingInfo', { requestedSpot: keyword })
    })
  },

  goGuide(e) {
    const id = (e && e.detail && e.detail.id) || (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id)
    if (!id) return
    wx.navigateTo({ url: this.buildUrl('/pages/guideDetail/guideDetail', { id }) })
  },

})
