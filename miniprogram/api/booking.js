const { callCloud } = require('./client')
const { getBookingData } = require('./spot')

async function createBooking(params = {}) {
  try {
    const result = await callCloud('createBooking', params)
    if (!result || result.success !== true) {
      return { success: false, error: (result && (result.error || result.message)) || '预约申请未提交' }
    }
    if (!(result.orderId || result._id) || !result.orderNo) {
      return { success: false, error: '预约服务返回了无效订单信息，请稍后重试' }
    }
    return result
  } catch (err) {
    // 网络或鉴权失败只能显示失败，不能生成本地订单号冒充成功。
    console.warn('[booking] createBooking failed:', (err && err.message) || err)
    return { success: false, error: (err && err.message) || '预约申请失败，请稍后重试' }
  }
}

module.exports = {
  getBookingData,
  createBooking
}
