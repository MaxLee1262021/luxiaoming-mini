const { displayTags, displayText, includedItemStats } = require('../../utils/productDisplay')

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
    // 首页固定卡片尺寸；其他入口继续按内容自然增高。
    variant: {
      type: String,
      value: 'default'
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
    // 是否展示套餐说明；配置标签始终在封面展示。
    showDetails: {
      type: Boolean,
      value: true
    },
    // 可选标签（如「主推」「限时」），由调用方传入 item.tags
    tags: {
      type: Array,
      value: []
    }
  },

  data: {
    // 套餐组合内容标签：含 照片 / 视频 / 周边（从 item.includedItems 派生）
    compositionTags: [],
    itemCount: 0,
    typeCount: 0,
    description: ''
  },

  observers: {
    'item': function (item) {
      const source = item || {}
      const tags = source.tags != null ? displayTags(source.tags)
        : displayTags(source.tag, source.serviceTags, source.styleTags, source.displayTags)
      // 套餐组合内容标签：从 includedItems 派生「照片 / 视频 / 周边」，去重保序
      const map = { album: '照片', video: '视频', peripheral: '周边' }
      const comp = []
      const items = (item && (Array.isArray(item.includedItems) ? item.includedItems : item.items)) || []
      items.forEach(it => {
        const label = map[it.type]
        if (label && comp.indexOf(label) === -1) comp.push(label)
      })
      this.setData({ tags, compositionTags: comp, description: displayText(item && (item.description ?? item.intro)), ...includedItemStats(items) })
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
