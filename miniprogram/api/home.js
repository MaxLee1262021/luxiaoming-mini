const { callCloud } = require('./client')

function getHomeData(params = {}) {
  return callCloud('getHomeData', params)
}

module.exports = {
  getHomeData
}
