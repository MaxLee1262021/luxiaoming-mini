// 搜索建议构建：首页 / 探索页共用同一份「跨五类检索」逻辑，
// 输入为空返回全部（用于默认「全部内容」态），有输入返回实时匹配。
// 与 utils/searchNav.js 配合，做到「点建议直达 / 点搜索跳结果页」两端完全一致的最后一公里。
const demoData = require('./demoData')

function buildSearchSuggestions(kw, source = {}) {
  // Existing callers pass a spots array. New callers can pass the real home
  // catalog so suggestions lead to packages maintained in the admin backend.
  const catalog = Array.isArray(source) ? { spots: source } : (source || {})
  const spots = Array.isArray(catalog.spots) ? catalog.spots : (demoData.spots || [])
  const packages = Array.isArray(catalog.packages) ? catalog.packages : (demoData.packages || [])
  const videos = Array.isArray(catalog.videos) ? catalog.videos : packages
  const albums = Array.isArray(catalog.albums) ? catalog.albums : (demoData.albums || [])
  const guides = Array.isArray(catalog.guides) ? catalog.guides : (demoData.guides || [])
  const k = (kw || '').trim().toLowerCase()
  const out = []
  const push = (type, tag, icon, color, bgColor, name, area, nav, desc) => {
    const lowerName = (name || '').toLowerCase()
    const idx = k ? lowerName.indexOf(k) : 0
    let nameBefore = name
    let nameMatch = ''
    let nameAfter = ''
    if (k && idx >= 0) {
      nameBefore = name.slice(0, idx)
      nameMatch = name.slice(idx, idx + k.length)
      nameAfter = name.slice(idx + k.length)
    }
    out.push({
      id: type + '-' + ((nav && nav._id) || name),
      type,
      tag,
      icon,
      color,
      bgColor,
      name,
      area: area || '',
      desc: desc || '',
      nav,
      nameBefore,
      nameMatch,
      nameAfter
    })
  }

  // 1. 打卡点（机位）
  ;(spots || []).forEach(s => {
    const text = `${s.name || ''} ${s.address || ''} ${(s.tags || []).join(' ')}`.toLowerCase()
    if (!k || text.indexOf(k) >= 0) {
      push('spot', '机位', '📍', '#EE2C2C', 'rgba(238,44,44,0.12)', s.name, s.district || '', { _id: s._id })
    }
  })

  // 2. 旅拍套餐（照片类）
  ;(packages || []).forEach(p => {
    const type = String(p.productType || p.serviceType || p.type || '').toLowerCase()
    if (/video|短视频|视频/.test(type)) return
    const text = `${p.name || ''} ${(p.tags || []).join(' ')}`.toLowerCase()
    if (!k || text.indexOf(k) >= 0) {
      push('package', '旅拍套餐', '🎁', '#FFD36A', 'rgba(255,211,106,0.14)', p.name, p.price ? '¥' + p.price : '', { _id: p._id, seriesId: p.seriesId, spotId: p.spotId }, p.price ? '¥' + p.price : '')
    }
  })

  // 3. 视频旅拍（视频类）
  ;(videos || []).forEach(p => {
    const type = String(p.productType || p.serviceType || p.type || '').toLowerCase()
    if (!/video|短视频|视频/.test(type)) return
    const text = `${p.name || ''} ${(p.tags || []).join(' ')}`.toLowerCase()
    if (!k || text.indexOf(k) >= 0) {
      push('video', '视频旅拍', '🎬', '#FF8D52', 'rgba(255,141,82,0.14)', p.name, '', { _id: p._id, seriesId: p.seriesId, spotId: p.spotId })
    }
  })

  // 4. 照片留影（单品相册）
  ;(albums || []).forEach(a => {
    const text = `${a.name || ''} ${(a.tags || []).join(' ')}`.toLowerCase()
    if (!k || text.indexOf(k) >= 0) {
      push('photo', '照片留影', '📷', '#FFD36A', 'rgba(255,211,106,0.14)', a.name, '', { _id: a._id, seriesId: a.seriesId, spotId: a.spotId })
    }
  })

  // 5. 旅拍灵感（攻略）
  ;(guides || []).forEach(g => {
    const text = `${g.title || ''}`.toLowerCase()
    if (!k || text.indexOf(k) >= 0) {
      push('guide', '攻略', '📖', '#FF8D52', 'rgba(255,141,82,0.12)', g.title, g.spotName || '', { _id: g._id })
    }
  })

  return out
}

module.exports = { buildSearchSuggestions }
