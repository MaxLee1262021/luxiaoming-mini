Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index', text: '首页', icon: 'home' },
      { pagePath: '/pages/explore/explore', text: '探索', icon: 'compass' },
      { pagePath: '/pages/my/my', text: '我的', icon: 'user' }
    ]
  },
  methods: {
    switchTab(e) {
      const idx = Number(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.index)
      const item = this.data.list[idx]
      if (!Number.isInteger(idx) || !item || this._tabSwitching || idx === this.data.selected) return

      const previousSelected = this.data.selected
      this._tabSwitching = true

      try {
        wx.switchTab({
          url: item.pagePath,
          success: () => {
            this.setData({ selected: idx })
          },
          fail: () => {
            this.setData({ selected: previousSelected })
          },
          complete: () => {
            this._tabSwitching = false
          }
        })
      } catch (err) {
        this.setData({ selected: previousSelected })
        this._tabSwitching = false
      }
    }
  }
})
