Component({
  properties: {
    item: {
      type: Object,
      value: {}
    }
  },

  methods: {
    emitDetail() {
      const id = this.data.item && this.data.item._id
      this.triggerEvent('detail', { id })
    },

    emitCancel() {
      const id = this.data.item && this.data.item._id
      this.triggerEvent('cancel', { id })
    },

    emitAfterSale() {
      const id = this.data.item && this.data.item._id
      this.triggerEvent('aftersale', { id })
    },

    emitDelete() {
      const id = this.data.item && this.data.item._id
      this.triggerEvent('delete', { id })
    }
  }
})
