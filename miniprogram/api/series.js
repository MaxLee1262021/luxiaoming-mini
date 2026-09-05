const { callCloud } = require('./client')

function getSeriesDetail(params = {}) {
  return callCloud('getSeriesDetail', params)
}

function getSeriesList(params = {}) {
  return callCloud('getSeriesList', params)
}

module.exports = {
  getSeriesDetail,
  getSeriesList
}
