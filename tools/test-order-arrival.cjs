'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const orderUtils = require('../miniprogram/utils/order');
const plain = value => JSON.parse(JSON.stringify(value));
const settle = () => new Promise(setImmediate);
const assigned = {
  id: 'arrival-order', orderNo: 'LXM-ARRIVAL-ORDER', status: 'deposit_paid',
  businessStatus: 'awaiting_shoot', workflowStage: 'awaiting_shoot', dispatchStatus: 'assigned',
  totalAmount: 100, depositDue: 30, depositPaid: 30, depositPaymentStatus: 'confirmed',
  finalDue: 70, finalPaid: 0, finalPaymentStatus: 'not_created',
  shootingCompleted: false, canPayFinal: false, canConfirmArrival: true,
  customerArrivedAt: '', deliveryPublished: false
};
const arrived = {
  ...assigned, status: 'shooting', businessStatus: 'shooting', workflowStage: 'shooting',
  canConfirmArrival: false, customerArrivedAt: '2026-11-15T02:00:00Z',
  canPayFinal: true, paymentPhase: 'final'
};

function harness() {
  const dialogs = [], writes = [], reads = [], toasts = [];
  let definition;
  const api = {
    async getOrderDetail(query) { reads.push(plain(query)); return { success: true, data: plain(arrived) }; },
    async confirmOrderArrival(query) { writes.push(plain(query)); return { success: true, data: plain(arrived) }; }
  };
  const dependencies = {
    '../../api/order': api,
    '../../utils/query': require('../miniprogram/utils/query'),
    '../../utils/order': orderUtils,
    '../../utils/orderStatusFilters': require('../miniprogram/utils/orderStatusFilters'),
    '../../utils/productDisplay': require('../miniprogram/utils/productDisplay'),
    '../../utils/physical': require('../miniprogram/utils/physical'),
    '../../service/orderFileActions': { data: {}, actions: { loadAfterSales() {}, cancelFileDownload() {} } },
    '../../service/orderProductNavigation': {},
    '../../service/mediaFiles': { normalizeFile: value => value },
    '../../utils/paymentFeedback': {},
    '../../service/customerService': {}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/pages/orderDetail/orderDetail.js'), 'utf8'), {
    Page(value) { definition = value; },
    getApp: () => ({ captureSource: () => ({}) }),
    require(name) { assert.ok(name in dependencies, 'Unexpected dependency: ' + name); return dependencies[name]; },
    wx: { showModal(options) { dialogs.push(options); }, showToast(options) { toasts.push(plain(options)); } },
    console: { error() {} }, Promise
  });
  const page = { ...definition, data: plain(definition.data), setData(patch) { Object.assign(this.data, patch); } };
  page.setData({ id: assigned.id, loading: false });
  page.applyOrder(orderUtils.normalizeOrder(assigned));
  return { page, api, dialogs, writes, reads, toasts };
}

test('arrival uses an explicit server grant and revokes stale grants on exceptions or later states', () => {
  assert.equal(orderUtils.normalizeOrder(assigned).canConfirmArrival, true);
  assert.equal(orderUtils.normalizeOrder({ ...assigned, canConfirmArrival: undefined }).canConfirmArrival, false);
  assert.equal(orderUtils.normalizeOrder({ ...assigned, canConfirmArrival: false }).canConfirmArrival, false);
  for (const patch of [
    { businessStatus: 'reserved', workflowStage: 'awaiting_dispatch' },
    { status: 'cancelled' }, { deleted: true }, { isDeleted: true }, { workflowStage: 'cancelled' },
    { businessStatus: 'completed' }, { businessStatus: 'shooting', workflowStage: 'shooting' },
    { afterSaleActive: true }, { paymentReviewRequired: true },
    { customerArrivedAt: arrived.customerArrivedAt }, { shootingStartedAt: arrived.customerArrivedAt },
    { shootingCompleted: true }
  ]) assert.equal(orderUtils.normalizeOrder({ ...assigned, ...patch }).canConfirmArrival, false, JSON.stringify(patch));
  assert.equal(orderUtils.normalizeBusinessStatus('待确认'), 'reserved');
  assert.equal(orderUtils.normalizeBusinessStatus('已预约'), 'reserved');
  assert.equal(orderUtils.normalizeBusinessStatus('待拍摄'), 'awaiting_shoot');
  assert.equal(orderUtils.normalizeBusinessStatus('已定档'), 'awaiting_shoot');
});

test('opening and cancelling arrival confirmation never submits or changes the order', async () => {
  const { page, dialogs, writes } = harness();
  const before = plain(page.data.order);
  const result = page.confirmArrival();
  assert.equal(dialogs.length, 1);
  assert.equal(dialogs[0].title, '确认到达');
  assert.equal(dialogs[0].content, '请确认您已到达约定的拍摄地点，确认后订单将进入“拍摄中”。');
  assert.equal(dialogs[0].cancelText, '暂未到达');
  assert.equal(dialogs[0].confirmText, '确认到达');
  assert.equal(writes.length, 0);
  await page.confirmArrival();
  assert.equal(dialogs.length, 1, 'rapid taps must not open duplicate dialogs');
  dialogs[0].success({ confirm: false, cancel: true });
  await result;
  assert.equal(writes.length, 0);
  assert.deepEqual(plain(page.data.order), before);
  assert.equal(page.data.arrivalConfirming, false);
  assert.equal(page.data.arrivalSubmitting, false);
});

test('confirmed arrival submits once, refreshes server facts and immediately opens final payment', async () => {
  const { page, api, dialogs, writes, reads, toasts } = harness();
  let completeRequest;
  api.confirmOrderArrival = query => {
    writes.push(plain(query));
    return new Promise(resolve => { completeRequest = resolve; });
  };
  const pending = page.confirmArrival();
  dialogs[0].success({ confirm: true });
  await settle();
  assert.deepEqual(writes, [{ orderId: assigned.id }]);
  assert.equal(page.data.arrivalSubmitting, true);
  assert.equal(page.data.order.businessStatusKey, 'awaiting_shoot', 'do not predict a successful state before the response');
  await page.confirmArrival();
  assert.equal(writes.length, 1);
  completeRequest({ success: true, data: plain(arrived) });
  await pending;
  assert.deepEqual(reads, [{ orderId: assigned.id }]);
  assert.equal(page.data.order.businessStatusKey, 'shooting');
  assert.equal(page.data.order.customerArrivedAt, arrived.customerArrivedAt);
  assert.equal(page.data.order.shootingCompleted, false, 'arrival must not invent completed shooting');
  assert.equal(page.data.order.canPayFinal, true, 'arrival must immediately reveal final payment');
  assert.equal(page.data.order.nextAction, '支付尾款');
  assert.equal(page.data.order.canConfirmArrival, false);
  assert.equal(page.data.arrivalSubmitting, false);
  assert.equal(toasts.at(-1).title, '已确认到达');
});

test('a failed arrival remains retryable and must not advance the order', async () => {
  const { page, api, dialogs, writes } = harness();
  api.confirmOrderArrival = async query => { writes.push(plain(query)); throw new Error('网络连接失败，请重试'); };
  const failed = page.confirmArrival();
  dialogs[0].success({ confirm: true });
  await failed;
  assert.equal(page.data.order.businessStatusKey, 'awaiting_shoot');
  assert.equal(page.data.order.canConfirmArrival, true);
  assert.equal(page.data.order.customerArrivedAt, '');
  assert.equal(page.data.arrivalError, '网络连接失败，请重试');
  assert.equal(page.data.arrivalSubmitting, false);
  api.confirmOrderArrival = async query => { writes.push(plain(query)); return { success: true, data: plain(arrived) }; };
  const retried = page.confirmArrival();
  assert.equal(page.data.arrivalError, '');
  dialogs[1].success({ confirm: true });
  await retried;
  assert.equal(writes.length, 2);
  assert.equal(page.data.order.businessStatusKey, 'shooting');
});

test('a missing grant, revoked grant or an order switch during confirmation cannot submit arrival', async () => {
  const { page, dialogs, writes } = harness();
  page.applyOrder(orderUtils.normalizeOrder({ ...assigned, canConfirmArrival: false }));
  await page.confirmArrival();
  assert.equal(dialogs.length, 0);
  for (const patch of [{ canConfirmArrival: false }, { id: 'different-order' }]) {
    page.applyOrder(orderUtils.normalizeOrder(assigned));
    const pending = page.confirmArrival();
    page.applyOrder(orderUtils.normalizeOrder({ ...assigned, ...patch }));
    dialogs.at(-1).success({ confirm: true });
    await pending;
  }
  assert.equal(writes.length, 0);
});

test('an incomplete or rejected server result cannot produce arrival success', async () => {
  for (const response of [
    { success: false, error: '订单已取消' },
    { success: true, data: assigned },
    { success: true, data: { ...arrived, id: 'different-order' } },
    { success: true, data: null }
  ]) {
    const { page, api, dialogs, toasts } = harness();
    api.confirmOrderArrival = async () => response;
    const pending = page.confirmArrival();
    dialogs[0].success({ confirm: true });
    await pending;
    assert.equal(page.data.order.businessStatusKey, 'awaiting_shoot');
    assert.equal(page.data.arrivalSubmitting, false);
    assert.equal(toasts.at(-1).icon, 'none');
    assert.ok(page.data.arrivalError);
  }
});

test('after arrival, the most recent server read wins over an older in-flight order response', async () => {
  const { page, api, dialogs } = harness();
  const reads = [];
  api.getOrderDetail = () => new Promise(resolve => reads.push(resolve));
  const pending = page.confirmArrival();
  const oldRead = page.loadOrder();
  dialogs[0].success({ confirm: true });
  await settle();
  assert.equal(reads.length, 2);
  const latest = { ...arrived, businessStatus: 'completed', workflowStage: 'completed' };
  reads[1]({ success: true, data: latest });
  await pending;
  reads[0]({ success: true, data: assigned });
  await oldRead;
  assert.equal(page.data.order.businessStatusKey, 'completed');
  assert.equal(page.data.order.canConfirmArrival, false);
});

test('the arrival RPC wrapper keeps the authenticated customer API transport', async () => {
  const calls = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/api/order.js'), 'utf8'), {
    module,
    require(name) {
      assert.equal(name, './client');
      return { callCloud: async (rpc, params) => { calls.push({ rpc, params: plain(params) }); return { success: true, data: plain(arrived) }; } };
    }
  });
  await module.exports.confirmOrderArrival({ orderId: assigned.id });
  assert.deepEqual(calls, [{ rpc: 'confirmOrderArrival', params: { orderId: assigned.id } }]);
});

test('service main labels stay in four states and physical order status names remain independent', () => {
  const detail = fs.readFileSync(path.join(root, 'miniprogram/pages/orderDetail/orderDetail.wxml'), 'utf8');
  const card = fs.readFileSync(path.join(root, 'miniprogram/components/lxm-order-card/lxm-order-card.wxml'), 'utf8');
  assert.match(detail, /status-tag[^\n]*>\{\{order.statusText\}\}/);
  assert.match(card, /<text>\{\{item.statusText\}\}<\/text>/);
  assert.match(detail, /disabled="\{\{arrivalConfirming \|\| arrivalSubmitting\}\}" bindtap="confirmArrival"/);
  assert.equal(require('../miniprogram/utils/physical').orderView({ status: 'awaiting_shipment' }).statusText, '待发货');
});
