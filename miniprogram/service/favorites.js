const favoriteApi = require('../api/favorite')
const { buildUrlWithSource } = require('../utils/query')

const TYPE_LABELS = {
  photo_single: '照片留影',
  photo_package: '旅拍套餐',
  video_single: '视频摄像',
  peripheral: '影像周边',
  guide: '旅拍灵感',
  spot: '打卡点'
}

function responseData(response) {
  if (!response || response.success !== true) {
    throw new Error(response && (response.error || response.message) || '收藏服务暂不可用，请重试')
  }
  return response.data || {}
}

function normalizeFavorite(row = {}) {
  if (!row || typeof row !== 'object') return null
  const type = String(row.type || '')
  const itemId = String(row.itemId || row.id || row._id || '')
  if (!TYPE_LABELS[type] || !itemId) return null
  const hasPrice = row.price !== undefined && row.price !== null && row.price !== ''
    && Number.isFinite(Number(row.price)) && Number(row.price) >= 0
  return {
    ...row,
    type,
    itemId,
    key: `${type}:${itemId}`,
    typeLabel: TYPE_LABELS[type],
    name: row.title || row.name || TYPE_LABELS[type],
    cover: row.cover || row.coverImage || row.coverUrl || row.image || '/images/placeholder.png',
    priceText: hasPrice ? `¥${Number(row.price)}` : ''
  }
}

async function checkFavorite(type, itemId) {
  const data = responseData(await favoriteApi.checkFavorite({ type, itemId }))
  if (typeof data.favorite !== 'boolean') throw new Error('收藏状态暂不可用，请重试')
  return data.favorite
}

async function setFavorite(type, itemId, active, item = {}) {
  if (!TYPE_LABELS[type] || !itemId) throw new Error('收藏内容不存在')
  // Explicit add/remove makes retries safe even if a previous response was lost.
  const operation = active ? favoriteApi.addFavorite : favoriteApi.removeFavorite
  const data = responseData(await operation({ type, itemId, item }))
  if (data.favorite !== active) throw new Error('收藏状态未确认，请重试')
  return active
}

async function getMyFavorites(page = 1, pageSize = 20) {
  const data = responseData(await favoriteApi.getMyFavorites({ page, pageSize }))
  const rows = Array.isArray(data) ? data : (data.items || data.list)
  if (!Array.isArray(rows)) throw new Error('收藏列表暂不可用，请重试')
  const items = rows.map(normalizeFavorite).filter(Boolean)
  return {
    items,
    hasMore: typeof data.hasMore === 'boolean' ? data.hasMore : rows.length >= pageSize
  }
}

function getFavoriteUrl(row, source = {}) {
  const item = normalizeFavorite(row)
  if (!item) return ''
  const { itemId, seriesId = '', spotId = '' } = item
  const targets = {
    photo_single: ['/pages/photoCollection/photoCollection', { albumId: itemId, seriesId, spotId }],
    photo_package: ['/pages/photoPackageDetail/photoPackageDetail', { packageId: itemId, seriesId, spotId }],
    video_single: ['/pages/videoProductDetail/videoProductDetail', { productId: itemId, spotId }],
    peripheral: ['/pages/peripheralDetail/peripheralDetail', { id: itemId }],
    guide: ['/pages/guideDetail/guideDetail', { id: itemId }],
    spot: ['/pages/spotSheet/spotSheet', { id: itemId }]
  }
  const [path, params] = targets[item.type]
  return buildUrlWithSource(path, params, source)
}

module.exports = { checkFavorite, setFavorite, getMyFavorites, getFavoriteUrl, normalizeFavorite }
