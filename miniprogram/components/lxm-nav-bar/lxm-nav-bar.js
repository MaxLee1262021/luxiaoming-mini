Component({
  properties: {
    title: { type: String, value: '' },
    kicker: { type: String, value: '' },
    showBack: { type: Boolean, value: false },
    backToHome: { type: Boolean, value: false },
    theme: { type: String, value: 'dark' },
    placeholder: { type: Boolean, value: false }
  },

  data: {
    navTopPx: 26,
    capsuleSafeRightPx: 104
  },

  lifetimes: {
    attached() {
      this._initNavMetrics()
    }
  },

  methods: {
    _initNavMetrics() {
      try {
        const menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null
        const system = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
        const windowWidth = system.windowWidth || 375
        const statusBarHeight = system.statusBarHeight || 20
        const navTopPx = menu && menu.top ? menu.top : statusBarHeight + 8
        const capsuleSafeRightPx = menu && menu.left ? windowWidth - menu.left + 12 : 104
        this.setData({ navTopPx, capsuleSafeRightPx })
      } catch (err) {
        console.warn('[lxm-nav-bar] init nav metrics fallback', err)
      }
    },

    onBack() {
      if (this.data.backToHome) {
        wx.switchTab({ url: '/pages/index/index' })
        return
      }
      const pages = getCurrentPages()
      if (pages.length >= 2) {
        wx.navigateBack({ delta: 1 })
      } else {
        wx.switchTab({ url: '/pages/index/index' })
      }
    }
  }
})
