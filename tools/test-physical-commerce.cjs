'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const physical = require('../miniprogram/utils/physical');
const skuSelection = require('../miniprogram/utils/physicalSkuSelection');
const root = path.resolve(__dirname, '..');

function load(relative, dependencies = {}, wx = {}) {
  let definition;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, relative), 'utf8'), {
    module, exports: module.exports, Page(value) { definition = value; }, getApp() { return {}; },
    require(name) { assert.ok(name in dependencies, 'unexpected dependency ' + name); return dependencies[name]; },
    wx, console, Date, Math, Promise, setTimeout, clearTimeout
  }, { filename: relative });
  if (!definition) return module.exports;
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(patch) {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.');
      let target = this.data;
      for (const part of parts.slice(0, -1)) target = target[part] || (target[part] = {});
      target[parts.at(-1)] = value;
    }
  } };
  return page;
}
const plain = value => JSON.parse(JSON.stringify(value));

function loadPeripheralPage(api, client = {}, wx = {}) {
  return load('miniprogram/pages/peripherals/peripherals.js', {
    '../../api/peripheral': {},
    '../../utils/product': require('../miniprogram/utils/product'),
    '../../utils/peripheralPresentation': require('../miniprogram/utils/peripheralPresentation'),
    '../../service/customerService': {},
    '../../api/physical': api,
    '../../utils/physical': physical,
    '../../utils/physicalSkuSelection': skuSelection,
    '../../api/client': {
      getOpenid: () => 'user1',
      isLoggedOut: () => false,
      async login() {},
      ...client
    }
  }, wx);
}

test('peripheral cart badge respects an authoritative zero and sums quantities when no total is returned', async () => {
  let cart = { totalQuantity: 0, items: [{ quantity: 4 }] };
  const page = loadPeripheralPage({ async getPhysicalCart() { return cart; } });
  page.setData({ cartQuantity: 8 });
  await page.loadCartCount();
  assert.equal(page.data.cartQuantity, 0);
  cart = { items: [{ quantity: 2 }, { quantity: '3' }] };
  await page.loadCartCount();
  assert.equal(page.data.cartQuantity, 5);
});

test('a delayed cart count cannot replace the result of a newer refresh', async () => {
  const pending = [];
  const page = loadPeripheralPage({ getPhysicalCart() { return new Promise(resolve => pending.push(resolve)); } });
  const oldRefresh = page.loadCartCount();
  const newRefresh = page.loadCartCount();
  pending[1]({ totalQuantity: 5 });
  await newRefresh;
  assert.equal(page.data.cartQuantity, 5);
  pending[0]({ totalQuantity: 2 });
  await oldRefresh;
  assert.equal(page.data.cartQuantity, 5);
});

test('logging out clears the cart badge and prevents an older response from restoring it', async () => {
  let currentUser = 'user1';
  let loggedOut = false;
  let resolveCart;
  let reads = 0;
  const page = loadPeripheralPage({ getPhysicalCart() { reads++; return new Promise(resolve => { resolveCart = resolve; }); } }, {
    getOpenid: () => currentUser,
    isLoggedOut: () => loggedOut
  });
  page.setData({ cartQuantity: 9 });
  const oldRefresh = page.loadCartCount();
  currentUser = '';
  loggedOut = true;
  await page.loadCartCount();
  assert.equal(page.data.cartQuantity, 0);
  assert.equal(reads, 1);
  resolveCart({ totalQuantity: 9 });
  await oldRefresh;
  assert.equal(page.data.cartQuantity, 0);
});

test('a cart response from another account cannot populate the current badge', async () => {
  let currentUser = 'user1';
  let resolveCart;
  const page = loadPeripheralPage({ getPhysicalCart() { return new Promise(resolve => { resolveCart = resolve; }); } }, {
    getOpenid: () => currentUser
  });
  const oldRefresh = page.loadCartCount();
  currentUser = 'user2';
  resolveCart({ totalQuantity: 12 });
  await oldRefresh;
  assert.equal(page.data.cartQuantity, 0);
});

test('adding several units refreshes the cart badge with the confirmed total', async () => {
  const requests = [];
  const toasts = [];
  let totalQuantity = 2;
  let reads = 0;
  const page = loadPeripheralPage({
    async updatePhysicalCart(data) {
      requests.push(plain(data));
      totalQuantity += data.quantity;
    },
    async getPhysicalCart() { reads++; return { totalQuantity }; }
  }, {}, { showToast(options) { toasts.push(options); } });
  page.setData({
    cartQuantity: 2,
    purchaseVisible: true,
    purchaseMode: 'cart',
    purchaseProduct: { id: 'p1' },
    selectedSku: { id: 's1', availableQuantity: 10 },
    purchaseQuantity: 3
  });
  await page.confirmPurchase();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].operation, 'add');
  assert.equal(requests[0].productId, 'p1');
  assert.equal(requests[0].skuId, 's1');
  assert.equal(requests[0].quantity, 3);
  assert.ok(requests[0].idempotencyKey);
  assert.equal(reads, 1);
  assert.equal(page.data.cartQuantity, 5);
  assert.equal(page.data.purchaseVisible, false);
  assert.equal(page.data.purchaseBusy, false);
  assert.equal(toasts[0].title, '已加入购物车');
});

test('cart selection preserves stable identifiers and rejects selected invalid lines', () => {
  const cart = { items: [
    { id: 'line1', productId: 'p1', skuId: 'sku1', quantity: 2, version: 4, selected: true },
    { id: 'line2', productId: 'p2', skuId: 'sku2', quantity: 1, version: 6, selected: false, valid: false }
  ] };
  assert.deepEqual(physical.checkoutItems(cart), [{ productId: 'p1', skuId: 'sku1', quantity: 2, lineId: 'line1', version: 4 }]);
  cart.items[1].selected = true;
  assert.throws(() => physical.checkoutItems(cart), /失效/);
});

test('purchase styles distinguish equal sizes and retain their selected SKU when added to the cart', async () => {
  const changes = [];
  const page = loadPeripheralPage({
    async getPhysicalCatalog() { return { items: [{ id: 'frame', name: '摆台相框', purchasable: true, skus: [
      { id: 'portrait', spec: '8寸15×20cm', style: '可横可竖', price: 12.8, available: 8 },
      { id: 'grid', spec: '8寸15×20cm', style: '两宫格', price: 18.8, available: 2 },
      { id: 'empty', spec: '10寸20×25cm', style: '单幅', price: 20, available: 0 }
    ] }] }; },
    async updatePhysicalCart(input) { changes.push(plain(input)); },
    async getPhysicalCart() { return { totalQuantity: 2 }; }
  }, {}, { showToast() {} });
  page.setData({ featuredPeripheral: { _id: 'frame', cover: '/images/frame.jpg' } });
  await page.openPurchase({ currentTarget: { dataset: { mode: 'cart' } } });
  assert.equal(page.data.selectedSku, null);
  assert.equal(page.data.purchasePriceText, '12.80–18.80');
  assert.equal(page.data.purchaseProduct.cover, '/images/frame.jpg');
  assert.equal(page.data.purchaseSkus[0].specLabel, '可横可竖 / 8寸15×20cm');
  assert.equal(page.data.purchaseSkus[1].specLabel, '两宫格 / 8寸15×20cm');
  assert.deepEqual(plain(page.data.purchaseSelection.styles.map(row => row.label)), ['可横可竖', '两宫格', '单幅']);
  assert.deepEqual(plain(page.data.purchaseSelection.specs.map(row => row.label)), ['8寸15×20cm', '10寸20×25cm']);
  page.selectPurchaseStyle({ currentTarget: { dataset: { value: '可横可竖' } } });
  assert.equal(page.data.selectedSku, null);
  await page.confirmPurchase();
  assert.match(page.data.purchaseError, /请选择规格/);
  assert.equal(changes.length, 0);
  page.selectPurchaseSpec({ currentTarget: { dataset: { value: '8寸15×20cm' } } });
  page.purchaseQuantityChange({ detail: { value: '5' } });
  page.selectPurchaseStyle({ currentTarget: { dataset: { value: '两宫格' } } });
  assert.equal(page.data.purchaseQuantity, 2);
  page.selectPurchaseStyle({ currentTarget: { dataset: { value: '单幅' } } });
  assert.equal(page.data.selectedSku.id, 'grid');
  page.purchaseQuantityChange({ currentTarget: { dataset: { delta: 1 } } });
  assert.equal(page.data.purchaseQuantity, 2);
  assert.match(page.data.purchaseError, /可售数量/);
  await page.confirmPurchase();
  assert.equal(changes[0].skuId, 'grid');
  assert.equal(changes[0].quantity, 2);
});

test('switching styles clears incompatible sizes and direct checkout submits only a complete available combination', async () => {
  const navigations = [];
  const page = loadPeripheralPage({
    async getPhysicalCatalog() { return { items: [{ id: 'frame', purchasable: true, skus: [
      { id: 'wood-6', spec: '6寸', style: '枫木白', specLabel: '6寸【枫木白】', price: 25, available: 8 },
      { id: 'white-7', spec: '7寸', style: '米白色', price: 30, available: 2 },
      { id: 'white-6', spec: '6寸', style: '米白色', price: 25, available: 0 }
    ] }] }; }
  }, {}, { navigateTo(options) { navigations.push(options.url); } });
  page.setData({ featuredPeripheral: { _id: 'frame' } });
  await page.openPurchase({ currentTarget: { dataset: { mode: 'direct' } } });
  page.selectPurchaseSpec({ currentTarget: { dataset: { value: '6寸' } } });
  assert.equal(page.data.selectedSku, null, 'specification cannot bypass selecting a style');
  page.selectPurchaseStyle({ currentTarget: { dataset: { value: '枫木白' } } });
  page.selectPurchaseSpec({ currentTarget: { dataset: { value: '6寸' } } });
  assert.equal(page.data.selectedSku.specLabel, '枫木白 / 6寸');
  page.selectPurchaseStyle({ currentTarget: { dataset: { value: '米白色' } } });
  assert.equal(page.data.selectedSku, null);
  assert.equal(page.data.purchaseSelection.spec, null);
  assert.equal(page.data.purchaseSelection.specs.find(row => row.value === '6寸').available, false);
  page.selectPurchaseSpec({ currentTarget: { dataset: { value: '6寸' } } });
  await page.confirmPurchase();
  assert.equal(navigations.length, 0);
  page.selectPurchaseSpec({ currentTarget: { dataset: { value: '7寸' } } });
  await page.confirmPurchase();
  assert.equal(navigations.length, 1);
  assert.match(navigations[0], /checkoutSource=direct&productId=frame&skuId=white-7&quantity=1/);
});

test('single-SKU and legacy products can still be selected without invented styles or combinations', () => {
  const single = skuSelection.initialSkuSelection(skuSelection.skuOptions([{ id: 'one', spec: '6寸', price: 25, available: 1 }]));
  assert.equal(single.style, '');
  assert.equal(single.styles[0].label, '默认样式');
  assert.equal(single.spec, '6寸');
  assert.equal(single.sku.id, 'one');
  const legacy = skuSelection.skuOptions([{ id: 'old', specLabel: '历史规格说明', price: 10 }]);
  assert.equal(legacy[0].spec, '历史规格说明');
  assert.equal(legacy[0].specLabel, '历史规格说明');
});

test('style labels display consistently in cart, checkout and frozen order lines with legacy fallback', () => {
  const line = { id: 'item', spec: '8寸', style: '两宫格', quantity: 1, price: 18.8 };
  assert.equal(physical.lineView(line).spec, '两宫格 / 8寸');
  assert.equal(physical.orderView({ items: [line] }).items[0].spec, '两宫格 / 8寸');
  assert.equal(physical.lineView({ ...line, specLabel: '订单保存的规格【原样式】' }).spec, '订单保存的规格【原样式】');
  assert.equal(physical.lineView({ spec: '旧版6寸' }).spec, '旧版6寸');
});

test('changing cart specifications uses the selected SKU and stable row version', async () => {
  const changes = [];
  const page = load('miniprogram/pages/physicalCart/physicalCart.js', {
    '../../utils/physical': physical,
    '../../utils/physicalSkuSelection': skuSelection,
    '../../api/physical': {
      async getPhysicalCatalog() { return { items: [{ id: 'p1', skus: [{ id: 's1', spec: '原木' }, { id: 's2', spec: '黑色' }] }] }; },
      async updatePhysicalCart(data) { changes.push(plain(data)); },
      async getPhysicalCart() { return { items: [] }; }
    },
    '../../api/client': { getOpenid: () => 'user1' }
  }, { showToast() {} });
  page.setData({ items: [{ id: 'line1', lineId: 'line1', productId: 'p1', skuId: 's1', quantity: 2, version: 9 }] });
  await page.openSpec({ currentTarget: { dataset: { index: 0 } } });
  assert.equal(page.data.specOptions.length, 2);
  page.chooseSpec({ currentTarget: { dataset: { value: '黑色' } } });
  assert.equal(changes.length, 0);
  await page.confirmSpec();
  assert.deepEqual(changes[0], { operation: 'spec', lineId: 'line1', version: 9, skuId: 's2' });
});

test('a late address response from another account cannot repopulate the page', async () => {
  let currentUser = 'user1'; let resolveOld;
  const page = load('miniprogram/pages/shippingAddresses/shippingAddresses.js', {
    '../../utils/physical': physical,
    '../../api/client': { getOpenid: () => currentUser },
    '../../api/physical': { getShippingAddresses() { return new Promise(resolve => { resolveOld = resolve; }); } }
  });
  const pending = page.load();
  currentUser = 'user2';
  resolveOld({ items: [{ id: 'private-a1', recipient: 'user1', phone: '13800000001' }] });
  await pending;
  assert.equal(page.data.items.length, 0);
});

test('missing money never becomes a fabricated zero price', () => {
  assert.equal(physical.money(null), '—');
  assert.equal(physical.money(undefined), '—');
  assert.equal(physical.money(0), '0.00');
});

test('physical cards retain total quantity and completed fulfillment distinct from payment', () => {
  const view = physical.orderView({ id: 'o1', status: 'awaiting_shipment', items: [{ id: 'i1', name: '相册', price: 129, quantity: 2 }, { id: 'i2', name: '相框', price: 89, quantity: 1 }], goodsAmount: 347, shippingFee: 10, totalAmount: 357 });
  assert.equal(view.orderType, 'physical');
  assert.equal(view.quantity, 3);
  assert.equal(view.statusText, '待发货');
  assert.equal(view.totalText, '357.00');
  assert.equal(view.items[0].lineAmountText, '258.00');
  assert.equal(physical.can({ ...view, allowedActions: [] }, 'pay', ['awaiting_shipment']), false);
});

test('client payment success does not mean confirmed money', async () => {
  let queried = 0;
  const payment = load('miniprogram/service/physicalPayment.js', { './merchantShare': { async ensureScanSynced() {} }, '../api/physical': {
    async createPhysicalPayment() { return { status: 'pending', paymentParams: { timeStamp: '1', nonceStr: 'n', package: 'prepay_id=p', paySign: 's' } }; },
    async getPhysicalPaymentStatus() { queried++; return { status: 'pending' }; }
  } }, { requestPayment(options) { options.success({}); } });
  const result = await payment.payPhysicalOrder('order1');
  assert.equal(result.status, 'pending');
  assert.equal(queried, 1);
});

test('cancelled wallet is queried and a real late payment wins over cancellation', async () => {
  const payment = load('miniprogram/service/physicalPayment.js', { './merchantShare': { async ensureScanSynced() {} }, '../api/physical': {
    async createPhysicalPayment() { return { status: 'pending', payParams: { timeStamp: '1', nonceStr: 'n', package: 'prepay_id=p', paySign: 's' } }; },
    async getPhysicalPaymentStatus() { return { status: 'confirmed' }; }
  } }, { requestPayment(options) { options.fail({ errMsg: 'requestPayment:fail cancel' }); } });
  assert.equal((await payment.payPhysicalOrder('order1')).status, 'confirmed');
});

test('physical wallet waits for a newly pending scan even after its payment API returned parameters', async () => {
  let release, started, invoked = 0, queried = 0;
  const ready = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const payment = load('miniprogram/service/physicalPayment.js', {
    './merchantShare': { async ensureScanSynced() { started(); await gate; } },
    '../api/physical': {
      async createPhysicalPayment() { return { status: 'pending', paymentParams: { timeStamp: '1', nonceStr: 'n', package: 'prepay_id=p', paySign: 's' } }; },
      async getPhysicalPaymentStatus() { queried++; return { status: 'pending' }; }
    }
  }, { requestPayment(options) { invoked++; options.success({}); } });
  const paying = payment.payPhysicalOrder('order1');
  await ready;
  assert.equal(invoked, 0); assert.equal(queried, 0);
  release(); await paying;
  assert.equal(invoked, 1); assert.equal(queried, 1);
});

test('checkout retries an unknown creation result with the original request and key', async () => {
  const requests = []; const redirects = []; let count = 0;
  const checkout = load('miniprogram/pages/physicalCheckout/physicalCheckout.js', {
    '../../api/physical': { async createPhysicalOrder(data) { requests.push(plain(data)); if (++count === 1) throw new Error('network timeout'); return { id: 'recovered' }; } },
    '../../utils/physical': physical,
    '../../service/physicalPayment': { async payPhysicalOrder() { return { status: 'cancelled' }; } }
  }, { redirectTo({ url }) { redirects.push(url); }, showToast() {} });
  checkout._key = 'stable-key'; checkout._items = [{ productId: 'p1', skuId: 's1', quantity: 1 }];
  checkout.setData({ checkoutSource: 'direct', address: { id: 'a1', version: 3 }, quote: { quoteVersion: 'quote1' }, agreed: true, loading: false });
  await checkout.submit();
  assert.equal(checkout.data.submissionPending, true);
  checkout.data.remark = 'changed while the result was unknown';
  await checkout.submit();
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(requests[1].idempotencyKey, 'stable-key');
  assert.equal(requests[1].checkoutSource, 'direct');
  assert.equal(redirects[0], '/pages/physicalOrderDetail/physicalOrderDetail?id=recovered');
});

test('checkout displays each quoted product description once across several specifications', async () => {
  const requests = [];
  const quote = { goodsAmount: 50, shippingFee: 5, totalAmount: 55, afterSaleDays: 0, items: [
    { id: 'i1', productId: 'magnet', skuId: 's1', name: 'DIY冰箱贴', description: '亚克力材质\n请按说明上传照片。', quantity: 2, price: 10 },
    { id: 'i2', productId: 'magnet', skuId: 's2', name: 'DIY冰箱贴', description: '亚克力材质\n请按说明上传照片。', quantity: 1, price: 10 },
    { id: 'i3', productId: 'frame', skuId: 's3', name: '相框', description: '木质相框，请远离潮湿环境。', quantity: 1, price: 20 }
  ] };
  const checkout = load('miniprogram/pages/physicalCheckout/physicalCheckout.js', {
    '../../api/physical': { async previewPhysicalCheckout(input) { requests.push(plain(input)); return quote; } },
    '../../utils/physical': physical, '../../service/physicalPayment': {}
  });
  checkout._items = [{ productId: 'magnet', skuId: 's1', quantity: 2 }];
  checkout.setData({ address: { id: 'a1', version: 3 }, agreed: true });
  await checkout.preview();
  assert.deepEqual(plain(checkout.data.productDescriptions), [
    { id: 'magnet', name: 'DIY冰箱贴', content: quote.items[0].description },
    { id: 'frame', name: '相框', content: quote.items[2].description }
  ]);
  assert.equal(checkout.data.items.length, 3, 'Deduplicating descriptions must not remove purchased specifications');
  assert.equal(checkout.data.totalText, '55.00');
  assert.equal(checkout.data.agreed, false);
  assert.equal(requests[0].addressId, 'a1');
});

test('fresh checkout previews replace product copy and never reuse old descriptions after a missing field or failure', async () => {
  let quote = { items: [{ productId: 'p1', name: '相框', description: '后台填写的商品说明' }], totalAmount: 20 };
  let failure;
  const checkout = load('miniprogram/pages/physicalCheckout/physicalCheckout.js', {
    '../../api/physical': { async previewPhysicalCheckout() { if (failure) throw failure; return quote; } },
    '../../utils/physical': physical, '../../service/physicalPayment': {}
  });
  await checkout.preview();
  assert.equal(checkout.data.productDescriptions[0].content, '后台填写的商品说明');
  quote.items[0].description = '后台更新后的说明\n请轻拿轻放。';
  await checkout.preview();
  assert.equal(checkout.data.productDescriptions[0].content, quote.items[0].description);
  quote = { items: [{ productId: 'p2', name: '旧商品' }], afterSaleDays: 7 };
  await checkout.preview();
  assert.equal(checkout.data.productDescriptions.length, 0, 'A missing description must not become generic after-sale policy');
  checkout.setData({ productDescriptions: [{ id: 'stale', content: '旧说明' }], agreed: true });
  failure = new Error('商品暂不可结算');
  await assert.rejects(checkout.preview(), /暂不可结算/);
  assert.equal(checkout.data.productDescriptions.length, 0);
  assert.equal(checkout.data.quote, null);
  assert.equal(checkout.data.agreed, false);
});

test('direct checkout never loads or changes a cart, and missing address cannot create an order', async () => {
  let created = 0; const calls = [];
  const checkout = load('miniprogram/pages/physicalCheckout/physicalCheckout.js', {
    '../../api/physical': { async getShippingAddresses() { calls.push('addresses'); return { items: [] }; }, async createPhysicalOrder() { created++; } },
    '../../utils/physical': physical, '../../service/physicalPayment': {}
  });
  checkout._direct = true; checkout._items = [{ productId: 'p1', skuId: 's1', quantity: 1 }];
  await checkout.load(); await checkout.submit();
  assert.deepEqual(calls, ['addresses']);
  assert.equal(created, 0);
  assert.equal(checkout.data.address, null);
});

test('physical list paginates by the server total and keeps service state filters isolated', async () => {
  const queries = [];
  const page = load('miniprogram/pages/myOrders/myOrders.js', {
    '../../service/customerService': {},
    '../../api/order': {}, '../../utils/query': { buildUrlWithSource: path => path },
    '../../utils/order': {}, '../../utils/orderStatusFilters': require('../miniprogram/utils/orderStatusFilters'),
    '../../utils/physical': physical, '../../api/physical': { async getPhysicalOrders(query) { queries.push(plain(query)); return { items: [{ id: 'o1', status: 'awaiting_receipt', items: [] }], total: 1 }; } }
  });
  await page.onLoad({ orderType: 'physical', status: 'awaiting_receipt' });
  assert.equal(queries[0].status, 'awaiting_receipt');
  assert.equal(page.data.hasMore, false);
  assert.equal(page.data.orders[0].orderType, 'physical');
  assert.ok(page.data.tabs.some(item => item.key === 'pending_payment'));
});

test('WeChat receipt view opens without trusting its client callback as completion', async () => {
  const submissions = []; let opened;
  const page = load('miniprogram/pages/physicalOrderDetail/physicalOrderDetail.js', {
    '../../api/physical': { async confirmPhysicalReceipt(data) { submissions.push(data); } }, '../../utils/physical': physical,
    '../../service/physicalPayment': {}, '../../service/customerService': {}, '../../service/mediaFiles': {}
  }, { showModal(options) { options.success({ confirm: true }); }, openBusinessView(options) { opened = options; } });
  page.setData({ id: 'o1', order: { id: 'o1', receiptSyncRequired: true, paymentTransactionId: 'wx-real-txn', version: 1 } });
  page.receive();
  assert.equal(opened.businessType, 'weappOrderConfirm');
  assert.equal(opened.extraData.transaction_id, 'wx-real-txn');
  assert.equal(submissions.length, 0);
  assert.equal(page._waitingWechatReceipt, true);
  page.action = async operation => operation();
  await page.onShow();
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].source, 'wechat');
});

test('physical orders contact customer service in every state and retain existing after-sale evidence', async () => {
  for (const status of ['pending_payment', 'awaiting_shipment', 'awaiting_receipt', 'completed', 'cancelled']) {
    let contacts = 0;
    const previews = [];
    const page = load('miniprogram/pages/physicalOrderDetail/physicalOrderDetail.js', {
      '../../api/physical': {
        async getPhysicalOrder() { return { id: 'physical_order1', status, allowedActions: [], items: [] }; },
        async getPhysicalAfterSales() { return { items: [{ id: 'sale1', status: 'completed', refundAmount: 10, attachments: ['private-f1'] }] }; },
        async createPhysicalAfterSale() { assert.fail('Contacting customer service must not create a refund request'); }
      },
      '../../utils/physical': physical,
      '../../service/physicalPayment': {},
      '../../service/customerService': { openCustomerService() { contacts++; } },
      '../../service/mediaFiles': { normalizeFile: file => file, async previewFile(file) { previews.push(file.fileId); } }
    });
    page.setData({ id: 'physical_order1' });
    await page.load();
    page.contactService();
    assert.equal(contacts, 1, status);
    assert.equal(page.data.afterSales[0].statusText, '已结案');
    await page.previewEvidence({ currentTarget: { dataset: { sale: 0, index: 0 } } });
    assert.deepEqual(previews, ['private-f1']);
  }

  const template = fs.readFileSync(path.join(root, 'miniprogram/pages/physicalOrderDetail/physicalOrderDetail.wxml'), 'utf8');
  const actions = template.match(/<view class="physical-actions physical-order-actions">([\s\S]*?)<\/view>/)[1];
  assert.match(actions, /<button class="physical-secondary" bindtap="contactService">联系客服<\/button>/);
  assert.match(actions, /bindtap="buyAgain">再逛周边/);
  assert.doesNotMatch(template, /累计退款|order\.refundedText|申请退款\/售后|afterSaleVisible|openAfterSale|submitAfterSale|退货退款|<radio-group|lxm-file-picker|添加凭证/);
});
