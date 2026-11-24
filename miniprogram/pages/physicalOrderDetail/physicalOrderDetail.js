const api = require('../../api/physical')
const { rows, orderView, shipmentView, addressText, can, money } = require('../../utils/physical')
const { payPhysicalOrder } = require('../../service/physicalPayment')
const { openCustomerService } = require('../../service/customerService')
const mediaFiles = require('../../service/mediaFiles')
Page({
  data: { id: '', order: null, loading: true, busy: false, error: '', paymentMessage: '', addressText: '', canPay: false, canCancel: false, canReceive: false, canAddress: false, tracking: [], logisticsError: '', afterSales: [], returnSale: null, returnCarrierIndex: -1, returnTrackingNo: '', carriers: [] },
  onLoad(options = {}) { this.setData({ id: options.id || options.orderId || '' }) },
  onShow() {
    if (this._waitingWechatReceipt) {
      this._waitingWechatReceipt = false
      return this.action(() => api.confirmPhysicalReceipt({ orderId: this.data.id, source: 'wechat', received: true }))
    }
    return this.load()
  },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh() },
  async load() {
    if (!this.data.id) { this.setData({ loading: false, error: '缺少订单信息' }); return }
    this.setData({ loading: true, error: '' })
    try {
      const data = await api.getPhysicalOrder({ orderId: this.data.id })
      const order = orderView(data.order || data)
      this.setData({ order, addressText: addressText(order.address || {}), canPay: order.paymentMode !== 'package' && can(order, 'pay', ['pending_payment']), canCancel: can(order, 'cancel', ['pending_payment']), canReceive: can(order, 'confirmReceipt', ['awaiting_receipt']), canAddress: can(order, 'changeAddress', ['pending_payment', 'awaiting_shipment']), tracking: rows(order.shipment && (order.shipment.tracking || order.shipment.events || order.shipment.traces)), logisticsError: order.shipment && order.shipment.queryError ? '物流更新暂不可用，以下为最近可靠记录。' : '' })
      try { const sales = await api.getPhysicalAfterSales({ orderId: order.id }); this.setData({ afterSales: rows(sales).map(row => ({ ...row, amountText: money(row.refundAmount ?? row.amount ?? Number(row.amountFen || 0) / 100), attachments: (row.attachments || row.attachmentFileIds || []).map(file => mediaFiles.normalizeFile(typeof file === 'string' ? { fileId: file } : file)), statusText: ({ pending_review: '待审核', dispatch_verification: '交运核实中', awaiting_return: '请退回商品', ready_refund: '待退款', refund_pending: '退款处理中', completed: '已结案', rejected: '已驳回', withdrawn: '已撤销' })[row.status] || row.status, returnAddressText: typeof row.returnAddress === 'string' ? row.returnAddress : row.returnAddress ? [row.returnAddress.recipient || row.returnAddress.name, row.returnAddress.phone, addressText(row.returnAddress)].filter(Boolean).join(' ') : '' })), carriers: sales.carrierOptions || this.data.carriers }) } catch (_) {}
    } catch (error) { this.setData({ error: error.message || '订单读取失败' }) }
    finally { this.setData({ loading: false }) }
  },
  async action(callback) { if (this.data.busy) return; this.setData({ busy: true }); try { await callback(); await this.load() } catch (error) { wx.showToast({ title: error.message || '操作失败，请刷新重试', icon: 'none' }) } finally { this.setData({ busy: false }) } },
  pay() { return this.action(async () => { const result = await payPhysicalOrder(this.data.id); this.setData({ paymentMessage: result.status === 'confirmed' ? '支付已确认' : result.status === 'cancelled' ? '已取消支付，可在有效期内继续付款' : '支付结果确认中，请查询支付结果' }) }) },
  queryPayment() { return this.action(async () => { const result = await api.getPhysicalPaymentStatus({ orderId: this.data.id }); this.setData({ paymentMessage: result.status === 'confirmed' ? '支付已确认' : '支付结果尚未确认，请稍后刷新' }) }) },
  cancel() { wx.showModal({ title: '取消订单', content: '系统将先核对支付结果，确认未付款后关闭订单。', success: result => { if (result.confirm) this.action(() => api.cancelPhysicalOrder({ orderId: this.data.id, version: this.data.order.version })) } }) },
  receive() {
    const order = this.data.order
    if (!order || this.data.busy) return
    wx.showModal({ title: '确认收货', content: '请确认已经实际收到本订单全部剩余商品。确认后订单将完成，如需售后请联系客服。', success: result => {
      if (!result.confirm) return
      if (order.receiptSyncRequired || order.receiptPlatformRequired) {
        const transactionId = order.paymentTransactionId || order.transactionId
        if (!transactionId || typeof wx.openBusinessView !== 'function') return wx.showToast({ title: '当前无法打开微信收货确认，请升级微信或联系客服', icon: 'none' })
        this._waitingWechatReceipt = true
        wx.openBusinessView({ businessType: 'weappOrderConfirm', extraData: { transaction_id: transactionId }, fail: () => { this._waitingWechatReceipt = false; wx.showToast({ title: '微信确认页未打开，订单尚未完成', icon: 'none' }) } })
        // Returning to this page only starts a verified backend query. It never marks success locally.
      } else this.action(() => api.confirmPhysicalReceipt({ orderId: this.data.id, version: order.version, source: 'mini', received: true }))
    } })
  },
  chooseAddress() {
    if (this.data.busy) return
    wx.navigateTo({ url: '/pages/shippingAddresses/shippingAddresses?select=1', events: { addressSelected: ({ address }) => this.action(async () => {
      const result = await api.requestPhysicalAddressChange({ orderId: this.data.id, addressId: address.id, version: this.data.order.version, reason: '用户申请修改收货地址' })
      const order = result.order || result
      wx.showToast({ title: order.addressChange && order.addressChange.status === 'pending' ? '改址申请已提交，待客服核实' : '请核对更新后的地址和运费', icon: 'none' })
    }) } })
  },
  async refreshLogistics() {
    if (this.data.busy) return
    this.setData({ busy: true, logisticsError: '' })
    try { const result = await api.getPhysicalLogistics({ orderId: this.data.id, refresh: true }); const shipment = shipmentView(result.shipment || result); this.setData({ 'order.shipment': shipment, tracking: rows(shipment.events), logisticsError: shipment.queryError ? '物流更新暂不可用，以下为最近可靠记录。' : '' }) }
    catch (error) { this.setData({ logisticsError: '物流暂时无法更新，已保留最近记录，可复制单号查询或联系客服。' }) }
    finally { this.setData({ busy: false }) }
  },
  copyTracking() { const shipment = this.data.order && this.data.order.shipment || {}; const value = shipment.trackingNo || shipment.trackingNumber || shipment.number || shipment.logisticsNo; if (value) wx.setClipboardData({ data: value }) },
  async openReturn(e) {
    const sale = this.data.afterSales[Number(e.currentTarget.dataset.index)]
    if (!sale || this.data.busy) return
    try {
      let carriers = this.data.carriers
      if (!carriers.length) { const catalog = await api.getPhysicalCatalog(); carriers = catalog.carrierOptions || [] }
      if (!carriers.length) throw new Error('退货快递公司尚未配置，请联系客服')
      this.setData({ returnSale: sale, returnCarrierIndex: -1, returnTrackingNo: '', carriers })
    } catch (error) { wx.showToast({ title: error.message || '退货信息暂不可用', icon: 'none' }) }
  },
  closeReturn() { if (!this.data.busy) this.setData({ returnSale: null }) },
  returnCarrier(e) { this.setData({ returnCarrierIndex: Number(e.detail.value) }) },
  returnTracking(e) { this.setData({ returnTrackingNo: e.detail.value }) },
  async refreshReturn(e) {
    const index = Number(e.currentTarget.dataset.index), sale = this.data.afterSales[index]
    if (!sale || !sale.returnShipment || this.data.busy) return
    this.setData({ busy: true })
    try {
      const result = await api.getPhysicalLogistics({ orderId: this.data.id, shipmentId: sale.returnShipment.id, refresh: true })
      this.setData({ ['afterSales[' + index + '].returnShipment']: shipmentView(result.shipment) })
    } catch (error) { wx.showToast({ title: '退货物流暂不可用，已保留最近记录', icon: 'none' }) }
    finally { this.setData({ busy: false }) }
  },
  submitReturn() {
    const carrier = this.data.carriers[this.data.returnCarrierIndex], number = this.data.returnTrackingNo.trim()
    if (!carrier || !number) return wx.showToast({ title: '请选择快递公司并填写退货单号', icon: 'none' })
    return this.action(async () => { await api.updatePhysicalReturnShipment({ orderId: this.data.id, afterSaleId: this.data.returnSale.id, carrierCode: carrier.code, trackingNo: number }); this.setData({ returnSale: null }); wx.showToast({ title: '退货物流已提交', icon: 'success' }) })
  },
  async previewEvidence(e) {
    const sale = this.data.afterSales[Number(e.currentTarget.dataset.sale)]
    const file = sale && sale.attachments[Number(e.currentTarget.dataset.index)]
    if (!file) return
    try { await mediaFiles.previewFile(file) } catch (error) { wx.showToast({ title: error.message || '凭证暂不可用，请重试', icon: 'none' }) }
  },
  buyAgain() { wx.navigateTo({ url: '/pages/peripherals/peripherals' }) },
  contactService() { openCustomerService() },
  noop() {}
})
