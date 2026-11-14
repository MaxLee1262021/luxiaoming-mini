// Shared presentation contract for guides returned by current and older RPCs.
const { API_BASE } = require('../config/env')

const HIDDEN_STATUSES = ['草稿', '下架', '已下架', '停用', '禁用', '待审核', '待发布', 'draft', 'offline', 'disabled', 'pending']

function isPublicGuide(item = {}) {
  const explicitlyFalse = value => value === false || value === 0 || value === '0' || value === 'false'
  if (!item || item.deleted || item.isDeleted || ['isShow', 'visible', 'enabled', 'published'].some(key => explicitlyFalse(item[key]))) return false
  return !HIDDEN_STATUSES.includes(String(item.status || '').trim().toLowerCase())
}

function guideSpotIds(item = {}) {
  return [...new Set([
    ...(Array.isArray(item.spotIds) ? item.spotIds : []), item.spotId
  ].filter(value => value !== undefined && value !== null && String(value).trim()).map(String))]
}

function matchesSpot(item = {}, spotId = '') {
  return !spotId || guideSpotIds(item).includes(String(spotId))
}

function decodeEntities(value = '') {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }
  return String(value).replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, entity) => {
    if (entity[0] !== '#') return entities[entity.toLowerCase()] || all
    const numeric = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
    return numeric > 0 && numeric <= 0x10ffff && !(numeric >= 0xd800 && numeric <= 0xdfff) ? String.fromCodePoint(numeric) : ''
  })
}

function mediaUrl(value = '') {
  const url = decodeEntities(value).trim()
  if (/[\u0000-\u0020\u007f\\<>"']/.test(url)) return ''
  if (/^https?:\/\/[^/?#@]+(?:[/?#].*)?$/i.test(url)) return url
  // /images belongs to the mini program; all other root paths belong to the API origin.
  if (/^\/images\//.test(url)) return url
  if (/^\/(?!\/)/.test(url)) {
    const origin = API_BASE.match(/^https?:\/\/[^/]+/i)
    return origin ? origin[0] + url : url
  }
  return ''
}

function guideAttachmentUrl(value = '') {
  const url = mediaUrl(value)
  const origin = (API_BASE.match(/^https?:\/\/[^/]+/i) || [])[0] || ''
  const prefix = origin + '/api/media/'
  if (!origin || !url.startsWith(prefix)) return null
  const match = url.slice(prefix.length).match(/^(file_[a-f0-9]{32,48})(?:\?download=(?:1|true))?$/)
  return match ? { url: prefix + match[1], fileId: match[1] } : null
}

function attachmentSize(size) {
  if (!Number.isFinite(size) || size <= 0) return ''
  if (size < 1024) return size + ' B'
  if (size < 1024 * 1024) return Math.round(size / 1024 * 10) / 10 + ' KB'
  return Math.round(size / (1024 * 1024) * 10) / 10 + ' MB'
}

function normalizeGuide(item = {}) {
  if (!item) return item
  const spotIds = guideSpotIds(item)
  const rawSpots = Array.isArray(item.spots) ? item.spots : (Array.isArray(item.relatedSpots) ? item.relatedSpots : [])
  const spots = rawSpots.filter(Boolean).map(spot => ({
    id: String(spot.id || spot._id || ''), name: spot.name || spot.spotName || '', cover: mediaUrl(spot.cover || spot.image || '')
  })).filter(spot => spot.id && spotIds.includes(spot.id))
  const firstSpotId = String(item.spotId || spotIds[0] || '')
  if (firstSpotId && !spots.some(spot => spot.id === firstSpotId)) {
    spots.unshift({ id: firstSpotId, name: item.spotName || '查看打卡点', cover: mediaUrl(item.spotCover || '') })
  }
  spotIds.forEach(id => {
    if (!spots.some(spot => spot.id === id)) spots.push({ id, name: '查看打卡点', cover: '' })
  })
  const isTop = item.isTop === true || (item.isTop === undefined && item.pinned === true)
  const mediaItems = (Array.isArray(item.mediaItems) ? item.mediaItems : (Array.isArray(item.mediaUrls) ? item.mediaUrls : []))
    .filter(Boolean).map(media => {
      const url = mediaUrl(typeof media === 'string' ? media : media.url)
      return { url, type: media.type || (item.mediaType === 'video' || /\.(mp4|mov|webm)(\?|$)|\/video\//i.test(url) ? 'video' : 'image') }
    }).filter(media => media.url)
  const content = Array.isArray(item.content) ? item.content : String(item.content || item.description || '').split(/\n+/).map(text => text.trim()).filter(Boolean)
  return {
    ...item,
    _id: item._id || item.id || '',
    title: item.title || item.name || '',
    description: item.description || '',
    image: mediaUrl(item.cover || item.coverUrl || item.image || '') || '/images/placeholder.png',
    cover: mediaUrl(item.cover || item.coverUrl || item.image || ''),
    spotId: firstSpotId, spotIds, spots,
    spotName: item.spotName || (spots[0] && spots[0].name) || '',
    spotCover: mediaUrl(item.spotCover || ''),
    contentHtml: typeof item.contentHtml === 'string' ? item.contentHtml : '',
    content, mediaItems, mediaUrls: mediaItems.map(media => media.url),
    targetProductSpotId: String(item.targetProductSpotId || ''),
    bookingProduct: item.bookingProduct || null,
    isTop, pinned: isTop,
    readCount: item.readCount || item.views || 0
  }
}

function publicGuides(list = []) {
  return (Array.isArray(list) ? list : []).filter(isPublicGuide).map(normalizeGuide).sort((a, b) => {
    const top = Number(b.isTop) - Number(a.isTop)
    if (top) return top
    const timestamp = item => {
      const value = item.updatedAt || item.updateTime || item.createTime || item.createdAt || ''
      return typeof value === 'number' || /^\d+$/.test(value) ? Number(value) : (Date.parse(value) || 0)
    }
    return timestamp(b) - timestamp(a)
  })
}

const TAG_STYLES = {
  p: 'margin:0 0 16px;line-height:1.8;', div: 'line-height:1.8;',
  h1: 'font-size:25px;font-weight:bold;margin:20px 0 12px;',
  h2: 'font-size:22px;font-weight:bold;margin:20px 0 12px;',
  h3: 'font-size:19px;font-weight:bold;margin:18px 0 10px;',
  h4: 'font-size:17px;font-weight:bold;margin:16px 0 8px;',
  h5: 'font-size:16px;font-weight:bold;margin:14px 0 8px;',
  h6: 'font-size:15px;font-weight:bold;margin:12px 0 8px;',
  blockquote: 'margin:16px 0;padding:8px 12px;border-left:3px solid #d9c7b2;color:#7d7266;background:#f8f5f0;',
  ul: 'margin:12px 0;padding-left:24px;', ol: 'margin:12px 0;padding-left:24px;', li: 'margin-bottom:6px;',
  hr: 'margin:20px 0;border:0;border-top:1px solid #e9e3db;',
  strong: 'font-weight:bold;', b: 'font-weight:bold;', em: 'font-style:italic;', i: 'font-style:italic;',
  u: 'text-decoration:underline;', s: 'text-decoration:line-through;', strike: 'text-decoration:line-through;',
  pre: 'white-space:pre-wrap;padding:12px;background:#f8f5f0;', code: 'font-family:monospace;'
}
const ALLOWED_TAGS = new Set([...Object.keys(TAG_STYLES), 'br', 'span', 'a', 'img', 'video', 'source'])
const VOID_TAGS = new Set(['br', 'hr', 'img', 'source'])

function readAttributes(tag = '') {
  const attrs = {}
  tag.replace(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g, (_, key, double, single, bare) => {
    attrs[key.toLowerCase()] = decodeEntities(double === undefined ? (single === undefined ? bare : single) : double)
    return ''
  })
  return attrs
}

// Parse to rich-text nodes, then move images/video into native components.
// This preserves their position in the article and enables image previews;
// WeChat rich-text deliberately does not render video elements.
function guideContentBlocks(html = '') {
  const root = { children: [] }
  const stack = [root]
  const clean = String(html).replace(/<(script|style|iframe|object|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
  const tokens = clean.match(/<!--[\s\S]*?-->|<[^>]*>|[^<]+|</g) || []
  tokens.forEach(token => {
    if (token.startsWith('<!--') || /^<!/.test(token)) return
    const closing = token.match(/^<\/\s*([\w-]+)/)
    if (closing) {
      const name = closing[1].toLowerCase()
      for (let i = stack.length - 1; i > 0; i--) {
        if ((stack[i].sourceName || stack[i].name) === name) { stack.length = i; break }
      }
      return
    }
    const opening = token.match(/^<\s*([\w-]+)/)
    if (!opening) {
      stack[stack.length - 1].children.push({ type: 'text', text: decodeEntities(token) })
      return
    }
    const name = opening[1].toLowerCase()
    if (!ALLOWED_TAGS.has(name)) return
    const attrs = readAttributes(token.slice(opening[0].length))
    if (name === 'source') {
      const video = stack.slice().reverse().find(node => node.name === 'video')
      if (video && !video.url) video.url = mediaUrl(attrs.src)
      return
    }
    const node = { name, attrs: { style: TAG_STYLES[name] || '' }, children: [] }
    if (name === 'img' || name === 'video') {
      node.url = mediaUrl(attrs.src)
      node.poster = mediaUrl(attrs.poster)
      node.alt = attrs.alt || ''
    }
    // Only uploaded guide attachments become actionable. Other links stay text.
    if (name === 'a') {
      node.name = 'span'; node.sourceName = 'a'
      const attachment = guideAttachmentUrl(attrs.href || '')
      if (attachment && (!attrs['data-file-id'] || attrs['data-file-id'] === attachment.fileId)) {
        const size = Number(attrs['data-file-size'] || 0)
        node.attachment = {
          ...attachment,
          name: String(attrs['data-file-name'] || '').slice(0, 255),
          mimeType: attrs['data-file-type'] || '',
          size: Number.isFinite(size) && size > 0 ? size : 0,
          sizeLabel: attachmentSize(size)
        }
      }
    }
    stack[stack.length - 1].children.push(node)
    if (!VOID_TAGS.has(name) && !/\/\s*>$/.test(token)) stack.push(node)
  })
  const split = node => {
    if (node.attachment) {
      const text = children => (children || []).map(child => child.type === 'text' ? child.text : text(child.children)).join('')
      return [{ type: 'attachment', ...node.attachment, name: node.attachment.name || text(node.children).trim().slice(0, 255) || '下载附件' }]
    }
    if (node.name === 'img' || node.name === 'video') {
      return node.url ? [{ type: node.name === 'img' ? 'image' : 'video', url: node.url, poster: node.poster, alt: node.alt }] : []
    }
    if (node.type === 'text') return [{ type: 'richText', nodes: [node] }]
    const blocks = []
    ;(node.children || []).forEach(child => {
      split(child).forEach(block => {
        const last = blocks[blocks.length - 1]
        if (block.type === 'richText' && last && last.type === 'richText') last.nodes.push(...block.nodes)
        else blocks.push(block)
      })
    })
    if (!blocks.length && (node.name === 'hr' || node.name === 'br')) blocks.push({ type: 'richText', nodes: [] })
    if (node.name) return blocks.map(block => block.type === 'richText'
      ? { type: 'richText', nodes: [{ name: node.name, attrs: node.attrs, children: block.nodes }] } : block)
    return blocks
  }
  return split(root).filter(block => block.type !== 'richText' || block.nodes.some(node => node.type !== 'text' || node.text.trim()))
    .map((block, index) => ({ ...block, key: `guide-block-${index}` }))
}

module.exports = { isPublicGuide, guideSpotIds, matchesSpot, normalizeGuide, publicGuides, guideContentBlocks, mediaUrl, guideAttachmentUrl }
