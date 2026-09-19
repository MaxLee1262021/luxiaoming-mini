const { getBookingData } = require('../api/spot')
const { getPeripherals } = require('../api/peripheral')
const { normalizeMediaUrls } = require('../api/client')
const favorite = require('../utils/favorite')

let refreshPromise
function refreshFavoriteMedia() {
  if (refreshPromise) return refreshPromise
  const list = favorite.list()
  if (!list.length) return Promise.resolve([])
  refreshPromise = (async () => {
    const [catalogResult, peripheralResult] = await Promise.all([
      list.some(item => item.type !== 'peripheral') ? getBookingData().catch(() => null) : null,
      list.some(item => item.type === 'peripheral') ? getPeripherals().catch(() => null) : null
    ])
    const catalog = catalogResult && catalogResult.data || {}
    const rows = {
      photo_single: catalog.albums || catalog.allAlbums || [],
      photo_package: catalog.allPackages || catalog.packages || [],
      video_single: [...(catalog.videoProducts || []), ...(catalog.videoSingles || []), ...(catalog.allPackages || [])],
      peripheral: peripheralResult && Array.isArray(peripheralResult.data) ? peripheralResult.data : []
    }
    const covers = list.map(item => {
      const current = (rows[item.type] || []).find(row => String(row._id || row.id || row.albumId || '') === String(item.id))
      const loaded = item.type === 'peripheral' ? peripheralResult : catalogResult
      const cover = current ? current.cover || current.coverImage || current.coverUrl || current.image : (loaded ? '' : item.cover)
      return { id: item.id, cover: normalizeMediaUrls(cover || '/images/placeholder.png') }
    })
    // Merge into the current list: a favorite removed during the request must
    // not be restored by an older response.
    favorite.updateCovers(covers)
    return favorite.list()
  })().finally(() => { refreshPromise = null })
  return refreshPromise
}

module.exports = { refreshFavoriteMedia }
