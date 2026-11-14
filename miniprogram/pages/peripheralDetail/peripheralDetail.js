const app = getApp()
const { buildUrlWithSource } = require('../../utils/query')

// 兼容已分享、收藏或扫码进入的旧详情链接，统一进入周边展示页。
Page({
  onLoad(options = {}) {
    const source = app.captureSource ? app.captureSource(options) : {}
    wx.redirectTo({
      url: buildUrlWithSource('/pages/peripherals/peripherals', {
        id: options.id || '',
        shopId: options.shopId || '',
        scene: options.scene || ''
      }, source)
    })
  }
})
