Component({
  options: {
    addGlobalClass: true
  },
  properties: {
    value: {
      type: String,
      value: ''
    },
    placeholder: {
      type: String,
      value: '搜索'
    },
    mode: {
      type: String,
      value: 'global' // 'global' 带「探索」按钮跳搜索页；'filter' 仅表单内即时过滤
    },
    compact: {
      type: Boolean,
      value: false
    },
    actionStyle: {
      type: String,
      value: 'primary' // 'primary' 红渐变；'light' 灰底红字轻量按钮
    },
    actionVisible: {
      type: Boolean,
      value: true
    },
    iconColor: {
      type: String,
      value: 'muted' // 搜索图标颜色：muted 灰色 / red 品牌红
    }
  },
  data: {
    focused: false
  },
  methods: {
    onInput(e) {
      this.triggerEvent('input', { value: e.detail.value })
    },
    onConfirm(e) {
      this.triggerEvent('confirm', { value: e.detail.value })
    },
    onClear() {
      this.triggerEvent('clear')
    },
    onFocus() {
      this.setData({ focused: true })
      this.triggerEvent('focus')
    },
    onBlur() {
      this.setData({ focused: false })
      this.triggerEvent('blur')
    },
    onAction() {
      this.triggerEvent('action', { value: this.data.value })
    }
  }
})
