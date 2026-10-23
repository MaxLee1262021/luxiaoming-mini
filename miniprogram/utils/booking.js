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
  return (items || []).reduce((sum, item) => {
    const price = Number(item && item.price) || 0
    const quantity = Math.max(1, Math.min(99, Math.floor(Number(item && (item.quantity ?? item.qty)) || 1)))
    return sum + price * quantity
  }, 0)
}

function normalizeDepositRatio(value, fallback = 0.3) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return fallback
  return Math.min(number > 1 ? number / 100 : number, 1)
}

function sumDepositDue(items = [], fallbackRatio = 0.3) {
  const amount = (items || []).reduce((sum, item) => {
    const price = Number(item && item.price) || 0
    const quantity = Math.max(1, Math.min(99, Math.floor(Number(item && (item.quantity ?? item.qty)) || 1)))
    const ratio = normalizeDepositRatio(item && (item.depositRatio ?? item.depositRate), fallbackRatio)
    return sum + price * quantity * ratio
  }, 0)
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

function validateBookingForm(data = {}) {
  if (!String(data.name || '').trim()) return { valid: false, message: '请输入姓名' }
  if (!isValidPhone(data.phone)) return { valid: false, message: '手机号格式错误' }
  if (!data.agreed) return { valid: false, message: '请同意预约须知' }
  const items = data.items || []
  if (!items.length) return { valid: false, message: '请至少添加一个拍摄项目' }
  if (items.some(item => item.peripheralId)) return { valid: false, message: '周边仅支持咨询客服，不能加入预约' }
  if ((data.date && !data.time) || (!data.date && data.time)) return { valid: false, message: '请选择完整的拍摄日期和时间' }
  return { valid: true, message: '' }
}

function buildBookingPayload(data = {}) {
  const items = data.items || []
  const contactPhones = [data.phone, ...(data.contactPhones || [])]
    .map(phone => String(phone || '').trim())
    .filter((phone, index, list) => phone && list.indexOf(phone) === index)
  const config = data.bookingConfig || {}
  const agreementVersion = String(
    data.agreementVersion || config.bookingNoticeVersion || config.agreementVersion || 'v1.0'
  ).trim()
  return {
    shopId: data.shopId || '',
    scene: data.scene || '',
    name: String(data.name || '').trim(),
    phone: String(data.phone || '').trim(),
    contactPhones,
    message: data.message || '',
    date: data.date || '',
    timePeriod: data.time || '',
    items,
    totalPrice: sumItemsPrice(items),
    depositRatio: normalizeDepositRatio(data.depositRatio, 0.3),
    participantCount: Number(data.participantCount || 1),
    bookingMode: 'consult',
    // The server checks the exact notice version, so the checkbox state must
    // travel with the request instead of being kept only in page state.
    agreement: {
      version: agreementVersion,
      current: data.agreed === true
    },
    agreementVersion,
    agreementCurrent: data.agreed === true,
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
    quantity: 1,
    defaultPrice: Number(defaultPrice || album.price || 0),
    depositRatio: album.depositRatio ?? series.depositRatio ?? pkg.depositRatio
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
    quantity: 1,
    defaultPrice: album.price || 0,
    depositRatio: pkg.depositRatio ?? series.depositRatio
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
    quantity: 1,
    defaultPrice: 0,
    depositRatio: peripheral.depositRatio
  }
}

module.exports = {
  isValidPhone,
  isPastDate,
  sumItemsPrice,
  sumDepositDue,
  validateBookingForm,
  buildBookingPayload,
  buildPrefillItem,
  filterSeriesBySpot,
  filterPackagesBySpot,
  buildItemFromPackage,
  buildItemFromPeripheral
}
