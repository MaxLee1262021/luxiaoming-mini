const { callCloud } = require('./client')

function getGuides(params = {}) {
  return callCloud('getGuides', params)
}

module.exports = {
  getGuides
}
