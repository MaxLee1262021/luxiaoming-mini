const demoData = require('../utils/demoData')
const { callCloud } = require('./client')

// 旅拍灵感（拍照攻略）数据层。
// 生产环境走自托管后台 RPC（listGuides / getGuide），
// 开发 / 演示环境无后台时自动回退到 demoData，保证小程序端体验可独立预览。

// 归一化：兼容后台（id/cover/name）与小程序 demo（_id/image/title）两套字段形状
function normalizeGuide(item = {}) {
  if (!item) return item
  return {
    _id: item._id || item.id || '',
    title: item.title || item.name || '',
    description: item.description || '',
    image: item.image || item.coverUrl || item.cover || '/images/placeholder.png',
    cover: item.cover || item.coverUrl || item.image || '',
    spotId: item.spotId || '',
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

function getGuides(params = {}) {
  return callCloud('listGuides', params)
    .then(res => {
      const list = (res && res.data && (res.data.list || res.data.guides || res.data)) || []
      if (!list || !list.length) throw new Error('empty')
      return list.map(normalizeGuide)
    })
    .catch(() => {
      const all = (demoData.guides || []).map(normalizeGuide)
      const spotId = params && params.spotId
      return spotId ? all.filter(g => g.spotId === spotId) : all
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
    .catch(() => {
      const found = (demoData.guides || []).find(g => (g._id || g.id) === id)
      return normalizeGuide(found || {})
    })
}

module.exports = {
  getGuides,
  getGuideDetail,
  normalizeGuide
}
