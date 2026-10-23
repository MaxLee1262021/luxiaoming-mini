const { normalizeAlbumPresentation } = require('../utils/albumPresentation')
const { isPublicProduct } = require('../utils/product')

function albumId(item = {}) {
  return String(item._id || item.albumId || item.id || '')
}

function buildRelatedPhotoCollections(current = {}, collections = [], catalog = {}) {
  const seen = new Set([albumId(current)])
  const seriesList = Array.isArray(catalog.allSeries) ? catalog.allSeries : []
  const spots = Array.isArray(catalog.spots) ? catalog.spots : []
  const albums = Array.isArray(catalog.albums) ? catalog.albums : []
  // 商品目录优先，避免详情接口中的旧副本覆盖最新的上下架状态和价格。
  return [...albums, ...collections].reduce((related, item) => {
    const id = albumId(item)
    if (!id || seen.has(id)) return related
    seen.add(id)
    if (!isPublicProduct(item)) return related
    const matchedSeries = seriesList.find(row => String(row._id || row.id) === String(item.seriesId))
    if (Array.isArray(catalog.allSeries) && item.seriesId && !matchedSeries) return related
    const series = matchedSeries || {}
    if (!isPublicProduct(series)) return related
    const spotId = item.spotId || (item.spotIds || [])[0] || series.spotId || (series.spotIds || [])[0] || ''
    const spot = spots.find(row => String(row._id || row.id) === String(spotId)) || {}
    related.push({
      ...normalizeAlbumPresentation(item),
      _id: id,
      albumId: id,
      collectionKey: id,
      name: item.name || item.title || '照片留影',
      seriesName: item.seriesName || series.name || '',
      spotId,
      spotName: item.spotName || spot.name || '',
      cover: item.cover || item.coverImage || item.coverUrl || (item.sampleUrls || [])[0] || '/images/placeholder.png'
    })
    return related
  }, []).sort((a, b) => {
    const score = item => (current.seriesId && item.seriesId === current.seriesId ? 2 : 0)
      + (current.spotId && item.spotId === current.spotId ? 1 : 0)
    return score(b) - score(a)
  }).slice(0, 8)
}

module.exports = { buildRelatedPhotoCollections }
