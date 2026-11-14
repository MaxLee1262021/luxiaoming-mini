// 预约价格及须知只读取真实后台；缺失配置保持不可用，不生成本地报价。
const bookingConfigApi = require('../api/bookingConfig')
const EMPTY_CONFIG = Object.freeze({ customPrice: Object.freeze({ single: null, extraPerPerson: null }), depositRatio: null, bookingNotice: '', bookingNoticeVersion: '' })
let cached = null
let loading = null
let latestRequest = null
let loadVersion = 0
function getConfig() { return cached || EMPTY_CONFIG }
function numberOrNull(value) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}
function normalizeDepositRatio(value) {
  const number = numberOrNull(value)
  return number === null || number > 100 ? null : number > 1 ? number / 100 : number
}
function ensureLoaded(refresh = false) {
  if (refresh) cached = null
  if (cached) return Promise.resolve(cached)
  if (loading && !refresh) return loading
  const version = ++loadVersion
  const request = Promise.resolve().then(() => bookingConfigApi.getBookingConfig({})).then(res => {
    // A refresh supersedes earlier requests, even if an older response arrives last.
    if (version !== loadVersion) return latestRequest
    if (!res || !res.success || !res.data || typeof res.data !== 'object') throw new Error('预约配置加载失败，请稍后重试')
    const data = res.data
    const price = data.customPrice || {}
    cached = {
      customPrice: { single: numberOrNull(price.single ?? price.singlePersonPrice), extraPerPerson: numberOrNull(price.extraPerPerson ?? price.perExtraPerson) },
      depositRatio: normalizeDepositRatio(data.depositRatio ?? data.depositRate),
      bookingNotice: typeof data.bookingNotice === 'string' ? data.bookingNotice.trim() : '',
      bookingNoticeVersion: String(data.bookingNoticeVersion || data.agreementVersion || '').trim()
    }
    return cached
  }).catch(error => {
    if (version !== loadVersion) return latestRequest
    throw error
  }).finally(() => { if (version === loadVersion) loading = null })
  loading = latestRequest = request
  return request
}
function singlePrice() { return getConfig().customPrice.single }
function calcCustomPrice(count = 1) {
  const { single, extraPerPerson } = getConfig().customPrice
  const people = Math.max(1, Number(count) || 1)
  if (single === null || people > 1 && extraPerPerson === null) return null
  return single + (people - 1) * (extraPerPerson || 0)
}
function buildCustomRuleText() {
  const { single, extraPerPerson } = getConfig().customPrice
  if (single === null) return ''
  return '单人 1 小时 ¥' + single + (extraPerPerson === null ? '' : '，每增加 1 人每小时 +¥' + extraPerPerson)
}
function buildCustomItem({ count = 1, spotId = '', spotName = '', requestedSpot = '' } = {}) {
  return { spotId, spotName, seriesId: '', seriesName: '', albumId: '', albumName: '', packageId: '', packageName: '约拍定制', price: calcCustomPrice(count), defaultPrice: singlePrice(), custom: true, participantCount: Math.max(1, Number(count) || 1), requestedSpot: requestedSpot || spotName || '', pricingRule: buildCustomRuleText(), serviceType: 'custom', depositRatio: getConfig().depositRatio }
}
module.exports = { EMPTY_CONFIG, getConfig, ensureLoaded, singlePrice, calcCustomPrice, buildCustomRuleText, buildCustomItem, normalizeDepositRatio }
