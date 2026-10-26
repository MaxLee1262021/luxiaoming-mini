const { normalizePackage, sortByHotScore, filterVisibleProducts, filterStorePeripherals, isVideoSingle } = require('../utils/product')
const { buildModuleConfigMap, normalizeModuleConfig } = require('./pageConfig')
const { filterPhotoSeries } = require('../utils/catalog')
const { buildTarget } = require('../utils/router')
const { normalizeAlbumPresentation } = require('../utils/albumPresentation')

function mergePreviewList(list = [], fallback = []) {
  const seen = {}
  return [...(list || []), ...(fallback || [])].filter(item => {
    if (!item) return false
    const key = String(item._id || item.id || item.packageId || item.name || JSON.stringify(item))
    if (seen[key]) return false
    seen[key] = true
    return true
  })
}

function mergeManyLists(...lists) {
  return (lists || []).reduce((result, list) => mergePreviewList(result, list), [])
}

function packageIdentity(item = {}) {
  return String(item._id || item.id || item.packageId || item.name || '')
}

function collectPackageRecommendationIds(...configs) {
  const ids = new Set()
  const add = value => {
    if (value && typeof value === 'object') value = value._id || value.id || value.packageId
    if (value !== undefined && value !== null && String(value).trim()) ids.add(String(value))
  }
  const read = config => {
    if (!config || typeof config !== 'object') return
    const fields = ['hotPackageIds', 'featuredPackageIds', 'mainPushPackageIds', 'packageIds', 'packages']
    fields.forEach(field => {
      const values = config[field]
      if (Array.isArray(values)) values.forEach(add)
      else if (values && typeof values === 'object') Object.values(values).forEach(add)
    })
    const pages = config.pageModules && typeof config.pageModules === 'object' ? Object.values(config.pageModules) : []
    pages.forEach(page => read(page))
  }
  configs.forEach(read)
  return ids
}

function isGlobalPackage(item = {}) {
  return !item.spotId && !(Array.isArray(item.spotIds) && item.spotIds.length)
}

function isRemovedQuickNav(item = {}) {
  const targetType = String(item.targetType || item.type || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]/g, '_')
  const label = String(item.label || item.name || '').replace(/\s/g, '')
  return ['all_spots', 'allspots', 'spot_list', 'spotlist'].includes(targetType)
    || /^全部.*打卡点$/.test(label)
}

function isVideoBanner(item = {}) {
  const type = String(item.type || item.mediaType || item.fileType || '').toLowerCase()
  const url = String(item.videoUrl || item.url || item.fileID || item.fileId || item.src || '')
  return type === 'video' || /\.(mp4|mov|m4v|webm|m3u8)(\?|$)/i.test(url)
}

function normalizeBanner(item = {}) {
  const isVideo = isVideoBanner(item)
  const url = isVideo
    ? (item.videoUrl || item.url || item.fileID || item.fileId || item.src || '')
    : (item.imageUrl || item.url || item.fileID || item.fileId || item.src || item.cover || '')
  return {
    ...item,
    _id: item._id || item.id || url,
    type: isVideo ? 'video' : 'image',
    mediaType: isVideo ? 'video' : 'image',
    url,
    cover: item.cover || item.poster || item.imageUrl || item.thumbnail || '/images/placeholder.png',
    linkUrl: item.linkUrl || item.jumpUrl || item.targetUrl || item.path || item.pagePath || '',
    targetType: item.targetType || item.linkType || item.jumpType || '',
    targetId: item.targetId || item.linkId || item.jumpId || item.packageId || item.seriesId || item.spotId || item.guideId || ''
  }
}

function normalizeBanners(list = []) {
  return (list || []).map(item => normalizeBanner(item)).filter(item => item.url)
}

function buildBookingAlbums(albums = [], series = [], spots = []) {
  const seriesIds = new Set((series || []).map(item => item._id))
  return (albums || []).filter(album => seriesIds.has(album.seriesId)).map(album => {
    const albumId = album._id || album.albumId || ''
    const currentSeries = series.find(item => item._id === album.seriesId) || {}
    const spotId = album.spotId || (Array.isArray(currentSeries.spotIds) && currentSeries.spotIds[0]) || ''
    const currentSpot = spots.find(item => item._id === spotId) || {}
    const sampleUrls = album.sampleUrls || album.samples || []
    const normalizedAlbum = normalizeAlbumPresentation(album)
    return {
      ...normalizedAlbum,
      _id: albumId,
      albumId,
      seriesId: album.seriesId || currentSeries._id || '',
      spotId,
      spotName: album.spotName || currentSpot.name || '',
      seriesName: album.seriesName || currentSeries.name || '',
      cover: album.cover || album.coverImage || sampleUrls[0] || '/images/placeholder.png',
      sampleCount: normalizedAlbum.photoCount || sampleUrls.length || 0
    }
  }).filter(item => item.albumId && item.seriesId)
}

function buildSpotCardGradient(spot = {}, index = 0) {
  const configuredGradient = spot.cardGradient || spot.themeGradient || spot.gradient
  if (configuredGradient) return configuredGradient

  const colors = spot.accentColors || spot.dominantColors || spot.coverColors
  if (Array.isArray(colors) && colors.length >= 2) {
    return `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 100%)`
  }

  const text = `${spot.name || ''} ${(spot.tags || []).join('')} ${(spot.styles || []).join('')}`
  if (/夜|江|湘江|IFS|霓虹|城市/.test(text)) {
    return 'linear-gradient(135deg, #5657D9 0%, #213C94 100%)'
  }
  if (/岳麓|书院|古风|杜甫|江阁|阁/.test(text)) {
    return 'linear-gradient(135deg, #F2A13A 0%, #C94F32 100%)'
  }
  if (/橘子洲|亲子|草坪|自然|蓝天/.test(text)) {
    return 'linear-gradient(135deg, #2EBF83 0%, #0B8F68 100%)'
  }
  if (/太平|老街|复古|烟火|街/.test(text)) {
    return 'linear-gradient(135deg, #D95448 0%, #9D3C33 100%)'
  }

  const fallbackGradients = [
    'linear-gradient(135deg, #F59B3D 0%, #D95836 100%)',
    'linear-gradient(135deg, #5657D9 0%, #213C94 100%)',
    'linear-gradient(135deg, #D95448 0%, #9D3C33 100%)',
    'linear-gradient(135deg, #2EBF83 0%, #0B8F68 100%)',
    'linear-gradient(135deg, #F0B64C 0%, #E46A35 100%)'
  ]
  return fallbackGradients[index % fallbackGradients.length]
}

function buildHomeSpots(spots = []) {
  return sortByHotScore(spots).slice(0, 8).map((spot, index) => ({
    ...spot,
    cardGradient: buildSpotCardGradient(spot, index)
  }))
}

function buildHomeSeries(series = [], spots = [], albums = [], packages = []) {
  return (series || []).filter(item => {
    const spotIds = Array.isArray(item.spotIds) ? item.spotIds : (item.spotId ? [item.spotId] : [])
    return spotIds.length
  }).slice(0, 8).map(item => {
    const spotIds = Array.isArray(item.spotIds) ? item.spotIds : (item.spotId ? [item.spotId] : [])
    const relatedSpot = spots.find(spot => spotIds.includes(spot._id)) || {}
    const relatedAlbums = albums.filter(album => album.seriesId === item._id)
    const relatedPackages = packages.filter(pkg => pkg.seriesId === item._id || (Array.isArray(item.packageIds) && item.packageIds.includes(pkg._id)))
    return {
      ...item,
      spotId: item.spotId || relatedSpot._id || spotIds[0] || '',
      spotIds,
      cover: item.cover || item.coverImage || relatedSpot.image || relatedSpot.cover || '/images/placeholder.png',
      spotName: item.spotName || relatedSpot.name || '',
      albumCount: item.albumCount || relatedAlbums.length,
      packageCount: item.packageCount || relatedPackages.length,
      intro: item.intro || item.description || '进入系列查看主推旅拍套餐、旅拍套餐推荐和照片留影。'
    }
  })
}

function normalizeHomeVideoItem(item = {}) {
  const normalized = normalizePackage(item)
  return {
    ...normalized,
    displayType: 'video',
    isVideo: true,
    videoKindLabel: '视频摄像单品',
    videoCtaText: '查看单品',
    videoCardVariant: 'single'
  }
}

function pickHomeVideoItems(list = [], limit = 4) {
  return sortByHotScore(list).filter(isVideoSingle).slice(0, limit)
}

function buildHomeViewData(data = {}, previewData = {}, demoData = {}) {
  const mergedSpots = mergePreviewList(data.spots, previewData.spots)
  const mergedSeries = mergePreviewList(data.series, previewData.series)
  const photoSeries = filterPhotoSeries(mergedSeries)
  const mergedAlbums = mergePreviewList(data.albums, previewData.albums || demoData.albums)
  const mergedGuides = mergePreviewList(data.guides, previewData.guides)
  const mergedPeripherals = filterStorePeripherals(mergePreviewList(data.peripherals, previewData.peripherals))
  const recommendationIds = collectPackageRecommendationIds(
    data.recommendations,
    data.pageConfig && data.pageConfig.recommendations,
    data.homeConfig,
    previewData.recommendations,
    previewData.pageConfig && previewData.pageConfig.recommendations
  )
  // Different RPC generations expose packages under different keys. Merge all
  // of them, then apply the public visibility contract before normalizing.
  const allPackages = mergeManyLists(
    data.packages,
    data.allPackages,
    data.hotPackages,
    previewData.packages,
    previewData.allPackages,
    previewData.hotPackages
  ).filter(item => filterVisibleProducts([item]).length).map(item => {
    const normalized = normalizePackage(item)
    const id = packageIdentity(normalized)
    // 后端 getHomeData 若未返回 includedItems，先用 demoData 同 id 套餐兜底，避免首页组合标签为空
    if (!normalized.includedItems || !normalized.includedItems.length) {
      const demoPkg = (demoData.packages || []).find(p => packageIdentity(p) === id)
      if (demoPkg && demoPkg.includedItems) {
        normalized.includedItems = demoPkg.includedItems
      }
    }
    return { ...normalized, _id: id }
  })
  // 短视频单品：兼容后端 getHomeData 的 videoSingles 推荐字段（与 videoProducts 同源，去重合并）
  const explicitVideoProducts = mergeManyLists(
    data.videoProducts,
    data.videoSingles,
    previewData.videoProducts,
    previewData.videoSingles
  ).filter(isVideoSingle).filter(item => filterVisibleProducts([item]).length)
  // 「热门套餐」只展示可公开的旅拍套餐。后台可能只设置 isMainPush，
  // 也可能通过首页 recommendations 配置，因此不能只依赖 isHot。
  const photoPackages = allPackages
    .filter(item => item.displayType === 'photo' && !isVideoSingle(item))
  const recommendedPhotoPackages = photoPackages.filter(item => (
    recommendationIds.has(packageIdentity(item))
      || item.isHot
      || item.isHotSale
      || item.isMainPush
      || item.mainPush
      || item.isFeatured
  ))
  const hotPackages = (recommendedPhotoPackages.length ? recommendedPhotoPackages : photoPackages)
    .sort((a, b) => (b.hotScore || 0) - (a.hotScore || 0))
    .slice(0, 6)
  const videoPackages = mergeManyLists(
    explicitVideoProducts,
    allPackages.filter(isVideoSingle)
  ).filter(item => filterVisibleProducts([item]).length).map(normalizeHomeVideoItem)
  const homeVideoProducts = pickHomeVideoItems(videoPackages, 4)
  const homeModules = normalizeModuleConfig(data.modules || previewData.modules)
  const homeSpots = buildHomeSpots(mergedSpots)
  const homeSeries = buildHomeSeries(photoSeries, mergedSpots, mergedAlbums, allPackages)
  const rawQuickNav = data.quickNav || previewData.quickNav
  // The home page already exposes the map banner and ranked spot shelf; remove
  // the redundant "all spots" shortcut even when an older backend config still
  // returns it.
  const quickNav = Array.isArray(rawQuickNav)
    ? rawQuickNav.filter(item => item && !isRemovedQuickNav(item))
    : []

  return {
    shopInfo: data.shopInfo || previewData.shopInfo || {},
    activityText: data.activityText || previewData.activityText || '',
    banners: normalizeBanners(mergePreviewList(data.banners, previewData.banners)).slice(0, 6),
    // 探索页轮播：与首页轮播「单独一套」，后台在 homeConfig.exploreBanners 独立配置
    exploreBanners: normalizeBanners(mergePreviewList(data.exploreBanners, previewData.exploreBanners)).slice(0, 6),
    // 首页快捷入口：后台可配置的"导航"（tabBar 不可运行时改，故用首页快捷入口承载）
    quickNav,
    spots: homeSpots,
    series: homeSeries,
    bookingAlbums: buildBookingAlbums(mergedAlbums, photoSeries, mergedSpots).slice(0, 10),
    hotSpots: homeSpots,
    guides: mergedGuides,
    packages: allPackages,
    hotPackages,
    videoPackages: homeVideoProducts,
    peripherals: mergedPeripherals,
    homeModules,
    moduleConfig: buildModuleConfigMap(homeModules),
    loading: false
  }
}

function isHomeDataEmpty(data = {}) {
  return !(data.banners || []).length && !(data.spots || []).length && !(data.packages || []).length && !(data.series || []).length
}

function findHomePackage(packageGroups = [], packageId = '') {
  const wanted = String(packageId || '').trim()
  if (!wanted) return null
  const groups = Array.isArray(packageGroups) ? packageGroups : []
  return groups
    .flat()
    .find(item => item && String(item._id || item.id || item.packageId || item.productId || '').trim() === wanted) || null
}

function getHomePackageDetailPath(pkg = {}) {
  return '/pages/photoPackageDetail/photoPackageDetail'
}

function getBannerTarget(banner = {}) {
  const directUrl = banner.linkUrl || ''
  if (directUrl) {
    return {
      method: (directUrl.includes('/pages/explore/explore') || directUrl.includes('/pages/my/my')) ? 'switchTab' : 'navigateTo',
      url: directUrl
    }
  }
  // 统一从路由表取目标（首页 Banner 与快捷入口共用 utils/router）
  return buildTarget(String(banner.targetType || ''), banner.targetId || '')
}

module.exports = {
  buildBookingAlbums,
  buildHomeViewData,
  findHomePackage,
  getBannerTarget,
  getHomePackageDetailPath,
  isGlobalPackage,
  isHomeDataEmpty,
  mergePreviewList,
  normalizeBanner,
  normalizeBanners
}
