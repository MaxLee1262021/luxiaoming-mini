const orderApi = require('../api/order')
const { validateAfterSaleReason, buildAfterSalePayload } = require('./afterSale')
const media = require('./mediaFiles')
const { isCancelled } = require('./fileUpload')
const { canRefundDeposit } = require('../utils/order')

const types = ['退款申请', '改期', '投诉反馈', '补发成片', '补拍', '其他问题']
const data = {
  afterSaleVisible: false, afterSaleTypes: types, afterSaleTypeIndex: 0, afterSaleDepositRefund: false,
  afterSaleReason: '', afterSaleFiles: [], afterSalePending: false, afterSaleSubmitting: false,
  afterSaleError: '', afterSaleRecords: [], afterSaleRecordsError: '', afterSaleRecordsLoading: false,
  canRequestAfterSale: false, canRequestDepositRefund: false, deliveryFiles: [], fileBusyId: '', fileProgress: 0, fileActionError: ''
}

const actions = {
  async loadAfterSales() {
    const order = this.data.order || {}
    const orderId = order._id || order.id
    if (!orderId || this.data.isDemo) return
    this.setData({ afterSaleRecordsLoading: true, afterSaleRecordsError: '', canRequestAfterSale: false, canRequestDepositRefund: false })
    try {
      const response = await orderApi.getMyAfterSales({ orderId })
      if (!response || response.success === false || response.ok === false) throw new Error(response && (response.error || response.message) || '售后记录加载失败，请重试')
      const records = Array.isArray(response.data) ? response.data : []
      const active = records.some(item => !['completed', 'closed', 'done', '已完', '已完成', '已结案', '已结束'].includes(item.status))
      this.setData({
        afterSaleRecords: records.map(item => ({ ...item, attachments: (item.attachments || []).map(media.normalizeFile) })),
        canRequestAfterSale: !!order.canAfterSale && !active,
        canRequestDepositRefund: canRefundDeposit(order) && !active
      })
    } catch (error) {
      this.setData({ afterSaleRecordsError: error.message || '售后记录加载失败，请重试' })
    } finally { this.setData({ afterSaleRecordsLoading: false }) }
  },
  openAfterSale() {
    if (!this.data.canRequestAfterSale || this.data.isDemo) return
    this.setData({ afterSaleVisible: true, afterSaleDepositRefund: false, afterSaleReason: '', afterSaleFiles: [], afterSalePending: false, afterSaleError: '', afterSaleTypeIndex: 0 })
  },
  openDepositRefund() {
    if (!this.data.canRequestDepositRefund || !canRefundDeposit(this.data.order) || this.data.isDemo) return
    this.setData({ afterSaleVisible: true, afterSaleDepositRefund: true, afterSaleReason: '', afterSaleFiles: [], afterSalePending: false, afterSaleError: '', afterSaleTypeIndex: 0 })
  },
  closeAfterSale() {
    if (this.data.afterSaleSubmitting) return
    this.setData({ afterSaleVisible: false, afterSaleDepositRefund: false, afterSalePending: false, afterSaleFiles: [] })
  },
  onAfterSaleReason(e) { this.setData({ afterSaleReason: e.detail.value }) },
  onAfterSaleType(e) { this.setData({ afterSaleTypeIndex: Number(e.detail.value) }) },
  onAfterSaleFiles(e) { this.setData({ afterSaleFiles: e.detail.files, afterSalePending: !!e.detail.pending }) },
  async submitAfterSale() {
    if (this.data.afterSaleSubmitting) return
    const depositRefund = this.data.afterSaleDepositRefund
    if (depositRefund && (!this.data.canRequestDepositRefund || !canRefundDeposit(this.data.order))) {
      this.setData({ afterSaleError: '当前订单暂不能申请退定金，请刷新订单或联系客服。' })
      return
    }
    if (this.data.afterSalePending) { this.setData({ afterSaleError: '请等待上传完成，或移除上传失败的图片' }); return }
    const valid = validateAfterSaleReason(this.data.afterSaleReason)
    if (!valid.valid) { this.setData({ afterSaleError: valid.message }); return }
    this.setData({ afterSaleSubmitting: true, afterSaleError: '' })
    try {
      const response = await orderApi.submitAfterSale({
        ...buildAfterSalePayload(this.data.order, valid.reason),
        type: depositRefund ? '定金退款' : (types[this.data.afterSaleTypeIndex] || types[0]),
        ...(depositRefund ? { refundPhase: 'deposit' } : {}),
        attachmentFileIds: this.data.afterSaleFiles.map(file => file.fileId)
      })
      if (!response || response.success === false || response.ok === false) throw new Error(response && (response.error || response.message) || '提交失败，请重试')
      this.setData({ afterSaleVisible: false, afterSaleDepositRefund: false, afterSaleFiles: [], afterSalePending: false, canRequestAfterSale: false, canRequestDepositRefund: false })
      wx.showToast({ title: depositRefund ? '退定金申请已提交' : '售后申请已提交', icon: 'success' })
      await this.loadOrder()
    } catch (error) { this.setData({ afterSaleError: error.message || '提交失败，请重试' }) }
    finally { this.setData({ afterSaleSubmitting: false }) }
  },
  async previewOrderFile(e) {
    const d = e.currentTarget.dataset
    const file = d.ticket !== undefined
      ? ((this.data.afterSaleRecords[Number(d.ticket)] || {}).attachments || [])[Number(d.index)]
      : this.data.deliveryFiles[Number(d.index)]
    if (!file) return
    this.setData({ fileActionError: '' })
    try { await media.previewFile(file) }
    catch (error) { if (!isCancelled(error)) this.setData({ fileActionError: error.message || '预览失败，请重试' }) }
  },
  async saveOrderFile(e) {
    const file = this.data.deliveryFiles[Number(e.currentTarget.dataset.index)]
    if (!file || this.data.fileBusyId) return
    this.setData({ fileBusyId: file.id, fileProgress: 0, fileActionError: '' })
    this._downloadJob = media.downloadToAlbum(file, progress => this.setData({ fileProgress: progress }))
    try {
      await this._downloadJob.promise
      wx.showToast({ title: '已保存到相册', icon: 'success' })
    } catch (error) {
      if (!isCancelled(error)) this.setData({ fileActionError: error.message || error.errMsg || '保存失败，请重试' })
      if (error.permissionDenied) wx.showModal({ title: '开启相册保存权限', content: error.message, confirmText: '去设置',
        success(result) { if (result.confirm && wx.openSetting) wx.openSetting({}) } })
    } finally {
      this._downloadJob = null
      this.setData({ fileBusyId: '', fileProgress: 0 })
    }
  },
  cancelFileDownload() { if (this._downloadJob) this._downloadJob.cancel() },
  stopPanelTap() {}
}

module.exports = { data, actions }
