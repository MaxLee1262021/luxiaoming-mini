const demoData = require('../utils/demoData')
const { isVideo, normalizePackage, normalizePackageList, normalizeTags, buildPackageBenefits } = require('../utils/product')

function resolvePackageSpots(pkg = {}, data = {}) {
  const spotIds = new Set()

  if (pkg.spotId) spotIds.add(pkg.spotId)
  if (Array.isArray(pkg.spotIds)) pkg.spotIds.forEach(id => spotIds.add(id))

  const allSpots = data.spots || demoData.spots || []
  const albums = data.albums || demoData.albums || []
  const videos = data.videos || data.videoProducts || demoData.videoProducts || demoData.videos || []
  const seriesList = data.series ? [data.series] : (demoData.series || [])

  ;(pkg.includedItems || []).forEach(item => {
    const t = item.target || {}

    const directSpotId = t.spotId || item.spotId
    if (directSpotId) {
      spotIds.add(directSpotId)
      return
    }

    if (item.type === 'album' || t.page === 'photoCollection') {
      const albumId = t.albumId || item.albumId
      const album = albums.find(a => a._id === albumId || a.albumId === albumId)
      if (album) {
        if (album.spotId) spotIds.add(album.spotId)
        if (album.seriesId) {
          const series = seriesList.find(s => s._id === album.seriesId)
          if (series && Array.isArray(series.spotIds)) {
            series.spotIds.forEach(id => spotIds.add(id))
          }
        }
      }
    } else if (item.type === 'video' || t.page === 'videoProductDetail') {
      const productId = t.productId || item.productId
      const video = videos.find(v => v._id === productId || v.videoId === productId || v.productId === productId)
      if (video && video.spotId) spotIds.add(video.spotId)
    }
  })

  const resolved = Array.from(spotIds)
    .map(id => allSpots.find(s => s._id === id))
    .filter(Boolean)

  return resolved
}

function resolveSelectedPackage(data = {}, packageId = '') {
  let mainPushPackages = normalizePackageList(data.mainPushPackages)
  const spotPackages = normalizePackageList(data.spotPackages)
  const currentPackage = data.currentPackage ? normalizePackage(data.currentPackage) : null
  if (currentPackage) {
    const exists = [...mainPushPackages, ...spotPackages].some(item => item._id === currentPackage._id)
    if (!exists) mainPushPackages = [currentPackage, ...mainPushPackages]
  }

  const allPackages = [
    ...mainPushPackages,
    ...spotPackages,
    ...normalizePackageList(data.packages),
    currentPackage
  ].filter(Boolean)
  const photoPackages = allPackages.filter(item => !isVideo(item))
  const requestedPackageId = packageId === undefined || packageId === null ? '' : String(packageId).trim()

  return requestedPackageId
    ? (photoPackages.find(item => String(item._id) === requestedPackageId) || null)
    : (photoPackages.find(item => currentPackage && item._id === currentPackage._id) || photoPackages[0] || null)
}

function resolveItemPrice(item = {}, context = {}) {
  const declared = Number(item.price)
  if (declared > 0) return declared

  const t = item.target || {}
  const videos = context.videoProducts || context.videos || demoData.videoProducts || []
  const albums = context.albums || demoData.albums || []
  const peripherals = context.peripherals || demoData.peripherals || []

  if (item.type === 'video') {
    const pid = t.productId || item.productId || item.videoId
    const vid = pid && videos.find(v => v._id === pid || v.videoId === pid || v.productId === pid)
    if (vid) return Number(vid.price || 0)
  } else if (item.type === 'album') {
    const aid = t.albumId || item.albumId
    const alb = aid && albums.find(a => a._id === aid || a.albumId === aid)
    if (alb) return Number(alb.price || 0)
  } else if (item.type === 'peripheral') {
    const pid = t.peripheralId || item.peripheralId || t.id || item.id
    const per = pid && peripherals.find(p => p._id === pid || p.peripheralId === pid)
    if (per) return Number(per.price || 0)
  }

  return declared || 0
}

function resolveItemSpecs(item = {}, context = {}) {
  const t = item.target || {}
  const videos = context.videoProducts || context.videos || demoData.videoProducts || []
  const albums = context.albums || demoData.albums || []
  const peripherals = context.peripherals || demoData.peripherals || []

  if (item.type === 'video') {
    const pid = t.productId || item.productId || item.videoId
    const vid = pid && videos.find(v => v._id === pid || v.videoId === pid || v.productId === pid)
    if (vid) {
      const specs = []
      if (vid.videoDuration) specs.push(`${vid.videoDuration}`)
      if (vid.finishedVideoCount || vid.videoCount) specs.push(`${vid.finishedVideoCount || vid.videoCount}条成片`)
      if (vid.hasAerial || vid.aerial || vid.includeAerial) specs.push('含航拍')
      if (vid.fullEdit || vid.includeEditing) specs.push('含剪辑')
      if (vid.deliveryCycle || vid.deliveryDays) specs.push(`${vid.deliveryCycle || vid.deliveryDays}交付`)
      return specs.length ? specs.join(' · ') : '视频摄像'
    }
    return '视频摄像'
  }

  if (item.type === 'album') {
    const aid = t.albumId || item.albumId
    const alb = aid && albums.find(a => a._id === aid || a.albumId === aid)
    if (alb) {
      const specs = []
      if (alb.duration) specs.push(`${alb.duration}分钟`)
      if (alb.retouchCount) specs.push(`${alb.retouchCount}张精修`)
      if (alb.rawPhotoCount && alb.rawPhotoCount !== '多') specs.push(`${alb.rawPhotoCount}张底片`)
      else if (alb.rawPhotoCount === '多' || alb.rawPhotoCount === '全送' || alb.includeRaw) specs.push('底片全送')
      return specs.length ? specs.join(' · ') : '照片留影'
    }
    return '照片留影'
  }

  if (item.type === 'peripheral') {
    const pid = t.peripheralId || item.peripheralId || t.id || item.id
    const per = pid && peripherals.find(p => p._id === pid || p.peripheralId === pid)
    return per ? (per.subtitle || per.spec || per.material || '定制化周边') : '影像周边'
  }

  return ''
}

function normalizeIncludedItems(items = [], context = {}) {
  const typeMeta = {
    album: { label: '照片留影', cls: 'album' },
    video: { label: '视频摄像', cls: 'video' },
    peripheral: { label: '影像周边', cls: 'peripheral' }
  }
  return (items || []).map(item => {
    const meta = typeMeta[item.type] || { label: '产品', cls: 'album' }
    const price = resolveItemPrice(item, context)
    return {
      type: item.type,
      typeClass: meta.cls,
      typeLabel: meta.label,
      name: item.name || '未命名产品',
      cover: item.cover || '/images/placeholder.png',
      priceText: price ? `¥${price}` : '免费包含',
      specs: resolveItemSpecs(item, context),
      target: item.target || null
    }
  })
}

function normalizeRelatedAlbums(albums = [], seriesInfo = {}, spotId = '') {
  return (albums || []).map(album => {
    const sampleUrls = album.sampleUrls || album.samples || []
    const albumId = album._id || album.albumId || ''
    return {
      ...album,
      _id: albumId,
      albumId,
      seriesId: album.seriesId || seriesInfo._id || '',
      seriesName: album.seriesName || seriesInfo.name || '',
      spotId: album.spotId || spotId,
      cover: album.cover || album.coverImage || sampleUrls[0] || '/images/placeholder.png',
      sampleUrls,
      previewUrls: sampleUrls.slice(0, 3),
      photoCount: album.photoCount || sampleUrls.length || 0,
      price: Number(album.price || 0)
    }
  }).filter(album => album.albumId)
}

function buildPhotoPackageDetail(data = {}, options = {}) {
  const selectedPackage = resolveSelectedPackage(data, options.packageId)
  const seriesInfo = data.series || {}
  const photos = data.photos || []
  const spotId = data.currentSpotId || options.spotId || (selectedPackage && selectedPackage.spotId) || ''
  const albums = normalizeRelatedAlbums(data.albums || [], seriesInfo, spotId).slice(0, 2)
  const samples = photos.length
    ? photos.slice(0, 8)
    : (data.samples && data.samples.length ? data.samples : [{ _id: 'cover', url: selectedPackage && selectedPackage.cover || seriesInfo.cover || '/images/placeholder.png', type: 'image' }])

  const packageSpots = resolvePackageSpots(selectedPackage || {}, data)
  const spots = packageSpots.length ? packageSpots : (data.spots || [])

  return {
    seriesId: (seriesInfo && seriesInfo._id) || options.seriesId || '',
    spotId,
    seriesInfo: {
      ...seriesInfo,
      styles: normalizeTags(seriesInfo.styles || seriesInfo.tags)
    },
    samples,
    photos,
    albums,
    spots,
    selectedPackage,
    packageBenefits: buildPackageBenefits(selectedPackage || {}),
    includedItems: normalizeIncludedItems(selectedPackage && selectedPackage.includedItems, {
      videoProducts: data.videoProducts || demoData.videoProducts,
      albums: data.albums || demoData.albums,
      peripherals: data.peripherals || demoData.peripherals
    }),
    mainPushPackages: normalizePackageList(data.mainPushPackages),
    spotPackages: normalizePackageList(data.spotPackages)
  }
}

module.exports = {
  buildPhotoPackageDetail
}
