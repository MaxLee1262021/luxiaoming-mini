const DEFAULT_HOME_MODULES = [
  { key: 'hotSpots', title: '预约打卡点', visible: true, sort: 10 },
  { key: 'features', title: '特色专区', visible: true, sort: 20 },
  { key: 'bookingAlbums', title: '照片留影', visible: true, sort: 30 },
  { key: 'videoProducts', title: '视频摄像', visible: true, sort: 40 },
  { key: 'hotPackages', title: '旅拍套餐', visible: true, sort: 50 },
  { key: 'peripherals', title: '影像周边', visible: true, sort: 60 }
]

function isBrokenText(value) {
  const text = String(value || '').trim()
  if (!text) return false
  const questionCount = (text.match(/\?/g) || []).length
  return questionCount >= 3 && questionCount / text.length > 0.5
}

function mergeModuleConfig(fallback = {}, item = {}) {
  const next = { ...fallback, ...item }
  ;['title', 'subtitle', 'moreText'].forEach(key => {
    if (isBrokenText(item[key])) next[key] = fallback[key] || ''
  })
  return next
}

function normalizeModuleConfig(modules = [], fallback = DEFAULT_HOME_MODULES) {
  const byKey = {}
  ;(fallback || []).forEach(item => {
    byKey[item.key] = { ...item }
  })
  ;(modules || []).forEach(item => {
    if (!item || !item.key) return
    byKey[item.key] = mergeModuleConfig(byKey[item.key] || {}, item)
  })

  return Object.keys(byKey)
    .map(key => byKey[key])
    .filter(item => item.visible !== false)
    .sort((a, b) => (a.sort || 0) - (b.sort || 0))
}

function buildModuleConfigMap(modules = []) {
  return (modules || []).reduce((map, item) => {
    if (item && item.key) {
      map[item.key] = item
    }
    return map
  }, {})
}

module.exports = {
  DEFAULT_HOME_MODULES,
  buildModuleConfigMap,
  normalizeModuleConfig
}
