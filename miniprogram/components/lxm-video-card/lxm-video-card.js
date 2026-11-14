const { displayTags, displayVideoDuration } = require('../../utils/productDisplay')

let playingCard = null

function configuredText(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  return typeof value === 'string' ? value.trim() : ''
}

function videoMeta(item) {
  const duration = displayVideoDuration(item.videoDuration) || displayVideoDuration(item.durationText)
  let finishedCount = configuredText(item.finishedVideoCount)
  if (/^\d+(?:\.\d+)?$/.test(finishedCount)) finishedCount += ' 条成片'
  return [duration, finishedCount, configuredText(item.deliveryCycle)]
    .filter(Boolean)
    .join(' · ')
}

function previewUrl(item) {
  const candidates = [item.previewVideoUrl, item.videoUrl, item.url, ...(Array.isArray(item.videos) ? item.videos : [])]
  for (const value of candidates) {
    const media = typeof value === 'string' ? { url: value } : value || {}
    const url = configuredText(media.videoUrl || media.url || media.src)
    const declaredType = String(media.mediaType || media.mimeType || media.type || '').toLowerCase()
    const image = /\.(?:jpe?g|png|webp|gif|bmp|svg|avif|heic)(?:[?#]|$)/i.test(url) || /^data:image\//i.test(url) || /^(?:image|photo)/.test(declaredType)
    if (url && !image) return url
  }
  return ''
}

const MARKETING_BADGES = [
  { label: '爆款', className: 'is-hot-sale', fields: ['isHotSale'] },
  { label: '主推', className: 'is-main-push', fields: ['isMainPush', 'mainPush'] },
  { label: '新品', className: 'is-new', fields: ['isNew'] },
  { label: '热门', className: 'is-hot', fields: ['isHot', 'hot'] }
]

function marketingInfo(item, tags) {
  const enabled = value => [true, 1, '1', 'true'].includes(typeof value === 'string' ? value.trim().toLowerCase() : value)
  // 明确填写的营销标签优先于旧接口派生的标记，其他标签继续完整展示。
  return MARKETING_BADGES.find(badge => tags.includes(badge.label)) ||
    MARKETING_BADGES.find(badge => badge.fields.some(field => enabled(item[field]))) ||
    { label: '', className: '' }
}

Component({
  data: {
    marketingBadge: '',
    marketingBadgeClass: '',
    videoMetaText: '',
    displayTags: [],
    previewVideoUrl: '',
    isPlaying: false,
    videoError: false
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
    showCoverPrice: {
      type: Boolean,
      value: true
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
      const url = previewUrl(item || {})
      if (url !== this.data.previewVideoUrl) {
        this.pauseVideo()
        this.setData({ videoError: false })
      }
      const source = item || {}
      const tags = displayTags(source.tag, source.tags, source.serviceTags, source.styleTags)
      const badge = marketingInfo(source, tags)
      this.setData({
        marketingBadge: badge.label,
        marketingBadgeClass: badge.className,
        videoMetaText: videoMeta(source),
        displayTags: tags.filter(tag => tag !== badge.label && tag !== '视频摄像'),
        previewVideoUrl: url
      })
    }
  },

  lifetimes: {
    detached() {
      this.pauseVideo()
    }
  },

  pageLifetimes: {
    hide() {
      this.pauseVideo()
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

    onVideoTap() {
      // 视频区域使用原生播放控件，阻止点击冒泡到商品详情。
    },

    onVideoPlay() {
      if (playingCard && playingCard !== this) playingCard.pauseVideo()
      playingCard = this
      this.setData({ isPlaying: true })
    },

    onVideoPause() {
      if (playingCard === this) playingCard = null
      this.setData({ isPlaying: false })
    },

    onVideoError() {
      this.onVideoPause()
      this.setData({ videoError: true })
    },

    retryVideo() {
      if (!this.data.previewVideoUrl) return
      this.setData({ videoError: false }, () => {
        wx.createVideoContext('product-video', this).play()
      })
    },

    pauseVideo() {
      if (this.data.isPlaying) wx.createVideoContext('product-video', this).pause()
      this.onVideoPause()
    },

    onBook() {
      const item = this.data.item || {}
      this.triggerEvent('book', { id: item._id || item.id, spotId: item.spotId })
    }
  }
})
