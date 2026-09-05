Component({
  options: {
    styleIsolation: 'isolated'
  },
  properties: {
    keyword: { type: String, value: '' },
    hasInput: { type: Boolean, value: false },
    suggestions: { type: Array, value: [] },
    hotKeywords: { type: Array, value: [] },
    top: { type: Number, value: 180 }
  },
  methods: {
    onItemTap(e) {
      this.triggerEvent('itemtap', { item: e.currentTarget.dataset.item })
    },
    onHotTap(e) {
      this.triggerEvent('hottap', { keyword: e.currentTarget.dataset.keyword })
    },
    onClose() {
      this.triggerEvent('close')
    },
    onBooking(e) {
      this.triggerEvent('booking', e.detail)
    }
  }
})
