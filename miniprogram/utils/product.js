/**
 * utils/product.js — 商品类型单一真相源
 *
 * 鹿小鸣旅拍小程序所有商品（照片单品 / 旅拍套餐 / 短视频单品 / 周边）
 * 的类型判定都从这里走，禁止在页面或其他 service 里再手写 if (item.type === 'video')。
 *
 * 规范 category（统一用这一个字段）：
 *   photo_single   照片单品
 *   photo_package  旅拍套餐
 *   video_single   短视频单品
 *   peripheral     周边
 *
 * 兼容后台旧字段：type / serviceType / productType / category / displayType /
 * productKind / kind / goodsType / videoId / cate / isVideo，前端先理顺，
 * 不强制后台立即改字段。
 */

const CATEGORY = {
  PHOTO_SINGLE: 'photo_single',
  PHOTO_PACKAGE: 'photo_package',
  VIDEO_SINGLE: 'video_single',
  PERIPHERAL: 'peripheral'
}

const MEDIATYPE = {
  PHOTO: 'photo',
  VIDEO: 'video'
}

const CATEGORY_VALUES = Object.values(CATEGORY)

function normalizeType(value = '') {
  return String(value || '').trim().toLowerCase()
}

// 兼容旧字段里可能出现的视频/照片关键词
function collectTypeWords(item = {}) {
  return [
    item.category,
    item.serviceType,
    item.productType,
    item.type,
    item.displayType,
    item.productKind,
    item.kind,
    item.goodsType
  ]
    .map(normalizeType)
    .filter(Boolean)
}

/**
 * 解析商品 category（单一真相源）
 * 优先级：显式 category → videoId/isVideo → 含 video 词 → productKind=video_single → cate → 含 photo 词 → demo-album id → 默认照片单品
 */
function resolveCategory(item = {}) {
  if (item.category && CATEGORY_VALUES.includes(item.category)) {
    return item.category
  }

  const words = collectTypeWords(item)
  const joined = words.join(' ')
  const hasVideoWord = /video|短视频|视频/.test(joined)
  const hasPhotoWord = /photo|照片|写真|拍照/.test(joined)
  const isSingleKind = item.productKind === 'video_single' || item.goodsType === 'video_single' || words.some(w => w.includes('single'))

  if (item.videoId || item.isVideo === true || hasVideoWord) {
    return CATEGORY.VIDEO_SINGLE
  }
  if (isSingleKind) return CATEGORY.VIDEO_SINGLE
  if (item.cate) return CATEGORY.PERIPHERAL
  if (hasPhotoWord) return CATEGORY.PHOTO_PACKAGE
  if (item._id && String(item._id).startsWith('demo-album')) return CATEGORY.PHOTO_SINGLE
  return CATEGORY.PHOTO_SINGLE
}

function getMediaType(item = {}) {
  const cat = resolveCategory(item)
  if (cat === CATEGORY.VIDEO_SINGLE) return MEDIATYPE.VIDEO
  if (cat === CATEGORY.PERIPHERAL) return null
  return MEDIATYPE.PHOTO
}

// ---- 类型谓词（统一从这里取，页面/service 不要再各自重写）----
function isVideo(item = {}) {
  const c = resolveCategory(item)
  return c === CATEGORY.VIDEO_SINGLE
}
function isPhoto(item = {}) {
  const c = resolveCategory(item)
  return c === CATEGORY.PHOTO_SINGLE || c === CATEGORY.PHOTO_PACKAGE
}
function isPeripheral(item = {}) {
  return resolveCategory(item) === CATEGORY.PERIPHERAL
}
function isVideoSingle(item = {}) {
  return resolveCategory(item) === CATEGORY.VIDEO_SINGLE
}
function isPhotoSingle(item = {}) {
  return resolveCategory(item) === CATEGORY.PHOTO_SINGLE
}
function isPhotoPackage(item = {}) {
  return resolveCategory(item) === CATEGORY.PHOTO_PACKAGE
}

function normalizePackage(item = {}) {
  const category = resolveCategory(item)
  const video = isVideo(item)
  const photo = isPhoto(item)
  const peripheral = isPeripheral(item)
  const single = isVideoSingle(item) || isPhotoSingle(item)
  const isPkg = isPhotoPackage(item)
  const tags = item.serviceTags || item.tags || []
  const id = item._id || item.id || item.packageId || item.productId || ''
  const description = item.description || item.intro || item.desc || ''
  return {
    ...item,
    _id: id,
    id: item.id || id,
    name: item.name || item.title || '',
    intro: description,
    description,
    cover: item.cover || item.coverUrl || item.image || '/images/placeholder.png',
    category,
    mediaType: getMediaType(item),
    displayType: video ? 'video' : 'photo',
    displayTypeLabel: video ? '视频摄像' : '照片留影',
    isVideo: video,
    isPhoto: photo,
    isPeripheral: peripheral,
    isSingle: single,
    isPackage: isPkg,
    displayTags: normalizeTags(tags)
  }
}

function normalizePackageList(list = []) {
  return (list || []).map(item => normalizePackage(item)).filter(Boolean)
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.filter(Boolean)
  if (!tags) return []
  return String(tags).split(/[，,、|]/).map(item => item.trim()).filter(Boolean)
}

function buildVideoFields(pkg = {}) {
  if (!isVideo(pkg)) return []
  const fieldMap = [
    ['视频时长', pkg.videoDuration || (pkg.duration ? `${pkg.duration} 分钟拍摄` : '')],
    ['成片数量', pkg.finishedVideoCount || pkg.videoCount || pkg.deliverCount],
    ['航拍服务', pkg.hasAerial === true || pkg.aerial === true ? '包含' : (pkg.hasAerial === false ? '不含' : '')],
    ['全包剪辑', pkg.fullEdit === true || pkg.includeEditing === true ? '包含' : (pkg.fullEdit === false ? '不含' : '')],
    ['交付周期', pkg.deliveryCycle || pkg.deliveryDays],
    ['航拍加价', pkg.aerialExtraPrice || pkg.aerialPrice]
  ]
  return fieldMap
    .filter(item => item[1] !== undefined && item[1] !== null && item[1] !== '')
    .map(item => ({ label: item[0], value: item[1] }))
}

function buildPackageBenefits(pkg = {}) {
  const benefits = []
  const pushBenefit = (label, value) => {
    if (value === undefined || value === null || value === '') return
    benefits.push({ label, value })
  }

  if (isVideo(pkg)) {
    pushBenefit('主服务', pkg.videoDuration ? `视频摄像拍摄 ${pkg.videoDuration}` : '视频摄像拍摄')
    pushBenefit('成片交付', pkg.finishedVideoCount || pkg.videoCount || pkg.deliverCount)
  } else {
    pushBenefit('主服务', pkg.duration ? `照片拍摄 ${pkg.duration} 分钟` : '照片拍摄')
    pushBenefit('精修照片', pkg.retouchCount ? `${pkg.retouchCount} 张` : '')
  }

  pushBenefit('赠送打卡照', pkg.bonusPhotoCount ? `${pkg.bonusPhotoCount} 张` : '')
  pushBenefit('赠送精修', pkg.bonusRetouchCount ? `${pkg.bonusRetouchCount} 张` : '')
  pushBenefit('底片数量', pkg.rawPhotoCount ? `${pkg.rawPhotoCount} 张` : '')
  pushBenefit('妆造支持', pkg.makeupIncluded === true ? '包含' : (pkg.makeupIncluded === false ? '不含' : ''))
  pushBenefit('服装支持', pkg.costumeIncluded === true ? '包含' : (pkg.costumeIncluded === false ? '不含' : ''))

  const giftItems = Array.isArray(pkg.giftItems) ? pkg.giftItems : []
  giftItems.forEach(item => {
    if (typeof item === 'string') {
      pushBenefit('套餐赠送', item)
    } else if (item && item.name) {
      pushBenefit(item.label || '套餐赠送', item.name)
    }
  })

  const includedServices = Array.isArray(pkg.includedServices) ? pkg.includedServices : []
  includedServices.forEach(item => pushBenefit('包含服务', item))

  return benefits
}

const PUBLIC_HIDDEN_STATUSES = [
  'draft', 'pending', 'reviewing', 'rejected', 'offline', 'disabled', 'down',
  '草稿', '待审', '待审核', '驳回', '下架', '停用', '禁用', '已下', '已下架'
]
const PUBLIC_AUDIT_STATUSES = [
  'approved', 'pass', 'passed', 'published', 'online', '已上', '已上架',
  '审核通过', '通过', '已审', '已审核'
]

// Public RPCs already filter most rows, but pages can also receive preview or
// merged data. Keep the same visibility contract at the client boundary.
function isPublicProduct(item = {}) {
  if (!item || item.deleted === true || item.isDeleted === true || item.isShow === false || item.visible === false || item.enabled === false) return false
  const status = normalizeType(item.status || item.saleStatus || item.shelfStatus)
  if (status && PUBLIC_HIDDEN_STATUSES.includes(status)) return false
  const auditStatus = normalizeType(item.auditStatus || item.reviewStatus)
  if (auditStatus && !PUBLIC_AUDIT_STATUSES.includes(auditStatus)) return false
  const productType = normalizeType(item.productType || item.serviceType || item.type)
  if (['add_on', 'addon', 'add-on', '增值服务', '增值'].includes(productType)) return false
  return true
}

function filterVisibleProducts(list = []) {
  return (list || []).filter(isPublicProduct)
}

function filterPackagesByTypeAndSpot(packages = [], { type = '', spotId = '' } = {}) {
  const t = normalizeType(type)
  const wantVideo = /video|短视频|视频/.test(t)
  const wantPhoto = /photo|照片|写真|拍照/.test(t) || t === 'photo'
  return filterVisibleProducts(packages).filter(item => {
    const video = isVideo(item)
    let typeMatched = true
    if (wantVideo) typeMatched = video
    else if (wantPhoto) typeMatched = !video
    else if (t) typeMatched = (item.productType === t) || (item.serviceType === t) || (item.type === t)
    const spotMatched = !spotId
      || item.spotId === spotId
      || (Array.isArray(item.spotIds) && item.spotIds.includes(spotId))
    return typeMatched && spotMatched
  })
}

function sortByHotScore(list = []) {
  return [...list].sort((a, b) => (b.hotScore || 0) - (a.hotScore || 0))
}

module.exports = {
  CATEGORY,
  MEDIATYPE,
  resolveCategory,
  getMediaType,
  isVideo,
  isPhoto,
  isPeripheral,
  isVideoSingle,
  isPhotoSingle,
  isPhotoPackage,
  normalizePackage,
  normalizePackageList,
  normalizeTags,
  buildVideoFields,
  isPublicProduct,
  buildPackageBenefits,
  filterVisibleProducts,
  filterPackagesByTypeAndSpot,
  sortByHotScore
}
