'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')

const privacyPath = path.resolve(__dirname, '../miniprogram/pages/privacy/privacy.js')
const plain = value => JSON.parse(JSON.stringify(value))

function fixture(responses) {
  let definition
  let requests = 0
  vm.runInNewContext(fs.readFileSync(privacyPath, 'utf8'), {
    Page(value) { definition = value },
    console: { warn() {} },
    require(id) {
      assert.equal(id, '../../api/privacy')
      return { async getPrivacyPolicy() {
        const response = responses[requests++]
        if (response instanceof Error) throw response
        return response
      } }
    }
  }, { filename: privacyPath })
  return {
    get requests() { return requests },
    page() {
      return {
        ...definition,
        data: plain(definition.data),
        setData(value) { Object.assign(this.data, value) }
      }
    }
  }
}

const response = data => ({ success: true, data })

test('configured policy title, paragraphs and date reach the page, and stale sections cannot hide the saved body', async () => {
  const f = fixture([response({
    title: '测试政策标题', content: ' 第一段 \r\n\r\n · 第二段 \n最后一段 ', updateTime: '2026-11-17',
    sections: [{ title: '旧标题', paragraphs: ['旧正文'] }]
  })])
  const page = f.page()
  await page.onLoad()
  assert.equal(page.data.title, '测试政策标题')
  assert.equal(page.data.updateTime, '2026-11-17')
  assert.equal(page.data.error, '')
  assert.deepEqual(plain(page.data.sections), [{
    title: '测试政策标题', blocks: [
      { type: 'p', text: '第一段' }, { type: 'li', text: '· 第二段' }, { type: 'p', text: '最后一段' }
    ]
  }])
  const wxml = fs.readFileSync(privacyPath.replace(/\.js$/, '.wxml'), 'utf8')
  assert.match(wxml, /<lxm-nav-bar\s+title="\{\{title\}\}"/)
})

test('legacy section paragraphs and content render without breaking on empty sections', async () => {
  const f = fixture([response({ sections: [
    null, { title: '空节' },
    { title: '第一节', paragraphs: ['段落一', '• 段落二'] },
    { title: '第二节', content: '段落三\n段落四' }
  ] })])
  const page = f.page()
  await page.onLoad()
  assert.equal(page.data.title, '隐私政策')
  assert.deepEqual(plain(page.data.sections), [
    { title: '第一节', blocks: [{ type: 'p', text: '段落一' }, { type: 'li', text: '• 段落二' }] },
    { title: '第二节', blocks: [{ type: 'p', text: '段落三' }, { type: 'p', text: '段落四' }] }
  ])
})

test('each newly entered privacy page reads the latest server policy without a local policy cache', async () => {
  const f = fixture([
    response({ title: '原标题', content: '原正文' }),
    response({ title: '更新标题', content: '更新正文' })
  ])
  const first = f.page()
  await first.onLoad()
  const reopened = f.page()
  await reopened.onLoad()
  assert.equal(f.requests, 2)
  assert.equal(reopened.data.title, '更新标题')
  assert.equal(reopened.data.sections[0].blocks[0].text, '更新正文')
})

test('unconfigured policy and failed requests show the empty state without invented or stale text', async () => {
  for (const result of [response({}), response({ sections: [null, { paragraphs: {} }] }), { success: false }, new Error('offline')]) {
    const f = fixture([result])
    const page = f.page()
    Object.assign(page.data, { title: '旧标题', sections: [{ title: '旧标题', blocks: [{ text: '旧正文' }] }], updateTime: '旧日期' })
    await page.onLoad()
    assert.equal(page.data.title, '隐私政策')
    assert.deepEqual(plain(page.data.sections), [])
    assert.equal(page.data.updateTime, '')
    assert.match(page.data.error, /暂未配置或加载失败/)
  }
})

test('a successful reload clears a prior loading error', async () => {
  const f = fixture([new Error('offline'), response({ content: '测试正文' })])
  const page = f.page()
  await page.onLoad()
  assert.ok(page.data.error)
  await page.onLoad()
  assert.equal(page.data.error, '')
  assert.equal(page.data.sections[0].blocks[0].text, '测试正文')
})
