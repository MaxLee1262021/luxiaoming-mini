const favorites = require('../../service/favorites')

Component({
  properties: {
    type: { type: String, value: 'photo_single' },
    itemId: { type: String, value: '' },
    item: { type: Object, value: {} }
  },

  data: {
    active: false,
    loading: false
  },

  observers: {
    'type, itemId': function (type, itemId) {
      this.loadState(type, itemId)
    }
  },

  lifetimes: {
    detached() {
      this._stateVersion = (this._stateVersion || 0) + 1
    }
  },

  pageLifetimes: {
    show() {
      if (!this.data.loading) this.loadState(this.data.type, this.data.itemId)
    }
  },

  methods: {
    async loadState(type, itemId) {
      const version = this._stateVersion = (this._stateVersion || 0) + 1
      const key = `${type}:${itemId}`
      if (this._itemKey !== key) this.setData({ active: false, loading: false })
      this._itemKey = key
      if (!itemId) return
      try {
        const active = await favorites.checkFavorite(type, itemId)
        if (version === this._stateVersion) this.setData({ active })
      } catch (err) {
        // A failed read must not claim that an item was saved or removed.
      }
    },

    async onTap() {
      const itemId = String(this.data.itemId || '')
      if (!itemId || this.data.loading) return
      const version = this._stateVersion = (this._stateVersion || 0) + 1
      const type = this.data.type
      const next = !this.data.active
      this.setData({ loading: true })
      try {
        const active = await favorites.setFavorite(type, itemId, next, this.data.item || {})
        if (version !== this._stateVersion) return
        this.setData({ active })
        wx.showToast({ title: active ? '已收藏' : '已取消收藏', icon: 'none' })
        this.triggerEvent('change', { active, type, itemId })
      } catch (err) {
        if (version === this._stateVersion) {
          wx.showToast({ title: err.message || '收藏失败，请重试', icon: 'none' })
        }
      } finally {
        if (version === this._stateVersion) this.setData({ loading: false })
      }
    }
  }
})
