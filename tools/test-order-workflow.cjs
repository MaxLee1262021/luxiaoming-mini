"use strict";

const assert = require("node:assert/strict");
const booking = require("../miniprogram/utils/booking");
const order = require("../miniprogram/utils/order");
const bookingConfig = require("../miniprogram/service/bookingConfig");

function test(name, callback) {
  try {
    callback();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

test("booking total respects item quantity", () => {
  assert.equal(booking.sumItemsPrice([{ price: 99, quantity: 3 }, { price: 10 }]), 307);
});

test("custom booking retains people count and requested spot", () => {
  const item = bookingConfig.buildCustomItem({ count: 3, requestedSpot: "Custom place" });
  assert.equal(item.participantCount, 3);
  assert.equal(item.requestedSpot, "Custom place");
});

test("booking can be submitted without a customer-selected shooting time", () => {
  const form = booking.validateBookingForm({
    name: "游客",
    phone: "13800000000",
    agreed: true,
    items: [{ packageId: "pkg-1", price: 699 }]
  });
  assert.equal(form.valid, true);
  const payload = booking.buildBookingPayload({
    name: "游客",
    phone: "13800000000",
    date: "2099-01-01",
    time: "上午",
    items: [{ packageId: "pkg-1", price: 699 }]
  });
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "date"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "time"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "expectedDate"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "expectedTimePeriod"), false);
});

test("delivered order retains the final-payment entry", () => {
  const normalized = order.normalizeOrder({
    id: "order-1",
    status: "delivered",
    totalPrice: 1000,
    depositDue: 300,
    depositPaid: 300,
    depositFinanceStatus: "confirmed",
    finalDue: 700,
    finalPaid: 0,
    selectionStatus: "confirmed",
    paymentPhase: "final",
    paymentStatus: "not_created",
  });
  assert.equal(normalized.workflowStage, "awaiting_final_payment");
  assert.equal(normalized.paymentPhase, "final");
  assert.equal(normalized.canPay, true);
  assert.equal(normalized.finalDue, 700);
});

test("server payment state and sanitized timeline survive normalization", () => {
  const normalized = order.normalizeOrder({
    id: "order-2",
    status: "new",
    totalPrice: 500,
    depositDue: 150,
    paymentPhase: "deposit",
    paymentStatus: "pending",
    paymentPending: true,
    statusTimeline: [{ action: "Payment intent created", time: "2026-09-12T00:00:00.000Z" }],
  });
  assert.equal(normalized.paymentStatus, "pending");
  assert.equal(normalized.paymentPending, true);
  assert.equal(normalized.statusLogs.length, 1);
});

test("final payment is gated by offline selection confirmation", () => {
  const pendingSelection = order.normalizeOrder({
    id: "selection-pending",
    workflowStage: "selection_pending",
    status: "final_pending",
    totalAmount: 100,
    depositDue: 30,
    depositPaid: 30,
    depositFinanceStatus: "confirmed",
    finalDue: 70,
    selectionStatus: "pending"
  });
  assert.equal(pendingSelection.statusText, "待安排摄影师");
  assert.equal(pendingSelection.canPay, false);

  const confirmedSelection = order.normalizeOrder({
    id: "selection-confirmed",
    workflowStage: "awaiting_delivery",
    status: "final_pending",
    totalAmount: 100,
    depositDue: 30,
    depositPaid: 30,
    depositFinanceStatus: "confirmed",
    finalDue: 70,
    selectionStatus: "confirmed"
  });
  assert.equal(confirmedSelection.canPay, true);
  assert.equal(confirmedSelection.paymentPhase, "final");

  const inconsistentStage = order.normalizeOrder({
    id: "selection-inconsistent-stage",
    workflowStage: "awaiting_final_payment",
    status: "final_pending",
    totalAmount: 100,
    depositDue: 30,
    depositPaid: 30,
    depositFinanceStatus: "confirmed",
    finalDue: 70,
    selectionStatus: "pending"
  });
  assert.equal(inconsistentStage.canPay, false);

  const inconsistentGrant = order.normalizeOrder({
    id: "selection-inconsistent-grant",
    workflowStage: "awaiting_final_payment",
    status: "final_pending",
    totalAmount: 100,
    depositDue: 30,
    depositPaid: 30,
    depositFinanceStatus: "confirmed",
    finalDue: 70,
    selectionStatus: "pending",
    canPayFinal: true,
    canPay: true
  });
  assert.equal(inconsistentGrant.canPay, false);
});

if (!process.exitCode) console.log("Order workflow mini-program checks passed.");
