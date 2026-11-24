const { isVideo, normalizePackage, normalizePackageList, normalizeTags, buildPackageBenefits } = require('../utils/product')
const { normalizeAlbumPresentation } = require('../utils/albumPresentation')
const { itemQuantity } = require('../utils/productDisplay')
const { resolvePackageSpots } = require('../utils/packageSpots')

function normalizeDetailPackage(item = {}) {
  return { ...normalizePackage(item), description: item.description ?? item.intro ?? item.desc ?? '' }
}

function normalizeDetailPackages(items = []) {
  return (items || []).map(normalizeDetailPackage)
}

function resolveSelectedPackage(data = {}, packageId = '') {
  let mainPushPackages = normalizeDetailPackages(data.mainPushPackages)
  const spotPackages = normalizeDetailPackages(data.spotPackages)
  const currentPackage = data.currentPackage ? normalizeDetailPackage(data.currentPackage) : null
  if (currentPackage) {
    const exists = [...mainPushPackages, ...spotPackages].some(item => item._id === currentPackage._id)
    if (!exists) mainPushPackages = [currentPackage, ...mainPushPackages]
  }

  const allPackages = [
    ...mainPushPackages,
    ...spotPackages,
    ...normalizeDetailPackages(data.packages),
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
  const videos = context.videoProducts || context.videos || []
  const albums = context.albums || []
  const peripherals = context.peripherals || []

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
      ...item,
      type: item.type,
      typeClass: meta.cls,
      typeLabel: meta.label,
      name: item.name || '未命名产品',
      cover: item.cover || '/images/placeholder.png',
      priceText: price ? `¥${price}` : '免费包含',
      quantity: itemQuantity(item),
      qty: itemQuantity(item),
      target: item.target || null
    }
  })
}

function normalizeRelatedAlbums(albums = [], seriesInfo = {}, spotId = '') {
  return (albums || []).map(album => {
    const normalizedAlbum = normalizeAlbumPresentation(album)
    const sampleUrls = normalizedAlbum.sampleUrls || normalizedAlbum.samples || []
    const albumId = normalizedAlbum._id || normalizedAlbum.albumId || ''
    return {
      ...normalizedAlbum,
      _id: albumId,
      albumId,
      seriesId: normalizedAlbum.seriesId || seriesInfo._id || '',
      seriesName: normalizedAlbum.seriesName || seriesInfo.name || '',
      spotId: normalizedAlbum.spotId || spotId,
      cover: normalizedAlbum.cover || normalizedAlbum.coverImage || sampleUrls[0] || '/images/placeholder.png',
      sampleUrls,
      previewUrls: sampleUrls.slice(0, 3),
      photoCount: normalizedAlbum.photoCount,
      price: Number(normalizedAlbum.price || 0)
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

  const spots = resolvePackageSpots(selectedPackage || {}, data)

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
      videoProducts: data.videoProducts,
      albums: data.albums,
      peripherals: data.peripherals
    }),
    mainPushPackages: normalizePackageList(data.mainPushPackages),
    spotPackages: normalizePackageList(data.spotPackages)
  }
}

module.exports = {
  buildPhotoPackageDetail
}
