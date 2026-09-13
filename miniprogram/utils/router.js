/**
 * utils/router.js — 统一的页面路由表
 * 首页 Banner 跳转（homeData.getBannerTarget）与首页快捷入口（index.goQuickNav）共用，
 * 不再两份各写一份 routeMap。targetType → 页面路径 + 打开方式（navigateTo / switchTab）。
 */

const ROUTES = {
  // 详情 / 列表（带 id 的用 PARAM_KEY 映射参数名）
  spot:          { path: '/pages/spotSheet/spotSheet', method: 'navigateTo' },
  spot_list:     { path: '/pages/explore/explore', method: 'switchTab' },
  spots:         { path: '/pages/explore/explore', method: 'switchTab' },
  all_spots:     { path: '/pages/explore/explore', method: 'switchTab' },
  package:       { path: '/pages/photoPackageDetail/photoPackageDetail', method: 'navigateTo' },
  photo_package: { path: '/pages/photoPackageDetail/photoPackageDetail', method: 'navigateTo' },
  package_list:  { path: '/pages/search/search', method: 'navigateTo' },
  packages:      { path: '/pages/search/search', method: 'navigateTo' },
  video_product: { path: '/pages/videoProductDetail/videoProductDetail', method: 'navigateTo' },
  video_single:  { path: '/pages/videoProductDetail/videoProductDetail', method: 'navigateTo' },
  video:         { path: '/pages/videoProductDetail/videoProductDetail', method: 'navigateTo' },
  videos:        { path: '/pages/explore/explore', method: 'switchTab' },
  video_list:    { path: '/pages/explore/explore', method: 'switchTab' },
  album:         { path: '/pages/photoCollection/photoCollection', method: 'navigateTo' },
  albums:        { path: '/pages/search/search', method: 'navigateTo' },
  album_list:    { path: '/pages/search/search', method: 'navigateTo' },
  booking_albums: { path: '/pages/search/search', method: 'navigateTo' },
  photo:         { path: '/pages/photoCollection/photoCollection', method: 'navigateTo' },
  photos:        { path: '/pages/search/search', method: 'navigateTo' },
  photo_list:    { path: '/pages/search/search', method: 'navigateTo' },
  photo_collection: { path: '/pages/photoCollection/photoCollection', method: 'navigateTo' },
  peripheral:    { path: '/pages/peripheralDetail/peripheralDetail', method: 'navigateTo' },
  peripherals:   { path: '/pages/peripherals/peripherals', method: 'navigateTo' },
  explore:       { path: '/pages/explore/explore', method: 'switchTab' },
  guide:         { path: '/pages/guideDetail/guideDetail', method: 'navigateTo' },
  guides:        { path: '/pages/guideList/guideList', method: 'navigateTo' },
  guide_list:    { path: '/pages/guideList/guideList', method: 'navigateTo' },
  booking:       { path: '/pages/bookingInfo/bookingInfo', method: 'navigateTo' },
  my:            { path: '/pages/my/my', method: 'switchTab' }
}

// targetType → 跳转所带参数名（未列出的类型不带参）
const PARAM_KEY = {
  spot: 'id',
  package: 'packageId',
  photo_package: 'packageId',
  album: 'albumId',
  photo: 'albumId',
  photo_collection: 'albumId',
  video_product: 'productId',
  video_single: 'productId',
  video: 'productId',
  guide: 'id',
  peripheral: 'id'
}

// 统一处理下划线、短横线和驼峰写法，避免后台 targetType 变体静默失配。
function normalizeRouteKey(type = '') {
  return String(type || '')
    .trim()
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
}

const ROUTE_BY_KEY = {}
Object.keys(ROUTES).forEach(k => { ROUTE_BY_KEY[k.toLowerCase()] = ROUTES[k] })
const PARAM_BY_KEY = {}
Object.keys(PARAM_KEY).forEach(k => { PARAM_BY_KEY[k.toLowerCase()] = PARAM_KEY[k] })

function buildTarget(type = '', id = '') {
  const key = normalizeRouteKey(type)
  const route = ROUTE_BY_KEY[key]
  if (!route) return null
  const paramKey = PARAM_BY_KEY[key]
  // 保留旧版 `video` 入口的列表语义；配置了 targetId 时才直达视频详情。
  if (key === 'video' && !String(id || '').trim()) {
    return { method: 'switchTab', path: '/pages/explore/explore', params: {} }
  }
  if (paramKey && !String(id || '').trim()) return null
  const params = (paramKey && id) ? { [paramKey]: id } : {}
  return { method: route.method || 'navigateTo', path: route.path, params }
}

// 直接按 targetType 跳转（首页快捷入口用）。buildUrl 可选，用于把参数拼到 url 上。
function navigateToType(type = '', id = '', buildUrl) {
  const target = buildTarget(type, id)
  if (!target) return false
  if (target.method === 'switchTab') {
    wx.switchTab({ url: target.path })
  } else {
    const url = typeof buildUrl === 'function' ? buildUrl(target.path, target.params) : target.path
    wx.navigateTo({ url })
  }
  return true
}

module.exports = {
  ROUTES,
  PARAM_KEY,
  buildTarget,
  navigateToType,
  normalizeRouteKey
}
