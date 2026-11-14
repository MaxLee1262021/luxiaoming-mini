const { normalizePackageList, normalizePackage, buildVideoFields, buildPackageBenefits, isVideoSingle, filterVisibleProducts } = require('../utils/product')
const { displayTags, displayText, displayVideoDuration, shootingInstructions } = require('../utils/productDisplay')

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
      type: item.type,
      typeClass: meta.cls,
      typeLabel: meta.label,
      name: item.name || '未命名产品',
      cover: item.cover || '/images/placeholder.png',
      priceText: price ? `¥${price}` : '免费包含',
      target: item.target || null
    }
  })
}

// isVideoSingle 统一从 utils/product 引入（单一真相源），不再本地重写

function pickMediaUrl(item = {}) {
  return [item.videoUrl, item.previewVideoUrl, item.url, item.src].map(displayText).find(Boolean) || ''
}

function normalizeVideoSample(value = {}, fallback = {}, hint = 'video') {
  const item = typeof value === 'string' ? { url: value } : (value || {})
  const url = pickMediaUrl(item)
  // File suffixes take precedence over the product's video category. A photo
  // incorrectly placed in a videos array must still render as an image.
  const knownImage = /\.(?:jpe?g|png|webp|gif|bmp|svg|avif|heic)(?:[?#]|$)/i.test(url) || /^data:image\//i.test(url)
  const knownVideo = /\.(?:mp4|mov|m4v|webm|avi)(?:[?#]|$)/i.test(url)
  const declaredType = String(item.mediaType || item.mimeType || item.type || '').toLowerCase()
  const type = knownImage ? 'image' : knownVideo ? 'video' : /^(?:image|photo)/.test(declaredType) ? 'image'
    : /^video/.test(declaredType) ? 'video' : hint
  return {
    ...item,
    _id: item._id || item.id || item.videoId || fallback.videoId || fallback._id,
    title: item.title || item.name || fallback.name || '视频摄像样片',
    cover: type === 'image' && url ? url : item.cover || item.poster || fallback.cover || '',
    url,
    videoUrl: type === 'video' ? url : '',
    type,
    durationText: type === 'video' ? displayVideoDuration(item.videoDuration) || displayVideoDuration(item.durationText)
      || displayVideoDuration(fallback.videoDuration) || displayVideoDuration(fallback.durationText) : '',
    spotName: item.spotName || fallback.spotName || ''
  }
}

function matchesSpot(item = {}, spotId = '') {
  if (!spotId) return false
  return item.spotId === spotId || (Array.isArray(item.spotIds) && item.spotIds.includes(spotId))
}

function buildVideoProductDetail(data = {}, params = {}) {
  const allPackages = normalizePackageList(filterVisibleProducts([
    ...(data.videoSingles || []),
    ...(data.videoProducts || []),
    ...(data.allPackages || []),
    ...(data.packages || []),
    data.currentPackage
  ].filter(Boolean)).filter(isVideoSingle))

  const productId = params.productId || params.packageId || params.id || ''
  const selectedProduct = productId
    ? allPackages.find(item => item._id === productId)
    : allPackages.find(isVideoSingle)

  if (!selectedProduct || !selectedProduct.isVideo) {
    return null
  }

  const product = normalizePackage(selectedProduct)
  const spots = data.spots || []
  const spot = spots.find(item => item._id === product.spotId || matchesSpot(product, item._id)) || {}
  const videos = (data.videos || data.videoSamples || []).map(item => normalizeVideoSample(item, product))
  const linkedVideo = videos.find(item => item._id === product.videoId || item.videoId === product.videoId)
  const sameSceneVideos = videos.filter(item => (
    item._id !== (linkedVideo && linkedVideo._id)
    && (item.seriesId === product.seriesId || item.spotId === product.spotId)
  ))
  const ownMedia = [
    normalizeVideoSample(product, product),
    ...(Array.isArray(product.images) ? product.images : []).map(item => normalizeVideoSample(item, product, 'image')),
    ...(Array.isArray(product.videos) ? product.videos : []).map(item => normalizeVideoSample(item, product, 'video'))
  ].filter(item => item.url)
  const samples = (ownMedia.length ? ownMedia : [
    normalizeVideoSample(linkedVideo || product, product),
    ...sameSceneVideos
  ]).filter((item, index, list) => item && (item.url || item.cover)
    && list.findIndex(target => (target.url || target.cover) === (item.url || item.cover)) === index)
    .map((item, index) => ({ ...item, _id: `${product._id}-media-${index}` }))
  const duration = displayVideoDuration(product.videoDuration) || displayVideoDuration(product.durationText)
  const finishedCount = displayText(product.finishedVideoCount ?? product.videoCount ?? product.deliverCount)
  const videoFields = buildVideoFields({ ...product, videoDuration: duration,
    finishedVideoCount: /^\d+(?:\.\d+)?$/.test(finishedCount) ? `${finishedCount} 条` : finishedCount })
  if (typeof product.makeupIncluded === 'boolean') videoFields.push({ label: '妆造服务', value: product.makeupIncluded ? '包含' : '不含' })

  const recommendations = allPackages
    .filter(item => item._id !== product._id && item.isVideo && isVideoSingle(item))
    .sort((a, b) => (b.hotScore || 0) - (a.hotScore || 0))
    .slice(0, 6)

  return {
    product: {
      ...product,
      spotName: product.spotName || spot.name || ''
    },
    spot,
    samples,
    recommendations,
    displayTags: displayTags(product.tags, product.serviceTags, product.styleTags),
    instructions: shootingInstructions(product.shootingNotes ?? product.shootingDescription ?? product.shootingNote ?? product.intro ?? product.description),
    videoFields,
    packageBenefits: buildPackageBenefits(product),
    includedItems: normalizeIncludedItems(selectedProduct && selectedProduct.includedItems, {
      videoProducts: data.videoProducts || data.videoSingles || [],
      albums: data.albums || [],
      peripherals: data.peripherals || []
    })
  }
}

module.exports = {
  buildVideoProductDetail,
  isVideoSingle,
  normalizeIncludedItems
}
