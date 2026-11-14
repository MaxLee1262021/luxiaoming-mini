// 小程序运行环境不依赖浏览器 URL API；外链只接受完整的 HTTPS 地址。
function normalizeExternalUrl(value = '') {
  if (typeof value !== 'string') return ''
  const url = value.trim()
  if (/[\s\\<>"'\u0000-\u001f\u007f]/.test(url)) return ''
  const match = /^https:\/\/([^/?#]+)([/?#].*)?$/i.exec(url)
  if (!match) return ''
  const authority = match[1]
  const host = /^([a-z\d](?:[a-z\d.-]*[a-z\d])?)(?::(\d{1,5}))?$/i.exec(authority)
  if (!host || host[1].length > 253 || (host[2] && (Number(host[2]) < 1 || Number(host[2]) > 65535))) return ''
  if (!host[1].split('.').every(label => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))) return ''
  // 保留路径、查询和片段内已有的百分号编码，避免二次解码改变链接语义。
  return `https://${authority.toLowerCase()}${match[2] || ''}`
}

function decodeExternalUrl(value = '') {
  if (typeof value !== 'string') return ''
  if (/^https:\/\//i.test(value.trim())) return normalizeExternalUrl(value)
  try {
    return normalizeExternalUrl(decodeURIComponent(value))
  } catch (e) {
    return ''
  }
}

module.exports = { normalizeExternalUrl, decodeExternalUrl }
