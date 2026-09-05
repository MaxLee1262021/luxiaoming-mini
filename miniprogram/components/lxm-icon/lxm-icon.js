Component({
  properties: {
    type: { type: String, value: '' },
    size: { type: Number, value: 24 },
    color: { type: String, value: 'ink' } // ink | muted | red | white | gold
  },
  data: { colorClass: 'c-ink' },
  observers: {
    color(c) {
      // 允许命名令牌（ink/muted/red/white/gold）或 hex；hex 自动映射到最近令牌，
      // 未知值回落 ink，避免生成不存在的 .c-#FFFFFF 类导致图标不显示。
      const map = {
        ink: 'ink', muted: 'muted', red: 'red', white: 'white', gold: 'gold',
        '#FFFFFF': 'white', '#EE2C2C': 'red', '#2A211B': 'ink',
        '#FFD36A': 'gold', '#9C877A': 'muted'
      }
      const key = (c || 'ink').trim()
      const suffix = map[key] || 'ink'
      this.setData({ colorClass: 'c-' + suffix })
    }
  }
})
