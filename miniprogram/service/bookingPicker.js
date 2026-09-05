const bookingUtils = require('../utils/booking')
const { isVideo } = require('../utils/product')

// 中文友好的搜索分词：保留完整词，并补充相邻 2-gram（与 api/search.js 一致）。
// 让"橘子洲旅拍"这类输入也能命中数据里的"橘子洲"。
function buildSearchTokens(keyword = '') {
  const q = String(keyword || '').trim().toLowerCase()
  if (!q) return []
  const tokens = [q]
  if (q.length >= 2) {
    for (let i = 0; i + 2 <= q.length; i++) {
      tokens.push(q.substr(i, 2))
    }
  }
  return tokens
}

function matchKeyword(item = {}, keyword = '') {
  const value = String(keyword || '').trim().toLowerCase()
  if (!value) return true
  const source = [
    item.name,
    item.title,
    item.spotName,
    item.seriesName,
    item.intro,
    item.description,
    Array.isArray(item.tags) ? item.tags.join(' ') : item.tags,
    Array.isArray(item.serviceTags) ? item.serviceTags.join(' ') : item.serviceTags
  ].filter(Boolean).join(' ').toLowerCase()
  const tokens = buildSearchTokens(value)
  return tokens.some(t => source.includes(t))
}

function getItemKey(item = {}) {
  if (item.peripheralId) return `peripheral:${item.peripheralId}`
  if (item.packageId) return `package:${item.packageId}`
  return `album:${item.albumId || item.seriesId || item.seriesName}`
}

function isPeripheralItem(item = {}) {
  return Boolean(item.peripheralId)
}

function hasMainItem(items = []) {
  return (items || []).some(item => !isPeripheralItem(item))
}

function hasItem(list = [], item = {}) {
  const key = getItemKey(item)
  return (list || []).some(current => getItemKey(current) === key)
}

function enrichSeriesList(series = [], albums = [], keyword = '') {
  return (series || [])
    .filter(item => matchKeyword(item, keyword))
    .map(item => {
      const childAlbums = (albums || []).filter(album => album.seriesId === item._id && matchKeyword(album, keyword))
      return {
        ...item,
        albumCount: childAlbums.length,
        previewAlbum: childAlbums[0] || {}
      }
    })
}

function filterAlbumsBySeries(albums = [], seriesId = '', keyword = '') {
  if (!seriesId) return []
  return (albums || [])
    .filter(item => item.seriesId === seriesId)
    .filter(item => matchKeyword(item, keyword))
    .map(item => ({
      ...item,
      cover: item.cover || item.coverImage || (item.sampleUrls && item.sampleUrls[0]) || '/images/placeholder.png',
      albumId: item.albumId || item._id
    }))
}

function filterPackages({ packages = [], albums = [], spotId = '', keyword = '', type = 'photo' } = {}) {
  return bookingUtils.filterPackagesBySpot(packages, spotId)
    .filter(item => type === 'video' ? isVideo(item) : !isVideo(item))
    .filter(item => matchKeyword(item, keyword))
    .map(item => ({
      ...item,
      previewUrls: buildPackagePreviewUrls(item, albums)
    }))
}

function uniqueTruthy(list = []) {
  const result = []
  ;(list || []).forEach(item => {
    if (item && !result.includes(item)) result.push(item)
  })
  return result
}

function buildPackagePreviewUrls(pkg = {}, albums = []) {
  const source = []
  if (Array.isArray(pkg.sampleUrls)) source.push(...pkg.sampleUrls)
  if (Array.isArray(pkg.videoSamples)) source.push(...pkg.videoSamples.map(item => item.cover || item.url || item))
  if (Array.isArray(pkg.videoCovers)) source.push(...pkg.videoCovers)
  if (Array.isArray(pkg.images)) source.push(...pkg.images)
  if (!isVideo(pkg)) {
    ;(albums || [])
      .filter(album => album.seriesId && album.seriesId === pkg.seriesId)
      .slice(0, 2)
      .forEach(album => {
        if (Array.isArray(album.sampleUrls)) source.push(...album.sampleUrls.slice(0, 3))
        source.push(album.cover, album.coverImage)
      })
  }
  source.push(pkg.cover, pkg.coverImage, pkg.image)
  return uniqueTruthy(source).slice(0, 6)
}

function buildItemFromAlbum({ album = {}, series = {}, spot = {} } = {}) {
  return bookingUtils.buildPrefillItem({
    series,
    spot,
    album,
    defaultPrice: album.price || 0
  })
}

function toggleCartItem(cart = [], item = {}) {
  if (hasItem(cart, item)) {
    return cart.filter(current => getItemKey(current) !== getItemKey(item))
  }
  return [...cart, item]
}

function mergeCartItems(items = [], cart = []) {
  return [...(items || []), ...(cart || []).filter(item => !hasItem(items, item))]
}

function mergeContactPhones(base = [], extra = []) {
  return [...(base || []), ...(extra || [])]
    .map(phone => String(phone || '').trim())
    .filter((phone, index, list) => phone && list.indexOf(phone) === index)
}

module.exports = {
  buildItemFromAlbum,
  enrichSeriesList,
  filterAlbumsBySeries,
  filterPackages,
  buildPackagePreviewUrls,
  getItemKey,
  hasItem,
  hasMainItem,
  isPeripheralItem,
  isVideo,
  mergeContactPhones,
  mergeCartItems,
  toggleCartItem
}
