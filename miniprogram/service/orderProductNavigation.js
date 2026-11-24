const seriesApi = require('../api/series')
const { buildTarget } = require('../utils/router')
const { buildUrlWithSource } = require('../utils/query')
const { isVideo } = require('../utils/product')

function text(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  return typeof value === 'string' ? value.trim() : ''
}

function unavailable() {
  wx.showToast({ title: '商品暂时无法查看，请稍后重试', icon: 'none' })
  return false
}

async function openOrderProduct(item = {}, source = {}) {
  const targetId = text(item.targetId)
  let targetType = text(item.targetType)
  if (!targetId || !['album', 'video', 'package', 'peripheral'].includes(targetType)) return unavailable()
  const spotId = text(item.spotId)
  const seriesId = text(item.seriesId)

  if (targetType === 'package') {
    // Older order snapshots classify videos as packages. Resolve only the
    // destination from today's catalogue; recorded names and prices stay intact.
    let result
    try {
      result = await seriesApi.getSeriesDetail({ packageId: targetId, spotId, seriesId })
    } catch (error) {
      return unavailable()
    }
    const product = result && result.success === true && result.data && result.data.currentPackage
    const productId = product && text(product._id || product.id || product.packageId || product.productId)
    // Never use a default or recommended product returned for another ID.
    if (!product || productId !== targetId) return unavailable()
    if (isVideo(product)) targetType = 'video'
  }

  const target = buildTarget(targetType, targetId)
  if (!target || target.method !== 'navigateTo') return unavailable()
  const params = targetType === 'peripheral'
    ? target.params
    : { ...target.params, spotId, seriesId }
  wx.navigateTo({
    url: buildUrlWithSource(target.path, params, source),
    fail() { wx.showToast({ title: '商品页面暂时无法打开，请重试', icon: 'none' }) }
  })
  return true
}

module.exports = { openOrderProduct }
