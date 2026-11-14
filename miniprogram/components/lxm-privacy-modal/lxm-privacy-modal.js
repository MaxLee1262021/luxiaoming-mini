Component({
  data: {
    visible: false,
    policyOpening: false,
    policyError: ''
  },
  lifetimes: {
    detached() {
      const app = getApp()
      if (app && typeof app.unregisterPrivacyModal === 'function') {
        app.unregisterPrivacyModal(this)
      }
    }
  },
  pageLifetimes: {
    // 页面切换后，多个页面可能同时保留组件实例；只让当前显示页接管全局弹窗。
    show() {
      const app = getApp()
      if (app && typeof app.registerPrivacyModal === 'function') {
        app.registerPrivacyModal(this)
      }
      if (app && app.globalData && app.globalData._privacyNeed) {
        this.show()
      }
    },
    hide() {
      const app = getApp()
      if (app && typeof app.unregisterPrivacyModal === 'function') {
        app.unregisterPrivacyModal(this)
      }
      this.setData({ visible: false })
    }
  },
  methods: {
    noop() {},
    show() {
      this._privacyResolved = false
      this.setData({ visible: true })
    },
    hide() {
      this.setData({ visible: false })
    },
    onViewPolicy() {
      if (this.data.policyOpening) return
      this.setData({ policyOpening: true, policyError: '' })
      const finish = () => this.setData({ policyOpening: false })
      const openLocalPolicy = () => {
        try {
          wx.navigateTo({
            url: '/pages/privacy/privacy',
            success: () => {
              // 阅读协议不代表授权；返回当前页面后仍由用户选择同意或拒绝。
              this.hide()
              finish()
            },
            fail: () => {
              this.setData({ visible: true, policyError: '隐私指引暂时无法打开，请重试。' })
              finish()
            }
          })
        } catch (error) {
          this.setData({ visible: true, policyError: '隐私指引暂时无法打开，请重试。' })
          finish()
        }
      }
      if (typeof wx.openPrivacyContract !== 'function') {
        openLocalPolicy()
        return
      }
      try {
        wx.openPrivacyContract({ success: finish, fail: openLocalPolicy })
      } catch (error) {
        openLocalPolicy()
      }
    },
    _resolve(result) {
      if (this._privacyResolved) return
      this._privacyResolved = true
      const app = getApp()
      const globalData = (app && app.globalData) || {}
      const resolve = globalData._privacyResolve
      try {
        // 微信校验同意按钮时，该按钮仍须挂载；先回传授权结果，再关闭弹窗。
        if (typeof resolve === 'function') resolve(result)
      } catch (error) {
        this._privacyResolved = false
        this.setData({ policyError: '隐私授权未完成，请重新操作。' })
        return
      }
      if (globalData._privacyResolve !== resolve) {
        this._privacyResolved = false
        return
      }
      globalData._privacyNeed = false
      globalData._privacyResolve = null
      globalData._privacyEventInfo = null
      this.hide()
    },
    onAgreeTap() {
      // tap 可能先于微信授权事件；仅在微信已确认授权时补收口，不能提前销毁按钮。
      if (typeof wx.getPrivacySetting !== 'function') return
      const app = getApp()
      const pendingResolve = app && app.globalData && app.globalData._privacyResolve
      try {
        wx.getPrivacySetting({
          success: (res) => {
            const currentResolve = app && app.globalData && app.globalData._privacyResolve
            if (currentResolve === pendingResolve && res.needAuthorization === false && this.data.visible && !this._privacyResolved) {
              this.onAgree()
            }
          },
          fail: () => {
            const currentResolve = app && app.globalData && app.globalData._privacyResolve
            if (currentResolve === pendingResolve && this.data.visible && !this._privacyResolved) {
              this.setData({ policyError: '未能确认隐私授权，请重试。' })
            }
          }
        })
      } catch (error) {
        this.setData({ policyError: '未能确认隐私授权，请重试。' })
      }
    },
    onAgree() {
      this._resolve({ event: 'agree', buttonId: 'privacy-agree' })
    },
    onDecline() {
      this._resolve({ event: 'disagree' })
    }
  }
})
