const { normalizeTags } = require('./product')

function nonnegativeInteger(value) {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : 0
}

function getAlbumPhotoCount(album = {}) {
  // 商品交付张数由后台单独配置，上传的预览图片数量不能代替交付张数。
  return nonnegativeInteger(album.photoCount)
}

function getAlbumRetouchMode(album = {}) {
  if (['count', 'included', 'excluded'].includes(album.retouchMode)) return album.retouchMode
  if (nonnegativeInteger(album.retouchCount) > 0) return 'count'
  return album.retouchIncluded === true ? 'included' : 'excluded'
}

function getAlbumPreviewUrls(album = {}) {
  const source = Array.isArray(album.sampleUrls)
    ? album.sampleUrls
    : [album.samples, album.photoUrls].find(list => Array.isArray(list)) || []
  const urls = source.map(item => typeof item === 'string' ? item : (item && item.url) || '').filter(Boolean)
  const cover = album.cover || album.coverImage || album.coverUrl || urls[0] || ''
  // 卡片封面也是详情预览默认大图，去重后保留其余照片的顺序。
  return Array.from(new Set([cover, ...urls].filter(Boolean)))
}

function normalizeAlbumDescription(album = {}, photoCount = getAlbumPhotoCount(album)) {
  const source = String(album.description || album.intro || '').trim()
  if (!source || !photoCount) return source
  return source.replace(/\d+\s*张\s*(?:样片|照片)/g, `${photoCount} 张照片`)
}

function normalizeAlbumPresentation(album = {}) {
  const photoCount = getAlbumPhotoCount(album)
  const description = normalizeAlbumDescription(album, photoCount)
  const retouchMode = getAlbumRetouchMode(album)
  const retouchCount = nonnegativeInteger(album.retouchCount)
  const sampleUrls = getAlbumPreviewUrls(album)
  const displayTags = Array.from(new Set([...normalizeTags(album.tags), ...normalizeTags(album.styleTags)]))
  return {
    ...album,
    photoCount,
    sampleCount: photoCount,
    retouchMode,
    retouchCount,
    retouchText: retouchMode === 'count' ? `${retouchCount} 张` : (retouchMode === 'included' ? '包含' : '不包含'),
    makeupText: album.makeupIncluded === true ? '包含' : '不包含',
    displayTags,
    sampleUrls,
    cover: album.cover || album.coverImage || album.coverUrl || sampleUrls[0] || '',
    ...(description ? { intro: description, description } : {})
  }
}

module.exports = {
  getAlbumPhotoCount,
  getAlbumRetouchMode,
  getAlbumPreviewUrls,
  normalizeAlbumDescription,
  normalizeAlbumPresentation
}
