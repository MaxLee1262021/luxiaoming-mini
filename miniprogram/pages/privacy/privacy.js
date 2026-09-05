// pages/privacy/privacy.js — 隐私政策
// 数据源优先级：后台 getPrivacyPolicy RPC（siteConfig('global').privacyPolicy）> 内置默认正文。
// 未接后台 / 请求失败时回退内置默认 5 段，保证页面零回归。
const privacyApi = require('../../api/privacy')

const DEFAULT_TITLE = '隐私政策'

// 内置默认正文（与后台未配置时完全一致，页面零回归）
const DEFAULT_SECTIONS = [
  {
    title: '一、我们收集的信息',
    blocks: [
      { type: 'p', text: '在你使用「鹿小鸣长沙旅拍」小程序时，为保障预约、照片查看与客服沟通等核心功能，我们会在你授权后收集以下信息：' },
      { type: 'li', text: '· 微信公开信息（昵称、头像），用于展示你的账户身份；' },
      { type: 'li', text: '· 手机号，经微信授权后获取，用于确认拍摄档期、联系拍摄事项与保护订单安全；' },
      { type: 'li', text: '· 预约与订单信息（拍摄项目、时间、联系人等），用于完成旅拍服务；' },
      { type: 'li', text: '· 你可能主动上传的照片或备注，仅用于服务交付。' }
    ]
  },
  {
    title: '二、我们如何使用信息',
    blocks: [
      { type: 'p', text: '上述信息仅用于：提供并优化旅拍预约与交付服务、与你确认拍摄安排、通过企业微信提供客服支持、以及法律法规要求的必要留存。我们不会将你的个人信息用于约定服务之外的商业营销，也不会擅自提供给第三方。' }
    ]
  },
  {
    title: '三、信息的存储与安全',
    blocks: [
      { type: 'p', text: '你的信息存储于鹿小鸣自托管的服务器（腾讯云轻量应用服务器，MySQL 数据库），我们采取合理的加密与访问控制措施保护数据安全。除法律法规或为你提供服务所必需外，我们不会向他人披露你的信息。' }
    ]
  },
  {
    title: '四、你的权利',
    blocks: [
      { type: 'li', text: '· 你可在「我的」页面随时查看已绑定的手机号；' },
      { type: 'li', text: '· 你有权撤回授权、更正或删除你的个人信息；' },
      { type: 'li', text: '· 如需协助，可通过小程序内「联系客服」与我们沟通。' }
    ]
  },
  {
    title: '五、未成年人保护',
    blocks: [
      { type: 'p', text: '本小程序主要面向成年旅拍用户。如涉及未成年人信息，我们将在监护人同意的前提下严格按照法律法规处理。' }
    ]
  }
]

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
      // 后台未实现 / 未接通：保留内置默认正文，页面零回归
      console.warn('getPrivacyPolicy failed, use default', err)
    }
    this.setData({ title: DEFAULT_TITLE, sections: DEFAULT_SECTIONS, updateTime: '' })
  }
})
