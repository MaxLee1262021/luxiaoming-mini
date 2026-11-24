const api = require('../../api/physical')
const { rows, lineView, money, checkoutItems } = require('../../utils/physical')
const { skuOptions, initialSkuSelection, selectSkuStyle, selectSkuSpec } = require('../../utils/physicalSkuSelection')
Page({
  data: { items: [], loading: true, busy: false, error: '', selectedQuantity: 0, totalText: '0.00', allSelected: false, specItem: null, specOptions: [], specSelection: { styles: [], specs: [], style: null, spec: null, sku: null, hint: '' } },
  onShow() { this.load() },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh() },
  async load() {
    const { getOpenid } = require('../../api/client')
    const account = getOpenid()
    if (this._account && this._account !== account) this.setData({ items: [], selectedQuantity: 0, totalText: '0.00', specItem: null })
    const request = this._request = (this._request || 0) + 1
    this.setData({ loading: true, error: '' })
    try {
      const cart = await api.getPhysicalCart()
      if (request !== this._request || (account && account !== getOpenid())) return
      const items = rows(cart).map(lineView)
      this._account = getOpenid()
      const selected = items.filter(item => item.selected !== false && item.valid)
      this.setData({ items, selectedQuantity: selected.reduce((sum, item) => sum + item.quantity, 0), totalText: money(selected.reduce((sum, item) => sum + Number(item.price || 0) * item.quantity, 0)), allSelected: items.some(item => item.valid) && items.filter(item => item.valid).every(item => item.selected !== false) })
    } catch (error) { if (request === this._request) this.setData({ error: error.message || '购物车暂时无法读取' }) }
    finally { if (request === this._request) this.setData({ loading: false }) }
  },
  async mutate(data) {
    if (this.data.busy) return
    this.setData({ busy: true })
    try { await api.updatePhysicalCart(data); await this.load() }
    catch (error) { wx.showToast({ title: error.message || '修改失败，请重试', icon: 'none' }); await this.load() }
    finally { this.setData({ busy: false }) }
  },
  item(e) { return this.data.items[Number(e.currentTarget.dataset.index)] },
  toggle(e) { const item = this.item(e); if (item) return this.mutate({ operation: 'select', lineId: item.lineId, version: item.version, selected: item.selected === false }) },
  async toggleAll() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      for (const item of this.data.items.filter(row => row.valid)) await api.updatePhysicalCart({ operation: 'select', lineId: item.lineId, version: item.version, selected: !this.data.allSelected })
    } catch (error) { wx.showToast({ title: error.message || '选择失败', icon: 'none' }) }
    finally { this.setData({ busy: false }); await this.load() }
  },
  quantity(e) { const item = this.item(e); if (!item) return; const quantity = e.detail && e.detail.value !== undefined ? Number(e.detail.value) : item.quantity + Number(e.currentTarget.dataset.delta); if (!Number.isInteger(quantity) || quantity < 1) return wx.showToast({ title: '数量至少为1', icon: 'none' }); return this.mutate({ operation: 'quantity', lineId: item.lineId, version: item.version, quantity }) },
  remove(e) { const item = this.item(e); if (!item) return; wx.showModal({ title: '移除商品', content: '确定将此商品移出购物车？', success: result => { if (result.confirm) this.mutate({ operation: 'remove', lineId: item.lineId, version: item.version }) } }) },
  clearInvalid() { wx.showModal({ title: '清理失效商品', content: '仅移除已失效的购物车商品。', success: result => { if (result.confirm) this.mutate({ operation: 'clearInvalid' }) } }) },
  async openSpec(e) {
    const item = this.item(e)
    if (!item || this.data.busy) return
    try {
      const catalog = await api.getPhysicalCatalog({ id: item.productId })
      const product = rows(catalog).find(row => String(row.id || row.productId) === String(item.productId)) || catalog.product || catalog
      const specOptions = skuOptions(rows(product.skus))
      this.setData({ specItem: item, specOptions, specSelection: initialSkuSelection(specOptions, item.skuId) })
    } catch (error) { wx.showToast({ title: error.message || '样式与规格读取失败', icon: 'none' }) }
  },
  chooseStyle(e) {
    if (this.data.busy || !this.data.specItem) return
    this.setData({ specSelection: selectSkuStyle(this.data.specOptions, this.data.specSelection, e.currentTarget.dataset.value) })
  },
  chooseSpec(e) {
    if (this.data.busy || !this.data.specItem) return
    this.setData({ specSelection: selectSkuSpec(this.data.specOptions, this.data.specSelection, e.currentTarget.dataset.value) })
  },
  confirmSpec() {
    if (this.data.busy) return
    const item = this.data.specItem
    const sku = this.data.specSelection.sku
    if (!item || !sku || !sku.purchasable) return
    const available = Number(sku.availableQuantity ?? sku.available)
    if (Number.isFinite(available) && item.quantity > available) return wx.showToast({ title: '购买数量超过当前可售数量', icon: 'none' })
    this.closeSpec()
    return this.mutate({ operation: 'spec', lineId: item.lineId, version: item.version, skuId: sku.id })
  },
  closeSpec() { if (!this.data.busy) this.setData({ specItem: null }) },
  checkout() {
    if (this.data.busy || this.data.loading) return
    try { if (!checkoutItems({ items: this.data.items }).length) throw new Error('请先选择商品'); wx.navigateTo({ url: '/pages/physicalCheckout/physicalCheckout?checkoutSource=cart' }) }
    catch (error) { wx.showToast({ title: error.message, icon: 'none' }) }
  },
  browse() { wx.navigateTo({ url: '/pages/peripherals/peripherals' }) },
  noop() {}
})
