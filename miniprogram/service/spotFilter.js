const { normalizeToGcj02 } = require('../utils/coord')
const { hasCoordinates } = require('./citySpot')

function normalizeSpot(item = {}) {
  // 坐标纠偏：把点位经纬度统一转成微信地图所需的 GCJ-02，避免漂移
  const configuredCoordinates = hasCoordinates(item)
  const coord = configuredCoordinates
    ? normalizeToGcj02(Number(item.latitude), Number(item.longitude), item.coordType)
    : { latitude: null, longitude: null }
  return {
    ...item,
    latitude: coord.latitude,
    longitude: coord.longitude,
    cover: item.cover || item.coverUrl || item.image || '/images/placeholder.png',
    tags: Array.isArray(item.tags) ? item.tags : [],
    district: item.district || inferDistrict(item.address || item.name || '')
  }
}

function inferDistrict(text = '') {
  const source = String(text || '')
  const districts = ['天心区', '芙蓉区', '岳麓区', '开福区', '雨花区', '望城区', '长沙县']
  return districts.find(item => source.includes(item)) || ''
}

function buildDistrictOptions(spots = []) {
  const districts = spots.map(item => item.district || inferDistrict(item.address || '')).filter(Boolean)
  return [
    { name: '全部区域', value: '' },
    ...Array.from(new Set(districts)).map(item => ({ name: item, value: item }))
  ]
}

function matchKeyword(item = {}, keyword = '') {
  if (!keyword) return true
  const tags = Array.isArray(item.tags) ? item.tags.join(' ') : ''
  const text = `${item.name || ''} ${item.description || ''} ${item.address || ''} ${tags}`.toLowerCase()
  return text.includes(String(keyword).toLowerCase())
}

function sortSpots(spots = [], sort = 'hot') {
  const list = [...spots]
  if (sort === 'new') {
    return list.reverse()
  }
  if (sort === 'name') {
    return list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN'))
  }
  return list.sort((a, b) => Number(b.hotScore || b.visitCount || 0) - Number(a.hotScore || a.visitCount || 0))
}

function filterSpots(spots = [], filters = {}) {
  const { category = '', district = '', sort = 'hot' } = filters
  const filtered = spots
    .filter(item => matchKeyword(item, category))
    .filter(item => !district || item.district === district)
  return sortSpots(filtered, sort)
}

module.exports = {
  normalizeSpot,
  buildDistrictOptions,
  filterSpots
}
