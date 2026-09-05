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
  const sceneParams = parseScene(options.scene)
  const stored = getSource()
  // 关键：商家码解析出的 codeId/位置字段一旦写入，后续各页面空 options 的 onLoad
  // 不得覆盖掉它们（否则扫码来源在跳到预约页时丢失）。因此这里始终从 stored 回填。
  const source = {
    shopId: options.shopId || sceneParams.shopId || stored.shopId || '',
    scene: options.sceneName || sceneParams.scene || options.scene || stored.scene || '',
    distributorId: options.distributorId || sceneParams.distributorId || sceneParams.distributor || stored.distributorId || '',
    sourceType: options.sourceType || sceneParams.sourceType || sceneParams.channel || stored.sourceType || '',
    codeId: options.codeId || sceneParams.codeId || stored.codeId || '',
    placementType: options.placementType || sceneParams.placementType || stored.placementType || '',
    placementLabel: options.placementLabel || sceneParams.placementLabel || stored.placementLabel || ''
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
