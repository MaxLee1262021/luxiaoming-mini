'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const miniRoot = path.resolve(__dirname, '../miniprogram');
const orderUtils = require(path.join(miniRoot, 'utils/order'));
const plain = value => JSON.parse(JSON.stringify(value));
const paymentParams = {
  timeStamp: '1700000000', nonceStr: 'nonce', package: 'prepay_id=final-prepay', signType: 'RSA', paySign: 'signature'
};

const awaitingFinal = {
  id: 'final-order', status: 'final_pending', businessStatus: 'shooting', workflowStage: 'awaiting_final_payment',
  totalAmount: 100, depositDue: 30, depositPaid: 30, depositPaymentStatus: 'confirmed',
  finalDue: 70, finalPaid: 0, finalPaymentStatus: 'not_created', shootingCompleted: true,
  canPayFinal: true, canPay: true, paymentPhase: 'final', canConfirmCompletion: false
};

function fixture(initial = awaitingFinal) {
  let definition, serverOrder = plain(initial);
  const storage = new Map(), requests = [], statusQueries = [], toasts = [];
  const control = { invokeCount: 0, statusReads: 0, detailReads: 0, create: undefined, status: undefined };
  const api = {
    async getOrderDetail() { control.detailReads++; return { success: true, data: plain(serverOrder) }; },
    async confirmOrderArrival() {
      serverOrder = { ...serverOrder, status: 'shooting', businessStatus: 'shooting', workflowStage: 'shooting',
        customerArrivedAt: '2026-11-16T03:00:00Z', canConfirmArrival: false, canPayFinal: true, canPay: true, paymentPhase: 'final' };
      return { success: true, data: plain(serverOrder) };
    },
    async createPayment(query) {
      requests.push(plain(query));
      if (control.create) return control.create(query);
      if (query.phase === 'final' && query.selectionAccepted !== true) return { success: false, error: '请确认已拍摄并同意支付尾款' };
      return { success: true, data: { status: 'pending', provider: 'wechat_pay', paymentParams } };
    },
    async getPaymentStatus(query) {
      control.statusReads++;
      statusQueries.push(plain(query));
      if (control.status) return control.status(query);
      serverOrder = { ...serverOrder, status: 'completed', businessStatus: 'completed', workflowStage: 'completed',
        finalPaid: serverOrder.finalDue, finalPaymentStatus: 'confirmed', canPayFinal: false, canPay: false, canConfirmCompletion: false };
      return { success: true, data: { status: 'confirmed' } };
    }
  };
  const wx = {
    getStorageSync: key => storage.get(key) || '', setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key), showToast: toast => toasts.push(toast),
    showModal(options) { options.success({ confirm: true }); },
    requestPayment(options) { control.invokeCount++; options.success({ errMsg: 'requestPayment:ok' }); }
  };
  const dependencies = {
    '../../api/order': api, '../../utils/order': orderUtils,
    '../../utils/physical': require('../miniprogram/utils/physical'),
    '../../utils/query': {}, '../../utils/orderStatusFilters': {},
    '../../service/orderFileActions': { data: {}, actions: { async loadAfterSales() {} } },
    '../../service/mediaFiles': { normalizeFile: value => value }, '../../utils/paymentFeedback': { paymentFailure: require('../miniprogram/utils/paymentFeedback').paymentFailure, logPaymentFailure() {} },
    '../../service/merchantShare': { async ensureScanSynced() { if (control.scanSync) await control.scanSync(); } },
    '../../service/orderProductNavigation': {},
    '../../service/customerService': {}, '../../utils/productDisplay': { orderItemDisplay: () => [] }
  };
  vm.runInNewContext(fs.readFileSync(path.join(miniRoot, 'pages/orderDetail/orderDetail.js'), 'utf8'), {
    getApp: () => ({}), Page: value => { definition = value; }, require: name => dependencies[name], wx, console, Date
  });
  const page = { ...definition, data: { ...plain(definition.data), id: initial.id },
    setData(patch) { Object.assign(this.data, patch); } };
  return { page, control, api, storage, requests, statusQueries, toasts, setServerOrder: value => { serverOrder = value; } };
}

const payFinal = page => page.handlePaymentTap({ currentTarget: { dataset: { phase: 'final' } } });
const pendingFinal = { ...awaitingFinal, paymentStatus: 'pending', finalPaymentStatus: 'pending' };
const paymentKey = `lxm_payment_intent_${awaitingFinal.id}_final`;

test('arrival immediately opens final payment and only server-confirmed payment completes the order', async () => {
  const f = fixture({ ...awaitingFinal, status: 'deposit_paid', businessStatus: 'awaiting_shoot', workflowStage: 'awaiting_shoot',
    shootingCompleted: false, canConfirmArrival: true, canPayFinal: false, canPay: false, paymentPhase: '' });
  await f.page.loadOrder();
  assert.equal(f.page.data.order.canConfirmArrival, true);
  assert.equal(f.page.data.order.canPayFinal, false);
  await f.page.confirmArrival();
  assert.equal(f.page.data.order.statusText, '拍摄中');
  assert.equal(f.page.data.order.shootingCompleted, false);
  assert.equal(f.page.data.order.canPayFinal, true);
  assert.equal(f.page.data.order.nextAction, '支付尾款');
  assert.equal(f.requests.length, 0);

  f.control.status = async () => ({ success: true, data: { status: 'pending', paymentParams } });
  await payFinal(f.page);
  assert.equal(f.control.invokeCount, 1);
  assert.equal(f.requests[0].selectionAccepted, true);
  assert.equal(f.page.data.order.statusText, '拍摄中', 'WeChat success without server confirmation cannot complete the order');
  assert.equal(f.page.data.order.canPayFinal, true);

  f.control.status = undefined;
  await f.page.refreshPaymentStatus({ silent: true });
  assert.equal(f.page.data.order.statusText, '已完成');
  assert.equal(f.page.data.order.canPayFinal, false);
  assert.equal(f.page.data.order.canConfirmArrival, false);
});

test('finance placeholders cannot override the current phase payment status or open a resume loop', async () => {
  const placeholder = { id: 'final-placeholder', phase: 'final', amount: 70, status: 'pending' };
  for (const states of [
    { paymentStatus: 'not_created', finalPaymentStatus: 'not_created' },
    { paymentStatus: 'not_created' },
    {}
  ]) {
    const initial = { ...awaitingFinal, ...states, paymentRecords: [placeholder] };
    if (!Object.hasOwn(states, 'finalPaymentStatus')) delete initial.finalPaymentStatus;
    const f = fixture(initial);
    await f.page.loadOrder();
    assert.equal(f.page.data.paymentStatus, 'not_created');
    assert.equal(f.page.data.order.paymentPending, false);
    await payFinal(f.page);
    assert.equal(f.requests.length, 1);
    assert.equal(f.control.invokeCount, 1);
    assert.equal(f.page.data.order.businessStatusKey, 'completed');
  }
  const realPending = orderUtils.normalizeOrder({ ...awaitingFinal, finalPaymentStatus: undefined,
    paymentRecords: [{ ...placeholder, provider: 'wechat_pay', idempotencyKey: 'existing-real-intent' }] });
  assert.equal(realPending.paymentStatus, 'pending');
});

test('payment status for the active phase takes precedence over stale records and aggregate amounts', async () => {
  const f = fixture({ ...awaitingFinal, paymentStatus: 'pending', pendingPaymentAmount: 30,
    paymentRecords: [{ id: 'old-final', phase: 'final', status: 'pending', provider: 'wechat_pay' }] });
  await f.page.loadOrder();
  assert.equal(f.page.data.paymentStatus, 'not_created');
  assert.equal(f.page.data.paymentMessage, '');
  await payFinal(f.page);
  assert.equal(f.requests.length, 1);
});

test('resuming an uncreated final payment creates and invokes it in the same tap', async () => {
  const f = fixture(pendingFinal);
  await f.page.loadOrder();
  f.storage.set(paymentKey, 'mini-final-original-request');
  f.control.status = async () => {
    f.control.status = undefined;
    return { success: true, data: { status: 'not_created' } };
  };
  await payFinal(f.page);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].idempotencyKey, 'mini-final-original-request');
  assert.equal(f.requests[0].selectionAccepted, true);
  assert.equal(f.control.invokeCount, 1);
  assert.deepEqual(f.statusQueries[0], { orderId: awaitingFinal.id, phase: 'final' });
  assert.equal(f.page.data.order.businessStatusKey, 'completed');
  assert.equal(f.page.data.paymentSubmitting, false);
  assert.equal(f.storage.has(paymentKey), false);
});

test('resuming without parameters reuses the intent key and asks the server to prepare payment', async () => {
  const f = fixture(pendingFinal);
  await f.page.loadOrder();
  f.storage.set(paymentKey, 'mini-final-uncertain-request');
  f.control.status = async () => {
    f.control.status = undefined;
    return { success: true, data: { status: 'pending', provider: 'wechat_pay' } };
  };
  await payFinal(f.page);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].idempotencyKey, 'mini-final-uncertain-request');
  assert.equal(f.control.invokeCount, 1);
  assert.equal(f.toasts.some(toast => /支付参数准备中/.test(toast.title)), false);
});

test('a failed intent is replaced before invoking payment again', async () => {
  const f = fixture(pendingFinal);
  await f.page.loadOrder();
  f.storage.set(paymentKey, 'mini-final-failed-request');
  f.control.status = async () => {
    f.control.status = undefined;
    return { success: true, data: { status: 'failed' } };
  };
  await payFinal(f.page);
  assert.equal(f.requests.length, 1);
  assert.notEqual(f.requests[0].idempotencyKey, 'mini-final-failed-request');
  assert.equal(f.control.invokeCount, 1);
});

test('a pending payment with parameters resumes directly without creating another intent', async () => {
  const f = fixture(pendingFinal);
  await f.page.loadOrder();
  f.control.status = async () => {
    f.control.status = undefined;
    return { success: true, data: { status: 'pending', provider: 'wechat_pay', paymentParams } };
  };
  await payFinal(f.page);
  assert.equal(f.requests.length, 0);
  assert.equal(f.control.invokeCount, 1);
  assert.equal(f.page.data.order.businessStatusKey, 'completed');
});

test('resuming an existing payment keeps status queries available while waiting for the latest merchant scan before opening WeChat', async () => {
  const f = fixture(pendingFinal);
  await f.page.loadOrder();
  f.control.status = async () => ({ success: true, data: { status: 'pending', provider: 'wechat_pay', paymentParams } });
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  f.control.scanSync = async () => { started(); await gate; };
  const paying = payFinal(f.page);
  await ready;
  assert.equal(f.statusQueries.length, 1, 'the existing payment can be queried before scan synchronization');
  assert.equal(f.requests.length, 0); assert.equal(f.control.invokeCount, 0);
  release(); await paying;
  assert.equal(f.control.invokeCount, 1);
});

test('an unsynced scan prevents a resumed wallet invocation and shows a retry message without preventing status queries', async () => {
  const f = fixture(pendingFinal);
  await f.page.loadOrder();
  f.control.status = async () => ({ success: true, data: { status: 'pending', provider: 'wechat_pay', paymentParams } });
  f.control.scanSync = async () => { throw Object.assign(new Error('pending scan'), { code: 'SHARE_SCAN_SYNC_PENDING' }); };
  await payFinal(f.page);
  assert.equal(f.control.invokeCount, 0); assert.equal(f.requests.length, 0);
  assert.equal(f.statusQueries.length, 2, 'payment status remains readable after the blocked invocation');
  assert.ok(f.toasts.some(toast => /扫码信息同步/.test(toast.title)));
  f.control.scanSync = undefined;
  await payFinal(f.page);
  assert.equal(f.control.invokeCount, 1, 'retry can open the wallet after synchronization succeeds');
});

test('an already confirmed payment only refreshes the order and clears the request key', async () => {
  const f = fixture(pendingFinal);
  await f.page.loadOrder();
  f.storage.set(paymentKey, 'mini-final-already-paid');
  await payFinal(f.page);
  assert.equal(f.requests.length, 0);
  assert.equal(f.control.invokeCount, 0);
  assert.equal(f.page.data.order.businessStatusKey, 'completed');
  assert.equal(f.storage.has(paymentKey), false);
});

test('a failed status query cannot create a new payment or invoke WeChat', async () => {
  const f = fixture(pendingFinal);
  await f.page.loadOrder();
  f.storage.set(paymentKey, 'mini-final-unknown-result');
  f.control.status = async () => { throw new Error('network unavailable'); };
  await payFinal(f.page);
  assert.equal(f.requests.length, 0);
  assert.equal(f.control.invokeCount, 0);
  assert.equal(f.storage.get(paymentKey), 'mini-final-unknown-result');
  assert.match(f.toasts.at(-1).title, /支付状态暂时无法查询/);
  assert.equal(f.page.data.paymentMessage, f.toasts.at(-1).title);
  assert.doesNotMatch(f.page.data.paymentMessage, /network unavailable/);
  assert.equal(f.page.data.paymentSubmitting, false);
});

test('controlled recovery errors are visible for rejected and unsuccessful status responses', async () => {
  for (const responseMode of ['rejected', 'unsuccessful']) {
    const f = fixture(pendingFinal);
    await f.page.loadOrder();
    f.storage.set(paymentKey, 'mini-final-recovery-error');
    const message = '微信支付服务响应校验失败，请稍后重试';
    f.control.status = async () => {
      if (responseMode === 'rejected') throw Object.assign(new Error(message), { code: 'WECHAT_PAY_RESPONSE_SIGNATURE_INVALID' });
      return { success: false, error: message, code: 'WECHAT_PAY_RESPONSE_SIGNATURE_INVALID' };
    };
    await payFinal(f.page);
    assert.equal(f.requests.length, 0);
    assert.equal(f.control.invokeCount, 0);
    assert.equal(f.control.detailReads, 1, 'a failed query cannot replace the order or infer payment success');
    assert.equal(f.page.data.paymentMessage, message);
    assert.equal(f.toasts.at(-1).title, message);
    assert.equal(f.storage.get(paymentKey), 'mini-final-recovery-error');
    assert.equal(f.page.data.paymentSubmitting, false);
  }
});

test('status errors without a controlled payment code show the generic query message', async () => {
  const f = fixture(pendingFinal);
  await f.page.loadOrder();
  f.control.status = async () => ({ success: false, error: 'internal network diagnostics', code: 'ETIMEDOUT' });
  await payFinal(f.page);
  assert.equal(f.requests.length, 0);
  assert.equal(f.control.invokeCount, 0);
  assert.equal(f.toasts.at(-1).title, '支付状态暂时无法查询，请稍后重试');
  assert.equal(f.page.data.paymentMessage, f.toasts.at(-1).title);
});

test('uncertain creation responses preserve the original request and query before invoking payment on retry', async () => {
  for (const responseMode of ['rejected', 'unsuccessful']) {
    const f = fixture();
    await f.page.loadOrder();
    const message = '微信支付网络连接异常，请稍后重试';
    f.control.create = async () => {
      if (responseMode === 'rejected') throw Object.assign(new Error(message), { code: 'WECHAT_PAY_NETWORK_ERROR' });
      return { success: false, error: message, code: 'WECHAT_PAY_NETWORK_ERROR' };
    };
    await payFinal(f.page);
    const originalKey = f.requests[0].idempotencyKey;
    assert.ok(originalKey);
    assert.equal(f.storage.get(paymentKey), originalKey);
    assert.equal(f.page.data.paymentStatus, 'pending');
    assert.equal(f.page.data.paymentMessage, message);
    assert.equal(f.toasts.at(-1).title, message);
    assert.equal(f.control.invokeCount, 0);
    assert.equal(f.page.data.paymentSubmitting, false);

    f.control.status = async () => {
      assert.equal(f.storage.get(paymentKey), originalKey);
      f.control.status = undefined;
      return { success: true, data: { status: 'pending', paymentParams } };
    };
    await payFinal(f.page);
    assert.equal(f.requests.length, 1, 'the retry must query and resume the original intent instead of creating another');
    assert.equal(f.control.statusReads, 2);
    assert.equal(f.control.invokeCount, 1);
    assert.equal(f.page.data.order.businessStatusKey, 'completed');
    assert.equal(f.storage.has(paymentKey), false);
  }
});

test('a query proving no payment was created retries with the preserved request key', async () => {
  const f = fixture();
  await f.page.loadOrder();
  f.control.create = async () => ({ success: false, error: '支付状态同步中，请稍后重试' });
  await payFinal(f.page);
  const originalKey = f.requests[0].idempotencyKey;
  assert.equal(f.storage.get(paymentKey), originalKey);
  f.control.create = undefined;
  f.control.status = async () => {
    f.control.status = undefined;
    return { success: true, data: { status: 'not_created' } };
  };
  await payFinal(f.page);
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].idempotencyKey, originalKey);
  assert.equal(f.control.invokeCount, 1);
  assert.equal(f.page.data.order.businessStatusKey, 'completed');
});

test('resuming rechecks the payment grant and phase after refreshing the order', async () => {
  for (const status of ['not_created', 'pending', 'failed']) {
    for (const changed of [
      { canPay: false, canPayFinal: false },
      { paymentPhase: 'deposit', canPayFinal: false }
    ]) {
      const f = fixture(pendingFinal);
      await f.page.loadOrder();
      f.control.status = async () => {
        f.setServerOrder({ ...pendingFinal, ...changed });
        return { success: true, data: { status, ...(status === 'pending' ? { paymentParams } : {}) } };
      };
      await payFinal(f.page);
      assert.equal(f.requests.length, 0);
      assert.equal(f.control.invokeCount, 0);
      assert.equal(f.page.data.paymentSubmitting, false);
    }
  }
});

test('repeated taps during status recovery create at most one payment', async () => {
  const f = fixture(pendingFinal);
  await f.page.loadOrder();
  let releaseStatus;
  f.control.status = () => new Promise(resolve => { releaseStatus = resolve; });
  const firstTap = payFinal(f.page);
  await payFinal(f.page);
  assert.equal(f.control.statusReads, 1);
  f.control.status = undefined;
  releaseStatus({ success: true, data: { status: 'not_created' } });
  await firstTap;
  assert.equal(f.requests.length, 1);
  assert.equal(f.control.invokeCount, 1);
  assert.equal(f.page.data.paymentSubmitting, false);
});

test('final payment invokes WeChat and completes only after server confirmation and detail refresh', async () => {
  const f = fixture();
  await f.page.loadOrder();
  assert.equal(f.page.data.order.businessStatusKey, 'shooting');
  assert.equal(f.page.data.order.canPayFinal, true);
  await f.page.handlePaymentTap({ currentTarget: { dataset: { phase: 'final' } } });
  assert.equal(f.requests[0].phase, 'final');
  assert.equal(f.requests[0].orderId, awaitingFinal.id);
  assert.deepEqual(Object.keys(f.requests[0]).sort(), ['idempotencyKey', 'orderId', 'phase', 'selectionAccepted']);
  assert.equal(f.requests[0].selectionAccepted, true, 'the final-payment API requires acknowledgement of completed shooting');
  assert.equal(f.control.invokeCount, 1);
  assert.equal(f.control.statusReads, 1);
  assert.equal(f.control.detailReads, 2);
  assert.equal(f.page.data.order.businessStatusKey, 'completed');
  assert.equal(f.page.data.order.finalPaid, 70);
  assert.equal(f.page.data.order.canPayFinal, false);
});

test('zero balance completion after arrival needs only the customer acknowledgement and never invokes WeChat', async () => {
  const zero = { ...awaitingFinal, status: 'shooting', workflowStage: 'shooting', shootingCompleted: false,
    customerArrivedAt: '2026-11-16T03:00:00Z', finalDue: 0, totalAmount: 30, canPay: false, canPayFinal: false, canConfirmCompletion: true };
  const f = fixture(zero);
  await f.page.loadOrder();
  assert.equal(f.page.data.order.canConfirmCompletion, true);
  assert.equal(f.page.data.order.statusText, '拍摄中');
  assert.equal(f.page.data.order.shootingCompleted, false);
  f.control.create = async () => {
    f.setServerOrder({ ...zero, status: 'completed', businessStatus: 'completed', workflowStage: 'completed',
      canConfirmCompletion: false, completionSource: 'zero_balance', finalPaymentStatus: 'confirmed' });
    return { success: true, data: { status: 'confirmed', provider: 'zero_balance', invokeWeChatPay: false } };
  };
  await f.page.confirmCompletion();
  assert.equal(f.requests[0].phase, 'final');
  assert.equal(f.requests[0].confirmCompletion, true);
  assert.equal(f.requests[0].selectionAccepted, true);
  assert.ok(f.requests[0].idempotencyKey);
  assert.equal(f.control.invokeCount, 0);
  assert.equal(f.control.detailReads, 2);
  assert.equal(f.page.data.order.businessStatusKey, 'completed');
  assert.equal(f.page.data.order.finalPaid, 0);
  assert.equal(f.storage.size, 0);
});

test('completion requires a zero balance server grant and retries keep the same request key', async () => {
  const zero = { ...awaitingFinal, finalDue: 0, totalAmount: 30, canPay: false, canPayFinal: false, canConfirmCompletion: true };
  const f = fixture(zero);
  await f.page.loadOrder();
  f.control.create = async () => ({ success: false, error: '状态已变化，请刷新' });
  await f.page.confirmCompletion();
  assert.equal(f.page.data.order.businessStatusKey, 'shooting');
  assert.equal(f.control.detailReads, 1);
  assert.match(f.toasts.at(-1).title, /状态已变化/);
  await f.page.confirmCompletion();
  assert.equal(f.requests[0].idempotencyKey, f.requests[1].idempotencyKey);
  const before = f.requests.length;
  f.page.data.order.canConfirmCompletion = false;
  await f.page.confirmCompletion();
  f.page.data.order.canConfirmCompletion = true;
  f.page.data.order.finalDue = 1;
  await f.page.confirmCompletion();
  f.page.data.order.finalDue = 0;
  f.page.data.paymentSubmitting = true;
  await f.page.confirmCompletion();
  assert.equal(f.requests.length, before);
  assert.equal(f.control.invokeCount, 0);
});

test('returning to order details refreshes the shooting result and exposes the final-payment grant', async () => {
  const shooting = { ...awaitingFinal, status: 'shooting', workflowStage: 'shooting', shootingCompleted: false, canPay: false, canPayFinal: false };
  const f = fixture(shooting);
  await f.page.onLoad({ id: shooting.id });
  await f.page.onShow();
  assert.equal(f.control.detailReads, 1, 'initial onShow must reuse onLoad');
  assert.equal(f.page.data.order.canPayFinal, false);
  f.setServerOrder(awaitingFinal);
  await f.page.onShow();
  assert.equal(f.control.detailReads, 2);
  assert.equal(f.page.data.order.canPayFinal, true);
  assert.equal(f.page.data.order.shootingCompleted, true);
});

test('a confirmed response from another provider cannot complete a zero-balance order', async () => {
  const zero = { ...awaitingFinal, finalDue: 0, totalAmount: 30, canPay: false, canPayFinal: false, canConfirmCompletion: true };
  const f = fixture(zero);
  await f.page.loadOrder();
  for (const provider of ['wechat_pay', 'mock_payment', undefined]) {
    f.control.create = async () => ({ success: true, data: { status: 'confirmed', provider } });
    await f.page.confirmCompletion();
    assert.equal(f.page.data.order.businessStatusKey, 'shooting');
    assert.equal(f.control.detailReads, 1);
    assert.equal(f.control.invokeCount, 0);
    assert.doesNotMatch(f.toasts.at(-1).title, /订单已完成/);
  }
  assert.equal(f.requests[0].idempotencyKey, f.requests[2].idempotencyKey);
});
