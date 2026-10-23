const { callCloud } = require('./client')

function checkFavorite(params = {}) {
  return callCloud('checkFavorite', params)
}

function toggleFavorite(params = {}) {
  return callCloud('toggleFavorite', params)
}

function getMyFavorites(params = {}) {
  return callCloud('getMyFavorites', params)
}

function addFavorite(params = {}) {
  return callCloud('addFavorite', params)
}

function removeFavorite(params = {}) {
  return callCloud('removeFavorite', params)
}

module.exports = {
  checkFavorite,
  toggleFavorite,
  getMyFavorites,
  addFavorite,
  removeFavorite
}
