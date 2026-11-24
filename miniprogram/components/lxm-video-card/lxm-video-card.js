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

Component({
  data: {
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
      // 后台标签字段为准；明确清空后不再带回旧标签或推荐标记。
      const tags = source.tags != null ? displayTags(source.tags)
        : displayTags(source.tag, source.serviceTags, source.styleTags)
      this.setData({
        videoMetaText: videoMeta(source),
        displayTags: tags,
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
