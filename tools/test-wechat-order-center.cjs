"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const pagePath = path.join(__dirname, "..", "miniprogram", "pages", "orderDetail", "orderDetail.js");
const requests = [];
let response;
let pageDefinition;
const order = { _id: "order-center-1", orderNo: "LXM202610260001", status: "deposit_paid" };
const success = () => ({ success: true, data: { ...order } });
const dependencies = {
  "../../api/order": {
    async getOrderDetail(query) {
      requests.push(JSON.parse(JSON.stringify(query)));
      if (response instanceof Error) throw response;
      return typeof response === "function" ? response() : response;
    }
  },
  "../../utils/query": { buildUrlWithSource() { return ""; } },
  "../../utils/order": require("../miniprogram/utils/order"),
  "../../utils/orderStatusFilters": require("../miniprogram/utils/orderStatusFilters"),
  "../../service/orderFileActions": {
    data: {},
    actions: { loadAfterSales() {}, cancelFileDownload() {} }
  },
  "../../service/mediaFiles": { normalizeFile(file) { return file; } },
  "../../utils/paymentFeedback": {},
  "../../service/customerService": {}
};

vm.runInNewContext(fs.readFileSync(pagePath, "utf8"), {
  Page(definition) { pageDefinition = definition; },
  getApp() { return { captureSource() { return {}; } }; },
  require(request) {
    assert.ok(Object.hasOwn(dependencies, request), `Unexpected page dependency: ${request}`);
    return dependencies[request];
  },
  console: { error() {} },
  Promise
}, { filename: pagePath });

function createPage() {
  return {
    ...pageDefinition,
    data: JSON.parse(JSON.stringify(pageDefinition.data)),
    setData(patch) { this.data = { ...this.data, ...patch }; }
  };
}

function assertRealOrder(page) {
  assert.equal(page.data.order._id, order._id);
  assert.equal(page.data.error, "");
  assert.equal(page.data.loading, false);
  assert.equal(page.data.isDemo, false);
}

async function main() {
  assert.ok(pageDefinition, "order detail page must register");
  response = success();
  const tradeNo = "LXM0123456789abcdef0123456789abc";

  for (const key of ["out_trade_no", "outTradeNo"]) {
    const page = createPage();
    await page.onLoad({ [key]: tradeNo });
    assert.deepEqual(requests.at(-1), { outTradeNo: tradeNo }, "payment trade numbers must reach the dedicated lookup, including LXM prefixes");
    assertRealOrder(page);
  }

  for (const [options, expected] of [
    [{ id: order._id }, { orderId: order._id }],
    [{ orderId: order._id }, { orderId: order._id }],
    [{ orderNo: order.orderNo }, { orderNo: order.orderNo }],
    [{ id: order.orderNo }, { orderNo: order.orderNo }],
    [{ id: "LS202610260001" }, { orderNo: "LS202610260001" }],
    [{ id: order._id, out_trade_no: tradeNo }, { orderId: order._id, outTradeNo: tradeNo }]
  ]) {
    const page = createPage();
    await page.onLoad(options);
    assert.deepEqual(requests.at(-1), expected, "existing links and combined identifiers must remain usable");
    assertRealOrder(page);
  }

  const missing = createPage();
  const requestCount = requests.length;
  await missing.onLoad({});
  assert.equal(requests.length, requestCount, "missing identifiers must not trigger an unrestricted lookup");
  assert.equal(missing.data.error, "缺少订单信息");
  assert.equal(missing.data.loading, false);
  assert.equal(missing.data.isDemo, false);

  for (const failure of [
    new Error("network failed"),
    { success: false, error: "无权限" },
    { success: true, data: null },
    undefined
  ]) {
    response = failure;
    const page = createPage();
    await page.onLoad({ out_trade_no: tradeNo });
    assert.ok(page.data.error, "failed order loading must show a retryable error");
    assert.equal(page.data.loading, false);
    assert.equal(page.data.isDemo, false);
    assert.equal(Object.keys(page.data.order).length, 0, "failures must never render a demonstration order");

    let finishRequest;
    response = () => new Promise((resolve) => { finishRequest = resolve; });
    const retry = page.retry();
    assert.equal(page.data.loading, true, "retry must show the loading state while awaiting the server");
    assert.equal(page.data.error, "", "retry must clear the previous error");
    assert.deepEqual(requests.at(-1), { outTradeNo: tradeNo }, "retry must retain the original payment identifier");
    finishRequest(success());
    await retry;
    assertRealOrder(page);
  }

  process.stdout.write("WeChat order center page checks passed.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
