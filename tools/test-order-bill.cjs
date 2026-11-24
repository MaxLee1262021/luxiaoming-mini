'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { buildReservationBill, normalizeOrder } = require('../miniprogram/utils/order')

const booked = { totalAmount: 0.3, depositDue: 0.09, depositPaid: 0.09,
  depositPaymentStatus: 'confirmed', finalDue: 0.21, finalPaid: 0, refundedAmount: 0 }

test('reservation bills distinguish the total, received deposit, outstanding balance, received final payment and completed refunds', () => {
  assert.deepEqual(buildReservationBill(normalizeOrder(booked)), {
    totalText: '0.30', depositText: '0.09', balanceText: '0.21', finalPaidText: '0.00', refundedText: '0.00'
  })
  const unpaid = buildReservationBill({ ...booked, depositPaid: 0, depositPaymentStatus: 'not_created' })
  assert.equal(unpaid.depositText, '0.00', 'A scheduled deposit is not received money')
  assert.equal(unpaid.balanceText, '0.21', 'The final balance does not include the unpaid deposit')
  assert.equal(buildReservationBill({ totalAmount: 0, packagePrice: 888 }).totalText, '0.00')
})

test('partial and complete final payments reduce the outstanding balance with cent precision', () => {
  for (const [finalPaid, balance] of [[0.2, '0.01'], [0.21, '0.00'], [0.3, '0.00']]) {
    const bill = buildReservationBill({ ...booked, finalPaid })
    assert.equal(bill.balanceText, balance)
    assert.equal(bill.finalPaidText, finalPaid.toFixed(2))
  }
  assert.equal(buildReservationBill({ ...booked, status: 'cancelled' }).balanceText, '0.00')
  assert.equal(buildReservationBill({ ...booked, status: 'canceled' }).balanceText, '0.00')
})

test('refunded totals never come from requested amounts or an unconfirmed refund status', () => {
  assert.equal(buildReservationBill({ ...booked, refundAmount: 0.09, refundStatus: 'processing' }).refundedText, '0.00')
  assert.equal(buildReservationBill({ ...booked, refundedAmount: 0.04, refundAmount: 0.09, refundStatus: 'processing' }).refundedText, '0.04')
  for (const refundedAmount of [undefined, null, '', ' ', false, -1, 'invalid']) {
    assert.equal(buildReservationBill({ ...booked, refundedAmount, refundAmount: 0.09, refundStatus: 'refunded' }).refundedText, '—')
  }
})

test('order details refresh the completed bill and render exactly the five requested rows in order', () => {
  const filename = path.resolve(__dirname, '../miniprogram/pages/orderDetail/orderDetail.js')
  let definition
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page(value) { definition = value }, require: createRequire(filename), getApp() { return {} }, console
  }, { filename })
  const page = { ...definition, data: {}, setData(patch) { Object.assign(this.data, patch) }, loadAfterSales() {} }
  page.applyOrder(normalizeOrder(booked))
  assert.equal(page.data.reservationBill.balanceText, '0.21')
  assert.equal(page.data.reservationBill.finalPaidText, '0.00')
  page.applyOrder(normalizeOrder({ ...booked, workflowStage: 'completed', finalPaid: 0.21, finalPaymentStatus: 'confirmed', refundedAmount: 0.04 }))
  assert.equal(page.data.reservationBill.balanceText, '0.00')
  assert.equal(page.data.reservationBill.finalPaidText, '0.21')
  assert.equal(page.data.reservationBill.refundedText, '0.04')
  const template = fs.readFileSync(filename.replace(/\.js$/, '.wxml'), 'utf8')
  const bill = template.match(/<view class="info-card amount-card">([\s\S]*?)\r?\n    <\/view>/)[1]
  assert.match(bill, /<view class="card-title">预约账单<\/view>/)
  assert.deepEqual(Array.from(bill.matchAll(/<view class="info-row"><text>([^<]+)<\/text>/g), match => match[1]), ['订单总额', '已收定金', '待收尾款', '已收尾款', '已退款'])
  assert.match(bill, /<text>已收尾款<\/text><text>¥\{\{reservationBill\.finalPaidText\}\}<\/text>/)
  assert.doesNotMatch(bill, /定金应收|已确认定金|尾款应收|已确认尾款|待收金额|depositRefundHint/)
})
