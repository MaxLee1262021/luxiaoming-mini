'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const miniRoot = path.join(__dirname, '..', 'miniprogram');
const orderUtils = require(path.join(miniRoot, 'utils', 'order'));
const filters = require(path.join(miniRoot, 'utils', 'orderStatusFilters'));
const queryUtils = require(path.join(miniRoot, 'utils', 'query'));
const requests = [];
const navigation = [];
let responseData = [];
let directResponse = false;
let counts = {};
let requestHandler;
let nextTimerId = 0;
const timers = new Map();

const api = {
  async getMyOrders(query) {
    requests.push(query);
    if (requestHandler) return requestHandler(query);
    return directResponse ? responseData : { success: true, data: responseData };
  },
  async getOrderStatusCount() { return { success: true, data: counts }; }
};

function loadPage(name, extraDependencies = {}) {
  let definition;
  const dependencies = {
    '../../api/order': api,
    '../../utils/query': queryUtils,
    '../../utils/order': orderUtils,
    '../../utils/orderStatusFilters': filters,
    ...extraDependencies
  };
  vm.runInNewContext(fs.readFileSync(path.join(miniRoot, 'pages', name, name + '.js'), 'utf8'), {
    Page(value) { definition = value; },
    getApp() { return { captureSource() { return {}; } }; },
    require(request) {
      assert.ok(Object.hasOwn(dependencies, request), 'unexpected page dependency ' + request);
      return dependencies[request];
    },
    wx: { navigateTo(options) { navigation.push(options.url); } },
    console, Promise,
    setTimeout(callback, delay) {
      const id = ++nextTimerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); }
  }, { filename: name + '.js' });
  assert.ok(definition, name + ' must register');
  return definition;
}

const ordersDefinition = loadPage('myOrders');
const myDefinition = loadPage('my', {
  '../../service/customerService': {}, '../../api/client': {},
  '../../store/sourceStore': {}, '../../store/userStore': {}
});
const plain = value => JSON.parse(JSON.stringify(value));
function page(definition) {
  return {
    ...definition, data: plain(definition.data),
    setData(patch) { Object.assign(this.data, patch); }
  };
}
const settle = () => new Promise(setImmediate);

assert.deepEqual(plain(ordersDefinition.data.tabs).map(({ key, text }) => ({ key, text })), [
  { key: '', text: '全部订单' },
  { key: 'reserved', text: '待确认' },
  { key: 'awaiting_shoot', text: '待拍摄' },
  { key: 'shooting', text: '拍摄中' },
  { key: 'completed', text: '已完成' }
]);
assert.deepEqual(plain(myDefinition.data.orderStatusFilters), plain(ordersDefinition.data.tabs.slice(1)));
const myMarkup = fs.readFileSync(path.join(miniRoot, 'pages', 'my', 'my.wxml'), 'utf8');
assert.match(myMarkup, /wx:for="\{\{orderStatusFilters\}\}"[\s\S]*?data-status="\{\{item.key\}\}"/);
assert.match(myMarkup, /type="\{\{item.icon\}\}"/);
assert.match(myMarkup, /class="status-name">\{\{item.text\}\}/);
assert.match(myMarkup, /orderCounts\[item.countKey\]/);

const rows = [
  { id: 'reserved-1', businessStatus: 'reserved', workflowStage: 'awaiting_dispatch' },
  { id: 'awaiting-1', businessStatus: 'awaiting_shoot', workflowStage: 'awaiting_shoot' },
  { id: 'shooting-1', businessStatus: 'shooting', workflowStage: 'shooting' },
  { id: 'completed-1', businessStatus: 'completed', workflowStage: 'completed' },
  { id: 'unpaid-draft', businessStatus: 'pending_payment', workflowStage: 'awaiting_deposit' }
];
for (const stale of [
  { businessStatus: 'reserved', status: 'cancelled' },
  { businessStatus: 'reserved', workflowStage: 'cancelled' },
  { listStatusKey: 'reserved', deleted: true },
  { businessStatus: 'awaiting_shoot', isDeleted: true }
]) assert.equal(filters.orderListStatus(stale), '');

(async () => {
  const my = page(myDefinition);
  my.ensureAuth = () => true;
  my.data.shopId = 'shop-1';
  my.data.scene = 'entry&source';
  for (const [index, filter] of filters.ORDER_STATUS_FILTERS.entries()) {
    my.goToOrders({ currentTarget: { dataset: { status: filter.key } } });
    const target = new URL(navigation.at(-1), 'https://mini.example.invalid');
    assert.equal(target.pathname, '/pages/myOrders/myOrders');
    assert.equal(target.searchParams.get('status'), filter.key);
    assert.equal(target.searchParams.get('shopId'), 'shop-1');
    assert.equal(target.searchParams.get('scene'), 'entry&source');
    const orders = page(ordersDefinition);
    responseData = rows;
    orders.onLoad(Object.fromEntries(target.searchParams));
    await settle();
    assert.equal(orders.data.currentStatus, filter.key);
    assert.equal(orders.data.tabs[index + 1].text, filter.text);
    assert.deepEqual(plain(requests.at(-1)), { page: 1, pageSize: 10, businessStatus: filter.key });
    assert.equal(orders.data.orders.length, 1, 'server business status and client filter must agree for ' + filter.key);
    assert.equal(orders.data.orders[0].statusText, filter.text);
  }

  // A zero reserved count must stay zero even when other totals are nonzero.
  counts = { businessStatus: { pending_payment: 19, reserved: 0, awaiting_shoot: 3, shooting: 4, completed: 5 } };
  await my.loadOrderCounts();
  assert.deepEqual(plain(my.data.orderCounts), { pendingConfirmation: 0, awaitingShoot: 3, shooting: 4, completed: 5 });
  counts.businessStatus.reserved = 2;
  await my.loadOrderCounts();
  assert.equal(my.data.orderCounts.pendingConfirmation, 2);

  const aliases = {
    pending_payment: 'reserved', pending: 'reserved', deposit: 'reserved',
    awaiting_photographer: 'reserved', confirmed: 'reserved',
    shot: 'shooting', editing: 'shooting', final: 'shooting',
    paid: 'completed', delivered: 'completed'
  };
  for (const [legacy, canonical] of Object.entries(aliases)) {
    const orders = page(ordersDefinition);
    responseData = rows;
    orders.onLoad({ status: legacy });
    await settle();
    assert.equal(orders.data.currentStatus, canonical, legacy);
    assert.ok(orders.data.tabs.some(tab => tab.key === canonical));
    assert.equal(requests.at(-1).businessStatus, canonical);
    assert.equal(orders.data.orders.length, 1);
  }

  const orders = page(ordersDefinition);
  orders.setData({ currentStatus: 'reserved' });
  for (const response of [
    { list: [rows[0]], total: 1 },
    { data: { rows: [rows[0]] } }
  ]) {
    responseData = response;
    await orders.loadOrders(true);
    assert.equal(orders.data.orders.length, 1, 'wrapped rows must render');
  }
  directResponse = true;
  responseData = [rows[0]];
  await orders.loadOrders(true);
  assert.equal(orders.data.orders.length, 1, 'direct array must render');
  directResponse = false;

  responseData = rows;
  orders.filterOrders({ currentTarget: { dataset: { status: '' } } });
  await settle();
  assert.equal(orders.data.currentStatus, '');
  assert.deepEqual(plain(requests.at(-1)), { page: 1, pageSize: 10 });
  assert.equal(orders.data.orders.length, rows.length);

  responseData = { list: [
    { id: 'after-sale-1', businessStatus: 'completed', afterSaleActive: true },
    { id: 'normal-1', businessStatus: 'completed', afterSaleActive: false }
  ] };
  orders.setData({ currentStatus: 'after_sale' });
  await orders.loadOrders(true);
  assert.deepEqual(plain(requests.at(-1)), { page: 1, pageSize: 100 });
  assert.deepEqual(plain(orders.data.orders.map(item => item.id)), ['after-sale-1']);

  // A visible list follows backend changes even when the customer stays on
  // this page; returning from details refreshes immediately without requiring
  // a pull gesture. The first onShow must not duplicate onLoad's request.
  const live = page(ordersDefinition);
  responseData = [rows[2]];
  await live.onLoad();
  const initialRequestCount = requests.length;
  live.onShow();
  assert.equal(requests.length, initialRequestCount);
  assert.equal(timers.size, 1);
  const runSync = async () => {
    const [id, timer] = timers.entries().next().value;
    timers.delete(id);
    assert.equal(timer.delay, 15000);
    await timer.callback();
  };
  responseData = [rows[3]];
  await runSync();
  assert.equal(live.data.orders[0].statusText, '已完成');
  live.onHide();
  assert.equal(timers.size, 0, 'hidden pages must not keep polling');
  responseData = [rows[0]];
  await live.onShow();
  assert.equal(live.data.orders[0].statusText, '待确认');

  // Quiet synchronization keeps loaded pages, and failed synchronization
  // leaves the last successful list visible until a subsequent retry.
  const firstPageRows = Array.from({ length: 10 }, (_, index) => ({ ...rows[2], id: 'live-' + index }));
  requestHandler = async query => ({ success: true, data: query.page === 1 ? firstPageRows : [rows[0]] });
  await live.loadOrders(true);
  await live.loadOrders(false);
  assert.equal(live.data.orders.length, 11);
  firstPageRows[0] = { ...rows[3], id: 'live-0' };
  await runSync();
  assert.equal(live.data.orders.length, 11);
  assert.equal(live.data.orders[0].statusText, '已完成');
  assert.equal(live.data.page, 3);
  const lastSuccessfulRows = plain(live.data.orders);
  requestHandler = async () => ({ success: false, error: 'temporarily unavailable' });
  const previousConsoleError = console.error;
  try {
    console.error = () => {};
    await runSync();
  } finally {
    console.error = previousConsoleError;
  }
  assert.deepEqual(plain(live.data.orders), lastSuccessfulRows);
  assert.equal(live.data.error, '');
  let finishHiddenSync;
  requestHandler = () => new Promise(resolve => { finishHiddenSync = resolve; });
  const hiddenSync = runSync();
  live.onHide();
  finishHiddenSync({ success: true, data: [rows[3]] });
  await hiddenSync;
  assert.equal(timers.size, 0, 'finishing a request after onHide must not restart polling');
  live.onUnload();
  assert.equal(timers.size, 0, 'unloaded pages must not keep polling');

  // Rapid tab switches start the new query immediately. A delayed response
  // for an old tab cannot erase the completed orders or finish its loading UI.
  const pending = [];
  requestHandler = () => new Promise(resolve => pending.push(resolve));
  const switching = page(ordersDefinition);
  switching.setData({ currentStatus: 'reserved' });
  const oldRequest = switching.loadOrders(true);
  const latestRequest = switching.filterOrders({ currentTarget: { dataset: { status: 'completed' } } });
  assert.equal(pending.length, 2);
  pending[0]({ success: true, data: [rows[0]] });
  await oldRequest;
  assert.equal(switching.data.loading, true);
  pending[1]({ success: true, data: [rows[3]] });
  await latestRequest;
  assert.deepEqual(plain(switching.data.orders.map(item => item.id)), ['completed-1']);
  assert.equal(switching.data.loading, false);
  switching.setData({ currentStatus: 'reserved' });
  const lateOldRequest = switching.loadOrders(true);
  const fastLatestRequest = switching.filterOrders({ currentTarget: { dataset: { status: 'completed' } } });
  pending[3]({ success: true, data: [rows[3]] });
  await fastLatestRequest;
  pending[2]({ success: true, data: [rows[0]] });
  await lateOldRequest;
  assert.deepEqual(plain(switching.data.orders.map(item => item.id)), ['completed-1'], 'late old responses must not replace the new tab');

  // A full server page may have fewer local matches; pagination follows the
  // received rows so later completed orders can still be loaded.
  requestHandler = undefined;
  responseData = Array.from({ length: 10 }, (_, index) => ({ ...rows[index % 2 ? 0 : 3], id: 'mixed-' + index }));
  await switching.loadOrders(true);
  assert.equal(switching.data.orders.length, 5);
  assert.equal(switching.data.hasMore, true);
  responseData = [rows[3]];
  await switching.loadOrders(false);
  assert.equal(requests.at(-1).page, 2);
  assert.equal(switching.data.orders.length, 6);
  assert.equal(switching.data.hasMore, false);

  requestHandler = () => new Promise(resolve => pending.push(resolve));
  const unloaded = page(ordersDefinition);
  const unfinishedRequest = unloaded.loadOrders(true);
  unloaded.onUnload();
  unloaded.setData = () => assert.fail('an unloaded page must ignore late responses');
  pending.at(-1)({ success: true, data: [rows[3]] });
  await unfinishedRequest;
  requestHandler = undefined;
  console.log('Personal center and order-list four-status navigation, counts and filter checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
