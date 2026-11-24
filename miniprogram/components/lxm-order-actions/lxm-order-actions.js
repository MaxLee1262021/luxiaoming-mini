const orderApi = require('../../api/order')
const { normalizeOrder } = require('../../utils/order')

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

Component({
  properties: {
    item: { type: Object, value: {} },
    action: { type: String, value: '' }
  },
  data: { visible: false, submitting: false, date: '', time: '', reason: '', error: '', minDate: '' },
  observers: {
    action(action) {
      if (!['cancel', 'reschedule', 'refund'].includes(action)) {
        this.setData({ visible: false })
        return
      }
      this.setData({ visible: true, date: '', time: '', reason: '', error: '', minDate: today() })
    }
  },
  methods: {
    stopTap() {},
    close() {
      if (this.data.submitting) return
      this.setData({ visible: false })
      this.triggerEvent('close')
    },
    onDate(e) { this.setData({ date: e.detail.value, error: '' }) },
    onTime(e) { this.setData({ time: e.detail.value, error: '' }) },
    onReason(e) { this.setData({ reason: e.detail.value, error: '' }) },
    async submit() {
      if (this.data.submitting) return
      const order = normalizeOrder(this.data.item || {})
      const action = this.data.action
      const reschedule = action === 'reschedule'
      const refund = action === 'refund'
      if (!['cancel', 'reschedule', 'refund'].includes(action) || !order._id) return
      const allowed = reschedule ? order.canReschedule : refund ? order.canApplyRefund : order.canCancel
      if (!allowed) {
        this.setData({ error: reschedule ? '订单状态已变化，当前不能申请改期，请刷新订单。' : refund ? '订单状态已变化，当前不能取消预约，请刷新订单或联系客服。' : '订单已定档或状态已变化，当前不能取消，请刷新订单。' })
        return
      }
      const reason = String(this.data.reason || '').trim()
      if (reason.length < 2) return this.setData({ error: '请填写至少 2 个字的原因' })
      if (reschedule) {
        const date = this.data.date
        const time = this.data.time
        if (!date || !time) return this.setData({ error: '请选择期望拍摄日期和时间' })
        if (date < today() || new Date(`${date}T${time}:00`).getTime() <= Date.now()) {
          return this.setData({ error: '请选择未来的拍摄时间' })
        }
      }
      this.setData({ submitting: true, error: '' })
      try {
        const storageKey = `lxm_${action}_order_${order._id}`
        // Keep the same key after a timeout; a changed request is a new intent.
        const fingerprint = JSON.stringify(reschedule ? [this.data.date, this.data.time, reason] : [reason])
        let intent = wx.getStorageSync(storageKey)
        if (action === 'cancel' && typeof intent === 'string' && intent) intent = { fingerprint, key: intent }
        if (!intent || intent.fingerprint !== fingerprint || !intent.key) {
          intent = { fingerprint, key: `mini-${action}-${order._id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` }
          wx.setStorageSync(storageKey, intent)
        }
        const params = { orderId: order._id, reason, idempotencyKey: intent.key }
        const response = reschedule
          ? await orderApi.requestOrderReschedule({ ...params, appointmentAt: this.data.date, timePeriod: this.data.time })
          : refund ? await orderApi.requestOrderRefund(params) : await orderApi.cancelOrder(params)
        if (!response || response.success !== true) throw new Error(response && (response.error || response.message) || '操作未完成，请重试')
        const result = response.data || {}
        wx.removeStorageSync(storageKey)
        this.setData({ visible: false })
        this.triggerEvent('updated', { orderId: order._id, order: result })
        this.triggerEvent('close')
        wx.showToast({ title: reschedule ? '改期申请已提交' : refund ? '取消预约已提交' : '订单已取消', icon: 'success' })
        if (!reschedule && result.refundStatus && !['not_requested', 'not_required', 'none', 'no_refund'].includes(result.refundStatus)) {
          const message = ['success', 'refunded'].includes(result.refundStatus) ? '已支付款项已原路退款。'
            : ['failed', 'refund_failed', 'abnormal', 'closed'].includes(result.refundStatus) ? '订单已取消，退款暂未完成，请在订单详情重试或联系客服。'
              : '已自动发起原路退款，到账以微信退款结果为准。'
          wx.showModal({ title: '退款进度', content: message, showCancel: false })
        }
      } catch (error) {
        this.setData({ error: error.message || '操作未完成，请重试' })
      } finally {
        this.setData({ submitting: false })
      }
    }
  }
})
