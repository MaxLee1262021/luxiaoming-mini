function positiveNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function listLength(value) {
  return Array.isArray(value) ? value.length : 0
}

function getAlbumPhotoCount(album = {}) {
  return positiveNumber(album.photoCount)
    || positiveNumber(album.sampleCount)
    || listLength(album.sampleUrls)
    || listLength(album.samples)
    || listLength(album.photoUrls)
    || listLength(album.photoIds)
    || 0
}

function normalizeAlbumDescription(album = {}, photoCount = getAlbumPhotoCount(album)) {
  const source = String(album.description || album.intro || '').trim()
  if (!source || !photoCount) return source
  return source.replace(/\d+\s*张\s*(?:样片|照片)/g, `${photoCount} 张照片`)
}

function normalizeAlbumPresentation(album = {}) {
  const photoCount = getAlbumPhotoCount(album)
  const description = normalizeAlbumDescription(album, photoCount)
  return {
    ...album,
    photoCount,
    sampleCount: photoCount,
    ...(description ? { intro: description, description } : {})
  }
}

module.exports = {
  getAlbumPhotoCount,
  normalizeAlbumDescription,
  normalizeAlbumPresentation
}
