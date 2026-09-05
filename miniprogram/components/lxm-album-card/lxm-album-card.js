Component({
  properties: {
    item: {
      type: Object,
      value: {}
    },
    // grid（覆盖式网格）| compact（横向滚动小卡）| row（横排列表行）| stack（竖版产品卡）
    mode: {
      type: String,
      value: 'grid'
    },
    index: {
      type: Number,
      value: 0
    },
    // row 模式封面边长（默认 96rpx）；stack 模式封面高度（默认 330rpx）
    coverSize: {
      type: Number,
      value: 0
    },
    // 选中态：row/stack 显示红边 + 浅红底（吸收 picker 选中 / collection 聚焦）
    selected: {
      type: Boolean,
      value: false
    },
    // row 模式右侧静态胶囊文案（纯视觉，点击整卡仍走 tap 事件）
    ctaText: {
      type: String,
      value: ''
    },
    showBook: {
      type: Boolean,
      value: false
    },
    showPreview: {
      type: Boolean,
      value: false
    },
    // 业务类型，随所有事件下发，便于页面 handler 区分
    type: {
      type: String,
      value: ''
    }
  },

  observers: {
    'item': function (item) {
      // 营销角标：爆款 > 主推 > 热门（后台 isHotSale/isMainPush/isHot 控制，前端统一角标）
      let marketingBadge = ''
      let marketingBadgeClass = ''
      if (item) {
        if (item.isHotSale) {
          marketingBadge = '爆款'
          marketingBadgeClass = 'is-hot-sale'
        } else if (item.isMainPush) {
          marketingBadge = '主推'
          marketingBadgeClass = 'is-main-push'
        } else if (item.isHot) {
          marketingBadge = '热门'
          marketingBadgeClass = 'is-hot'
        }
      }
      this.setData({ marketingBadge, marketingBadgeClass })
    }
  },

  methods: {
    _payload() {
      const item = this.data.item || {}
      return {
        id: item.albumId || item._id,
        albumId: item.albumId || item._id,
        seriesId: item.seriesId,
        spotId: item.spotId,
        price: item.price || 0,
        type: this.data.type,
        index: this.data.index
      }
    },

    onTap() {
      this.triggerEvent('tap', this._payload())
    },

    onBook() {
      this.triggerEvent('book', this._payload())
    },

    onPreview() {
      this.triggerEvent('preview', this._payload())
    }
  }
})
