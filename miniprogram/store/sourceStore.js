const { parseScene } = require('../utils/query')

const STORAGE_KEY = 'lxm_source'

function getSource() {
  return wx.getStorageSync(STORAGE_KEY) || {}
}

function setSource(source = {}) {
  wx.setStorageSync(STORAGE_KEY, source)
  return source
}

function captureSource(options = {}) {
  options = options.query || options
  const sceneParams = parseScene(options.scene)
  const stored = getSource()
  // Customer-service links are click events, even if a merchant scene was
  // appended to the URL. They must not introduce a merchant order source.
  if (options.staffWecomId || options.staff_id || options.s || sceneParams.staffWecomId || sceneParams.staff_id || sceneParams.s
    || options.linkId || options.link_id || options.l || sceneParams.linkId || sceneParams.link_id || sceneParams.l) return stored
  let rawScene = String(options.scene || '')
  try { rawScene = decodeURIComponent(rawScene) } catch (_) {}
  const shareScene = /^S[A-Za-z0-9]{2,31}$/.test(rawScene) ? rawScene : ''
  const legacyCode = String(options.c || sceneParams.c || '').trim()
  if (shareScene || legacyCode) {
    // Internal links carry the current legacy scene too. Keep the already
    // resolved city/placement when they refer to the exact same code.
    if (!shareScene && stored.codeId === legacyCode && stored.scene === `c=${legacyCode}`) return stored
    // New QR entries replace the whole attribution candidate. Mixing a new
    // scene with an older shop/code can attribute an order to the wrong shop.
    // The server validates this raw code when creating the booking; scan
    // reporting remains independent and does not delay navigation or checkout.
    return setSource({
      shopId: '', scene: shareScene || `c=${legacyCode}`, distributorId: '',
      sourceType: 'merchant_qrcode', codeId: shareScene ? '' : legacyCode,
      placementType: '', placementLabel: '', cityId: '', city: ''
    })
  }
  // 关键：商家码解析出的 codeId/位置字段一旦写入，后续各页面空 options 的 onLoad
  // 不得覆盖掉它们（否则扫码来源在跳到预约页时丢失）。因此这里始终从 stored 回填。
  const source = {
    shopId: options.shopId || sceneParams.shopId || stored.shopId || '',
    scene: options.sceneName || sceneParams.scene || options.scene || stored.scene || '',
    distributorId: options.distributorId || sceneParams.distributorId || sceneParams.distributor || stored.distributorId || '',
    sourceType: options.sourceType || sceneParams.sourceType || sceneParams.channel || stored.sourceType || '',
    codeId: options.codeId || sceneParams.codeId || stored.codeId || '',
    placementType: options.placementType || sceneParams.placementType || stored.placementType || '',
    placementLabel: options.placementLabel || sceneParams.placementLabel || stored.placementLabel || '',
    cityId: options.cityId || sceneParams.cityId || stored.cityId || '',
    city: options.city || sceneParams.city || stored.city || ''
  }

  if (source.shopId || source.scene || source.distributorId || source.sourceType || source.codeId) {
    return setSource(source)
  }
  return source
}

module.exports = {
  captureSource,
  getSource,
  setSource
}
