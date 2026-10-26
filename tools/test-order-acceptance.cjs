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

// Personal-center links and order-list filters use the same four groups.
// Unpaid applications are outside formal reserved orders.
assert.equal(matches("reserved", "awaiting_dispatch"), true);
assert.equal(matches("reserved", "awaiting_confirmation"), false);
assert.equal(matches("pending", "awaiting_confirmation"), false);
assert.equal(matches("pending", "awaiting_dispatch"), true);
assert.equal(matches("confirmed", "awaiting_dispatch"), true);
assert.equal(matches("confirmed", "awaiting_shoot"), false);
assert.equal(matches("completed", "paid"), true);
assert.equal(matches("completed", "delivered"), true);
assert.equal(matches("completed", "completed"), true);
assert.equal(matches("completed", "awaiting_final_payment"), false);
assert.equal(matches("pending_payment", "awaiting_confirmation"), false);
assert.equal(matches("awaiting_photographer", "awaiting_dispatch"), true);
assert.equal(matches("awaiting_photographer", "awaiting_shoot"), false);
assert.equal(matches("shooting", "shooting"), true);
assert.equal(matches("shooting", "awaiting_shoot"), false);
assert.equal(matches("shot", "selection_pending"), true);
assert.equal(matches("paid", "paid"), true);
assert.equal(matches("delivered", "delivered"), true);
assert.equal(matches("after_sale", "paid", { isAfterSale: true }), true);
assert.equal(matches("after_sale", "paid", { isAfterSale: false }), false);

// Before the deposit is paid, an application is still cancellable and has no
// payment action unless the server grants the deposit payment explicitly.
const application = order.normalizeOrder({
  id: "application-1",
  status: "new",
  totalAmount: 100,
  depositDue: 30,
  finalDue: 70,
  canCancel: true,
});
assert.equal(application.workflowStage, "awaiting_deposit");
assert.equal(application.canPay, true);
assert.equal(application.canCancel, true);
assert.equal(application.cancelRuleText, '');
assert.equal(application.canAfterSale, false);
const cancelRuleDisplay = order.normalizeOrder({
  id: "cancel-rule-display-1",
  status: "new",
  workflowStage: "awaiting_deposit",
  canCancel: true,
  cancelRule: "before_service_confirmation_and_payment_intent"
});
assert.equal(cancelRuleDisplay.cancelRuleText, "服务确认或收款核对开始前，可提交取消申请。");
assert.equal(cancelRuleDisplay.cancelRule, "before_service_confirmation_and_payment_intent");
assert.equal(order.normalizeOrder({ ...application, id: "application-no-cancel-grant", canCancel: undefined }).canCancel, false);

// Shooting completion and the server grant gate final payment. Delivery
// files remain hidden until the balance is confirmed and delivery is released.
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
  canPayFinal: true,
  deliverFiles: [{ fileId: "private-file", name: "draft.jpg" }],
});
assert.equal(unpublished.statusText, "拍摄中");
assert.equal(unpublished.canPay, true);
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
  selectionStatus: "confirmed",
  canPayFinal: true,
  deliveryRecord: { method: "mini_program" },
  deliveryPublished: true,
  deliverFiles: [{ fileId: "published-file", name: "final.jpg" }],
});
assert.equal(published.canPay, true);
// A delivery draft is not visible until the final payment is confirmed.
assert.deepEqual(published.deliverFiles, []);

const delivered = order.normalizeOrder({
  id: "delivery-complete-1",
  status: "delivered",
  workflowStage: "delivered",
  totalAmount: 100,
  depositDue: 30,
  depositPaid: 30,
  depositFinanceStatus: "confirmed",
  finalDue: 70,
  finalPaid: 70,
  finalFinanceStatus: "confirmed",
  selectionStatus: "confirmed",
  deliveryRecord: { method: "mini_program" },
  deliverFiles: [{ fileId: "published-file", name: "final.jpg" }],
});
assert.equal(delivered.statusText, "已完成");
assert.deepEqual(delivered.deliverFiles.map((file) => file.fileId), ["published-file"]);

// The customer-facing contract has four formal states. Technical
// workflow stages remain available for operations but are collapsed here.
const customerStates = [
  ["awaiting_confirmation", "待支付"],
  ["awaiting_dispatch", "待确认"],
  ["awaiting_shoot", "待拍摄"],
  ["shooting", "拍摄中"],
  ["selection_pending", "拍摄中"],
  ["awaiting_final_payment", "拍摄中"],
  ["paid", "已完成"],
  ["delivered", "已完成"]
];
for (const [workflowStage, label] of customerStates) {
  assert.equal(order.normalizeOrder({ workflowStage, status: workflowStage }).statusText, label);
}

const finalAfterOfflineSelection = order.normalizeOrder({
  id: "offline-selection-1",
  workflowStage: "awaiting_delivery",
  status: "final_pending",
  totalAmount: 100,
  depositDue: 30,
  depositPaid: 30,
  depositFinanceStatus: "confirmed",
  finalDue: 70,
  selectionStatus: "confirmed",
  canPayFinal: true
});
assert.equal(finalAfterOfflineSelection.customerStatusKey, "shooting");
assert.equal(finalAfterOfflineSelection.canPay, true);

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

const mockPaymentEnabled = order.normalizeOrder({ ...application, id: "mock-payment-1", paymentSimulationEnabled: true });
assert.equal(mockPaymentEnabled.paymentSimulationEnabled, true);
assert.equal(mockPaymentEnabled.paymentMode, "mock");
const mockPaymentModeOnly = order.normalizeOrder({ ...application, id: "mock-payment-2", paymentMode: "mock" });
assert.equal(mockPaymentModeOnly.paymentSimulationEnabled, true);

process.stdout.write("Mini-program order acceptance checks passed.\n");
