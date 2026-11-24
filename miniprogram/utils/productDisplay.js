// Display-only normalization. Prices and quantities here never change an order.
function displayText(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  return typeof value === 'string' ? value.trim() : ''
}

function displayVideoDuration(value) {
  const text = displayText(value)
  return /^\d+(?:\.\d+)?$/.test(text) ? `${text} 秒` : text
}

function displayTags(...values) {
  const tags = []
  values.forEach(value => {
    const list = Array.isArray(value) ? value : displayText(value).split(/[，,、|]/)
    list.forEach(item => {
      const tag = displayText(item)
      if (tag && !tags.includes(tag)) tags.push(tag)
    })
  })
  return tags
}

function shootingInstructions(value) {
  return (Array.isArray(value) ? value : [value])
    .flatMap(item => displayText(item).split(/[；;\r\n]/))
    .map(item => item.trim()).filter(Boolean)
}

function itemQuantity(item = {}) {
  const value = Number(item.quantity ?? item.qty ?? 1)
  return Number.isSafeInteger(value) && value > 0 ? value : 1
}

function includedItemStats(items = []) {
  return {
    itemCount: items.reduce((total, item) => total + itemQuantity(item), 0),
    typeCount: new Set(items.map(item => item.typeClass || item.type).filter(Boolean)).size
  }
}

function orderItemDisplay(items = []) {
  const targetTypes = {
    album: 'album', photo_album: 'album', photo_single: 'album', sample: 'album', photo_collection: 'album',
    video: 'video', video_single: 'video', video_package: 'video', video_product: 'video',
    package: 'package', photo_package: 'package', photo: 'package',
    peripheral: 'peripheral', accessory: 'peripheral', addon: 'peripheral'
  }
  const labels = {
    album: '照片留影', photo_album: '照片留影', photo_single: '照片留影',
    video: '视频摄像', video_single: '视频摄像',
    package: '旅拍套餐', photo_package: '旅拍套餐',
    peripheral: '影像周边', accessory: '影像周边', custom: '约拍定制'
  }
  return (Array.isArray(items) ? items : []).filter(item => item && typeof item === 'object').map((item, index) => {
    const rawPrice = item.unitPrice ?? item.price
    const price = displayText(rawPrice)
    const hasPrice = price !== '' && Number.isFinite(Number(price)) && Number(price) >= 0
    const type = displayText(item.productType || item.type).toLowerCase()
    const targetType = (type === 'photo_single' && item.packageId ? 'package' : targetTypes[type]) || (!type
      ? (item.videoId ? 'video' : item.packageId ? 'package' : item.albumId ? 'album' : item.peripheralId ? 'peripheral' : '')
      : '')
    const typedId = { album: item.albumId, video: item.videoId || item.packageId, package: item.packageId, peripheral: item.peripheralId }[targetType]
    return {
      key: `${item.productId || item.packageId || item.albumId || item.peripheralId || 'item'}-${index}`,
      name: displayText(item.name || item.title || item.packageName || item.albumName || item.peripheralName) || '预约项目',
      typeLabel: labels[targetType] || labels[type] || (item.albumId ? '照片留影' : item.peripheralId ? '影像周边' : item.packageId ? '旅拍套餐' : '预约项目'),
      typeClass: targetType || 'custom',
      targetType,
      targetId: targetType ? displayText(item.productId || typedId) : '',
      spotId: displayText(item.spotId),
      seriesId: displayText(item.seriesId),
      quantity: itemQuantity(item),
      priceText: hasPrice ? `¥${Number(price)}` : '',
      spotName: displayText(item.spotName),
      seriesName: displayText(item.seriesName)
    }
  })
}

module.exports = { displayText, displayVideoDuration, displayTags, shootingInstructions, itemQuantity, includedItemStats, orderItemDisplay }
