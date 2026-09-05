Component({
  properties: {
    item: {
      type: Object,
      value: {}
    },
    // 'vertical'（默认，上图下文）| 'horizontal'（封面在左的紧凑选择行）
    layout: {
      type: String,
      value: 'vertical'
    },
    // 可选中模式：开启后点击触发 select 事件（而非 tap），并显示选中描边
    selectable: {
      type: Boolean,
      value: false
    },
    selected: {
      type: Boolean,
      value: false
    },
    // 旅拍套餐可含视频（includedItems.type==='video'），视频以单品形式存在，不单独设“视频型套餐”
    isVideo: {
      type: Boolean,
      value: false
    },
    // 自定义小角标，如「主推」
    badge: {
      type: String,
      value: ''
    },
    // 封面尺寸（rpx）。0 = 按布局取默认（竖版 224 / 横版 180）
    coverSize: {
      type: Number,
      value: 0
    },
    // 可选标签（如「主推」「限时」），由调用方传入 item.tags
    tags: {
      type: Array,
      value: []
    }
  },

  data: {
    // 套餐组合内容标签：含 照片 / 视频 / 周边（从 item.includedItems 派生）
    compositionTags: []
  },

  observers: {
    'item': function (item) {
      const tags = (item && (item.tags || item.displayTags || [])) || []
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
      // 套餐组合内容标签：从 includedItems 派生「照片 / 视频 / 周边」，去重保序
      const map = { album: '照片', video: '视频', peripheral: '周边' }
      const comp = []
      const items = (item && item.includedItems) || []
      items.forEach(it => {
        const label = map[it.type]
        if (label && comp.indexOf(label) === -1) comp.push(label)
      })
      this.setData({ tags: tags.slice(0, 3), marketingBadge, marketingBadgeClass, compositionTags: comp })
    }
  },

  methods: {
    onTap() {
      const id = this.data.item && this.data.item._id
      if (this.data.selectable) {
        this.triggerEvent('select', { id })
      } else {
        this.triggerEvent('tap', { id })
      }
    }
  }
})
