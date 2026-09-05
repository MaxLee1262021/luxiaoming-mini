Component({
  data: {
    visible: false,
    title: '',
    type: 'none' // none | success | error
  },
  methods: {
    show(opts = {}) {
      const title = (opts && opts.title) || ''
      const type = (opts && opts.type) || 'none'
      this.setData({ visible: true, title, type })
      if (this._timer) clearTimeout(this._timer)
      this._timer = setTimeout(() => {
        this.setData({ visible: false })
      }, 1600)
    },
    hide() {
      if (this._timer) clearTimeout(this._timer)
      this.setData({ visible: false })
    }
  }
})
