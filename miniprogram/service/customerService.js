const CUSTOMER_SERVICE_URL = 'https://work.weixin.qq.com/kfid/kfc39a3180cff84adda'
let pendingPreparation = null

function openCustomerService() {
  const app = getApp()
  const config = (app && app.globalData) || {}
  const corpId = String(config.corpId || '').trim()

  if (typeof wx.openCustomerServiceChat !== 'function') {
    wx.showToast({ title: '当前微信版本不支持客服，请升级后重试', icon: 'none' })
    return
  }
  if (!corpId) {
    if (!app || typeof app.loadCustomerServiceConfig !== 'function') {
      wx.showToast({ title: '客服暂未配置，请稍后再试', icon: 'none' })
      return false
    }
    if (!pendingPreparation) {
      pendingPreparation = Promise.resolve()
        .then(() => app.loadCustomerServiceConfig())
        .then(() => {
          const ready = String((app.globalData || {}).corpId || '').trim()
          wx.showToast({ title: ready ? '客服已就绪，请再次点击联系客服' : '客服暂未配置，请稍后再试', icon: 'none' })
          return false
        })
        .catch((error) => {
          console.error('prepare customer service failed', error)
          wx.showToast({ title: '客服暂时无法打开，请稍后重试', icon: 'none' })
          return false
        })
        .finally(() => { pendingPreparation = null })
    }
    // 异步加载后保留再次点击，由用户手势同步拉起微信客服。
    return pendingPreparation
  }

  const onFailure = (error) => {
    console.error('open customer service failed', error)
    wx.showToast({ title: '客服暂时无法打开，请稍后重试', icon: 'none' })
  }
  try {
    wx.openCustomerServiceChat({
      corpId,
      extInfo: { url: CUSTOMER_SERVICE_URL },
      fail: onFailure
    })
    return true
  } catch (error) {
    onFailure(error)
    return false
  }
}

module.exports = { CUSTOMER_SERVICE_URL, openCustomerService }
