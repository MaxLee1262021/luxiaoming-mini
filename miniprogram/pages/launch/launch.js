// pages/launch/launch.js — 方案 B · 品牌沉浸
Page({
  data: {
    // 自定义导航栏页面需自行避让状态栏，默认给一个安全兜底值
    skipTop: 44
  },

  onLoad() {
    this.jumped = false
    this.initSkipPosition()
    // 冷启动展示 3 秒后进入首页（与进度条动画同步）
    this.jumpTimer = setTimeout(() => {
      this.goHome()
    }, 3000)
  },

  // 让"跳过"与右上角胶囊按钮同高，避免压到状态栏
  initSkipPosition() {
    try {
      const info = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()) || {}
      const statusBarHeight = info.statusBarHeight || 20
      let top = statusBarHeight + 4
      if (wx.getMenuButtonBoundingClientRect) {
        const rect = wx.getMenuButtonBoundingClientRect()
        if (rect && rect.top) {
          top = rect.top
        }
      }
      this.setData({ skipTop: top })
    } catch (err) {
      // 取不到就用默认值，不影响主流程
    }
  },

  // 点击"跳过"立即进入首页
  skip() {
    this.goHome()
  },

  // 统一出口，防止定时器与手动跳过重复触发
  goHome() {
    if (this.jumped) return
    this.jumped = true
    this.clearJumpTimer()
    wx.switchTab({
      url: '/pages/index/index',
      fail: () => {
        this.jumped = false
      }
    })
  },

  clearJumpTimer() {
    if (this.jumpTimer) {
      clearTimeout(this.jumpTimer)
      this.jumpTimer = null
    }
  },

  onUnload() {
    this.clearJumpTimer()
  }
})
