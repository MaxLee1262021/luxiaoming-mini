Component({
  properties: {
    title: {
      type: String,
      value: ''
    },
    subtitle: {
      type: String,
      value: ''
    },
    moreText: {
      type: String,
      value: ''
    },
    badge: {
      type: String,
      value: ''
    },
    compact: {
      type: Boolean,
      value: false
    }
  },

  data: {
    moreClean: ''
  },

  observers: {
    moreText(v) {
      this.setData({ moreClean: (v || '').replace(/[›\s]+$/, '') })
    },
    subtitle(v) {
      if (v === null || v === undefined) {
        this.setData({ subtitle: '' })
      }
    }
  },

  methods: {
    onMoreTap() {
      this.triggerEvent('more')
    }
  }
})
