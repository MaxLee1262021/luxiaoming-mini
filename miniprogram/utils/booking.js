const { filterPhotoSeries } = require('./catalog')

function isValidPhone(phone = '') {
  return /^1[3-9]\d{9}$/.test(String(phone).trim())
}

// 判断日期是否早于今天（避免 iOS 对 YYYY-MM-DD 解析异常，先转成 YYYY/MM/DD）
function isPastDate(dateStr = '') {
  if (!dateStr) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(String(dateStr).replace(/-/g, '/'))
  return !isNaN(target.getTime()) && target < today
}

function sumItemsPrice(items = []) {
  return (items || []).reduce((sum, item) => sum + (Number(item.price) || 0), 0)
}

function validateBookingForm(data = {}) {
  if (!String(data.name || '').trim()) return { valid: false, message: '请输入姓名' }
  if (!isValidPhone(data.phone)) return { valid: false, message: '手机号格式错误' }
  if (!data.agreed) return { valid: false, message: '请同意预约须知' }
  const items = data.items || []
  if (!items.length) return { valid: false, message: '请至少添加一个拍摄项目' }
  const hasMainItem = items.some(item => !item.peripheralId)
  if (!hasMainItem) return { valid: false, message: '影像周边需搭配拍摄项目一起预约' }
  return { valid: true, message: '' }
}

function buildBookingPayload(data = {}) {
  const items = data.items || []
  const contactPhones = [data.phone, ...(data.contactPhones || [])]
    .map(phone => String(phone || '').trim())
    .filter((phone, index, list) => phone && list.indexOf(phone) === index)
  return {
    shopId: data.shopId || '',
    scene: data.scene || '',
    name: String(data.name || '').trim(),
    phone: String(data.phone || '').trim(),
    contactPhones,
    date: data.date || '',
    time: data.time || '',
    message: data.message || '',
    items,
    totalPrice: sumItemsPrice(items),
    bookingMode: 'consult',
    // 商家二维码溯源字段：扫码进来时由预约页从实时来源填入
    placementType: data.placementType || '',
    placementLabel: data.placementLabel || '',
    codeId: data.codeId || ''
  }
}

function buildPrefillItem({ series = {}, spot = {}, album = {}, pkg = {}, defaultPrice = 0 } = {}) {
  return {
    spotId: spot._id || pkg.spotId || '',
    spotName: spot.name || pkg.spotName || '',
    seriesId: series._id || pkg.seriesId || album.seriesId || '',
    seriesName: series.name || pkg.seriesName || album.seriesName || '',
    albumId: album._id || album.albumId || '',
    albumName: album.name || album.albumName || '',
    packageId: pkg._id || '',
    packageName: pkg.name || '',
    price: Number(pkg.price || defaultPrice || album.price || 0),
    defaultPrice: Number(defaultPrice || album.price || 0)
  }
}

function filterSeriesBySpot(series = [], spotId = '') {
  const photoSeries = filterPhotoSeries(series)
  if (!spotId) return photoSeries
  return photoSeries.filter(item => Array.isArray(item.spotIds) && item.spotIds.includes(spotId))
}

function filterPackagesBySpot(packages = [], spotId = '') {
  if (!spotId) return packages || []
  return (packages || []).filter(item => item.spotId === spotId || (Array.isArray(item.spotIds) && item.spotIds.includes(spotId)))
}

function buildItemFromPackage({ pkg = {}, series = {}, spot = {}, album = {} } = {}) {
  return {
    spotId: spot._id || pkg.spotId || '',
    spotName: spot.name || pkg.spotName || '',
    seriesId: series._id || pkg.seriesId || '',
    seriesName: series.name || pkg.seriesName || '',
    albumId: album._id || '',
    albumName: album.name || '',
    packageId: pkg._id || '',
    packageName: pkg.name || '',
    price: pkg.price || 0,
    defaultPrice: album.price || 0
  }
}

function buildItemFromPeripheral({ peripheral = {} } = {}) {
  return {
    spotId: '',
    spotName: '',
    seriesId: '',
    seriesName: '',
    albumId: '',
    albumName: '',
    packageId: '',
    packageName: '',
    peripheralId: peripheral._id || '',
    peripheralName: peripheral.name || '',
    price: peripheral.price || 0,
    defaultPrice: 0
  }
}

module.exports = {
  isValidPhone,
  sumItemsPrice,
  validateBookingForm,
  buildBookingPayload,
  buildPrefillItem,
  filterSeriesBySpot,
  filterPackagesBySpot,
  buildItemFromPackage,
  buildItemFromPeripheral
}
