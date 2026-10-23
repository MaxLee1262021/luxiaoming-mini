function configuredText(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  return typeof value === 'string' ? value.trim() : ''
}

function videoMeta(item) {
  const duration = configuredText(item.videoDuration) || configuredText(item.durationText)
  let finishedCount = configuredText(item.finishedVideoCount)
  if (/^\d+(?:\.\d+)?$/.test(finishedCount)) finishedCount += ' 条成片'
  return [duration, finishedCount, configuredText(item.deliveryCycle)]
    .filter(Boolean)
    .join(' · ')
}

function previewUrl(item) {
  const url = [item.videoUrl, item.previewVideoUrl, item.url]
    .find(value => typeof value === 'string' && value.trim())
  return url ? url.trim() : ''
}

Component({
  data: {
    marketingBadge: '',
    marketingBadgeClass: '',
    videoMetaText: '',
    previewVideoUrl: ''
  },

  properties: {
    item: {
      type: Object,
      value: {}
    },
    mode: {
      type: String,
      value: 'product'
    },
    showBook: {
      type: Boolean,
      value: false
    },
    // 短视频单品卡片（视频摄像板块统一使用单品形态）
    variant: {
      type: String,
      value: 'single'
    },
    // 父列表中的索引，方便相关推荐等组件回传完整 item
    index: {
      type: Number,
      value: -1
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
      this.setData({
        marketingBadge,
        marketingBadgeClass,
        videoMetaText: videoMeta(item || {}),
        previewVideoUrl: previewUrl(item || {})
      })
    }
  },

  methods: {
    onTap() {
      const item = this.data.item || {}
      this.triggerEvent('tap', {
        id: item._id || item.id,
        spotId: item.spotId,
        item: item,
        index: this.data.index
      })
    },

    onPreview() {
      const item = this.data.item || {}
      const url = previewUrl(item)
      if (!url) return
      this.triggerEvent('preview', {
        id: item._id || item.id,
        url,
        cover: item.cover
      })
    },

    onBook() {
      const item = this.data.item || {}
      this.triggerEvent('book', { id: item._id || item.id, spotId: item.spotId })
    }
  }
})
