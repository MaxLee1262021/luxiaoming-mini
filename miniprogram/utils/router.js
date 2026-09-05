/**
 * utils/router.js — 统一的页面路由表
 * 首页 Banner 跳转（homeData.getBannerTarget）与首页快捷入口（index.goQuickNav）共用，
 * 不再两份各写一份 routeMap。targetType → 页面路径 + 打开方式（navigateTo / switchTab）。
 */

const ROUTES = {
  // 详情 / 列表（带 id 的用 PARAM_KEY 映射参数名）
  spot:          { path: '/pages/spotSheet/spotSheet', method: 'navigateTo' },
  package:       { path: '/pages/photoPackageDetail/photoPackageDetail', method: 'navigateTo' },
  photo_package: { path: '/pages/photoPackageDetail/photoPackageDetail', method: 'navigateTo' },
  video_product: { path: '/pages/videoProductDetail/videoProductDetail', method: 'navigateTo' },
  video_single:  { path: '/pages/videoProductDetail/videoProductDetail', method: 'navigateTo' },
  video:         { path: '/pages/explore/explore', method: 'switchTab' },
  videos:        { path: '/pages/explore/explore', method: 'switchTab' },
  peripheral:    { path: '/pages/peripheralDetail/peripheralDetail', method: 'navigateTo' },
  peripherals:   { path: '/pages/peripherals/peripherals', method: 'navigateTo' },
  explore:       { path: '/pages/explore/explore', method: 'switchTab' },
  guide:         { path: '/pages/guideDetail/guideDetail', method: 'navigateTo' },
  guides:        { path: '/pages/guideList/guideList', method: 'navigateTo' },
  my:            { path: '/pages/my/my', method: 'switchTab' }
}

// targetType → 跳转所带参数名（未列出的类型不带参）
const PARAM_KEY = {
  spot: 'id',
  package: 'packageId',
  photo_package: 'packageId',
  video_product: 'productId',
  video_single: 'productId',
  guide: 'id',
  peripheral: 'id'
}

// 大小写不敏感查找（数据里的 targetType 可能是 bookingAlbums 这类驼峰，避免静默匹配失败）
const ROUTE_BY_KEY = {}
Object.keys(ROUTES).forEach(k => { ROUTE_BY_KEY[k.toLowerCase()] = ROUTES[k] })
const PARAM_BY_KEY = {}
Object.keys(PARAM_KEY).forEach(k => { PARAM_BY_KEY[k.toLowerCase()] = PARAM_KEY[k] })

function buildTarget(type = '', id = '') {
  const key = String(type || '').toLowerCase()
  const route = ROUTE_BY_KEY[key]
  if (!route) return null
  const paramKey = PARAM_BY_KEY[key]
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
  navigateToType
}
