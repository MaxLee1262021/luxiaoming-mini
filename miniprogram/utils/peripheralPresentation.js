function text(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function labels(value) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,，;；、\n|]+/) : []
  return [...new Set(values.map(item => text(item && typeof item === 'object' ? item.name || item.label : item)).filter(Boolean))]
}

function mediaUrl(value) {
  return text(value && typeof value === 'object' ? value.url || value.src || value.imageUrl || value.videoUrl : value)
}

function mediaType(value, url, fallback) {
  const declared = value && typeof value === 'object' ? text(value.type || value.mediaType || value.mimeType) : ''
  if (/\.(png|jpe?g|webp|gif|bmp|avif|svg|heic)(?:[?#]|$)/i.test(url) || /^data:image\//i.test(url)) return 'image'
  if (/\.(mp4|m4v|mov|webm|m3u8)(?:[?#]|$)/i.test(url)) return 'video'
  if (/^video(?:\/|$)/i.test(declared)) return 'video'
  if (/^image(?:\/|$)/i.test(declared)) return 'image'
  return fallback
}

function explicitBoolean(value) {
  if (value === true || value === 1 || value === 'true') return true
  if (value === false || value === 0 || value === 'false') return false
  return null
}

// A display projection only: stock and transaction fields never enter the view model.
function normalizePeripheral(item = {}) {
  const gallery = []
  const seen = new Set()
  function addMedia(value, fallback) {
    const url = mediaUrl(value)
    if (!url || seen.has(url)) return
    const type = mediaType(value, url, fallback)
    const poster = value && typeof value === 'object' ? mediaUrl(value.poster || value.cover || value.thumbnail) : ''
    gallery.push({ url, type, poster, key: `${type}:${url}` })
    seen.add(url)
  }
  const cover = mediaUrl(item.cover) || mediaUrl(item.image)
  if (cover && mediaType(null, cover, 'image') === 'image') addMedia(cover, 'image')
  const images = Array.isArray(item.images) ? item.images : item.images ? [item.images] : []
  const videos = Array.isArray(item.videos) ? item.videos : item.videos ? [item.videos] : []
  images.forEach(value => addMedia(value, 'image'))
  videos.forEach(value => addMedia(value, 'video'))
  if (item.videoUrl) addMedia({ url: item.videoUrl, poster: item.poster || item.videoCover }, 'video')
  const coverMedia = gallery.find(media => media.type === 'image')
  const videoPoster = gallery.find(media => media.type === 'video' && media.poster)
  const configuredPrice = item.price !== undefined && item.price !== null ? item.price : item.salePrice
  const hasPrice = (typeof configuredPrice === 'number' || typeof configuredPrice === 'string')
    && text(configuredPrice) !== '' && Number.isFinite(Number(configuredPrice)) && Number(configuredPrice) >= 0
  const price = hasPrice ? Number(configuredPrice) : null
  const services = []
  const retouch = explicitBoolean(item.retouchIncluded)
  const editing = explicitBoolean(item.editingIncluded)
  if (retouch !== null) services.push(retouch ? '含精修' : '不含精修')
  if (editing !== null) services.push(editing ? '含精剪' : '不含精剪')
  const category = text(item.category)
  const specs = labels(item.specs !== undefined && item.specs !== null ? item.specs : item.spec)
  return {
    _id: firstText(item._id, item.id),
    name: firstText(item.name, item.title),
    cover: coverMedia ? coverMedia.url : videoPoster ? videoPoster.poster : '',
    category: category && category !== 'peripheral' ? category : text(item.cate),
    tags: labels(item.tags),
    specs,
    stackSpecs: specs.slice(0, 2),
    hasPrice,
    priceText: hasPrice ? `${Number.isInteger(price) ? String(price) : price.toFixed(2)}${item.specMode === 'multiple' ? '起' : ''}` : '',
    description: firstText(item.description, item.intro, item.desc),
    deliveryCycle: text(item.deliveryCycle),
    services,
    gallery,
    isHot: item.isHot === true,
    isHotSale: item.isHotSale === true,
    isNew: item.isNew === true
  }
}

module.exports = { normalizePeripheral }
