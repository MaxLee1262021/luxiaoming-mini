const app = getApp()
const guideApi = require('../../api/guide')
const { buildUrlWithSource, decodeQueryValue } = require('../../utils/query')
const { matchesSpot, sortGuides } = require('../../utils/guideContent')

const categoryOf = guide => typeof guide.category === 'string' ? guide.category.trim() : ''

Page({
  data: {
    loading: true,
    spotId: '',
    spotName: '',
    title: '旅拍灵感',
    guides: [],
    featuredGuides: [],
    visibleFeaturedGuides: [],
    featuredIndex: 0,
    feedGuides: [],
    chips: [{ key: 'all', label: '全部' }],
    activeChip: 'all',
    sortOptions: [{ key: 'default', label: '默认排序' }, { key: 'readCount', label: '浏览人数 ↓' }, { key: 'score', label: '评分 ↓' }],
    activeSort: 'default',
    filteredGuides: [],
    leftGuides: [],
    rightGuides: []
  },

  onLoad(options = {}) {
    const source = app.captureSource ? app.captureSource(options) : {}
    const spotId = options.spotId || ''
    const spotName = decodeQueryValue(options.spotName)
    this.setData({
      spotId,
      spotName,
      shopId: options.shopId || source.shopId || '',
      scene: options.scene || source.scene || '',
      title: spotName ? `${spotName}·旅拍灵感` : '旅拍灵感'
    })
    this.loadGuides()
  },

  buildUrl(path, params = {}) {
    return buildUrlWithSource(path, params, this.data)
  },

  async loadGuides() {
    try {
      const allGuides = await guideApi.getGuides()
      // 顶部只展示后台置顶文章，不受入口打卡点限制，也不自动提升普通文章。
      const featuredGuides = allGuides.filter(guide => guide.isTop === true || (guide.isTop === undefined && guide.pinned === true))
      const featuredIds = new Set(featuredGuides.map(guide => guide._id))
      // 点位入口的下方列表保留全部关联文章，包括已在顶部展示的关联置顶文章。
      const feedGuides = this.data.spotId
        ? allGuides.filter(guide => matchesSpot(guide, this.data.spotId))
        : allGuides.filter(guide => !featuredIds.has(guide._id))
      const guides = allGuides.filter(guide => featuredIds.has(guide._id) || matchesSpot(guide, this.data.spotId))
      this.setData({ guides, featuredGuides, feedGuides, loading: false })
      this.applyChips(guides)
    } catch (err) {
      console.error('load guides error', err)
      this.setData({ loading: false })
    }
  },

  applyChips(list = []) {
    const categories = [...new Set(list.map(categoryOf).filter(Boolean))]
    const chips = [{ key: 'all', label: '全部' }, ...categories.map(category => ({ key: 'category:' + category, label: category, category }))]
    if (list.some(guide => !categoryOf(guide))) chips.push({ key: 'uncategorized', label: '未分类' })
    const activeChip = chips.some(chip => chip.key === this.data.activeChip) ? this.data.activeChip : 'all'
    const chip = chips.find(item => item.key === activeChip)
    const matches = guide => activeChip === 'all' || (activeChip === 'uncategorized' ? !categoryOf(guide) : categoryOf(guide) === chip.category)
    const visibleFeaturedGuides = this.data.featuredGuides.filter(matches)
    const filtered = sortGuides(this.data.feedGuides.filter(matches), this.data.activeSort)
    const left = []
    const right = []
    filtered.forEach((g, i) => {
      if (i % 2 === 0) left.push(g)
      else right.push(g)
    })
    this.setData({ chips, activeChip, visibleFeaturedGuides, featuredIndex: 0, filteredGuides: filtered, leftGuides: left, rightGuides: right })
  },

  onChipTap(e) {
    const cat = e.currentTarget.dataset.cat
    if (cat === this.data.activeChip || !this.data.chips.some(chip => chip.key === cat)) return
    this.setData({ activeChip: cat })
    this.applyChips(this.data.guides)
    wx.pageScrollTo({ scrollTop: 0, duration: 200 })
  },

  onFeaturedChange(e) {
    this.setData({ featuredIndex: e.detail.current })
  },

  onSortTap(e) {
    const sort = e.currentTarget.dataset.sort
    if (sort === this.data.activeSort || !this.data.sortOptions.some(option => option.key === sort)) return
    this.setData({ activeSort: sort })
    this.applyChips(this.data.guides)
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
