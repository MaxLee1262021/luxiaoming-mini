const app = getApp()

// 商家二维码落地页（非 tabBar）：扫码后小程序先到这里，解析商家与铺放位置，
// 把来源写入 storage，再跳到首页。解析失败也保证客人能进首页，不卡死。
Page({
  data: {
    loading: true,
    shopName: '',
    placementLabel: ''
  },

  async onLoad(options = {}) {
    try {
      const source = await app.resolveMerchantSource(options)
      if (source && source.shopName) {
        this.setData({ shopName: source.shopName, placementLabel: source.placementLabel || '' })
      }
    } catch (e) {
      console.error('scanEntry resolve failed', e)
    } finally {
      // 不论解析成功与否，都进入首页
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/index/index' })
      }, 400)
    }
  }
})
