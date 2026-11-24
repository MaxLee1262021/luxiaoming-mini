const contentOrder = require('../utils/contentOrder')
const { callCloud } = require('./client')
const homeApi = require('./home')
const { normalizePackage, normalizePackageList, isVideo, filterVisibleProducts } = require('../utils/product')
const { isVideoSingle } = require('../service/videoProductDetail')
const { publicGuides } = require('../utils/guideContent')

// 搜索热词由真实后台配置提供。
function getSearchConfig(params = {}) {
  return callCloud('getSearchConfig', params)
}

// 中文友好的搜索分词：保留完整词，并补充相邻 2-gram。
// 解决"输入比数据长"搜不到的问题——如搜索"橘子洲旅拍"应能命中数据里的"橘子洲"。
function buildSearchTokens(keyword = '') {
  const q = String(keyword || '').trim().toLowerCase()
  if (!q) return []
  const tokens = [q]
  if (q.length >= 2) {
    for (let i = 0; i + 2 <= q.length; i++) {
      tokens.push(q.substr(i, 2))
    }
  }
  return tokens
}

function filterPhotoPackages(list = []) {
  return normalizePackageList(filterVisibleProducts(list)).filter(item => !isVideo(item))
}

function mergeByIdentity(...lists) {
  const seen = new Set()
  const output = []
  lists.forEach(list => {
    ;(Array.isArray(list) ? list : []).forEach(item => {
      if (!item) return
      const key = String(item._id || item.id || item.packageId || item.productId || item.name || '')
      if (!key || seen.has(key)) return
      seen.add(key)
      output.push(item)
    })
  })
  return output
}

function normalizeCatalog(data = {}) {
  const packageRows = mergeByIdentity(data.packages, data.allPackages, data.hotPackages)
  const packages = normalizePackageList(filterVisibleProducts(packageRows)).sort((a, b) => contentOrder.compare('packages', a, b))
  const videos = mergeByIdentity(
    data.videoSingles,
    data.videoProducts,
    packages.filter(isVideoSingle)
  ).filter(isVideoSingle).filter(item => filterVisibleProducts([item]).length)
    .map(item => normalizeSearchVideoItem(item)).sort((a, b) => contentOrder.compare('packages', a, b))
  return {
    spots: Array.isArray(data.spots) ? data.spots : [],
    packages: packages.filter(item => !isVideo(item)),
    videos,
    series: Array.isArray(data.series) ? data.series : [],
    guides: publicGuides(data.guides)
  }
}


async function getCatalogFromServer() {
  const result = await homeApi.getHomeData()
  if (!result || !result.success) {
    throw new Error((result && (result.error || result.message)) || '套餐目录暂不可用')
  }
  return normalizeCatalog(result.data || {})
}

function normalizeSearchVideoItem(item = {}) {
  const normalized = normalizePackage(item)
  const single = isVideoSingle(normalized)
  return {
    ...normalized,
    displayType: 'video',
    isVideo: true,
    videoCardVariant: single ? 'single' : 'package',
    name: item.name || item.title || '',
    videoDuration: item.videoDuration || item.durationText || '',
    finishedVideoCount: item.finishedVideoCount === undefined ? '' : item.finishedVideoCount
  }
}

async function getSearchHome() {
  const routes = []

  const catalog = await getCatalogFromServer()
  const promotedPackages = catalog.packages.filter(item => item.isHot || item.isHotSale || item.isMainPush || item.mainPush || item.isFeatured)

  // 热词只使用后台返回的配置。
  let hotKeywords = []
  try {
    const res = await getSearchConfig()
    const hotWords = res && res.success && res.data && Array.isArray(res.data.hotWords)
      ? res.data.hotWords.filter(w => w && String(w).trim())
      : []
    if (hotWords.length) hotKeywords = hotWords
  } catch (err) {
    console.warn('getSearchConfig failed', err)
  }

  return {
    success: true,
    data: {
      hotKeywords,
      routes,
      spots: catalog.spots.slice(0, 6),
      packages: (promotedPackages.length ? promotedPackages : catalog.packages).slice(0, 6),
      videos: catalog.videos.slice(0, 3),
      guides: catalog.guides.filter(item => item.isTop || item.isHot).slice(0, 3)
    }
  }
}

async function search({ keyword = '' } = {}) {
  const value = String(keyword || '').trim()
  const tokens = buildSearchTokens(value)
  const matchText = item => {
    if (!tokens.length) return false
    const hay = JSON.stringify(item).toLowerCase()
    return tokens.some(t => hay.includes(t))
  }
  if (!value) {
    return getSearchHome()
  }

  const source = await getCatalogFromServer()

  return {
    success: true,
    data: {
      keyword: value,
      spots: source.spots.filter(matchText),
      packages: source.packages.filter(matchText),
      series: source.series.filter(matchText),
      guides: source.guides.filter(matchText),
      videos: source.videos.filter(matchText)
    }
  }
}

module.exports = {
  getSearchHome,
  getSearchConfig,
  search
}
