const { decodeExternalUrl } = require('../../utils/externalLink')

Page({
  data: { url: '', failed: false, invalid: false },

  onLoad(options = {}) {
    const url = decodeExternalUrl(options.url || '')
    this.setData({ url, failed: false, invalid: !url })
  },

  onWebError() {
    this.setData({ failed: true })
  },

  retry() {
    if (!this.data.url) return
    this.setData({ failed: false })
  },

  goBack() {
    wx.navigateBack({
      delta: 1,
      fail: () => wx.switchTab({ url: '/pages/index/index' })
    })
  }
})
