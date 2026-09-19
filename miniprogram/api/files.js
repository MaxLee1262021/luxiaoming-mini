const { requestAuthenticated, normalizeMediaUrls } = require('./client')

function createIntent(data) { return requestAuthenticated('/files/upload-intent', data) }
function complete(fileId) { return requestAuthenticated('/files/' + encodeURIComponent(fileId) + '/complete') }
function access(fileId, download = false) { return requestAuthenticated('/files/' + encodeURIComponent(fileId) + '/access', { download }) }

module.exports = { createIntent, complete, access, normalizeMediaUrls }
