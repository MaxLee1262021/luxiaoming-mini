const demoData = require('../utils/demoData')
const bookingUtils = require('../utils/booking')
const { mergeByIdentity } = require('../utils/list')

function mergeBookingData(data = {}, { allowFallback = false } = {}) {
  const fallback = allowFallback ? demoData.getBookingData() : {}
  return {
    spots: allowFallback ? mergeByIdentity(data.spots, fallback.spots) : (Array.isArray(data.spots) ? data.spots : []),
    allSeries: allowFallback ? mergeByIdentity(data.allSeries, fallback.allSeries) : (Array.isArray(data.allSeries) ? data.allSeries : []),
    allPackages: allowFallback ? mergeByIdentity(data.allPackages || data.hotPackages, fallback.allPackages || fallback.hotPackages) : (Array.isArray(data.allPackages) ? data.allPackages : (Array.isArray(data.hotPackages) ? data.hotPackages : [])),
    allAlbums: allowFallback ? mergeByIdentity(data.albums, fallback.albums) : (Array.isArray(data.albums) ? data.albums : []),
    allPeripherals: Array.isArray(data.allPeripherals) ? data.allPeripherals : (allowFallback ? (fallback.allPeripherals || demoData.peripherals || []) : [])
  }
}

function findPrefillSelection({ data = {}, prefill = {} } = {}) {
  const pkg = prefill.packageId
    ? (data.allPackages || []).find(item => item._id === prefill.packageId) || {}
    : {}
  const album = prefill.albumId
    ? (data.allAlbums || []).find(item => item._id === prefill.albumId || item.albumId === prefill.albumId) || {
      _id: prefill.albumId,
      albumId: prefill.albumId,
      seriesId: prefill.seriesId,
      name: '照片单品商品',
      price: Number(prefill.albumPrice || 0)
    }
    : {}
  const seriesId = prefill.seriesId || pkg.seriesId || album.seriesId || ''
  const series = (data.allSeries || []).find(item => item._id === seriesId) || {}
  const spotId = prefill.spotId || pkg.spotId || (Array.isArray(pkg.spotIds) && pkg.spotIds[0]) || album.spotId || (Array.isArray(series.spotIds) && series.spotIds[0]) || ''
  const spot = (data.spots || []).find(item => item._id === spotId) || {}

  return {
    item: bookingUtils.buildPrefillItem({
      series,
      spot,
      album,
      pkg,
      defaultPrice: Number(prefill.albumPrice || album.price || 0)
    }),
    spotId
  }
}

module.exports = {
  mergeBookingData,
  findPrefillSelection
}
