const app = getApp()
const guideApi = require('../../api/guide')
const { buildUrlWithSource } = require('../../utils/query')

// 旅拍灵感（攻略）分类：按标题 / 描述关键词派生，避免依赖后台字段
const CAT_KEYWORDS = {
  '机位': ['机位'],
  '路线': ['路线'],
  '夜景': ['夜景'],
  '亲子': ['亲子']
}

Page({
  data: {
    loading: true,
    spotId: '',
    spotName: '',
    title: '旅拍灵感',
    guides: [],
    featuredGuide: null,
    feedGuides: [],
    chips: ['全部'],
    activeChip: '全部',
    filteredGuides: [],
    leftGuides: [],
    rightGuides: []
  },

  onLoad(options = {}) {
    const spotId = options.spotId || ''
    const spotName = options.spotName || ''
    this.setData({
      spotId,
      spotName,
      title: spotName ? `${spotName}·旅拍灵感` : '旅拍灵感'
    })
    this.loadGuides()
  },

  buildUrl(path, params = {}) {
    return buildUrlWithSource(path, params, this.data)
  },

  async loadGuides() {
    try {
      const guides = await guideApi.getGuides({ spotId: this.data.spotId })
      this.tagGuides(guides)
      // 本期推荐（国风杂志流 hero）：优先取后台标记 isFeatured/pinned=true 的攻略置顶；
      // 无标记时回退为列表首条。该攻略仅作 hero 展示，不重复出现在双列瀑布流。
      let featuredGuide = null
      let feed = guides
      const featuredIdx = guides.findIndex(g => g.isFeatured === true || g.pinned === true)
      if (featuredIdx !== -1) {
        featuredGuide = guides[featuredIdx]
        feed = guides.filter((_, i) => i !== featuredIdx)
      } else {
        featuredGuide = guides[0] || null
        feed = guides.slice(1)
      }
      this.setData({ guides, featuredGuide, feedGuides: feed, loading: false })
      this.applyChips(feed)
    } catch (err) {
      console.error('load guides error', err)
      this.setData({ loading: false })
    }
  },

  tagGuides(list = []) {
    list.forEach(g => {
      const text = (g.title || '') + (g.description || '')
      const cats = []
      Object.keys(CAT_KEYWORDS).forEach(cat => {
        if (CAT_KEYWORDS[cat].some(k => text.indexOf(k) !== -1) && cats.indexOf(cat) === -1) {
          cats.push(cat)
        }
      })
      g._cats = cats
    })
  },

  applyChips(list = []) {
    const present = Object.keys(CAT_KEYWORDS).filter(cat => list.some(g => g._cats && g._cats.indexOf(cat) !== -1))
    const chips = ['全部', ...present]
    const activeChip = this.data.activeChip
    const filtered = activeChip === '全部' ? list : list.filter(g => g._cats && g._cats.indexOf(activeChip) !== -1)
    const left = []
    const right = []
    filtered.forEach((g, i) => {
      if (i % 2 === 0) left.push(g)
      else right.push(g)
    })
    this.setData({ chips, activeChip, filteredGuides: filtered, leftGuides: left, rightGuides: right })
  },

  onChipTap(e) {
    const cat = e.currentTarget.dataset.cat
    if (cat === this.data.activeChip) return
    const list = this.data.feedGuides
    const filtered = cat === '全部' ? list : list.filter(g => g._cats && g._cats.indexOf(cat) !== -1)
    const left = []
    const right = []
    filtered.forEach((g, i) => {
      if (i % 2 === 0) left.push(g)
      else right.push(g)
    })
    this.setData({ activeChip: cat, filteredGuides: filtered, leftGuides: left, rightGuides: right })
    wx.pageScrollTo({ scrollTop: 0, duration: 200 })
  },

  goGuideDetail(e) {
    const id = (e && e.detail && e.detail.id) || (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id)
    if (!id) return
    wx.navigateTo({ url: this.buildUrl('/pages/guideDetail/guideDetail', { id }) })
  },

  goAllPackages() {
    wx.switchTab({ url: '/pages/explore/explore' })
  }
})
