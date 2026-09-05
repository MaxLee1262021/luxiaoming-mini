// 轻量埋点：统一封装 wx.reportEvent / wx.reportAnalytics / wx.reportPerformance
// 微信要求事件 ID 仅含英文字母、数字、下划线，且需在小程序后台「事件分析」配置后才生效；
// 未配置或基础库不支持时静默忽略，绝不影响业务。
// 事件 ID 约定：app_launch（启动）/ booking_submit（提交预约）/ booking_add_item（加购成功）等

function safeReport(fn, ...args) {
  try {
    if (typeof fn === 'function') fn.apply(wx, args)
  } catch (e) {
    /* 埋点失败不影响业务 */
  }
}

function track(eventId, data = {}) {
  safeReport(wx.reportEvent, eventId, data)
  safeReport(wx.reportAnalytics, eventId, data)
}

function reportPerformance(phase, opts = {}) {
  safeReport(wx.reportPerformance, phase, opts)
}

module.exports = { track, reportPerformance }
