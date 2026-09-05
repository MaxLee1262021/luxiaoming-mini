// service/footprint.js — 我的旅拍足迹（城市集章）数据推导
// 章册配置来源优先级：远程 getFootprintConfig RPC > siteConfig 页面配置 > 内置默认长沙章册。
// 点亮规则：用户有效订单（已确认档期及之后）命中该印章的点位关键词 / 点位 ID 即点亮。
const siteConfig = require('./siteConfig')
const footprintConfigApi = require('../api/footprintConfig')

// 默认章册（长沙）。后台可整体覆盖，支持换城市、换枚数、换奖励文案
const DEFAULT_ALBUM = {
  title: '我的旅拍足迹',
  rewardText: '下单旅拍，集城市印章，领定制礼品。',
  stamps: [
    { key: 'mountain', char: '山', name: '岳麓山', keywords: ['岳麓', '麓山', '爱晚亭'] },
    { key: 'river', char: '水', name: '湘江边', keywords: ['湘江', '杜甫江阁', '渔人码头', '江滩', '洋湖'] },
    { key: 'isle', char: '洲', name: '橘子洲', keywords: ['橘子洲', '橘洲'] },
    { key: 'city', char: '城', name: '老长沙', keywords: ['太平', '文和友', 'IFS', '国金', '五一广场', '潮宗街', '坡子街', '天心阁', '解放西'] }
  ]
}

// 计入集章的订单状态：已确认档期及之后（待确认、已取消不计）
const VALID_ORDER_STATUS = [
  'confirmed',
  'deposit_paid',
  'assigned',
  'shooting',
  'editing',
  'final_pending',
  'delivered',
  'completed'
]

// 远程章册缓存（getFootprintConfig 成功下发且 stamps 非空才写入）
let _remoteAlbum = null
// 是否已尝试过远程加载（成功 / 失败均置 true，避免 my 页反复 onShow 重复请求）
let _remoteLoaded = false

// 把后台下发的章册归一化为内部结构（title / rewardText / stamps 三件套）
function normalizeAlbum(remote) {
  return {
    title: remote.title || DEFAULT_ALBUM.title,
    rewardText: remote.rewardText || DEFAULT_ALBUM.rewardText,
    stamps: remote.stamps.map((item, index) => ({
      key: item.key || ('stamp-' + index),
      char: (item.char || item.name || '章').slice(0, 1),
      name: item.name || '',
      keywords: Array.isArray(item.keywords) ? item.keywords : [],
      spotIds: Array.isArray(item.spotIds) ? item.spotIds : []
    }))
  }
}

// 幂等拉取远程章册配置：成功且 stamps 非空才缓存；失败 / 空保留默认，页面零回归。
async function ensureLoaded() {
  if (_remoteLoaded) return
  _remoteLoaded = true
  try {
    const res = await footprintConfigApi.getFootprintConfig()
    const remote = res && res.success ? res.data : null
    if (remote && Array.isArray(remote.stamps) && remote.stamps.length) {
      _remoteAlbum = normalizeAlbum(remote)
    }
  } catch (err) {
    console.warn('getFootprintConfig fallback', err)
  }
}

function getAlbumConfig() {
  if (_remoteAlbum) return _remoteAlbum
  const config = siteConfig.getPageModuleConfig('my') || {}
  const remote = config.footprint
  if (remote && Array.isArray(remote.stamps) && remote.stamps.length) {
    return normalizeAlbum(remote)
  }
  return DEFAULT_ALBUM
}

// 把一张订单摊平成"可用于匹配的文本 + 点位 ID 集合"
function collectOrderTokens(order = {}) {
  const texts = []
  const spotIds = []
  const push = (value) => {
    if (value && typeof value === 'string') texts.push(value)
  }

  push(order.spotName)
  push(order.seriesName)
  push(order.packageName)
  if (order.spotId) spotIds.push(order.spotId)

  const items = Array.isArray(order.items) ? order.items : []
  items.forEach((item) => {
    push(item.spotName)
    push(item.seriesName)
    push(item.packageName)
    if (item.spotId) spotIds.push(item.spotId)
  })

  return { text: texts.join(' '), spotIds }
}

function isValidOrder(order = {}) {
  return VALID_ORDER_STATUS.includes(order.status)
}

function matchStamp(stamp, tokens) {
  const spotIds = stamp.spotIds || []
  if (spotIds.length && tokens.spotIds.some((id) => spotIds.includes(id))) return true
  const keywords = stamp.keywords || []
  if (!keywords.length) return false
  return keywords.some((word) => word && tokens.text.indexOf(word) > -1)
}

/**
 * 由订单列表推导集章进度
 * @param {Array} orders 订单列表
 * @param {Object} options { authReady: 是否已绑定手机号 }
 */
function buildFootprint(orders = [], options = {}) {
  const album = getAlbumConfig()
  const authReady = !!options.authReady
  const validOrders = authReady && Array.isArray(orders) ? orders.filter(isValidOrder) : []
  const tokenList = validOrders.map(collectOrderTokens)

  const stamps = album.stamps.map((stamp) => {
    const hit = tokenList.some((tokens) => matchStamp(stamp, tokens))
    return {
      key: stamp.key,
      char: stamp.char,
      name: stamp.name,
      got: hit
    }
  })

  const total = stamps.length
  const gotCount = stamps.filter((item) => item.got).length
  const remain = total - gotCount

  let subText = album.rewardText
  if (!authReady) {
    subText = '授权手机号后同步你的集章进度。'
  } else if (gotCount === 0) {
    subText = album.rewardText
  } else if (remain > 0) {
    subText = '再集 ' + remain + ' 枚，即可联系客服领取定制礼品。'
  } else {
    subText = '已集满全册，联系客服领取定制礼品。'
  }

  return {
    title: album.title,
    total,
    gotCount,
    progressText: '已集 ' + gotCount + '/' + total,
    completed: total > 0 && gotCount === total,
    subText,
    stamps
  }
}

function getEmptyFootprint(options = {}) {
  return buildFootprint([], options)
}

module.exports = {
  DEFAULT_ALBUM,
  VALID_ORDER_STATUS,
  ensureLoaded,
  buildFootprint,
  getEmptyFootprint,
  getAlbumConfig
}
