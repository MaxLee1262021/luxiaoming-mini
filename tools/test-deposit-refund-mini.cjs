'use strict';

const assert = require('node:assert/strict');
const { normalizeOrder, canRefundDeposit } = require('../miniprogram/utils/order');

const toasts = [];
global.wx = {
  getStorageSync() { return ''; },
  setStorageSync() {},
  removeStorageSync() {},
  showToast(options) { toasts.push(options); }
};

const orderApi = require('../miniprogram/api/order');
const orderFiles = require('../miniprogram/service/orderFileActions');
const paidDeposit = {
  id: 'order-deposit', status: 'deposit_paid', workflowStage: 'awaiting_dispatch',
  totalAmount: 100, depositDue: 30, depositPaid: 30, depositFinanceStatus: 'confirmed',
  finalDue: 70, finalPaid: 0, canRefundDeposit: true, canAfterSale: true
};
// Public RPC responses intentionally contain neither finance-review fields
// nor payment records. Use that exact payment contract in the UI flow test.
const publicPaidDeposit = {
  id: 'order-deposit', status: 'deposit_paid', workflowStage: 'awaiting_dispatch',
  businessStatus: 'awaiting_photographer', totalAmount: 100,
  depositDue: 30, depositPaid: 30, depositPaymentStatus: 'confirmed',
  finalDue: 70, finalPaid: 0, finalPaymentStatus: 'not_created',
  paymentPending: false, canRefundDeposit: true, canAfterSale: true
};

function page(extra = {}) {
  return {
    ...orderFiles.actions,
    data: { ...orderFiles.data, order: normalizeOrder(publicPaidDeposit), ...extra },
    setData(patch) { Object.assign(this.data, patch); },
    async loadOrder() { this.reloaded = true; }
  };
}

async function test(name, run) {
  toasts.length = 0;
  await run();
  process.stdout.write('PASS ' + name + '\n');
}

(async () => {
  await test('public phase payment statuses preserve the refund grant and final-payment confirmation', () => {
    const normalized = normalizeOrder(publicPaidDeposit);
    assert.equal(normalized.depositPaymentConfirmed, true);
    assert.equal(normalized.canRefundDeposit, true);
    assert.equal(normalized.finalPaymentConfirmed, false);
    assert.equal(normalizeOrder({ ...publicPaidDeposit, depositPaymentStatus: 'pending' }).canRefundDeposit, false);
    assert.equal(normalizeOrder({ ...publicPaidDeposit, depositPaid: 20 }).canRefundDeposit, false);
    const finalPaid = normalizeOrder({
      ...publicPaidDeposit, workflowStage: 'paid', status: 'paid', businessStatus: 'paid',
      finalPaid: 70, finalPaymentStatus: 'confirmed', selectionStatus: 'confirmed', canRefundDeposit: false
    });
    assert.equal(finalPaid.finalPaymentConfirmed, true);
    assert.equal(finalPaid.canPay, false);
  });

  await test('a confirmed deposit before assignment needs an explicit refund grant', () => {
    assert.equal(normalizeOrder(paidDeposit).canRefundDeposit, true);
    assert.equal(canRefundDeposit({ ...paidDeposit, canRefundDeposit: false }), false);
    assert.equal(canRefundDeposit({ ...paidDeposit, canRefundDeposit: undefined }), false);
    assert.equal(canRefundDeposit({ ...paidDeposit, depositPaid: 0 }), false);
    assert.equal(canRefundDeposit({ ...paidDeposit, depositFinanceStatus: 'pending' }), false);
    assert.equal(canRefundDeposit({ ...paidDeposit, paymentPending: true }), false);
    assert.equal(canRefundDeposit({ ...paidDeposit, depositRefundable: false }), false);
  });

  await test('assignment history, terminal stages and active aftersale revoke stale grants', () => {
    const denied = [
      { photographerId: 'photographer-1' },
      { dispatchRecord: { photographerId: 'photographer-1' } },
      { dispatchRecord: { next: { photographerId: 'photographer-1' } } },
      { dispatchRecord: { previous: { photographerId: 'photographer-1' } } },
      { dispatchRecords: [{ previous: { photographerId: 'photographer-1' } }] },
      { dispatchHistory: [{ photographerId: 'photographer-1' }] },
      { dispatchStatus: 'pending_reassignment' }, { dispatchStatus: 'unassigned' }, { dispatchStatus: 'unable' },
      { status: 'cancelled' }, { deleted: true },
      { workflowStage: 'awaiting_shoot' }, { workflowStage: 'shooting' },
      { workflowStage: 'selection_pending' }, { workflowStage: 'completed' },
      { afterSaleActive: true }, { afterSaleStatus: 'pending_review' }
    ];
    for (const patch of denied) {
      assert.equal(normalizeOrder({ ...paidDeposit, ...patch }).canRefundDeposit, false, JSON.stringify(patch));
    }
    assert.equal(canRefundDeposit({ ...paidDeposit, dispatchRecord: { note: 'not assigned' }, dispatchHistory: [] }), true);
    assert.equal(canRefundDeposit({ ...paidDeposit, status: 'assigned', dispatchStatus: 'assigned', dispatchRecord: {} }), true);
  });

  await test('refund form opens only after records load and submits a deposit request without claiming payment', async () => {
    let payload;
    orderApi.getMyAfterSales = async () => ({ success: true, data: [] });
    orderApi.submitAfterSale = async data => { payload = data; return { success: true, data: { status: 'pending_review' } }; };
    const instance = page();
    instance.openDepositRefund();
    assert.equal(instance.data.afterSaleVisible, false);
    await instance.loadAfterSales();
    assert.equal(instance.data.canRequestDepositRefund, true);
    instance.openDepositRefund();
    assert.equal(instance.data.afterSaleDepositRefund, true);
    instance.data.afterSaleReason = '拍摄计划发生变化';
    instance.data.afterSaleTypeIndex = 3;
    await instance.submitAfterSale();
    assert.equal(payload.type, '定金退款');
    assert.equal(payload.refundPhase, 'deposit');
    assert.equal(payload.orderId, 'order-deposit');
    assert.equal(Object.hasOwn(payload, 'amount'), false);
    assert.equal(instance.data.order.depositPaid, 30);
    assert.equal(instance.data.order.workflowStage, 'awaiting_dispatch');
    assert.equal(instance.data.canRequestDepositRefund, false);
    assert.equal(instance.reloaded, true);
    assert.equal(toasts[0].title, '退定金申请已提交');
  });

  await test('active tickets or record loading failures keep the refund action closed', async () => {
    const instance = page();
    orderApi.getMyAfterSales = async () => ({ success: true, data: [{ status: 'pending_review' }] });
    await instance.loadAfterSales();
    assert.equal(instance.data.canRequestDepositRefund, false);
    instance.openDepositRefund();
    assert.equal(instance.data.afterSaleVisible, false);
    instance.data.canRequestDepositRefund = true;
    orderApi.getMyAfterSales = async () => { throw new Error('加载暂不可用'); };
    await instance.loadAfterSales();
    assert.equal(instance.data.canRequestDepositRefund, false);
    assert.match(instance.data.afterSaleRecordsError, /暂不可用/);
    orderApi.getMyAfterSales = async () => ({ success: false, message: '记录查询失败' });
    await instance.loadAfterSales();
    assert.equal(instance.data.canRequestDepositRefund, false);
    assert.match(instance.data.afterSaleRecordsError, /查询失败/);
  });

  await test('an assignment arriving after the form opens blocks the stale refund action', async () => {
    let requests = 0;
    orderApi.submitAfterSale = async () => { requests++; return { success: true }; };
    const instance = page({ canRequestDepositRefund: true });
    instance.openDepositRefund();
    instance.data.afterSaleReason = '拍摄计划发生变化';
    instance.data.order.photographerId = 'newly-assigned';
    await instance.submitAfterSale();
    assert.equal(requests, 0);
    assert.equal(instance.data.afterSaleVisible, true);
    assert.match(instance.data.afterSaleError, /刷新订单/);
  });

  await test('server refusal retains the refund draft and never displays success', async () => {
    orderApi.submitAfterSale = async () => ({ success: false, message: '摄影师已安排，请联系客服' });
    const instance = page({ canRequestDepositRefund: true });
    instance.openDepositRefund();
    instance.data.afterSaleReason = '拍摄计划发生变化';
    instance.data.afterSaleFiles = [{ fileId: 'evidence-complete' }];
    await instance.submitAfterSale();
    assert.equal(instance.data.afterSaleVisible, true);
    assert.equal(instance.data.afterSaleReason, '拍摄计划发生变化');
    assert.equal(instance.data.afterSaleFiles[0].fileId, 'evidence-complete');
    assert.equal(instance.data.afterSaleSubmitting, false);
    assert.match(instance.data.afterSaleError, /摄影师已安排/);
    assert.equal(toasts.length, 0);
  });

  process.stdout.write('Mini-program deposit refund checks passed.\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
