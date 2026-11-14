const bookingUtils = require('../utils/booking')
const { filterStorePeripherals } = require('../utils/product')

function mergeBookingData(data = {}) {
  return {
    spots: Array.isArray(data.spots) ? data.spots : [],
    allSeries: Array.isArray(data.allSeries) ? data.allSeries : [],
    allPackages: Array.isArray(data.allPackages) ? data.allPackages : (Array.isArray(data.hotPackages) ? data.hotPackages : []),
    allAlbums: Array.isArray(data.albums) ? data.albums : (Array.isArray(data.allAlbums) ? data.allAlbums : []),
    allPeripherals: filterStorePeripherals(Array.isArray(data.allPeripherals) ? data.allPeripherals : [])
  }
}

function findPrefillSelection({ data = {}, prefill = {} } = {}) {
  const pkg = prefill.packageId
    ? (data.allPackages || []).find(item => item._id === prefill.packageId) || {}
    : {}
  const album = prefill.albumId
    ? (data.allAlbums || []).find(item => item._id === prefill.albumId || item.albumId === prefill.albumId) || {}
    : {}
  if (!(pkg._id || pkg.id || album._id || album.id || album.albumId)) return { item: {}, spotId: '' }
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
      defaultPrice: Number(album.price || 0)
    }),
    spotId
  }
}

module.exports = {
  mergeBookingData,
  findPrefillSelection
}
