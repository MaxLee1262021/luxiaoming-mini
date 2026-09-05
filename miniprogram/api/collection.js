const { callCloud } = require('./client')

function getPhotoCollection(params = {}) {
  return callCloud('getPhotoCollection', params)
}

module.exports = {
  getPhotoCollection
}
