'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const miniRoot = path.join(__dirname, '..', 'miniprogram');
const orderUtils = require(path.join(miniRoot, 'utils/order'));
const filters = require(path.join(miniRoot, 'utils/orderStatusFilters'));
const queryUtils = require(path.join(miniRoot, 'utils/query'));
const storage = new Map();
const navigation = [];
const requests = [];
const plain = value => JSON.parse(JSON.stringify(value));

// The public contract includes payment and workflow facts, not finance-review
// fields, private photographer IDs or internal payment records.
const paidDeposit = {
  id: 'public-order', orderNo: 'LXM-PUBLIC-ORDER', status: 'confirmed',
  businessStatus: 'reserved', workflowStage: 'awaiting_dispatch', dispatchStatus: 'pending',
  totalAmount: 100, depositDue: 30, depositPaid: 30, depositPaymentStatus: 'confirmed',
  finalDue: 70, finalPaid: 0, finalPaymentStatus: 'not_created',
  shootingCompleted: false, canRefundDeposit: true, canAfterSale: true,
  canPayDeposit: false, canPayFinal: false, paymentPending: false,
  deliveryPublished: false, deliverFiles: []
};
let publicOrder = paidDeposit;
const api = {
  async createPayment() {
    return { success: true, data: { status: 'confirmed', orderId: paidDeposit.id, orderNo: paidDeposit.orderNo, workflowStage: 'awaiting_dispatch' } };
  },
  async getOrderDetail() { return { success: true, data: plain(publicOrder) }; },
  async getMyOrders(query) { requests.push(query); return { success: true, data: [plain(publicOrder)] }; },
  async getOrderStatusCount() { return { success: true, data: { businessStatus: { reserved: 0, awaiting_shoot: 0, shooting: 0, completed: 0, [publicOrder.businessStatus]: 1 } } }; }
};
const wx = {
  getStorageSync: key => storage.get(key) || '',
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: key => storage.delete(key),
  navigateTo: value => navigation.push(value.url),
  redirectTo: value => navigation.push(value.url),
  showToast() {}
};

function loadPage(name) {
  let definition;
  const dependencies = {
    '../../api/order': api, '../../utils/order': orderUtils,
    '../../utils/orderStatusFilters': filters, '../../utils/query': queryUtils,
    '../../service/bookingConfig': { getConfig() { return {}; } },
    '../../service/orderFileActions': { data: {}, actions: { async loadAfterSales() {} } },
    '../../service/mediaFiles': { normalizeFile: value => value }
  };
  vm.runInNewContext(fs.readFileSync(path.join(miniRoot, 'pages', name, name + '.js'), 'utf8'), {
    Page(value) { definition = value; },
    getApp: () => ({ captureSource: () => ({}) }),
    require: name => dependencies[name] || {},
    wx, console, Promise, Date, Math
  }, { filename: name + '.js' });
  return {
    ...definition, data: plain(definition.data),
    setData(patch) { Object.assign(this.data, patch); }
  };
}

(async () => {
  for (const patch of [
    { businessStatus: 'awaiting_photographer', workflowStage: undefined, status: 'confirmed' },
    { businessStatus: 'awaiting_photographer', workflowStage: undefined, status: 'confirmed', dispatchRecord: {} },
    { businessStatus: undefined, workflowStage: undefined, status: 'assigned', dispatchStatus: 'assigned', dispatchRecord: {} }
  ]) {
    const normalized = orderUtils.normalizeOrder({ ...paidDeposit, ...patch });
    assert.equal(normalized.businessStatusKey, 'reserved', JSON.stringify(patch));
    assert.equal(normalized.statusText, '待确认');
    assert.equal(normalized.workflowStage, 'awaiting_dispatch');
    assert.equal(normalized.canRefundDeposit, true);
    assert.equal(filters.orderListStatus(normalized), 'reserved');
  }
  const assigned = orderUtils.normalizeOrder({ ...paidDeposit, photographerId: 'actual-photographer' });
  assert.equal(assigned.businessStatusKey, 'awaiting_shoot');
  assert.equal(assigned.canRefundDeposit, false);
  assert.equal(orderUtils.normalizeOrder({ ...paidDeposit, businessStatus: 'shooting', workflowStage: undefined }).businessStatusKey, 'shooting');
  const earlyDelivery = orderUtils.normalizeOrder({
    ...paidDeposit, businessStatus: 'shooting', workflowStage: undefined, status: 'shooting',
    shootingCompleted: false, deliveryRecord: { method: 'mini_program' }, deliveryPublished: true,
    canPayFinal: true, paymentPhase: 'final'
  });
  assert.equal(earlyDelivery.workflowStage, 'shooting');
  assert.equal(earlyDelivery.shootingCompleted, false);
  assert.equal(earlyDelivery.canPayFinal, false);
  assert.equal(orderUtils.normalizeOrder({ ...earlyDelivery, workflowStage: 'awaiting_final_payment' }).canPayFinal, false);

  const booking = loadPage('bookingInfo');
  booking.data.depositDue = 30;
  assert.equal(await booking.startBookingPayment('booking-draft'), true);
  let target = new URL(navigation.at(-1), 'https://mini.example.invalid');
  assert.equal(target.pathname, '/pages/bookingSuccess/bookingSuccess');
  const success = loadPage('bookingSuccess');
  await success.loadOrderDetail(target.searchParams.get('orderNo'), target.searchParams.get('orderId'));
  assert.equal(success.data.businessStatusKey, 'reserved');
  assert.equal(success.data.statusText, '待确认');
  success.goOrderDetail();
  target = new URL(navigation.at(-1), 'https://mini.example.invalid');
  const detail = loadPage('orderDetail');
  await detail.onLoad(Object.fromEntries(target.searchParams));
  assert.equal(detail.data.order.statusText, '待确认');
  assert.match(detail.data.statusDesc, /等待客服安排摄影师/);
  assert.equal(detail.data.order.canRefundDeposit, true);

  const orders = loadPage('myOrders');
  const my = loadPage('my');
  const scenarios = [
    ['reserved', '待确认', paidDeposit],
    ['awaiting_shoot', '待拍摄', { ...paidDeposit, businessStatus: 'awaiting_shoot', workflowStage: 'awaiting_shoot', dispatchStatus: 'assigned', canRefundDeposit: false }],
    ['shooting', '拍摄中', { ...paidDeposit, businessStatus: 'shooting', workflowStage: 'shooting', status: 'shooting', shootingStartedAt: '2026-10-26T09:00:00Z', canRefundDeposit: false, canPayFinal: true, paymentPhase: 'final' }],
    ['shooting', '拍摄中', { ...paidDeposit, businessStatus: 'shooting', workflowStage: 'awaiting_final_payment', shootingCompleted: true, shootingCompletedAt: '2026-10-26T10:00:00Z', selectionStatus: 'pending', canRefundDeposit: false, canPayFinal: true, paymentPhase: 'final' }],
    ['completed', '已完成', { ...paidDeposit, businessStatus: 'completed', workflowStage: 'paid', status: 'paid', shootingCompleted: true, finalPaid: 70, finalPaymentStatus: 'confirmed', canRefundDeposit: false }],
    ['completed', '已完成', { ...paidDeposit, businessStatus: 'completed', workflowStage: 'completed', status: 'completed', shootingCompleted: true, finalPaid: 70, finalPaymentStatus: 'confirmed', canRefundDeposit: false }]
  ];
  for (const [key, text, payload] of scenarios) {
    publicOrder = payload;
    await success.loadOrderDetail(payload.orderNo, payload.id);
    await detail.loadOrder();
    orders.setData({ currentStatus: key });
    await orders.loadOrders(true);
    await my.loadOrderCounts();
    assert.equal(success.data.businessStatusKey, key);
    assert.equal(success.data.statusText, text);
    assert.equal(detail.data.order.businessStatusKey, key);
    assert.equal(detail.data.order.statusText, text);
    assert.equal(orders.data.orders.length, 1);
    assert.equal(orders.data.orders[0].businessStatusKey, key);
    assert.equal(orders.data.orders[0].statusText, text);
    assert.equal(requests.at(-1).businessStatus, key);
    const filter = filters.ORDER_STATUS_FILTERS.find(item => item.key === key);
    assert.equal(my.data.orderCounts[filter.countKey], 1);
    if (key === 'shooting') assert.equal(detail.data.order.canPayFinal, payload.shootingCompleted === true);
    if (key === 'completed') {
      assert.equal(detail.data.order.canPay, false);
      assert.equal(detail.data.order.deliveryVisible, false, 'delivery is independent of order completion');
      assert.equal(detail.data.order.nextAction, '订单已完成');
    }
  }
  assert.equal(orderUtils.normalizeOrder({ ...scenarios[3][2], canPayFinal: false }).canPayFinal, false);
  const detailMarkup = fs.readFileSync(path.join(miniRoot, 'pages/orderDetail/orderDetail.wxml'), 'utf8');
  assert.match(detailMarkup, /wx:for="\{\{orderStatusFilters\}\}"/);
  assert.doesNotMatch(detailMarkup, /step-label">(?:已支付|已交付|已拍摄)/);
  process.stdout.write('Public payment -> success -> detail -> list and four-state customer workflow checks passed.\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
