'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { normalizeOrder } = require('../miniprogram/utils/order')

const spots = [{ _id: 'wenheyou', name: '超级文和友' }, { _id: 'square', name: '恰同学少年广场' }]

test('reservation information keeps submitted intent while the order retains the confirmed shooting schedule', () => {
  const order = {
    intentDate: '2026-11-20', intentTimePeriod: '10:30',
    appointmentAt: '2026-11-22', timePeriod: '16:00', workflowStage: 'awaiting_shoot',
    confirmationSnapshot: { date: '2026-11-22', timePeriod: '16:00' }
  }
  const normalized = normalizeOrder(order)
  assert.equal(normalized.reservationInfo.timeText, '2026-11-20 10:30')
  assert.equal(normalized.date, '2026-11-22')
  assert.equal(normalized.timePeriod, '16:00')
  assert.equal(normalized.snapshotLabel, '预约信息')
})

test('reservation projects and prices come from checkout rather than the confirmed service snapshot', () => {
  const order = {
    packageName: '订单原套餐', packagePrice: 999, totalAmount: 999,
    packageSnapshot: { name: '原预约套餐', totalPrice: 0.3, applicableSpots: spots,
      items: [{ name: '原预约照片', price: 0.1, quantity: 1, seriesName: '原风格' }, { name: '原预约视频', price: 0.2, quantity: 1 }] },
    confirmationSnapshot: { name: '客服调整后的服务', price: 999, spotName: '集合点',
      items: [{ name: '确认商品', price: 999 }] },
    contactName: '客人姓名', contactPhone: '18818391883', contactWechat: 'customer-wx', message: '测试备注\n参与人数：1 人',
    applicableSpots: spots
  }
  const before = JSON.stringify(order)
  const normalized = normalizeOrder(order)
  assert.deepEqual(normalized.reservationInfo, {
    projectName: '原预约照片、原预约视频', priceText: '¥0.3', date: '', timePeriod: '', timeText: '',
    spotNamesText: '超级文和友、恰同学少年广场', seriesName: '原风格',
    contactName: '客人姓名', contactPhone: '18818391883', contactWechat: 'customer-wx', message: '测试备注\n参与人数：1 人'
  })
  assert.equal(normalized.packageName, '客服调整后的服务')
  assert.equal(normalized.packagePrice, 999)
  assert.equal(normalized.totalAmount, 999)
  assert.equal(JSON.stringify(order), before, 'Normalization never mutates the original order')
  assert.deepEqual(normalizeOrder(normalized).reservationInfo, normalized.reservationInfo)
})

test('raw order items retain every selected project, quantity totals, and complete package points', () => {
  const order = { productItems: [
    { name: '双人套餐', unitPrice: '199.9', quantity: 2, applicableSpots: spots },
    { name: '加拍视频', price: 0, quantity: 1, applicableSpots: [spots[1]] }
  ], name: '别名姓名', phone: '13800000000', wechat: 'alias-wx', remark: '旧版预约备注' }
  const info = normalizeOrder(order).reservationInfo
  assert.equal(info.projectName, '双人套餐、加拍视频')
  assert.equal(info.priceText, '¥399.8')
  assert.equal(info.spotNamesText, '超级文和友、恰同学少年广场')
  assert.equal(info.contactName, '别名姓名')
  assert.equal(info.contactPhone, '13800000000')
  assert.equal(info.contactWechat, 'alias-wx')
  assert.equal(info.message, '旧版预约备注')
})

test('legacy explicit intent aliases work while confirmed-only or missing fields stay blank', () => {
  for (const order of [
    { expectedDate: '2026-11-21', expectedTimePeriod: '11:20' },
    { requestedDate: '2026-11-21', requestedTimePeriod: '11:20' }
  ]) assert.equal(normalizeOrder(order).reservationInfo.timeText, '2026-11-21 11:20')
  const confirmedOnly = normalizeOrder({ appointmentAt: '2026-11-23', date: '2026-11-23', timePeriod: '12:00', spotName: '确认集合点' }).reservationInfo
  assert.equal(confirmedOnly.timeText, '')
  assert.equal(confirmedOnly.spotNamesText, '')
  const empty = normalizeOrder({}).reservationInfo
  assert.ok(Object.values(empty).every(value => value === ''))
  assert.equal(normalizeOrder({ message: '', remark: '旧备注' }).reservationInfo.message, '')
})

test('custom reservation location uses only the explicitly submitted requested point', () => {
  const order = { spotName: '后台确认集合点', items: [{ custom: true, name: '约拍定制', requestedSpot: '客人希望的点位', spotName: '后台改过的点位' }] }
  assert.equal(normalizeOrder(order).reservationInfo.spotNamesText, '客人希望的点位')
  assert.equal(normalizeOrder({ items: [{ custom: true, spotName: '仅后台地点' }] }).reservationInfo.spotNamesText, '')
  const mixed = normalizeOrder({ ...order, applicableSpots: spots })
  assert.equal(mixed.reservationInfo.spotNamesText, '超级文和友、恰同学少年广场、客人希望的点位')
})

test('booking success shows submitted time and product points without shooting style after refreshing', async () => {
  const filename = path.resolve(__dirname, '../miniprogram/pages/bookingSuccess/bookingSuccess.js')
  const localRequire = createRequire(filename)
  const order = {
    id: 'success-order', orderNo: 'LS-SUCCESS', intentDate: '2026-11-20', intentTimePeriod: '10:30',
    date: '2026-11-22', timePeriod: '16:00', workflowStage: 'awaiting_shoot',
    spotName: '后台确认集合点', seriesName: '后台拍摄风格', applicableSpots: spots
  }
  let definition
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: name => name === '../../api/order' ? { async getOrderDetail() { return { success: true, data: order } } } : localRequire(name),
    getApp: () => ({}), Page: value => { definition = value }, console
  }, { filename })
  const page = { ...definition, data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch) } }
  await page.loadOrderDetail('LS-SUCCESS', order.id)
  assert.equal(page.data.date, '2026-11-20')
  assert.equal(page.data.timePeriod, '10:30')
  assert.equal(page.data.spotName, '超级文和友、恰同学少年广场')
  assert.equal(page.data.seriesName, undefined)
  const template = fs.readFileSync(filename.replace(/\.js$/, '.wxml'), 'utf8')
  assert.match(template, /<text class="info-label">预约时间<\/text>/)
  assert.match(template, /<text class="info-label">拍摄点位<\/text>/)
  assert.doesNotMatch(template, /拍摄时间|拍摄地点|拍摄风格|seriesName|客服\/摄影师沟通确认/)
})
