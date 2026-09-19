"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

let pageDefinition = null;
global.wx = {
  getStorageSync() { return ""; },
  setStorageSync() {},
  removeStorageSync() {},
};
global.getApp = () => ({ captureSource: () => ({}) });
global.Page = (definition) => { pageDefinition = definition; };

const miniRoot = path.resolve(__dirname, "..", "miniprogram");
const order = require(path.join(miniRoot, "utils", "order.js"));
const pagePath = path.join(miniRoot, "pages", "myOrders", "myOrders.js");
delete require.cache[pagePath];
require(pagePath);

assert.ok(pageDefinition, "myOrders page must register");

function pageFor(status) {
  return { data: { ...pageDefinition.data, currentStatus: status } };
}

function matches(filter, workflowStage, extra = {}) {
  return pageDefinition.matchCurrentStatus.call(pageFor(filter), { workflowStage, ...extra });
}

// AC-04: the mini-program must use the same disjoint customer status sets as
// the server. In particular, a completed order must not disappear after it is
// persisted with its terminal workflow stage.
assert.equal(matches("pending", "awaiting_confirmation"), true);
assert.equal(matches("pending", "awaiting_dispatch"), false);
assert.equal(matches("confirmed", "awaiting_dispatch"), true);
assert.equal(matches("confirmed", "awaiting_shoot"), true);
assert.equal(matches("completed", "paid"), true);
assert.equal(matches("completed", "delivered"), true);
assert.equal(matches("completed", "completed"), true);
assert.equal(matches("completed", "awaiting_final_payment"), false);

// AC-02, AC-04 and AC-12: an application awaiting service confirmation has
// no payment action. Its only customer self-service off-ramp is cancellation.
const application = order.normalizeOrder({
  id: "application-1",
  status: "new",
  totalAmount: 100,
  depositDue: 30,
  finalDue: 70,
  canCancel: true,
});
assert.equal(application.workflowStage, "awaiting_confirmation");
assert.equal(application.canPay, false);
assert.equal(application.canCancel, true);
assert.equal(application.canAfterSale, false);
assert.equal(order.normalizeOrder({ ...application, id: "application-no-cancel-grant", canCancel: undefined }).canCancel, false);

// AC-09 and AC-10: server-projected unpublished delivery cannot expose files
// or a final-payment action. Publication is the gate for both.
const unpublished = order.normalizeOrder({
  id: "delivery-draft-1",
  status: "final_pending",
  workflowStage: "awaiting_delivery",
  totalAmount: 100,
  depositDue: 30,
  depositPaid: 30,
  depositFinanceStatus: "confirmed",
  finalDue: 70,
  selectionStatus: "confirmed",
  deliverFiles: [{ fileId: "private-file", name: "draft.jpg" }],
});
assert.match(unpublished.statusText, /发布/);
assert.equal(unpublished.canPay, false);
assert.deepEqual(unpublished.deliverFiles, []);

const published = order.normalizeOrder({
  id: "delivery-published-1",
  status: "delivered",
  workflowStage: "awaiting_final_payment",
  totalAmount: 100,
  depositDue: 30,
  depositPaid: 30,
  depositFinanceStatus: "confirmed",
  finalDue: 70,
  deliveryRecord: { method: "mini_program" },
  deliveryPublished: true,
  deliverFiles: [{ fileId: "published-file", name: "final.jpg" }],
});
assert.equal(published.canPay, true);
assert.deepEqual(published.deliverFiles.map((file) => file.fileId), ["published-file"]);

// The test-payment control is a server grant, never a client-side switch.
const testPaymentGranted = order.normalizeOrder({
  id: "test-payment-1",
  status: "deposit_pending",
  workflowStage: "awaiting_deposit",
  totalAmount: 100,
  depositDue: 30,
  finalDue: 70,
  paymentPhase: "deposit",
  paymentTestModeEnabled: true,
  canRunTestPayment: true,
});
assert.equal(testPaymentGranted.canRunTestPayment, true);
const testPaymentDenied = order.normalizeOrder({ ...testPaymentGranted, id: "test-payment-2", canRunTestPayment: false });
assert.equal(testPaymentDenied.canRunTestPayment, false);

process.stdout.write("Mini-program order acceptance checks passed.\n");
