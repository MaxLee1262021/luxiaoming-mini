Component({
  properties: {
    // 数据对象（攻略等）
    item: {
      type: Object,
      value: {}
    },
    // 'list'（封面在左的列表项）| 'thumb'（横滑缩略图小卡）
    variant: {
      type: String,
      value: 'list'
    },
    // 封面类型：'image'（图片）| 'badge'（渐变编号徽标）
    coverType: {
      type: String,
      value: 'image'
    },
    // 编号（badge 封面显示；thumb 选中时回传）
    index: {
      type: Number,
      value: 0
    },
    // 缩略图变体的选中态（高亮 + 上浮）
    active: {
      type: Boolean,
      value: false
    },
    // 封面图覆盖（不传则用 item.image / coverUrl / cover）
    cover: {
      type: String,
      value: ''
    },
    // 显式标题（thumb 常用「spot | title」拼接）
    title: {
      type: String,
      value: ''
    },
    // 显式描述 / 副标题
    desc: {
      type: String,
      value: ''
    },
    // 显式主标签（如打卡点名）
    tag: {
      type: String,
      value: ''
    },
    // 是否显示「热门」标签
    hot: {
      type: Boolean,
      value: false
    },
    // badge 封面渐变（缺省取 item.coverGradient / heroColor）
    badgeGradient: {
      type: String,
      value: ''
    }
  },

  data: {
    coverUrl: '',
    primaryTag: '',
    showHot: false,
    titleText: '',
    descText: '',
    metaList: [],
    badgeText: '',
    badgeBg: '',
    indexLabel: '01'
  },

  observers: {
    'item, variant, index, cover, title, desc, tag, hot, badgeGradient': function (item, variant, index, cover, title, desc, tag, hot, badgeGradient) {
      item = item || {}
      const coverUrl = cover || item.image || item.coverUrl || item.cover || ''
      const primaryTag = tag || item.spotName || item.spot || ''
      const showHot = !!(hot || item.isHot || item.hot)
      const titleText = title || item.title || ''
      const descText = desc || item.description || item.subtitle || ''
      const metaList = []
      if (item.readCount != null || item.score != null) {
        metaList.push((item.readCount || 0) + ' 人已看')
        metaList.push((item.score || '4.9') + ' 分')
      }
      const badgeText = (index != null) ? String(index) : ''
      const badgeBg = badgeGradient || item.coverGradient || item.heroColor || 'linear-gradient(135deg, #FF8D52 0%, #EE2C2C 100%)'
      const indexLabel = ('0' + ((index || 0) + 1)).slice(-2)
      this.setData({ coverUrl, primaryTag, showHot, titleText, descText, metaList, badgeText, badgeBg, indexLabel })
    }
  },

  methods: {
    onTap() {
      const id = this.data.item && this.data.item._id
      if (this.data.variant === 'thumb') {
        this.triggerEvent('select', { id, index: this.data.index })
      } else {
        this.triggerEvent('tap', { id })
      }
    }
  }
})
