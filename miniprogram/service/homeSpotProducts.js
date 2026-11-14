const bookingApi = require('../api/booking')
const peripheralApi = require('../api/peripheral')

function requireList(data, fields, label) {
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(data, field)) continue
    if (!Array.isArray(data[field])) throw new Error(`${label}数据格式错误，请重试`)
    // An explicit empty full catalogue must not revive an older preview list.
    return data[field]
  }
  throw new Error(`${label}数据不完整，请重试`)
}

// Older deployed home RPCs ignore spotProductsOnly and return a bounded set of
// recommendations. These existing endpoints supply complete public catalogues;
// the caller applies the selected point and city scope before displaying them.
async function loadLegacyHomeCatalog(context = {}, apis = {}) {
  const getBookingData = apis.getBookingData || bookingApi.getBookingData
  const getPeripherals = apis.getPeripherals || peripheralApi.getPeripherals
  const [bookingResult, peripheralResult] = await Promise.all([
    getBookingData(context),
    getPeripherals(context)
  ])
  const data = bookingResult && bookingResult.data
  if (!bookingResult || bookingResult.success !== true || !data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error((bookingResult && bookingResult.error) || '打卡点商品加载失败，请重试')
  }
  if (!peripheralResult || peripheralResult.success !== true || !Array.isArray(peripheralResult.data)) {
    throw new Error((peripheralResult && peripheralResult.error) || '周边商品加载失败，请重试')
  }
  return {
    series: requireList(data, ['allSeries', 'series'], '商品风格'),
    albums: requireList(data, ['allAlbums', 'albums'], '照片商品'),
    packages: requireList(data, ['allPackages', 'packages'], '视频和套餐商品'),
    peripherals: Object.prototype.hasOwnProperty.call(data, 'allPeripherals')
      ? requireList(data, ['allPeripherals'], '周边商品')
      : peripheralResult.data,
    ...(Array.isArray(data.spots) ? { spots: data.spots } : {})
  }
}

module.exports = { loadLegacyHomeCatalog }
