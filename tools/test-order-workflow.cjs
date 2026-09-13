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

if (!process.exitCode) console.log("Order workflow mini-program checks passed.");
