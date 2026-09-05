Component({
  properties: {
    // 样片地址数组：支持字符串数组 ['url'] 或对象数组 [{ url }]
    samples: {
      type: Array,
      value: [],
      observer(val) {
        const urls = (val || [])
          .map(item => (typeof item === 'string' ? item : (item && item.url) || ''))
          .filter(Boolean)
        this.setData({
          galleryUrls: urls,
          activeIndex: 0,
          activeUrl: urls[0] || ''
        })
      }
    },
    title: { type: String, value: '样片预览' },
    subtitle: { type: String, value: '' }
  },
  data: {
    galleryUrls: [],
    activeIndex: 0,
    activeUrl: ''
  },
  methods: {
    // 点胶片缩略条：切换上方大图，并高亮当前张
    onThumbTap(e) {
      const index = e.currentTarget.dataset.index
      const url = this.data.galleryUrls[index]
      if (!url) return
      this.setData({ activeIndex: index, activeUrl: url })
    },
    // 点大图：全屏预览整套样片，从当前张开始
    onPreview() {
      const urls = this.data.galleryUrls
      if (!urls.length) return
      wx.previewImage({ current: this.data.activeUrl || urls[0], urls })
    }
  }
})
