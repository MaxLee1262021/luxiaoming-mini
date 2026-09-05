const app = getApp()
const guideApi = require('../../api/guide')
const demoData = require('../../utils/demoData')
const { buildUrlWithSource } = require('../../utils/query')
const { normalizePackage, isVideoSingle } = require('../../utils/product')

Page({
  data: {
    loading: true,
    error: '',
    guide: {},
    relatedSpot: {},
    target: null
  },

  onLoad(options = {}) {
    const id = options.id || ''
    this.setData({ id })
    this.loadDetail()
  },

  buildUrl(path, params = {}) {
    return buildUrlWithSource(path, params, this.data)
  },

  async loadDetail() {
    try {
      const guide = await guideApi.getGuideDetail({ id: this.data.id })
      if (!guide || !guide._id) {
        this.setData({ loading: false, error: '攻略不存在' })
        return
      }
      const relatedSpot = this.resolveSpot(guide.spotId)
      const target = this.resolveTarget(guide.targetPackageId)
      this.setData({ guide, relatedSpot, target, loading: false })
    } catch (err) {
      console.error('guide detail error', err)
      this.setData({ loading: false, error: '加载失败' })
    }
  },

  // 解析关联打卡点（用于"看打卡点"跳转）
  resolveSpot(spotId = '') {
    const spot = (demoData.spots || []).find(s => s._id === spotId) || {}
    return { id: spot._id || spotId, name: spot.name || '', cover: spot.cover || spot.image || '' }
  },

  // 解析"预约同款"目标：在 demo 商品里按 targetPackageId 找类型，拼出正确的详情页路径
  resolveTarget(targetPackageId = '') {
    if (!targetPackageId) return null
    const allPackages = [...(demoData.packages || []), ...(demoData.videoProducts || [])]
    const pkg = allPackages.find(p => p._id === targetPackageId)
    if (!pkg) return null
    const normalized = normalizePackage(pkg)
    // 吸底按钮要显示"要预约的那个旅拍产品名"，而不是攻略标题
    const name = pkg.name || normalized.name || '同款旅拍'
    const single = isVideoSingle(normalized)
    if (normalized.isVideo || single) {
      if (single) {
        return {
          name,
          path: '/pages/videoProductDetail/videoProductDetail',
          params: { productId: pkg._id, packageId: pkg._id, id: normalized.seriesId, seriesId: normalized.seriesId, spotId: normalized.spotId }
        }
      }
      return {
        name,
        path: '/pages/videoProductDetail/videoProductDetail',
        params: { id: normalized.seriesId, packageId: pkg._id, spotId: normalized.spotId }
      }
    }
    return {
      name,
      path: '/pages/photoPackageDetail/photoPackageDetail',
      params: { id: normalized.seriesId, packageId: pkg._id, spotId: normalized.spotId }
    }
  },

  goSpot() {
    const spot = this.data.relatedSpot
    if (!spot || !spot.id) return
    wx.navigateTo({ url: this.buildUrl('/pages/spotSheet/spotSheet', { id: spot.id }) })
  },

  goTarget() {
    const target = this.data.target
    if (!target) return
    wx.navigateTo({ url: this.buildUrl(target.path, target.params) })
  },

  retry() {
    this.setData({ loading: true, error: '' })
    this.loadDetail()
  }
})
