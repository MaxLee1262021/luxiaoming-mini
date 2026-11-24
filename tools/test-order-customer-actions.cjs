'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.join(__dirname, '..', 'miniprogram');
const orderUtils = require('../miniprogram/utils/order');
const plain = value => JSON.parse(JSON.stringify(value));
const booked = {
  id: 'order-1', status: 'deposit_paid', businessStatus: 'reserved', workflowStage: 'awaiting_dispatch',
  totalAmount: 100, depositDue: 30, depositPaid: 30, depositPaymentStatus: 'confirmed', finalDue: 70,
  canCancel: true, canReschedule: true, canApplyRefund: true, cancelRule: 'before_schedule_auto_refund'
};

function harness(action = 'reschedule', item = booked) {
  let definition;
  const storage = new Map(), calls = [], events = [], notices = [];
  let respond = async () => ({ success: true, data: { rescheduleRequest: { id: 'request-1', status: 'pending' } } });
  const api = {};
  for (const name of ['cancelOrder', 'requestOrderReschedule', 'requestOrderRefund']) api[name] = async params => { calls.push({ name, params: plain(params) }); return respond(params); };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'components/lxm-order-actions/lxm-order-actions.js'), 'utf8'), {
    Component(value) { definition = value; },
    require(name) { return name === '../../utils/order' ? orderUtils : api; },
    wx: {
      getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: key => storage.delete(key),
      showToast: notice => notices.push(notice), showModal: notice => notices.push(notice)
    }, Date, Math, JSON, String, Error
  });
  const component = {
    ...definition.methods, data: { ...plain(definition.data), item: plain(item), action },
    setData(patch) { Object.assign(this.data, patch); },
    triggerEvent(name, detail) { events.push({ name, detail: detail && plain(detail) }); }
  };
  definition.observers.action.call(component, action);
  return { component, calls, events, notices, storage, respond(value) { respond = value; } };
}

test('paid customers may cancel only before scheduling; all action grants are revocable', () => {
  assert.equal(orderUtils.normalizeOrder(booked).canCancel, true);
  assert.equal(orderUtils.normalizeOrder(booked).canReschedule, true);
  assert.equal(orderUtils.normalizeOrder({ ...booked, afterSaleActive: true }).canCancel, true);
  assert.equal(orderUtils.normalizeOrder({ ...booked, afterSaleActive: true }).canReschedule, true);
  assert.match(orderUtils.normalizeOrder(booked).cancelRuleText, /自动原路退款/);
  assert.equal(orderUtils.normalizeOrder({ ...booked, canCancel: undefined }).canCancel, false);
  assert.equal(orderUtils.normalizeOrder({ ...booked, canReschedule: undefined }).canReschedule, false);
  const scheduled = { ...booked, workflowStage: 'awaiting_shoot', businessStatus: 'awaiting_shoot' };
  assert.equal(orderUtils.normalizeOrder(scheduled).canCancel, false);
  assert.equal(orderUtils.normalizeOrder(scheduled).canReschedule, true);
  for (const patch of [
    { businessStatus: 'shooting' }, { customerArrivedAt: '2026-11-15' }, { shootingStartedAt: '2026-11-15' }, { shootingCompleted: true },
    { businessStatus: 'completed' }, { status: 'cancelled' }, { deleted: true }
  ]) {
    const result = orderUtils.normalizeOrder({ ...booked, ...patch });
    assert.equal(result.canCancel, false, JSON.stringify(patch));
    assert.equal(result.canReschedule, false, JSON.stringify(patch));
  }
  for (const patch of [
    { photographerId: 'photo-1' }, { dispatchStatus: 'pending_reassignment' },
    { dispatchHistory: [{ previous: { photographerId: 'photo-1' } }] }
  ]) assert.equal(orderUtils.normalizeOrder({ ...booked, ...patch }).canCancel, false);
  assert.equal(orderUtils.normalizeOrder({ ...booked, rescheduleRequest: { status: 'pending' } }).canReschedule, false);
});

test('reschedule validates the desired time and reason without writing the schedule locally', async () => {
  const { component, calls, events } = harness();
  await component.submit();
  assert.equal(calls.length, 0);
  component.onReason({ detail: { value: '天气原因' } });
  await component.submit();
  assert.equal(calls.length, 0);
  component.onDate({ detail: { value: '2000-01-01' } });
  component.onTime({ detail: { value: '12:00' } });
  await component.submit();
  assert.equal(calls.length, 0);
  component.onDate({ detail: { value: '2099-01-01' } });
  await component.submit();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'requestOrderReschedule');
  assert.equal(calls[0].params.appointmentAt, '2099-01-01');
  assert.equal(calls[0].params.timePeriod, '12:00');
  assert.equal(calls[0].params.orderId, 'order-1');
  assert.equal(component.data.item.appointmentAt, undefined);
  assert.ok(events.some(event => event.name === 'updated'));
});

test('duplicate taps submit once; timeout retries keep their request key and surface errors', async () => {
  const h = harness('cancel');
  h.component.onReason({ detail: { value: '行程取消' } });
  let fail;
  h.respond(() => new Promise((resolve, reject) => { fail = reject; }));
  const pending = h.component.submit();
  await h.component.submit();
  h.component.close();
  assert.equal(h.calls.length, 1);
  assert.equal(h.component.data.visible, true);
  fail(new Error('网络超时'));
  await pending;
  assert.equal(h.component.data.submitting, false);
  assert.equal(h.component.data.error, '网络超时');
  assert.equal(h.events.length, 0);
  h.respond(async () => ({ success: true, data: { refundStatus: 'processing' } }));
  await h.component.submit();
  assert.equal(h.calls[0].params.idempotencyKey, h.calls[1].params.idempotencyKey);
  assert.match(h.notices.at(-1).content, /到账以微信退款结果为准/);
  assert.equal(h.component.data.visible, false);
});

test('cancel retries share request identifiers between list and detail, including legacy string caches', async () => {
  const h = harness('cancel');
  h.component.setData({ reason: '行程取消' });
  h.respond(async () => { throw new Error('网络超时'); });
  await h.component.submit();
  const intent = h.storage.get('lxm_cancel_order_order-1');
  assert.equal(typeof intent.key, 'string');
  let pageDefinition, submitted;
  const api = { async cancelOrder(params) { submitted = params; return { success: true }; } };
  const dependencies = {
    '../../utils/order': orderUtils, '../../api/order': api,
    '../../utils/orderStatusFilters': require('../miniprogram/utils/orderStatusFilters'),
    '../../service/orderFileActions': { data: {}, actions: {} }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pages/orderDetail/orderDetail.js'), 'utf8'), {
    Page(value) { pageDefinition = value; }, getApp: () => ({}), require: name => dependencies[name] || {},
    wx: { getStorageSync: key => h.storage.get(key), setStorageSync: (key, value) => h.storage.set(key, value), removeStorageSync: key => h.storage.delete(key), showToast() {} }, console
  });
  const detail = {
    ...pageDefinition, data: { ...plain(pageDefinition.data), order: orderUtils.normalizeOrder(booked), cancelFormReason: '行程取消' },
    setData(patch) { Object.assign(this.data, patch); }, async loadOrder() {}
  };
  await detail.submitCancel();
  assert.equal(submitted.idempotencyKey, intent.key);
  const legacy = harness('cancel');
  legacy.storage.set('lxm_cancel_order_order-1', 'old-detail-key');
  legacy.component.setData({ reason: '行程取消' });
  await legacy.component.submit();
  assert.equal(legacy.calls[0].params.idempotencyKey, 'old-detail-key');
});

test('revoked grants, pending requests and rejected RPC responses never claim success', async () => {
  for (const patch of [{ canReschedule: false }, { rescheduleRequest: { status: 'pending' } }, { businessStatus: 'shooting' }]) {
    const h = harness('reschedule', { ...booked, ...patch });
    h.component.setData({ date: '2099-01-01', time: '12:00', reason: '天气原因' });
    await h.component.submit();
    assert.equal(h.calls.length, 0);
    assert.ok(h.component.data.error);
  }
  for (const response of [null, { success: false, error: '已开始拍摄' }]) {
    const h = harness();
    h.component.setData({ date: '2099-01-01', time: '12:00', reason: '天气原因' });
    h.respond(async () => response);
    await h.component.submit();
    assert.equal(h.events.length, 0);
    assert.equal(h.component.data.visible, true);
    assert.ok(h.component.data.error);
  }
});

test('failed automatic refunds stay visible and retry is restricted to server-granted canceled orders', async () => {
  const h = harness('cancel');
  h.component.setData({ reason: '行程取消' });
  h.respond(async () => ({ success: true, data: { refundStatus: 'refund_failed' } }));
  await h.component.submit();
  assert.match(h.notices.at(-1).content, /退款暂未完成/);
  assert.equal(orderUtils.normalizeOrder({ ...booked, status: 'cancelled', canRetryCancelRefund: true }).canRetryCancelRefund, true);
  assert.equal(orderUtils.normalizeOrder({ ...booked, canRetryCancelRefund: true }).canRetryCancelRefund, false);
  assert.equal(orderUtils.normalizeOrder({ ...booked, status: 'cancelled', refundStatus: 'processing' }).refundStatusText.includes('到账'), true);
  assert.match(orderUtils.normalizeOrder({ ...booked, status: 'cancelled', refundStatus: 'closed', canRetryCancelRefund: true }).refundStatusText, /退款暂未完成/);
});

test('card actions emit separate events and list actions refresh after a successful write', async () => {
  let definition;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'components/lxm-order-card/lxm-order-card.js'), 'utf8'), { Component(value) { definition = value; } });
  const events = [];
  const card = { data: { item: orderUtils.normalizeOrder(booked) }, triggerEvent(name, detail) { events.push({ name, detail }); } };
  definition.methods.emitCancel.call(card);
  definition.methods.emitReschedule.call(card);
  definition.methods.emitRefund.call(card);
  assert.deepEqual(events.map(event => event.name), ['cancel', 'reschedule', 'refund']);
  const markup = fs.readFileSync(path.join(root, 'components/lxm-order-card/lxm-order-card.wxml'), 'utf8');
  assert.match(markup, /catchtap="emitCancel"/);
  assert.match(markup, /catchtap="emitReschedule"/);
  assert.match(markup, /wx:if="\{\{item.canApplyRefund\}\}" catchtap="emitRefund">取消预约/);
  const dependencies = {
    '../../utils/order': orderUtils, '../../utils/query': {}, '../../api/order': {}, '../../api/physical': {},
    '../../service/customerService': {},
    '../../utils/physical': {}, '../../utils/orderStatusFilters': require('../miniprogram/utils/orderStatusFilters')
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pages/myOrders/myOrders.js'), 'utf8'), {
    Page(value) { definition = value; }, getApp: () => ({}), require: name => dependencies[name]
  });
  let refreshes = 0;
  const page = { ...definition, data: { ...plain(definition.data), orders: [orderUtils.normalizeOrder(booked)] }, setData(patch) { Object.assign(this.data, patch); }, async loadOrders() { refreshes++; } };
  page.openCancel({ detail: { id: 'order-1' } });
  assert.equal(page.data.orderAction, 'cancel');
  assert.equal(refreshes, 0);
  await page.onOrderActionUpdated();
  assert.equal(refreshes, 1);
  assert.equal(page.data.orderAction, '');
  page.openRefund({ detail: { id: 'order-1' } });
  assert.equal(page.data.orderAction, 'refund');
  await page.onOrderActionUpdated();
  assert.equal(refreshes, 2);
  page.data.orderType = 'physical';
  page.openRefund({ detail: { id: 'order-1' } });
  assert.equal(page.data.orderAction, '');
});

test('detail removes refund and reschedule applications without exposing a replacement cancellation', () => {
  let definition;
  const dependencies = {
    '../../utils/order': orderUtils, '../../api/order': {},
    '../../utils/orderStatusFilters': require('../miniprogram/utils/orderStatusFilters'),
    '../../service/orderFileActions': { data: {}, actions: {} }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pages/orderDetail/orderDetail.js'), 'utf8'), {
    Page(value) { definition = value; }, getApp: () => ({}), require: name => dependencies[name] || {}, console
  });
  assert.equal(definition.openRefund, undefined);
  assert.equal(definition.openReschedule, undefined);
  const markup = fs.readFileSync(path.join(root, 'pages/orderDetail/orderDetail.wxml'), 'utf8');
  assert.doesNotMatch(markup, /申请退款|申请改期|bindtap="openRefund"|bindtap="openReschedule"|<lxm-order-actions/);
  assert.match(markup, /wx:if="{{order.rescheduleRequest}}"/);
  assert.match(markup, /order.rescheduleStatusText \|\| '改期记录'/);
  assert.match(markup, /order.refundStatusText/);
  assert.match(markup, /bindtap="contactService">去企业微信联系客服/);
  const cancelCondition = markup.match(/class="info-card" wx:if="{{([^}]+)}}">\s*<view class="card-title">取消订单/)[1];
  assert.equal(vm.runInNewContext(cancelCondition, { order: orderUtils.normalizeOrder(booked) }), false);
  const unpaid = { ...booked, status: 'deposit_pending', businessStatus: 'pending_payment', workflowStage: 'awaiting_deposit', depositPaid: 0, depositPaymentStatus: 'not_created' };
  assert.equal(vm.runInNewContext(cancelCondition, { order: orderUtils.normalizeOrder(unpaid) }), true);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'pages/orderDetail/orderDetail.json'), 'utf8'));
  assert.equal(config.usingComponents['lxm-order-actions'], undefined);
});
