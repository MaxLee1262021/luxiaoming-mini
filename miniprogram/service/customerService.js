function openCustomerService() {
  const app = getApp()
  const config = (app && app.globalData) || {}
  const corpId = String(config.corpId || '').trim()
  const url = String(config.customerServiceUrl || '').trim()

  if (typeof wx.openCustomerServiceChat !== 'function') {
    wx.showToast({ title: '当前微信版本不支持客服，请升级后重试', icon: 'none' })
    return
  }
  if (!corpId || !url) {
    wx.showToast({ title: '客服暂未配置，请稍后再试', icon: 'none' })
    return
  }

  const onFailure = (error) => {
    console.error('open customer service failed', error)
    wx.showToast({ title: '客服暂时无法打开，请稍后重试', icon: 'none' })
  }
  try {
    wx.openCustomerServiceChat({
      corpId,
      extInfo: { url },
      fail: onFailure
    })
  } catch (error) {
    onFailure(error)
  }
}

module.exports = { openCustomerService }
