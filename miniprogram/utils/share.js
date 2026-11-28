// 全站分享统一配置
// 页面可自行定义分享路径和参数，标题统一使用 BRAND_TITLE。
// 未定义的页面由 app.js 全局兜底注入，保证右上角菜单「转发 / 分享到朋友圈」全站可用。
// 详情分享只携带定位公开内容所需的参数，不复制会话、订单或商家扫码来源。

const { buildUrl, buildQuery } = require('./query')

const BRAND_TITLE = '麓小鸣旅拍·记录城市与你的故事'

function getCurrentPage() {
  try {
    const pages = getCurrentPages()
    return pages && pages.length ? pages[pages.length - 1] : null
  } catch (e) {
    return null
  }
}

function getCurrentRoute() {
  const page = getCurrentPage()
  return page && page.route ? '/' + page.route.replace(/^\//, '') : '/pages/index/index'
}

function getShareTarget(page) {
  const current = page && page.route ? page : (getCurrentPage() || {})
  const path = '/' + (current.route || 'pages/index/index').replace(/^\//, '')
  const data = current.data || {}
  const options = current.options || {}
  let params = {}

  // 使用页面已解析的内容标识，保证从系列入口进入后再分享仍指向当前商品。
  // 每个路由单独列出参数，不能将 options 或 data 整体拼入分享链接。
  if (path === '/pages/guideDetail/guideDetail') {
    const guide = data.guide || {}
    params = { id: guide._id || guide.id || data.id || options.id || '' }
  } else if (path === '/pages/photoPackageDetail/photoPackageDetail') {
    const selected = data.selectedPackage || {}
    const series = data.seriesInfo || {}
    params = {
      packageId: selected._id || selected.id || data.packageId || options.packageId || '',
      seriesId: data.seriesId || series._id || series.id || options.id || options.seriesId || '',
      spotId: data.spotId || selected.spotId || options.spotId || ''
    }
  } else if (path === '/pages/videoProductDetail/videoProductDetail') {
    const product = data.product || {}
    params = {
      productId: product._id || product.id || data.productId || options.productId || options.packageId || options.id || '',
      spotId: data.spotId || product.spotId || options.spotId || ''
    }
  } else if (path === '/pages/photoCollection/photoCollection') {
    const collection = data.currentCollection || {}
    const series = data.series || {}
    // 系列列表也可能有 currentCollection，不能因此将列表分享成某张单品详情。
    const albumId = data.isAlbumDetail
      ? (collection._id || collection.albumId || data.pendingAlbumId || options.albumId || '')
      : (data.pendingAlbumId || options.albumId || '')
    params = {
      albumId,
      seriesId: series._id || series.id || collection.seriesId || options.seriesId || '',
      spotId: data.currentSpotId || collection.spotId || options.spotId || '',
      focusAlbumId: data.focusAlbumId || options.focusAlbumId || ''
    }
  }
  return { path, params }
}

// 默认分享卡片：统一品牌口吻，详情页携带内容标识。
function defaultShare() {
  const target = getShareTarget(this)
  return {
    title: BRAND_TITLE,
    path: buildUrl(target.path, target.params)
  }
}

// 默认朋友圈分享（朋友圈仅支持 title + query，不传 path）
function defaultTimeline() {
  const target = getShareTarget(this)
  const query = buildQuery(target.params)
  return {
    title: BRAND_TITLE,
    ...(query ? { query } : {})
  }
}

module.exports = { defaultShare, defaultTimeline, getCurrentRoute, BRAND_TITLE }
