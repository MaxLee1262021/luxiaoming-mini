const { getMediaType } = require('./product')

function readTypeFields(item = {}) {
  return [
    item.productType,
    item.serviceType,
    item.type,
    item.contentType,
    item.seriesType,
    item.category,
    item.kind,
    item.productKind
  ].filter(Boolean)
}

// 只认显式类型字段，不再对 tags/styles 做子串匹配（避免把含「视频」的文案照片系列误判为视频系列）
function isVideoSeries(item = {}) {
  const explicit = readTypeFields(item)
  if (explicit.length) {
    return explicit.some(v => {
      const t = String(v).toLowerCase()
      return t.includes('video') || t.includes('短视频') || t.includes('视频')
    })
  }
  // 兜底：用商品类型单一真相源判断
  return getMediaType(item) === 'video'
}

function isPhotoSeries(item = {}) {
  return !isVideoSeries(item)
}

function normalizeSeries(item = {}) {
  const isVideo = isVideoSeries(item)
  return {
    ...item,
    productType: isVideo ? 'video' : 'photo',
    displayType: isVideo ? 'video' : 'photo'
  }
}

function filterPhotoSeries(series = []) {
  return (series || []).filter(isPhotoSeries)
}

function filterVideoSeries(series = []) {
  return (series || []).filter(isVideoSeries)
}

module.exports = {
  filterPhotoSeries,
  filterVideoSeries,
  isPhotoSeries,
  isVideoSeries,
  normalizeSeries
}
