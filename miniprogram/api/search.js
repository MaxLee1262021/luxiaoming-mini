const demoData = require('../utils/demoData')
const { callCloud } = require('./client')
const homeApi = require('./home')
const { isExplicitDemoMode } = require('../config/env')
const { normalizePackage, normalizePackageList, isVideo, filterVisibleProducts } = require('../utils/product')
const { isVideoSingle } = require('../service/videoProductDetail')

// 搜索热词兜底：后台 getSearchConfig 未就绪 / 请求失败时使用，保证页面不白屏。
const DEFAULT_HOT_KEYWORDS = ['橘子洲旅拍', 'IFS夜景视频摄像', '岳麓山亲子', '太平老街古风', '闺蜜写真', '城市漫步']

// 搜索配置：热词（全站搜索同源：搜索页热门 + 首页搜索框占位词/下拉热门）。
// 自托管后台 `getSearchConfig` RPC 就绪后返回 siteConfig('global').search.hotWords；
// 未接后台 / 请求失败时由调用方回退内置默认热词，页面零回归。
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
  const packages = normalizePackageList(filterVisibleProducts(packageRows))
  const videos = mergeByIdentity(
    data.videoSingles,
    data.videoProducts,
    packages.filter(isVideoSingle)
  ).filter(isVideoSingle).filter(item => filterVisibleProducts([item]).length)
    .map(item => normalizeSearchVideoItem(item))
  return {
    spots: Array.isArray(data.spots) ? data.spots : [],
    packages: packages.filter(item => !isVideo(item)),
    videos,
    series: Array.isArray(data.series) ? data.series : [],
    guides: Array.isArray(data.guides) ? data.guides : []
  }
}

function demoCatalog() {
  return normalizeCatalog({
    spots: demoData.spots,
    packages: demoData.packages,
    videoProducts: demoData.videoProducts,
    series: demoData.series,
    guides: demoData.guides
  })
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
  const routes = [
    {
      id: 'route-night',
      title: '夜景高光短视频路线',
      desc: 'IFS 国金中心 - 黄兴路 - 杜甫江阁',
      tag: '视频摄像',
      spotIds: ['demo-spot-ifs', 'demo-spot-huangxing', 'demo-spot-dufu']
    },
    {
      id: 'route-family',
      title: '亲子自然光旅拍路线',
      desc: '橘子洲 - 岳麓山 - 湘江边',
      tag: '亲子',
      spotIds: ['demo-spot-orange', 'demo-spot-yuelu']
    },
    {
      id: 'route-citywalk',
      title: '城市漫步街拍路线',
      desc: '太平老街 - 黄兴路 - IFS',
      tag: '写真',
      spotIds: ['demo-spot-taiping', 'demo-spot-huangxing', 'demo-spot-ifs']
    }
  ]

  let catalog
  try {
    catalog = await getCatalogFromServer()
  } catch (error) {
    if (!isExplicitDemoMode()) throw error
    catalog = demoCatalog()
  }
  const promotedPackages = catalog.packages.filter(item => item.isHot || item.isHotSale || item.isMainPush || item.mainPush || item.isFeatured)

  // 热词优先从后台配置取，失败 / 为空时回退内置默认（与老页面一致，零回归）
  let hotKeywords = DEFAULT_HOT_KEYWORDS
  try {
    const res = await getSearchConfig()
    const hotWords = res && res.success && res.data && Array.isArray(res.data.hotWords)
      ? res.data.hotWords.filter(w => w && String(w).trim())
      : []
    if (hotWords.length) hotKeywords = hotWords
  } catch (err) {
    console.warn('getSearchConfig fallback', err)
  }

  return {
    success: true,
    data: {
      hotKeywords,
      routes,
      spots: catalog.spots.slice(0, 6),
      packages: (promotedPackages.length ? promotedPackages : catalog.packages).slice(0, 6),
      videos: catalog.videos.slice(0, 3),
      guides: catalog.guides.filter(item => item.isHot).slice(0, 3)
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

  let source
  try {
    source = await getCatalogFromServer()
  } catch (error) {
    if (!isExplicitDemoMode()) throw error
    source = demoCatalog()
  }

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
