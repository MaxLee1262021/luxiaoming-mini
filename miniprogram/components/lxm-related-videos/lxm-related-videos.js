Component({
  properties: {
    title: { type: String, value: '相关推荐' },
    subtitle: { type: String, value: '更多视频摄像单品，可跨打卡点由后台统一配置' },
    badge: { type: String, value: '' },
    badgeType: { type: String, value: 'blue' }, // blue | red
    videos: { type: Array, value: [] }
  },
  methods: {
    onTapCard(e) {
      const { item, index, id, spotId } = e.detail || {}
      if (!item) return
      this.triggerEvent('tap', {
        item,
        index: index ?? -1,
        id: id || item._id,
        spot: spotId
      })
    }
  }
})
