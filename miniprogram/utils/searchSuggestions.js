// 搜索建议构建：首页 / 探索页共用同一份「跨五类检索」逻辑，
// 输入为空返回全部（用于默认「全部内容」态），有输入返回实时匹配。
// 与 utils/searchNav.js 配合，做到「点建议直达 / 点搜索跳结果页」两端完全一致的最后一公里。
const demoData = require('./demoData')

function buildSearchSuggestions(kw, spots) {
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
  ;(demoData.packages || []).forEach(p => {
    if (p.productType && p.productType !== 'photo') return
    const text = `${p.name || ''} ${(p.tags || []).join(' ')}`.toLowerCase()
    if (!k || text.indexOf(k) >= 0) {
      push('package', '旅拍套餐', '🎁', '#FFD36A', 'rgba(255,211,106,0.14)', p.name, p.price ? '¥' + p.price : '', { _id: p._id, seriesId: p.seriesId, spotId: p.spotId }, p.price ? '¥' + p.price : '')
    }
  })

  // 3. 视频旅拍（视频类）
  ;(demoData.packages || []).forEach(p => {
    if (p.productType !== 'video') return
    const text = `${p.name || ''} ${(p.tags || []).join(' ')}`.toLowerCase()
    if (!k || text.indexOf(k) >= 0) {
      push('video', '视频旅拍', '🎬', '#FF8D52', 'rgba(255,141,82,0.14)', p.name, '', { _id: p._id, seriesId: p.seriesId, spotId: p.spotId })
    }
  })

  // 4. 照片留影（单品相册）
  ;(demoData.albums || []).forEach(a => {
    const text = `${a.name || ''} ${(a.tags || []).join(' ')}`.toLowerCase()
    if (!k || text.indexOf(k) >= 0) {
      push('photo', '照片留影', '📷', '#FFD36A', 'rgba(255,211,106,0.14)', a.name, '', { _id: a._id, seriesId: a.seriesId, spotId: a.spotId })
    }
  })

  // 5. 旅拍灵感（攻略）
  ;(demoData.guides || []).forEach(g => {
    const text = `${g.title || ''}`.toLowerCase()
    if (!k || text.indexOf(k) >= 0) {
      push('guide', '攻略', '📖', '#FF8D52', 'rgba(255,141,82,0.12)', g.title, g.spotName || '', { _id: g._id })
    }
  })

  return out
}

module.exports = { buildSearchSuggestions }
