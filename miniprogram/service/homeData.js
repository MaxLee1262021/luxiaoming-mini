const { normalizePackage, sortByHotScore, filterVisibleProducts, filterStorePeripherals, isVideoSingle } = require('../utils/product')
const { buildModuleConfigMap, normalizeModuleConfig } = require('./pageConfig')
const { filterPhotoSeries } = require('../utils/catalog')
const { buildTarget, normalizeRouteKey } = require('../utils/router')
const { normalizeExternalUrl } = require('../utils/externalLink')
const { normalizeAlbumPresentation } = require('../utils/albumPresentation')
const { normalizePeripheral } = require('../utils/peripheralPresentation')
const { getSpotCover } = require('./spotFilter')
const { publicGuides } = require('../utils/guideContent')

const contentOrder = require('../utils/contentOrder')
const sortContent = (key, rows) => (rows || []).slice().sort((a, b) => contentOrder.compare(key, a, b))
const compareConfiguredContent = (key, left, right) => contentOrder.rank(left.sort) || contentOrder.rank(right.sort)
  ? contentOrder.compare(key, left, right) : 0

const HOME_SPOT_PAGE_SIZE = 20

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
  const url = String(bannerField(item, 'url', item.videoUrl || item.fileID || item.fileId || item.src || ''))
  return type === 'video' || /\.(mp4|mov|m4v|webm|m3u8)(\?|$)/i.test(url)
}

// 显式清空的新字段优先，避免重新读取后恢复旧素材、旧目标或旧链接。
function bannerField(item, key, fallback = '') {
  return Object.prototype.hasOwnProperty.call(item, key) ? (item[key] || '') : fallback
}

function normalizeBanner(item = {}) {
  const isVideo = isVideoBanner(item)
  const url = bannerField(item, 'url', isVideo
    ? (item.videoUrl || item.fileID || item.fileId || item.src || '')
    : (item.imageUrl || item.fileID || item.fileId || item.src || item.cover || ''))
  return {
    ...item,
    _id: item._id || item.id || url,
    type: isVideo ? 'video' : 'image',
    mediaType: isVideo ? 'video' : 'image',
    url,
    cover: item.cover || item.poster || item.imageUrl || item.thumbnail || '/images/placeholder.png',
    linkUrl: bannerField(item, 'linkUrl', item.jumpUrl || item.targetUrl || item.path || item.pagePath || ''),
    targetType: bannerField(item, 'targetType', item.linkType || item.jumpType || ''),
    targetId: bannerField(item, 'targetId', item.linkId || item.jumpId || item.packageId || item.seriesId || item.spotId || item.guideId || '')
  }
}

function normalizeBanners(list = []) {
  return (Array.isArray(list) ? list : []).filter(item => item && typeof item === 'object')
    .map(item => normalizeBanner(item)).filter(item => item.url)
}

function buildBookingAlbums(albums = [], series = [], spots = []) {
  const seriesById = new Map()
  const spotsById = new Map()
  series.forEach(item => {
    const id = String(item._id || item.id)
    if (!seriesById.has(id)) seriesById.set(id, item)
  })
  spots.forEach(item => {
    if (!spotsById.has(item._id)) spotsById.set(item._id, item)
  })
  return filterVisibleProducts(albums || []).slice().sort((a, b) => compareConfiguredContent('albums', a, b)).map(album => {
    const albumId = album._id || album.id || album.albumId || ''
    const currentSeries = seriesById.get(String(album.seriesId || '')) || {}
    const inheritedSpotId = album.spotBindingExplicit === true ? '' : (Array.isArray(currentSeries.spotIds) && currentSeries.spotIds[0]) || ''
    const spotId = album.spotId || (Array.isArray(album.spotIds) && album.spotIds[0]) || inheritedSpotId || ''
    const currentSpot = spotsById.get(spotId) || {}
    const normalizedAlbum = normalizeAlbumPresentation(album)
    return {
      ...normalizedAlbum,
      _id: albumId,
      albumId,
      seriesId: album.seriesId || currentSeries._id || currentSeries.id || '',
      spotId,
      spotName: album.spotName || currentSpot.name || '',
      seriesName: album.seriesName || currentSeries.name || '',
      cover: normalizedAlbum.cover || '/images/placeholder.png',
      sampleCount: normalizedAlbum.photoCount
    }
  }).filter(item => item.albumId)
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
  // 分页列表沿用服务端的排名顺序，追加时只补齐卡片展示字段。
  return spots.map((spot, index) => ({
    ...spot,
    cover: getSpotCover(spot),
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
  return sortContent('packages', list).filter(isVideoSingle).slice(0, limit)
}

// 旧接口保留完整候选目录在逻辑层，先按点位过滤，再限制横滑预览数量。
// 新接口的 spotProducts 已在服务端按点位筛选，完整展示该点商品。
function buildHomeSpotShelf(data = {}, spotId = '', scoped = false, complete = scoped) {
  const series = Array.isArray(data.series) ? data.series : []
  const seriesById = new Map(series.map(item => [String(item._id || item.id || ''), item]))
  const boundIds = item => [item.spotId, ...(Array.isArray(item.spotIds) ? item.spotIds : [])]
    .filter(value => value !== undefined && value !== null && String(value).trim()).map(String)
  const cityValues = [data.cityId, data.city].filter(Boolean).map(String)
  const declaredCities = item => [item.cityId, item.city, item.cityName, ...(Array.isArray(item.cityIds) ? item.cityIds : []),
    ...(Array.isArray(item.cities) ? item.cities : [])].filter(Boolean)
    .flatMap(value => typeof value === 'object' ? [value._id, value.id, value.name, value.code].filter(Boolean) : [value]).map(String)
  const spotsById = new Map((data.spots || []).map(item => [String(item._id || item.id || ''), item]))
  const matchesCity = item => {
    if (scoped || !cityValues.length) return true
    const declared = declaredCities(item)
    // 旧完整目录不处理城市参数；全城通用周边也只能在其所属城市展示。
    const cities = declared.length ? declared : boundIds(item).flatMap(id => declaredCities(spotsById.get(id) || {}))
    return !cities.length || cities.some(value => cityValues.includes(value))
  }
  const matches = item => {
    if (!matchesCity(item)) return false
    if (scoped || !spotId) return true
    const ids = boundIds(item)
    if (ids.length) return ids.includes(String(spotId))
    if (item.spotBindingExplicit === true) return true
    const owner = seriesById.get(String(item.seriesId || ''))
    const inherited = owner ? boundIds(owner) : []
    return (!owner || matchesCity(owner)) && (!inherited.length || inherited.includes(String(spotId)))
  }
  const allPackages = mergeManyLists(data.packages, data.allPackages, data.hotPackages)
    .filter(item => filterVisibleProducts([item]).length)
  const albums = buildBookingAlbums(filterVisibleProducts(data.albums || []).filter(matches), series, data.spots || [])
  const packages = sortContent('packages', allPackages.filter(matches).map(normalizePackage)
    .filter(item => item.displayType === 'photo' && !isVideoSingle(item)))
  const videos = sortContent('packages', mergeManyLists(data.videoSingles, data.videoProducts, allPackages.filter(isVideoSingle))
    .filter(isVideoSingle).filter(item => filterVisibleProducts([item]).length).filter(matches).map(normalizeHomeVideoItem))
  const peripherals = filterStorePeripherals(data.peripherals || []).filter(item => {
    if (!matchesCity(item)) return false
    if (scoped || !spotId || item.mode === '全城通用') return true
    const ids = boundIds(item)
    return !ids.length || ids.includes(String(spotId))
  }).map(normalizePeripheral)
  return {
    albums: complete ? albums : albums.slice(0, 10),
    videos: complete ? videos : videos.slice(0, 4),
    packages: complete ? packages : packages.slice(0, 6),
    peripherals: complete ? peripherals : peripherals.slice(0, 10)
  }
}

function buildHomeViewData(data = {}) {
  const mergedSpots = Array.isArray(data.spots) ? data.spots : []
  const mergedSeries = Array.isArray(data.series) ? data.series : []
  const photoSeries = filterPhotoSeries(mergedSeries)
  const mergedAlbums = Array.isArray(data.albums) ? data.albums : []
  const mergedGuides = publicGuides(data.guides)
  const mergedPeripherals = filterStorePeripherals(Array.isArray(data.peripherals) ? data.peripherals : [])
  const recommendationIds = collectPackageRecommendationIds(
    data.recommendations,
    data.pageConfig && data.pageConfig.recommendations,
    data.homeConfig
  )
  // Different RPC generations expose packages under different keys. Merge all
  // of them, then apply the public visibility contract before normalizing.
  const allPackages = mergeManyLists(
    data.packages,
    data.allPackages,
    data.hotPackages
  ).filter(item => filterVisibleProducts([item]).length).map(item => {
    const normalized = normalizePackage(item)
    const id = packageIdentity(normalized)
    return { ...normalized, _id: id }
  })
  // 短视频单品：兼容后端 getHomeData 的 videoSingles 推荐字段（与 videoProducts 同源，去重合并）
  const explicitVideoProducts = mergeManyLists(
    data.videoProducts,
    data.videoSingles
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
    .sort((a, b) => recommendationIds.size ? compareConfiguredContent('packages', a, b) : contentOrder.compare('packages', a, b))
    .slice(0, 6)
  const videoPackages = mergeManyLists(
    explicitVideoProducts,
    allPackages.filter(isVideoSingle)
  ).filter(item => filterVisibleProducts([item]).length).map(normalizeHomeVideoItem)
  const homeVideoProducts = pickHomeVideoItems(videoPackages, 4)
  const configuredModules = (data.modules || []).map(item => item && ({
    ...item,
    visible: item.visible !== false && item.enabled !== false
  }))
  const homeModules = normalizeModuleConfig(configuredModules)
  // 首页模板通过 moduleConfig[key].visible 判断显隐。可见列表会过滤关闭的
  // 板块，因此需在映射中保留 false，避免缺项又被模板当作默认显示。
  const moduleConfig = buildModuleConfigMap([
    ...homeModules,
    ...configuredModules.filter(item => item && item.visible === false)
  ])
  const homeSpots = buildHomeSpots(data.spotPagination
    ? mergedSpots
    : sortByHotScore(mergedSpots).slice(0, HOME_SPOT_PAGE_SIZE))
  const homeSeries = buildHomeSeries(photoSeries, mergedSpots, mergedAlbums, allPackages)
  const rawQuickNav = data.quickNav
  // The home page already exposes the map banner and ranked spot shelf; remove
  // the redundant "all spots" shortcut even when an older backend config still
  // returns it.
  const quickNav = Array.isArray(rawQuickNav)
    ? rawQuickNav.filter(item => item && !isRemovedQuickNav(item))
    : []

  return {
    shopInfo: data.shopInfo || {},
    activityText: data.activityText || '',
    banners: normalizeBanners(data.banners || []).slice(0, 6),
    // 探索页轮播：与首页轮播「单独一套」，后台在 homeConfig.exploreBanners 独立配置
    exploreBanners: normalizeBanners(data.exploreBanners || []).slice(0, 6),
    // 首页快捷入口：后台可配置的"导航"（tabBar 不可运行时改，故用首页快捷入口承载）
    quickNav,
    spots: homeSpots,
    series: homeSeries,
    bookingAlbums: buildBookingAlbums(mergedAlbums, photoSeries, mergedSpots).slice(0, 10),
    hotSpots: homeSpots,
    guides: mergedGuides,
    packages: sortContent('packages', allPackages),
    hotPackages,
    videoPackages: homeVideoProducts,
    peripherals: mergedPeripherals,
    homeModules,
    moduleConfig,
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
  if (!banner) return null
  const type = normalizeRouteKey(banner.targetType || '')
  if (['none', 'static'].includes(type)) return null
  const directUrl = typeof banner.linkUrl === 'string' ? banner.linkUrl.trim() : ''
  if (type === 'external' || (!type && /^https:\/\//i.test(directUrl))) {
    const url = normalizeExternalUrl(directUrl)
    return url ? { method: 'navigateTo', path: '/pages/webview/webview', params: { url } } : null
  }
  // 已配置的内容目标优先，旧链接不能覆盖新选择的商品或旅拍灵感。
  if (type) return buildTarget(type, banner.targetId || '')
  // 只为未配置类型的旧素材保留小程序内页面直链。
  if (!/^\/pages\/[a-z\d_/-]+(?:\?[^#]*)?$/i.test(directUrl)) return null
  const pathname = directUrl.split('?')[0]
  const isTab = ['/pages/index/index', '/pages/explore/explore', '/pages/my/my'].includes(pathname)
  return { method: isTab ? 'switchTab' : 'navigateTo', url: directUrl }
}

module.exports = {
  HOME_SPOT_PAGE_SIZE,
  buildBookingAlbums,
  buildHomeSpots,
  buildHomeSpotShelf,
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
