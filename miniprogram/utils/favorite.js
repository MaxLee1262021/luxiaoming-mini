/**
 * utils/favorite.js — 鹿小鸣全局收藏 store
 *
 * 基于 wx.storage 持久化，跨页面 / 跨会话共享。
 * 收藏项结构（item）：
 *   {
 *     type,       // 商品类型，如 photo_single / photo_package / video_single / peripheral
 *     typeLabel,  // 展示用分类名，如 照片留影 / 旅拍套餐 / 视频摄像 / 影像周边
 *     id,         // 唯一标识（必填），同一商品在不同详情页用同一 id 才能保证去重
 *     title,      // 标题
 *     cover,      // 封面图
 *     price,      // 价格（数字或字符串）
 *     spot,       // 打卡点名（展示用，可空）
 *     spotId,     // 打卡点 id（可空）
 *     url,        // 从「我的收藏」跳回详情页的完整 navigate url（必填）
 *     createdAt   // 收藏时间（自动写入）
 *   }
 */

const STORAGE_KEY = 'lxm_favorites_v1'

function safeGet() {
  try {
    const v = wx.getStorageSync(STORAGE_KEY)
    return Array.isArray(v) ? v : []
  } catch (e) {
    return []
  }
}

function safeSet(list) {
  try {
    wx.setStorageSync(STORAGE_KEY, list)
  } catch (e) {
    // 存储异常（如空间不足）静默失败，不影响主流程
  }
}

function normalize(item) {
  const id = item && item.id != null ? String(item.id) : ''
  return {
    type: item.type || '',
    typeLabel: item.typeLabel || '',
    id,
    title: item.title || '',
    cover: item.cover || '',
    price: item.price != null ? item.price : '',
    spot: item.spot || '',
    spotId: item.spotId != null ? String(item.spotId) : '',
    url: item.url || '',
    createdAt: Date.now()
  }
}

function has(id) {
  const sid = id != null ? String(id) : ''
  if (!sid) return false
  return safeGet().some(f => f.id === sid)
}

function add(item) {
  const norm = normalize(item)
  if (!norm.id) return false
  const list = safeGet()
  if (list.some(f => f.id === norm.id)) return false
  list.unshift(norm)
  safeSet(list)
  return true
}

function remove(id) {
  const sid = id != null ? String(id) : ''
  if (!sid) return false
  const list = safeGet()
  const next = list.filter(f => f.id !== sid)
  if (next.length === list.length) return false
  safeSet(next)
  return true
}

// 返回切换后的收藏状态：true=已收藏，false=已取消
function toggle(item) {
  const norm = normalize(item)
  if (!norm.id) return false
  if (has(norm.id)) {
    remove(norm.id)
    return false
  }
  add(norm)
  return true
}

function list() {
  return safeGet()
}

function count() {
  return safeGet().length
}

module.exports = {
  STORAGE_KEY,
  has,
  add,
  remove,
  toggle,
  list,
  count
}
