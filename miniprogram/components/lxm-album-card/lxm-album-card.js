const { normalizeAlbumPresentation } = require('../../utils/albumPresentation')
const { displayTags } = require('../../utils/productDisplay')

Component({
  data: {
    album: {},
    photoCountBelowCover: false,
    coverTags: [],
    coverTagText: ''
  },
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
      const source = item || {}
      // 明确配置的标签（包括清空）优先，不从首页推荐开关生成展示文案。
      const coverTags = source.tags != null ? displayTags(source.tags)
        : displayTags(source.tag, source.serviceTags, source.styleTags)
      const coverTagText = coverTags.length > 1 ? `${coverTags[0]} +${coverTags.length - 1}` : coverTags[0] || ''
      const album = normalizeAlbumPresentation(source)
      // 长说明在封面下方自然展开，避免挤出固定高度封面里的商品名和价格。
      const photoCountBelowCover = album.photoCountText.length > 16 || /[\r\n]/.test(album.photoCountText)
      this.setData({ album, photoCountBelowCover, coverTags, coverTagText })
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
