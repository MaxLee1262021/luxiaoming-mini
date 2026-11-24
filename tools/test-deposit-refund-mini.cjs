'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const orderUtils = require('../miniprogram/utils/order');
const root = path.join(__dirname, '..', 'miniprogram');
const plain = value => JSON.parse(JSON.stringify(value));
global.wx = { getStorageSync() { return ''; } };
const orderApi = require('../miniprogram/api/order');
const orderFiles = require('../miniprogram/service/orderFileActions');

// Public order projections omit finance-review fields and payment records.
const booked = {
  id: 'order-deposit', status: 'deposit_paid', workflowStage: 'awaiting_dispatch',
  businessStatus: 'reserved', totalAmount: 100, depositDue: 30, depositPaid: 30,
  depositPaymentStatus: 'confirmed', finalDue: 70, finalPaid: 0,
  finalPaymentStatus: 'not_created', paymentPending: false,
  canCancel: true, canApplyRefund: true, canAfterSale: false
};

function page(extra = {}) {
  return {
    ...orderFiles.actions,
    data: { ...orderFiles.data, order: orderUtils.normalizeOrder(booked), ...extra },
    setData(patch) { Object.assign(this.data, patch); },
    openRefund() { this.setData({ orderAction: 'refund' }); }
  };
}

function refundForm(item = booked) {
  let definition, respond = async () => ({ success: true, data: { refundStatus: 'processing', refundAmount: 30 } });
  const storage = new Map(), calls = [], notices = [], events = [];
  const api = {
    async requestOrderRefund(params) { calls.push(plain(params)); return respond(params); },
    async submitAfterSale() { throw new Error('Automatic refunds must not create after-sales'); },
    async cancelOrder() { throw new Error('The refund action must use the refund RPC'); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'components/lxm-order-actions/lxm-order-actions.js'), 'utf8'), {
    Component(value) { definition = value; }, require: name => name === '../../utils/order' ? orderUtils : api,
    wx: {
      getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: key => storage.delete(key),
      showToast: notice => notices.push(notice), showModal: notice => notices.push(notice)
    }, Date, Math, JSON, String, Error
  });
  const instance = {
    ...definition.methods, data: { ...plain(definition.data), item: plain(item), action: 'refund' },
    setData(patch) { Object.assign(this.data, patch); }, triggerEvent(name, detail) { events.push({ name, detail }); }
  };
  definition.observers.action.call(instance, 'refund');
  instance.onReason({ detail: { value: '拍摄计划发生变化' } });
  return { instance, calls, notices, events, respond(value) { respond = value; } };
}

test('reserved orders need a server grant and confirmed payment to apply for an automatic refund', () => {
  const normalized = orderUtils.normalizeOrder(booked);
  assert.equal(normalized.statusText, '已预约');
  assert.equal(normalized.canApplyRefund, true);
  assert.equal(normalized.canAfterSale, false);
  assert.equal(orderUtils.normalizeOrder({ ...booked, canAfterSale: true }).canAfterSale, false);
  assert.equal(orderUtils.normalizeOrder({ ...booked, canApplyRefund: undefined }).canApplyRefund, false);
  for (const patch of [
    { canApplyRefund: false }, { canCancel: false }, { depositPaid: 0 }, { depositPaymentStatus: 'pending' },
    { paymentPending: true }, { paymentReviewRequired: true }, { afterSaleActive: true },
    { status: 'cancelled' }, { deleted: true }, { photographerId: 'photo-1' },
    { dispatchHistory: [{ previous: { photographerId: 'photo-1' } }] }, { dispatchStatus: 'pending_reassignment' },
    { workflowStage: 'awaiting_shoot', businessStatus: 'awaiting_shoot' },
    { customerArrivedAt: '2026-11-16T03:00:00Z' }, { shootingStartedAt: '2026-11-16T03:00:00Z' }
  ]) assert.equal(orderUtils.normalizeOrder({ ...booked, ...patch }).canApplyRefund, false, JSON.stringify(patch));
});

test('the legacy deposit-refund entry uses automatic refunds independently of after-sale records', async () => {
  orderApi.getMyAfterSales = async () => { throw new Error('售后记录暂不可用'); };
  const instance = page();
  instance.openDepositRefund();
  assert.equal(instance.data.orderAction, 'refund');
  assert.equal(instance.data.afterSaleVisible, false);
  await instance.loadAfterSales();
  assert.match(instance.data.afterSaleRecordsError, /暂不可用/);
  assert.equal(instance.data.canRequestAfterSale, false);
  assert.equal(instance.data.order.canApplyRefund, true);
  instance.data.order.photographerId = 'new-assignment';
  instance.data.orderAction = '';
  instance.openDepositRefund();
  assert.equal(instance.data.orderAction, '');
});

test('a stale after-sale form cannot turn a reserved order into an after-sale refund', async () => {
  let requests = 0;
  orderApi.submitAfterSale = async () => { requests++; return { success: true }; };
  const instance = page({ afterSaleVisible: true, afterSaleReason: '行程变化申请退款', canRequestAfterSale: true });
  await instance.submitAfterSale();
  assert.equal(requests, 0);
  assert.match(instance.data.afterSaleError, /申请退款/);
  instance.data.afterSaleVisible = false;
  instance.openAfterSale();
  assert.equal(instance.data.afterSaleVisible, false);
});

test('automatic refund submissions preserve retry identity and never claim pending funds have arrived', async () => {
  const h = refundForm();
  let rejectRequest;
  h.respond(() => new Promise((resolve, reject) => { rejectRequest = reject; }));
  const pending = h.instance.submit();
  await h.instance.submit();
  h.instance.close();
  assert.equal(h.calls.length, 1);
  assert.equal(h.instance.data.visible, true);
  rejectRequest(new Error('网络超时'));
  await pending;
  assert.equal(h.instance.data.reason, '拍摄计划发生变化');
  assert.equal(h.notices.length, 0);
  assert.match(h.instance.data.error, /超时/);
  h.respond(async () => ({ success: true, data: { refundStatus: 'processing', refundAmount: 30 } }));
  await h.instance.submit();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].idempotencyKey, h.calls[0].idempotencyKey);
  assert.equal(h.calls[0].orderId, 'order-deposit');
  assert.equal(Object.hasOwn(h.calls[0], 'refundAmount'), false);
  assert.equal(Object.hasOwn(h.calls[0], 'financeStatus'), false);
  assert.equal(h.instance.data.item.depositPaid, 30);
  assert.equal(h.instance.data.visible, false);
  assert.ok(h.events.some(event => event.name === 'updated'));
  assert.equal(h.notices[0].title, '取消预约已提交');
  assert.match(h.notices.at(-1).content, /自动发起原路退款/);
  assert.doesNotMatch(h.notices.at(-1).content, /已原路退款/);
});

test('stale grants and server refusals retain the draft without showing success', async () => {
  const stale = refundForm();
  stale.instance.data.item.photographerId = 'new-assignment';
  await stale.instance.submit();
  assert.equal(stale.calls.length, 0);
  assert.match(stale.instance.data.error, /刷新订单/);
  for (const response of [null, { success: false, error: '摄影师已安排，请联系客服' }]) {
    const h = refundForm();
    h.respond(async () => response);
    await h.instance.submit();
    assert.equal(h.instance.data.visible, true);
    assert.equal(h.instance.data.reason, '拍摄计划发生变化');
    assert.equal(h.instance.data.submitting, false);
    assert.equal(h.notices.length, 0);
    assert.equal(h.events.length, 0);
    assert.ok(h.instance.data.error);
  }
});

test('only acknowledged refunds report success; refund failures offer a detail retry', async () => {
  const success = refundForm();
  success.respond(async () => ({ success: true, data: { refundStatus: 'refunded', refundAmount: 30 } }));
  await success.instance.submit();
  assert.match(success.notices.at(-1).content, /已原路退款/);
  const failed = refundForm();
  failed.respond(async () => ({ success: true, data: { refundStatus: 'refund_failed' } }));
  await failed.instance.submit();
  assert.match(failed.notices.at(-1).content, /退款暂未完成.*重试/);
});
