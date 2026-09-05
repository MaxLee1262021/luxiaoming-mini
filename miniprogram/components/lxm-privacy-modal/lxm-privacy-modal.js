Component({
  data: {
    visible: false
  },
  lifetimes: {
    attached() {
      const app = getApp()
      if (app && typeof app.registerPrivacyModal === 'function') {
        app.registerPrivacyModal(this)
      }
      // 若 App 在页面挂载前就已经有待处理的隐私请求，立即显示
      if (app && app.globalData && app.globalData._privacyNeed) {
        this.show()
      }
    },
    detached() {
      const app = getApp()
      if (app && typeof app.unregisterPrivacyModal === 'function') {
        app.unregisterPrivacyModal(this)
      }
    }
  },
  methods: {
    noop() {},
    show() {
      this.setData({ visible: true })
    },
    hide() {
      this.setData({ visible: false })
    },
    onViewPolicy() {
      wx.navigateTo({ url: '/pages/privacy/privacy' })
    },
    _resolve(allow) {
      const app = getApp()
      const resolve = app.globalData._privacyResolve
      const event = app.globalData._privacyEvent
      app.globalData._privacyNeed = false
      app.globalData._privacyResolve = null
      app.globalData._privacyEvent = null
      this.hide()
      if (typeof resolve === 'function') {
        resolve({ event, allow })
      }
    },
    onAgree() {
      this._resolve(true)
    },
    onDecline() {
      this._resolve(false)
    }
  }
})
