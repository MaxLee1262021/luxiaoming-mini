function asList(value) {
  return Array.isArray(value) ? value : []
}

function idText(value) {
  return value === undefined || value === null ? '' : String(value).trim()
}

function normalizeSpots(spots = []) {
  const seen = new Set()
  return asList(spots).filter(spot => spot && typeof spot === 'object').map(spot => {
    const id = idText(spot._id || spot.id || spot.spotId)
    return { ...spot, _id: id, id, name: idText(spot.name || spot.spotName) }
  }).filter(spot => {
    if (!spot._id || !spot.name || seen.has(spot._id)) return false
    seen.add(spot._id)
    return true
  })
}

function boundSpotIds(item = {}) {
  return [...new Set([item.spotId, ...asList(item.spotIds)].map(idText).filter(Boolean))]
}

function resolvePackageSpots(pkg = {}, data = {}) {
  // An explicit server projection also owns the empty case. Never replace it
  // with the current series' points or a stale package binding.
  if (Array.isArray(pkg.applicableSpots)) return normalizeSpots(pkg.applicableSpots)

  const knownSpots = normalizeSpots([...asList(data.spots), ...asList(pkg.spots)])
  const spotsById = new Map(knownSpots.map(spot => [spot._id, spot]))
  const series = [...asList(data.allSeries), ...asList(data.seriesList),
    ...(Array.isArray(data.series) ? data.series : data.series ? [data.series] : [])]
  const albums = asList(data.albums)
  const videos = [...asList(data.videoProducts), ...asList(data.videoSingles), ...asList(data.videos)]
  const peripherals = asList(data.peripherals)
  const ids = new Set()
  const addSpots = spots => normalizeSpots(spots).forEach(spot => {
    spotsById.set(spot._id, spot)
    ids.add(spot._id)
  })
  const addBinding = (item = {}) => {
    if (Array.isArray(item.applicableSpots)) {
      addSpots(item.applicableSpots)
      return
    }
    const direct = boundSpotIds(item)
    direct.forEach(id => ids.add(id))
    if (direct.length || item.spotBindingExplicit === true) return
    const owner = series.find(value => idText(value._id || value.id) === idText(item.seriesId))
    if (owner) boundSpotIds(owner).forEach(id => ids.add(id))
  }

  const includedItems = asList(pkg.includedItems)
  if (!includedItems.length) {
    addBinding(pkg)
    addSpots(pkg.spots)
  }
  includedItems.forEach(item => {
    if (!item || typeof item !== 'object') return
    const target = item.target || {}
    const type = String(item.type || item.productType || target.page || '').toLowerCase()
    const albumId = idText(target.albumId || item.albumId || item.productId || target.productId || target.id || item.id)
    const videoId = idText(target.productId || item.productId || item.videoId || target.videoId || target.id || item.id)
    const peripheralId = idText(target.peripheralId || item.peripheralId || item.productId || target.productId || target.id || item.id)
    let product
    if (/album|photo|collection/.test(type)) {
      product = albums.find(value => idText(value._id || value.id || value.albumId || value.productId) === albumId)
    } else if (/video/.test(type)) {
      product = videos.find(value => idText(value._id || value.id || value.productId || value.videoId) === videoId)
    } else if (/peripheral/.test(type)) {
      product = peripherals.find(value => idText(value._id || value.id || value.peripheralId || value.productId) === peripheralId)
    }
    // A target's spotId can be only the first point used for navigation.
    // Resolve the product's complete binding before using that older hint.
    if (product) addBinding(product)
    else {
      addBinding(item)
      addBinding(target)
    }
  })

  return Array.from(ids).map(id => spotsById.get(id)).filter(Boolean)
}

module.exports = { normalizeSpots, resolvePackageSpots }
