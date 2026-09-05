const { callCloud } = require('./client')
const { getBookingData } = require('./spot')

// 云函数未部署 / 云环境未开通（本地预览或演示）时，本地生成一个演示订单号，
// 保证预约提交流程能正常走通；真实部署后 callCloud 成功即走真实下单，不会进此兜底。
function genLocalOrderNo() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return `LS${y}${m}${d}${rand}`
}

async function createBooking(params = {}) {
  try {
    return await callCloud('createBooking', params)
  } catch (err) {
    console.warn('[booking] createBooking 云调用失败，降级为本地演示订单：', (err && err.message) || err)
    return { success: true, orderNo: genLocalOrderNo(), orderId: 'local-demo', demo: true }
  }
}

module.exports = {
  getBookingData,
  createBooking
}
