Component({
  properties: {
    item: {
      type: Object,
      value: {}
    }
  },

  methods: {
    emitContact() {
      const id = this.data.item && this.data.item._id
      this.triggerEvent('contact', { id })
    },
    emitRefund() {
      const item = this.data.item || {}
      if (item.canApplyRefund) this.triggerEvent('refund', { id: item._id })
    },
    emitReschedule() {
      const item = this.data.item || {}
      if (item.canReschedule) this.triggerEvent('reschedule', { id: item._id })
    },
    emitCancel() {
      const item = this.data.item || {}
      if (item.canCancel) this.triggerEvent('cancel', { id: item._id })
    },
    emitDetail() {
      const id = this.data.item && this.data.item._id
      this.triggerEvent('detail', { id })
    }

  }
})
