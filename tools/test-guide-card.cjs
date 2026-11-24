'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')

function createCard() {
  let definition
  const filename = path.resolve(__dirname, '../miniprogram/components/lxm-guide-card/lxm-guide-card.js')
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { Component(value) { definition = value } }, { filename })
  const card = {
    ...definition.methods,
    data: { ...definition.data, variant: 'waterfall' },
    setData(patch) { Object.assign(this.data, patch) }
  }
  const observe = Object.values(definition.observers)[0]
  card.update = item => {
    card.data.item = item
    observe.call(card, item, card.data.variant, 0, '', '', '', '', false, '')
  }
  return card
}

function imageEvent(src, width, height) {
  return { currentTarget: { dataset: { src } }, detail: { width, height } }
}

test('unloaded, failed, and missing article covers keep a nonzero reservation and intact article copy', () => {
  const card = createCard()
  const title = '在文和友，把一张照片拍回三十年前：老物件和拍摄路线完整攻略'
  const item = { _id: 'article', image: 'https://media.test/broken.jpg', title, readCount: 3658, score: 4.9 }
  card.update(item)
  assert.ok(card.data.coverPadding > 0)
  card.onCoverError(imageEvent(item.image))
  assert.equal(card.data.coverFailed, true)
  assert.ok(card.data.coverPadding > 0)
  assert.equal(card.data.titleText, title)
  assert.deepEqual(Array.from(card.data.metaList), ['3658 人已看', '4.9 分'])
  card.update({ ...item, image: '' })
  assert.equal(card.data.coverUrl, '')
  assert.equal(card.data.coverFailed, false)
  assert.ok(card.data.coverPadding > 0)
})

test('loaded covers retain their natural portrait or landscape proportions', () => {
  const card = createCard()
  card.update({ image: 'portrait.jpg' })
  card.onCoverLoad(imageEvent('portrait.jpg', 900, 1350))
  assert.equal(card.data.coverPadding, 150)
  card.update({ image: 'landscape.jpg' })
  card.onCoverLoad(imageEvent('landscape.jpg', 1200, 600))
  assert.equal(card.data.coverPadding, 50)
  card.onCoverLoad(imageEvent('landscape.jpg', 0, 600))
  card.onCoverLoad(imageEvent('landscape.jpg', 1200, Infinity))
  assert.equal(card.data.coverPadding, 50, 'Invalid image dimensions cannot collapse or corrupt the cover')
})

test('reusing a card clears a failed source and ignores late events from its previous image', () => {
  const card = createCard()
  card.update({ image: 'old.jpg' })
  card.onCoverError(imageEvent('old.jpg'))
  card.update({ image: 'new.jpg' })
  assert.equal(card.data.coverFailed, false)
  const reserved = card.data.coverPadding
  card.onCoverLoad(imageEvent('old.jpg', 100, 500))
  card.onCoverError(imageEvent('old.jpg'))
  assert.equal(card.data.coverFailed, false)
  assert.equal(card.data.coverPadding, reserved)
  card.onCoverLoad(imageEvent('new.jpg', 800, 800))
  assert.equal(card.data.coverPadding, 100)
  card.update({ image: 'new.jpg', readCount: 1 })
  assert.equal(card.data.coverPadding, 100, 'Updating article metadata must preserve the loaded cover geometry')
})
