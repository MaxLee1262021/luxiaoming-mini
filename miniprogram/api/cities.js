// 城市列表：探索页城市切换。
// 非演示模式只读取后台 cities 集合，不以本地城市替代真实配置。
const { callCloud } = require('./client')

function getCities(params = {}) {
  return callCloud('getCities', params)
}

module.exports = {
  getCities
}
