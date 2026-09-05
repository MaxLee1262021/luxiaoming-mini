// 城市列表：探索页「城市」切换。
// 自托管后台 `getCities` RPC 就绪后返回真实城市（读后台 `cities` 集合）；
// 未接后台 / 请求失败时由调用方回退本地兜底城市列表（见 pages/explore/explore.js 的 FALLBACK_CITIES）。
const { callCloud } = require('./client')

function getCities(params = {}) {
  return callCloud('getCities', params)
}

module.exports = {
  getCities
}
