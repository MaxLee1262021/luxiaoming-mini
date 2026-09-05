const sourceStore = require('./store/sourceStore')
const { parseScene } = require('./utils/query')
const { API_BASE, CORP_ID } = require('./config/env')
const { callCloud, login } = require('./api/client')
const shareHelper = require('./utils/share')
const analytics = require('./utils/analytics')

// 全站分享兜底：任何页面未定义 onShareAppMessage / onShareTimeline 时注入默认实现，
// 保证右上角菜单「转发 / 分享到朋友圈」全站可用，文案统一品牌口吻；页面可自行覆盖。
const _nativePage = Page
Page = function (config) {
  if (typeof config === 'object' && config) {
    if (typeof config.onShareAppMessage !== 'function') config.onShareAppMessage = shareHelper.defaultShare
    if (typeof config.onShareTimeline !== 'function') config.onShareTimeline = shareHelper.defaultTimeline
  }
  return _nativePage(config)
}

// 统一品牌 Toast（方案 A：深色玻璃药丸）：重写 wx.showToast，优先调用页面内的 <lxm-toast id="lxmToast"/> 组件；
// 若当前页未挂载该组件，自动回退原生，保证任何提示都不丢失。
const _nativeShowToast = wx.showToast
wx.showToast = function (opts = {}) {
  try {
    const pages = getCurrentPages()
    const page = pages && pages.length ? pages[pages.length - 1] : null
    const inst = page && typeof page.selectComponent === 'function' ? page.selectComponent('#lxmToast') : null
    if (inst && typeof inst.show === 'function') {
      const type = opts.icon === 'success' ? 'success' : (opts.icon === 'error' ? 'error' : 'none')
      inst.show({ title: opts.title || '', type })
      return
    }
  } catch (e) {
    /* 组件未挂载，下方回退原生 */
  }
  return _nativeShowToast(opts)
}

App({
  onLaunch(options = {}) {
    // 全局错误监控：未处理异常与 Promise 拒绝先落 console，后续接入监控后台时在此上报
    this.initErrorMonitor()
    // 启动埋点：记录进入来源，方便后续做渠道效果分析
    analytics.track('app_launch', {
      scene: (options && options.scene) || (this.globalData.source && this.globalData.source.scene) || ''
    })
    // 自托管架构：不再依赖微信云开发。启动即登录拿 openid（失败也不阻塞首屏）。
    login()
      .then((oid) => { this.globalData.openid = oid })
      .catch((e) => { console.warn('登录失败（不影响浏览）', e) })
    // 记录进入来源（普通带参启动：如 scene=shopId=xxx）
    if (options && options.query) this.captureSource(options.query)
    this.initPrivacy()
  },

  onShow(options = {}) {
    // 从后台切回前台也补一次来源采集（冷启动时 onLaunch 已做）
    if (options && options.query && Object.keys(options.query).length) {
      if (options.query.scene || options.query.shopId || options.query.codeId) {
        this.captureSource(options.query)
      }
    }
  },

  // 全局错误监控：捕获脚本错误与未处理的 Promise 拒绝
  initErrorMonitor() {
    if (typeof wx.onError === 'function') {
      wx.onError((error) => {
        console.error('[global] 脚本错误', error)
      })
    }
    if (typeof wx.onUnhandledRejection === 'function') {
      wx.onUnhandledRejection((res) => {
        console.error('[global] 未处理的 Promise 拒绝', res && res.reason)
      })
    }
  },

  // 隐私授权：微信要求收集手机号/微信信息前必须让用户同意
  initPrivacy() {
    if (typeof wx.onNeedPrivacyAuthorize !== 'function') return

    // 当任意页面调用需要隐私授权的接口（如授权手机号）时，微信会先走到这里
    wx.onNeedPrivacyAuthorize((resolve, event) => {
      this.globalData._privacyResolve = resolve
      this.globalData._privacyEvent = event
      this.globalData._privacyNeed = true
      this._showPrivacyModalIfReady()
    })

    // 首次进入主动检查：若还未授权，则弹出授权框
    wx.getPrivacySetting({
      success: (res) => {
        if (res.needAuthorization && typeof wx.requirePrivacyAuthorize === 'function') {
          wx.requirePrivacyAuthorize({ success() {}, fail() {} })
        }
      }
    })
  },

  // 当前页面已挂载隐私弹窗组件时，立即让它显示
  _showPrivacyModalIfReady() {
    if (this._privacyModal && this.globalData._privacyNeed) {
      this._privacyModal.show()
    }
  },

  // 由隐私弹窗组件在 attached/detached 时调用，登记当前可用的弹窗实例
  registerPrivacyModal(instance) {
    this._privacyModal = instance
    this._showPrivacyModalIfReady()
  },

  unregisterPrivacyModal(instance) {
    if (this._privacyModal === instance) this._privacyModal = null
  },

  parseScene(rawScene = '') {
    return parseScene(rawScene)
  },
  captureSource(options = {}) {
    const source = sourceStore.captureSource(options)
    this.globalData.source = source
    return source
  },
  // 商家二维码扫码链路：用短码 c=XXXX 反查商家与铺放位置，写入来源。
  // 由非 tabBar 落地页 scanEntry 在 onLoad 时调用。
  async resolveMerchantSource(options = {}) {
    const sceneParams = parseScene(options.scene)
    const c = options.c || sceneParams.c || (options.query && options.query.c) || ''
    if (!c) return this.getSource()
    try {
      const result = await callCloud('resolveMerchantCode', { c })
      if (result && result.success && result.shopId) {
        const source = {
          shopId: result.shopId,
          scene: result.scene || '',
          sourceType: 'shop',
          codeId: c,
          placementType: result.placementType || '',
          placementLabel: result.placementLabel || ''
        }
        sourceStore.setSource(source)
        this.globalData.source = source
        return source
      }
    } catch (e) {
      console.error('resolve merchant source failed', e)
    }
    return this.getSource()
  },
  getSource() {
    return this.globalData.source || sourceStore.getSource()
  },
  globalData: {
    userInfo: null,
    openid: null,
    source: {},
    sitePageConfig: {},
    // 企业微信客服 ID（corpId）：从 config/env.js 读取；后台 getCorpConfig RPC 就绪后，可改为由运营配置下发覆盖
    corpId: CORP_ID || ''
  }
})
