'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const physical = require('../miniprogram/utils/physical');
const selection = require('../miniprogram/utils/physicalSkuSelection');

const skus = [
  { id: 'wood-6', style: '枫木白色', spec: '6寸', price: 25, available: 3, purchasable: true },
  { id: 'wood-8', style: '枫木白色', spec: '8寸', price: 45, available: 0, purchasable: false },
  { id: 'white-7', style: '米白色', spec: '7寸', price: 35, available: 4, purchasable: true },
  { id: 'black-6', style: '黑色', spec: '6寸', price: 25, available: 0, purchasable: false }
];

function fixture(options = {}) {
  let definition;
  const changes = [], notices = [];
  const item = { id: 'line1', lineId: 'line1', productId: 'frame', skuId: options.skuId || 'wood-6', name: '相框', quantity: options.quantity || 2, version: 9 };
  const dependencies = {
    '../../utils/physical': physical,
    '../../utils/physicalSkuSelection': selection,
    '../../api/client': { getOpenid: () => 'user1' },
    '../../api/physical': {
      async getPhysicalCatalog() { return { items: [{ id: 'frame', skus: options.skus || skus }] }; },
      async updatePhysicalCart(value) { changes.push(JSON.parse(JSON.stringify(value))); },
      async getPhysicalCart() { return { items: [] }; }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/pages/physicalCart/physicalCart.js'), 'utf8'), {
    Page(value) { definition = value; },
    require(name) { assert.ok(name in dependencies, name); return dependencies[name]; },
    wx: { showToast(value) { notices.push(value); } }, console
  });
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(patch) { Object.assign(this.data, patch); } };
  page.setData({ items: [item] });
  return { page, changes, notices };
}
const tap = value => ({ currentTarget: { dataset: { value } } });
const open = page => page.openSpec({ currentTarget: { dataset: { index: 0 } } });

test('cart separates style and specification, preselects the saved SKU and waits for confirmation', async () => {
  const { page, changes } = fixture();
  await open(page);
  assert.deepEqual(Array.from(page.data.specSelection.styles, option => option.label), ['枫木白色', '米白色', '黑色']);
  assert.deepEqual(Array.from(page.data.specSelection.specs, option => option.label), ['6寸', '8寸', '7寸']);
  assert.equal(page.data.specSelection.style, '枫木白色');
  assert.equal(page.data.specSelection.spec, '6寸');
  assert.equal(page.data.specSelection.sku.id, 'wood-6');
  page.chooseStyle(tap('米白色'));
  assert.equal(page.data.specSelection.spec, null);
  assert.equal(page.data.specSelection.sku, null);
  assert.equal(changes.length, 0);
  await page.confirmSpec();
  assert.equal(changes.length, 0);
  page.chooseSpec(tap('7寸'));
  assert.equal(page.data.specSelection.sku.id, 'white-7');
  assert.equal(changes.length, 0);
  await page.confirmSpec();
  assert.deepEqual(changes, [{ operation: 'spec', lineId: 'line1', version: 9, skuId: 'white-7' }]);
  assert.equal(page.data.specItem, null);
});

test('sold-out styles, sold-out specifications and nonexistent combinations cannot be selected', async () => {
  const { page, changes } = fixture();
  await open(page);
  assert.equal(page.data.specSelection.styles.find(option => option.value === '黑色').available, false);
  page.chooseStyle(tap('黑色'));
  assert.equal(page.data.specSelection.style, '枫木白色');
  for (const value of ['8寸', '7寸', '不存在']) {
    page.chooseSpec(tap(value));
    assert.equal(page.data.specSelection.sku.id, 'wood-6');
  }
  page.chooseStyle(tap('米白色'));
  page.chooseSpec(tap('6寸'));
  assert.equal(page.data.specSelection.sku, null);
  await page.confirmSpec();
  assert.equal(changes.length, 0);
});

test('a saved SKU that sold out remains visible but cannot be confirmed', async () => {
  const { page, changes } = fixture({ skuId: 'wood-8' });
  await open(page);
  assert.equal(page.data.specSelection.style, '枫木白色');
  assert.equal(page.data.specSelection.spec, '8寸');
  assert.equal(page.data.specSelection.sku, null);
  await page.confirmSpec();
  assert.equal(changes.length, 0);
});

test('cart modification rejects insufficient stock for the existing quantity and supports legacy default styles', async () => {
  const { page, changes, notices } = fixture({ skus: [{ id: 'wood-6', spec: '6寸', price: 25, available: 1 }] });
  await open(page);
  assert.equal(page.data.specSelection.styles[0].label, '默认样式');
  assert.equal(page.data.specSelection.spec, '6寸');
  await page.confirmSpec();
  assert.equal(changes.length, 0);
  assert.match(notices[0].title, /超过当前可售数量/);
  assert.ok(page.data.specItem);
});

test('cart renders style choices before specification choices with an explicit confirmation', () => {
  const markup = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/physicalCart/physicalCart.wxml'), 'utf8');
  assert.ok(markup.indexOf('specSelection.styles') < markup.indexOf('specSelection.specs'));
  assert.match(markup, /bindtap="confirmSpec"[^>]+disabled="\{\{busy \|\| !specSelection.sku\}\}"/);
});
