const { callCloud } = require('./client')
const { normalizeGuide, matchesSpot, isPublicGuide, publicGuides } = require('../utils/guideContent')

// 旅拍灵感只读取真实后台 RPC。

function getGuides(params = {}) {
  // Fetch all public guides when filtering by point. Older server deployments
  // only match guide.spotId, while current content configuration can use
  // guide.spotIds for a multi-point guide.
  const requestedSpotId = params && params.spotId
  const requestParams = { ...params }
  if (requestedSpotId) delete requestParams.spotId
  return callCloud('listGuides', requestParams)
    .then(res => {
      const list = (res && res.data && (res.data.list || res.data.guides || res.data)) || []
      if (!res || !res.success || !Array.isArray(list)) throw new Error('guide request failed')
      return publicGuides(list, requestParams.sortBy).filter(guide => matchesSpot(guide, requestedSpotId))
    })
}

function getGuideDetail(params = {}) {
  const id = (params && params.id) || ''
  return callCloud('getGuide', { id })
    .then(res => {
      const item = (res && res.data) || null
      if (!res.success || !item || !(item._id || item.id) || !isPublicGuide(item)) return null
      return normalizeGuide(item)
    })
}

module.exports = {
  getGuides,
  getGuideDetail,
  matchesSpot,
  normalizeGuide
}
