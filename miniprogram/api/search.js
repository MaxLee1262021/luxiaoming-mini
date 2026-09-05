const demoData = require('../utils/demoData')
const { callCloud } = require('./client')
const { normalizePackage, normalizePackageList, isVideo } = require('../utils/product')
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
  return normalizePackageList(list).filter(item => !isVideo(item))
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
    finishedVideoCount: item.finishedVideoCount || '1条成片'
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
      spots: demoData.spots.slice(0, 6),
      packages: filterPhotoPackages(demoData.packages).filter(item => item.isHot).slice(0, 6),
      videos: demoData.videoProducts.map(item => normalizeSearchVideoItem(item)).slice(0, 3),
      guides: demoData.guides.filter(item => item.isHot).slice(0, 3)
    }
  }
}

function search({ keyword = '' } = {}) {
  const value = String(keyword || '').trim()
  const tokens = buildSearchTokens(value)
  const matchText = item => {
    if (!tokens.length) return false
    const hay = JSON.stringify(item).toLowerCase()
    return tokens.some(t => hay.includes(t))
  }
  const source = {
    spots: demoData.spots,
    packages: demoData.packages,
    series: demoData.series,
    guides: demoData.guides,
    videos: demoData.videoProducts.map(item => normalizeSearchVideoItem(item))
  }

  if (!value) {
    return getSearchHome()
  }

  return Promise.resolve({
    success: true,
    data: {
      keyword: value,
      spots: source.spots.filter(matchText),
      packages: filterPhotoPackages(source.packages).filter(matchText),
      series: source.series.filter(matchText),
      guides: source.guides.filter(matchText),
      videos: source.videos.filter(matchText)
    }
  })
}

module.exports = {
  getSearchHome,
  getSearchConfig,
  search
}
