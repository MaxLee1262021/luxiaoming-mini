/**
 * 统一品牌 Toast（方案 A：深色玻璃药丸，与骨架屏/弹窗同属一个品牌语言）。
 * 用法：
 *   const toast = require('../../utils/toast')
 *   toast('已加入预约清单')
 *   toast('授权成功', 'success')
 *   toast('出错了', 'error')
 * 依赖：使用页 wxml 内含 <lxm-toast id="lxmToast" /> 且 json 的 usingComponents 声明了该组件。
 * 若当前页未挂载组件，自动回退到原生 wx.showToast，保证不丢提示。
 */
function showLxmToast(title, type) {
  try {
    const pages = getCurrentPages()
    const page = pages && pages.length ? pages[pages.length - 1] : null
    const inst = page && page.selectComponent ? page.selectComponent('#lxmToast') : null
    if (inst && typeof inst.show === 'function') {
      inst.show({ title: title || '', type: type || 'none' })
      return
    }
  } catch (e) {
    /* 组件未挂载，走下方回退 */
  }
  wx.showToast({ title: title || '', icon: type === 'success' ? 'success' : 'none' })
}

module.exports = showLxmToast
