// pages/privacy/privacy.js — 隐私政策
// 隐私政策仅展示后台 getPrivacyPolicy RPC 的真实配置。
const privacyApi = require('../../api/privacy')

const DEFAULT_TITLE = '隐私政策'

// 空配置只保留页面标题，不生成政策正文。
const DEFAULT_SECTIONS = []

// 段落类型判断：以 ·/•/-/* 开头的行渲染为列表项，其余为正文段
function detectBlockType(text = '') {
  return /^[·•\-*]\s*/.test(text.trim()) ? 'li' : 'p'
}

// 后台下发的段落数组 → 渲染块列表
function normalizeParagraphs(paragraphs = []) {
  const blocks = []
  ;(paragraphs || []).forEach((line) => {
    const text = String(line || '').trim()
    if (!text) return
    blocks.push({ type: detectBlockType(text), text })
  })
  return blocks
}

// 归一化后台配置为渲染结构，兼容两种下发形态：
// 1. 结构化 sections: [{ title, paragraphs: ['...', '· ...'] }]
// 2. 纯文本 content: '...'（按 \n 分段，· 开头视为列表项）
function normalizeRemote(remote = {}) {
  if (!remote || typeof remote !== 'object') return null

  let sections = null
  if (Array.isArray(remote.sections) && remote.sections.length) {
    sections = remote.sections
      .map((section) => ({
        title: String(section.title || '').trim() || DEFAULT_TITLE,
        blocks: normalizeParagraphs(section.paragraphs)
      }))
      .filter((section) => section.blocks.length)
  } else if (typeof remote.content === 'string' && remote.content.trim()) {
    sections = [{
      title: String(remote.title || '').trim() || DEFAULT_TITLE,
      blocks: normalizeParagraphs(String(remote.content).split('\n'))
    }]
  }

  if (!sections || !sections.length) return null
  return {
    title: String(remote.title || '').trim() || DEFAULT_TITLE,
    sections,
    updateTime: String(remote.updateTime || '').trim()
  }
}

Page({
  data: {
    title: DEFAULT_TITLE,
    sections: DEFAULT_SECTIONS,
    error: '',
    updateTime: ''
  },

  async onLoad() {
    try {
      const res = await privacyApi.getPrivacyPolicy()
      if (res && res.success) {
        const normalized = normalizeRemote(res.data || {})
        if (normalized) {
          this.setData({
            title: normalized.title,
            sections: normalized.sections,
            updateTime: normalized.updateTime
          })
          return
        }
      }
    } catch (err) {
      // 后台不可用时展示错误，不能填充本地政策。
      console.warn('getPrivacyPolicy failed', err)
    }
    this.setData({ title: DEFAULT_TITLE, sections: [], updateTime: '', error: '隐私政策暂未配置或加载失败，请稍后重试' })
  }
})
