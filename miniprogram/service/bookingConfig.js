// 预约配置服务：约拍定制定价 + 预约须知（单一数据源）。
// 数据源 = 自托管后台 `getBookingConfig` RPC（读 siteConfig('global') 的 customPrice / bookingNotice）；
// 未接后台 / 请求失败时回退内置默认值（与原硬编码一致，零回归）。
// 全站共享此单例：bookingInfo 页（计算/展示）与 lxm-custom-booking-card 组件（约拍定制入口价格展示）统一从这里取数，
// 运营在后台改一次定价，全站入口与提交计算自动同步。
const bookingConfigApi = require('../api/bookingConfig')

const DEFAULT_CONFIG = {
  customPrice: { single: 200, extraPerPerson: 100 },
  bookingNotice: '1. 建议提前预约，方便安排摄影师和拍摄路线。\n2. 拍摄当天请准时到达约定地点。\n3. 如遇天气原因，可联系客服协商改期。\n4. 照片和短视频交付周期以旅拍套餐详情为准。'
}

let cached = null // 已成功加载的配置
let loading = null // 进行中的拉取 Promise（并发复用，只请求一次）

function getConfig() {
  return cached || DEFAULT_CONFIG
}

// 拉取真实配置（幂等：只请求一次，成功后缓存；失败保留默认值，不抛错）
function ensureLoaded() {
  if (cached) return Promise.resolve(cached)
  if (loading) return loading
  loading = bookingConfigApi.getBookingConfig({})
    .then(res => {
      const d = (res && res.success && res.data) || {}
      cached = {
        customPrice: Object.assign({}, DEFAULT_CONFIG.customPrice, d.customPrice || {}),
        bookingNotice: d.bookingNotice || DEFAULT_CONFIG.bookingNotice
      }
      return cached
    })
    .catch(err => {
      console.warn('bookingConfig load failed, use default', err)
      cached = DEFAULT_CONFIG
      return DEFAULT_CONFIG
    })
    .finally(() => { loading = null })
  return loading
}

// 约拍定制单人价（默认价）
function singlePrice() {
  return getConfig().customPrice.single
}

// 按参与人数计算约拍定制价：单人价 + (人数-1) * 每加1人价
function calcCustomPrice(count = 1) {
  const { single, extraPerPerson } = getConfig().customPrice
  return single + (Math.max(1, Number(count) || 1) - 1) * extraPerPerson
}

// 定价规则文案（展示给客人，随配置动态生成）
function buildCustomRuleText() {
  const { single, extraPerPerson } = getConfig().customPrice
  return `单人 1 小时 ¥${single}，每增加 1 人每小时 +¥${extraPerPerson}`
}

// 构建「约拍定制」商品项（bookingInfo 页 3 处调用统一走这里，消除重复写死）
function buildCustomItem({ count = 1, spotId = '', spotName = '', requestedSpot = '' } = {}) {
  return {
    spotId,
    spotName,
    seriesId: '',
    seriesName: '',
    albumId: '',
    albumName: '',
    packageId: '',
    packageName: '约拍定制',
    price: calcCustomPrice(count),
    defaultPrice: singlePrice(),
    custom: true,
    pricingRule: buildCustomRuleText(),
    serviceType: 'custom'
  }
}

module.exports = {
  DEFAULT_CONFIG,
  getConfig,
  ensureLoaded,
  singlePrice,
  calcCustomPrice,
  buildCustomRuleText,
  buildCustomItem
}
