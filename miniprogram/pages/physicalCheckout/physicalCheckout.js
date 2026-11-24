const api = require('../../api/physical')
const { rows, lineView, money, checkoutItems, addressText, newKey } = require('../../utils/physical')
const { payPhysicalOrder } = require('../../service/physicalPayment')
Page({
  data: { checkoutSource: 'cart', items: [], productDescriptions: [], address: null, addressText: '', loading: true, error: '', busy: false, quote: null, totalText: '—', goodsText: '—', shippingText: '—', remark: '', agreed: false, submissionPending: false },
  onLoad(options = {}) {
    this._direct = options.checkoutSource === 'direct'
    this._items = this._direct ? [{ productId: options.productId, skuId: options.skuId, quantity: Number(options.quantity) || 1 }] : []
    this._key = newKey()
    this.setData({ checkoutSource: this._direct ? 'direct' : 'cart' })
    this.load()
  },
  async load() {
    if (this.data.submissionPending) return this.submit()
    this.setData({ loading: true, error: '', quote: null })
    try {
      if (!this._direct) { const cart = await api.getPhysicalCart(); this._items = checkoutItems(cart) }
      if (!this._items.length) throw new Error('请先在购物车选择商品')
      const addresses = rows(await api.getShippingAddresses())
      const address = addresses.find(row => row.id === this._addressId) || addresses.find(row => row.isDefault) || null
      this.setData({ address, addressText: addressText(address || {}) })
      if (address) await this.preview()
    } catch (error) { this.setData({ error: error.message || '结算信息读取失败' }) }
    finally { this.setData({ loading: false }) }
  },
  payload() { return { checkoutSource: this.data.checkoutSource, items: this._items, addressId: this.data.address && this.data.address.id, addressVersion: this.data.address && this.data.address.version } },
  async preview() {
    this.setData({ error: '', quote: null, agreed: false, productDescriptions: [] })
    try {
      const quote = await api.previewPhysicalCheckout(this.payload())
      const items = rows(quote).map(lineView)
      const productDescriptions = []
      const seenProducts = new Set()
      items.forEach(item => {
        const id = item.productId || item.id
        const content = typeof item.description === 'string' ? item.description.trim() : ''
        if (!content || seenProducts.has(id)) return
        seenProducts.add(id)
        productDescriptions.push({ id, name: item.name, content })
      })
      this.setData({ quote, items, productDescriptions, totalText: money(quote.totalAmount), goodsText: money(quote.goodsAmount), shippingText: money(quote.shippingFee) })
    } catch (error) { this.setData({ error: error.message || '无法结算，请返回检查商品' }); throw error }
  },
  chooseAddress() {
    if (this.data.busy || this.data.submissionPending) return
    wx.navigateTo({ url: '/pages/shippingAddresses/shippingAddresses?select=1', events: { addressSelected: async ({ address }) => { this._addressId = address.id; this.setData({ address, addressText: addressText(address), error: '' }); try { await this.preview() } catch (_) {} } } })
  },
  remark(e) { this.setData({ remark: e.detail.value }) },
  agree(e) { this.setData({ agreed: e.detail.value.length > 0 }) },
  async submit() {
    if (this.data.busy || !this.data.quote || !this.data.address || !this.data.agreed) return
    this.setData({ busy: true, error: '' })
    let orderId = this._orderId
    try {
      if (!orderId) {
        if (!this._submission) {
          // A merchant scan can change while this checkout is open. Freeze the
          // latest source only at first submission, then keep it for retries.
          const app = getApp()
          const current = (app.getSource && app.getSource()) || {}
          const source = { shopId: current.shopId || '', scene: current.scene || '', codeId: current.codeId || '', cityId: current.cityId || '' }
          this._submission = { ...this.payload(), quoteVersion: this.data.quote.quoteVersion, idempotencyKey: this._key, remark: this.data.remark, source }
        }
        this.setData({ submissionPending: true })
        const created = await api.createPhysicalOrder(this._submission)
        const order = created.order || created
        orderId = order.id || order.orderId || order._id
        if (!orderId) throw new Error('订单结果待确认，请勿重复提交')
        this._orderId = orderId
        this.setData({ submissionPending: false })
      }
      try { const result = await payPhysicalOrder(orderId); if (result.status === 'pending') wx.showToast({ title: '支付结果确认中，可在订单查询', icon: 'none' }) }
      catch (error) { wx.showToast({ title: error.message || '请在订单中查询支付结果', icon: 'none' }) }
      wx.redirectTo({ url: '/pages/physicalOrderDetail/physicalOrderDetail?id=' + encodeURIComponent(orderId) })
    } catch (error) {
      const unknownResult = !error.statusCode || Number(error.statusCode) >= 500
      if (!unknownResult) { this._submission = null; this._key = newKey() }
      this.setData({ error: error.message || '提交失败，请重试', submissionPending: unknownResult })
      // Keep this key for an unknown network result; retry recovers the same order.
    } finally { this.setData({ busy: false }) }
  },
  backToCart() { wx.navigateBack() }
})
