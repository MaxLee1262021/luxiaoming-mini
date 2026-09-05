function parseScene(rawScene = '') {
  if (!rawScene) return {}
  let decoded = rawScene
  try {
    decoded = decodeURIComponent(rawScene)
  } catch (e) {
    console.warn('scene decode failed', e)
  }

  return decoded.split('&').reduce((result, pair) => {
    const [key, value = ''] = pair.split('=')
    if (key) result[key] = value
    return result
  }, {})
}

function buildQuery(params = {}) {
  return Object.keys(params)
    .filter(key => params[key] !== undefined && params[key] !== '')
    .map(key => `${key}=${encodeURIComponent(params[key])}`)
    .join('&')
}

function buildUrl(path, params = {}) {
  const query = buildQuery(params)
  return query ? `${path}?${query}` : path
}

function buildUrlWithSource(path, params = {}, source = {}) {
  return buildUrl(path, {
    ...params,
    shopId: params.shopId || source.shopId || '',
    scene: params.scene || source.scene || ''
  })
}

function decodeQueryValue(value = '') {
  if (value === undefined || value === null) return ''
  const text = String(value)
  try {
    return decodeURIComponent(text)
  } catch (e) {
    console.warn('query value decode failed', e)
    return text
  }
}

function decodeQueryFields(options = {}, keys = []) {
  return keys.reduce((result, key) => {
    result[key] = decodeQueryValue(options[key] || '')
    return result
  }, {})
}

module.exports = {
  parseScene,
  buildUrl,
  buildUrlWithSource,
  decodeQueryValue,
  decodeQueryFields
}
