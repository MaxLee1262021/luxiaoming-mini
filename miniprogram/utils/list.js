function mergeByIdentity(list = [], fallback = []) {
  const seen = {}
  return [...(list || []), ...(fallback || [])].filter(item => {
    if (!item) return false
    const key = item._id || item.albumId || item.id || item.name || JSON.stringify(item)
    if (seen[key]) return false
    seen[key] = true
    return true
  })
}

module.exports = {
  mergeByIdentity
}
