function backOrSwitchTab(fallbackUrl = '/pages/index/index') {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  if (pages.length > 1) {
    wx.navigateBack()
    return
  }
  wx.switchTab({ url: fallbackUrl })
}

module.exports = {
  backOrSwitchTab
}
