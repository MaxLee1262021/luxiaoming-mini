const api = require('../../api/physical')
const { rows, addressText } = require('../../utils/physical')
const EMPTY = { recipient: '', phone: '', province: '', city: '', district: '', detail: '', isDefault: false }
Page({
  data: { items: [], loading: true, error: '', editing: false, form: { ...EMPTY }, region: [], busy: false, selectMode: false },
  onLoad(options = {}) { this.setData({ selectMode: options.select === '1' }) },
  onShow() { return this.load() },
  async load() {
    const { getOpenid } = require('../../api/client')
    const account = getOpenid(), request = this._request = (this._request || 0) + 1
    if (this._account && account !== this._account) this.setData({ items: [], editing: false, form: { ...EMPTY } })
    this.setData({ loading: true, error: '' })
    try {
      const data = await api.getShippingAddresses()
      if (request !== this._request || (account && account !== getOpenid())) return
      this._account = getOpenid()
      this.setData({ items: rows(data).map(row => ({ ...row, addressText: addressText(row) })) })
    } catch (error) { if (request === this._request) this.setData({ error: error.message || '地址读取失败' }) }
    finally { if (request === this._request) this.setData({ loading: false }) }
  },
  add() { this.setData({ editing: true, form: { ...EMPTY }, region: [] }) },
  edit(e) { const row = this.data.items[Number(e.currentTarget.dataset.index)]; this.setData({ editing: true, form: { ...row, recipient: row.recipient || row.name || '' }, region: [row.province, row.city, row.district] }) },
  close() { if (!this.data.busy) this.setData({ editing: false }) },
  input(e) { const field = e.currentTarget.dataset.field; this.setData({ ['form.' + field]: e.detail.value }) },
  region(e) { const region = e.detail.value; this.setData({ region, 'form.province': region[0], 'form.city': region[1], 'form.district': region[2], 'form.regionCodes': e.detail.code || [], 'form.regionCode': e.detail.code && e.detail.code[2] || '' }) },
  defaultChange(e) { this.setData({ 'form.isDefault': e.detail.value }) },
  async save() {
    if (this.data.busy) return
    const form = { ...this.data.form, recipient: this.data.form.recipient.trim(), phone: this.data.form.phone.trim(), detail: this.data.form.detail.trim() }
    if (!form.recipient || !/^1[3-9]\d{9}$/.test(form.phone) || !form.province || !form.city || !form.district || form.detail.length < 5) return wx.showToast({ title: '请完善收货人、手机号、地区和详细地址', icon: 'none' })
    this.setData({ busy: true })
    try { await api.saveShippingAddress(form); this.setData({ editing: false }); await this.load() }
    catch (error) { wx.showToast({ title: error.message || '保存失败，输入已保留', icon: 'none' }) }
    finally { this.setData({ busy: false }) }
  },
  choose(e) {
    if (!this.data.selectMode) return
    const address = this.data.items[Number(e.currentTarget.dataset.index)]
    if (!address) return
    const channel = this.getOpenerEventChannel && this.getOpenerEventChannel()
    if (channel) channel.emit('addressSelected', { address })
    wx.navigateBack()
  },
  async setDefault(e) { if (this.data.busy) return; const row = this.data.items[Number(e.currentTarget.dataset.index)]; this.setData({ busy: true }); try { await api.setDefaultShippingAddress({ addressId: row.id, version: row.version }); await this.load() } catch (error) { wx.showToast({ title: error.message || '修改失败', icon: 'none' }) } finally { this.setData({ busy: false }) } },
  remove(e) { const row = this.data.items[Number(e.currentTarget.dataset.index)]; wx.showModal({ title: '删除地址', content: '删除后不会改变已提交订单中的收货地址。', success: async result => { if (!result.confirm || this.data.busy) return; this.setData({ busy: true }); try { await api.deleteShippingAddress({ addressId: row.id, version: row.version }); await this.load() } catch (error) { wx.showToast({ title: error.message || '删除失败', icon: 'none' }) } finally { this.setData({ busy: false }) } } }) },
  noop() {}
})
