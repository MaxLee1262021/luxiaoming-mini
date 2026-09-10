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
    }

  }
})
