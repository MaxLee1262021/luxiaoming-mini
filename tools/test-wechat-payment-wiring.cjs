"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const miniRoot = path.resolve(__dirname, "..", "miniprogram");
const orderApiPath = path.join(miniRoot, "api", "order.js");
const pagePath = path.join(miniRoot, "pages", "orderDetail", "orderDetail.js");

let pageDefinition = null;
let capturedPayment = null;
let createRequest = null;
let statusRequests = 0;
let paymentScenario = "wechat";
const storage = new Map();

global.wx = {
  getStorageSync(key) { return storage.get(key) || ""; },
  setStorageSync(key, value) { storage.set(key, value); },
  removeStorageSync(key) { storage.delete(key); },
  requestPayment(options) {
    capturedPayment = options;
    options.success({ errMsg: "requestPayment:ok" });
  },
  showToast() {},
};
global.getApp = () => ({ captureSource: () => ({}) });
global.Page = (definition) => { pageDefinition = definition; };

require.cache[require.resolve(orderApiPath)] = {
  id: orderApiPath,
  filename: orderApiPath,
  loaded: true,
  exports: {
    async createPayment(request) {
      createRequest = request;
      if (paymentScenario === "mock") {
        return {
          success: true,
          data: { status: "confirmed", provider: "mock_payment", paymentMode: "mock", simulatedPayment: true },
        };
      }
      return {
        success: true,
        data: {
          status: "pending",
          paymentParams: {
            timeStamp: "1700000000",
            nonceStr: "mini-payment-nonce",
            package: "prepay_id=wx-test-prepay",
            signType: "RSA",
            paySign: "server-signed-payment",
          },
        },
      };
    },
    async getPaymentStatus() {
      statusRequests += 1;
      return { success: true, data: { status: "confirmed" } };
    },
  },
};

delete require.cache[require.resolve(pagePath)];
require(pagePath);
assert.ok(pageDefinition, "order detail page must register");

const order = {
  _id: "order-payment-1",
  id: "order-payment-1",
  status: "new",
  paymentPhase: "deposit",
  canPay: true,
  depositDue: 30,
  finalDue: 0,
};
const page = {
  ...pageDefinition,
  data: { ...pageDefinition.data, order, paymentStatus: "not_created" },
  setData(patch) { this.data = { ...this.data, ...patch }; },
  async loadOrder() {},
};

(async () => {
  await pageDefinition.createPayment.call(page, { currentTarget: { dataset: { phase: "deposit" } } });
  assert.deepEqual(createRequest && Object.keys(createRequest).sort(), ["idempotencyKey", "orderId", "phase"]);
  assert.equal(createRequest.orderId, "order-payment-1");
  assert.equal(capturedPayment.timeStamp, "1700000000");
  assert.equal(capturedPayment.package, "prepay_id=wx-test-prepay");
  assert.equal(capturedPayment.signType, "RSA");
  assert.equal(statusRequests, 1, "payment result must be rechecked with the server");
  assert.equal(page.data.order.status, "new", "the client must never write a paid order status");
  assert.equal(page.data.paymentStatus, "confirmed");

  paymentScenario = "mock";
  capturedPayment = null;
  createRequest = null;
  statusRequests = 0;
  let mockLoadOrderCalls = 0;
  const mockPage = {
    ...pageDefinition,
    data: { ...pageDefinition.data, order: { ...order, paymentSimulationEnabled: true }, paymentStatus: "pending" },
    setData(patch) { this.data = { ...this.data, ...patch }; },
    async loadOrder() { mockLoadOrderCalls += 1; },
  };
  await pageDefinition.handlePaymentTap.call(mockPage, { currentTarget: { dataset: { phase: "deposit" } } });
  assert.deepEqual(createRequest && Object.keys(createRequest).sort(), ["idempotencyKey", "orderId", "phase"]);
  assert.equal(capturedPayment, null, "a confirmed mock payment must not open the WeChat cashier");
  assert.equal(statusRequests, 0, "a confirmed mock payment does not need a second status query");
  assert.equal(mockPage.data.paymentStatus, "confirmed");
  assert.equal(mockLoadOrderCalls, 1, "the page must reload server-confirmed mock payment data");
  process.stdout.write("Mini-program payment wiring checks passed.\n");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
