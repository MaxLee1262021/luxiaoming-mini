const demoData = require('../utils/demoData')
const { callCloud } = require('./client')
const { isExplicitDemoMode } = require('../config/env')

// 旅拍灵感（拍照攻略）数据层。
// 生产环境走自托管后台 RPC（listGuides / getGuide），
// 开发 / 演示环境无后台时自动回退到 demoData，保证小程序端体验可独立预览。

// 归一化：兼容后台（id/cover/name）与小程序 demo（_id/image/title）两套字段形状
function normalizeGuide(item = {}) {
  if (!item) return item
  const spotIds = [...new Set([
    ...(Array.isArray(item.spotIds) ? item.spotIds : []),
    item.spotId
  ].filter(value => value !== undefined && value !== null && String(value).trim()).map(value => String(value)))]
  return {
    _id: item._id || item.id || '',
    title: item.title || item.name || '',
    description: item.description || '',
    image: item.image || item.coverUrl || item.cover || '/images/placeholder.png',
    cover: item.cover || item.coverUrl || item.image || '',
    spotId: item.spotId || spotIds[0] || '',
    spotIds,
    spotName: item.spotName || '',
    seriesId: item.seriesId || '',
    targetPackageId: item.targetPackageId || '',
    isHot: !!item.isHot,
    readCount: item.readCount || 0,
    score: item.score || '4.9',
    content: Array.isArray(item.content) && item.content.length
      ? item.content
      : [item.description || '']
  }
}

function matchesSpot(guide = {}, spotId = '') {
  const wanted = String(spotId || '')
  if (!wanted) return true
  const ids = Array.isArray(guide.spotIds) ? guide.spotIds : []
  return String(guide.spotId || '') === wanted || ids.map(String).includes(wanted)
}

function getGuides(params = {}) {
  // Fetch all public guides when filtering by point. Older server deployments
  // only match guide.spotId, while current content configuration can use
  // guide.spotIds for a multi-point guide.
  const requestedSpotId = params && params.spotId
  const requestParams = requestedSpotId ? {} : params
  return callCloud('listGuides', requestParams)
    .then(res => {
      const list = (res && res.data && (res.data.list || res.data.guides || res.data)) || []
      if (!res || !res.success || !Array.isArray(list)) throw new Error('guide request failed')
      return list.map(normalizeGuide).filter(guide => matchesSpot(guide, requestedSpotId))
    })
    .catch((error) => {
      if (!isExplicitDemoMode()) throw error
      const all = (demoData.guides || []).map(normalizeGuide)
      return all.filter(guide => matchesSpot(guide, requestedSpotId))
    })
}

function getGuideDetail(params = {}) {
  const id = (params && params.id) || ''
  return callCloud('getGuide', { id })
    .then(res => {
      const item = (res && res.data) || null
      if (!item || !(item._id || item.id)) throw new Error('empty')
      return normalizeGuide(item)
    })
    .catch((error) => {
      if (!isExplicitDemoMode()) throw error
      const found = (demoData.guides || []).find(g => (g._id || g.id) === id)
      return normalizeGuide(found || {})
    })
}

module.exports = {
  getGuides,
  getGuideDetail,
  matchesSpot,
  normalizeGuide
}
