Component({
  properties: {
    type: {
      type: String,
      value: 'default'
    },
    title: {
      type: String,
      value: '暂无内容'
    },
    desc: {
      type: String,
      value: ''
    },
    buttonText: {
      type: String,
      value: ''
    },
    secondaryText: {
      type: String,
      value: ''
    }
  },

  methods: {
    onAction() {
      this.triggerEvent('action')
    },

    onSecondary() {
      this.triggerEvent('secondary')
    }
  }
})
