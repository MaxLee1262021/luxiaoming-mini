"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const booking = require("../miniprogram/utils/booking");

const root = path.resolve(__dirname, "..");
const wxml = fs.readFileSync(path.join(root, "miniprogram/pages/bookingInfo/bookingInfo.wxml"), "utf8");
const script = fs.readFileSync(path.join(root, "miniprogram/pages/bookingInfo/bookingInfo.js"), "utf8");

assert.equal(
  /<block wx:if="\{\{authReady\}\}">\s*<view class="empty-selection"/.test(wxml),
  false,
  "booking fields and submit action must not be hidden until a phone is entered",
);
assert.match(
  wxml,
  /class="booking-submit-bar"[\s\S]*?bindtap="submitBooking"/,
  "the booking page must expose a submit button wired to submitBooking",
);
assert.match(
  script,
  /idempotencyKey:\s*bookingRequestKey/,
  "submitBooking must include an idempotency key",
);
assert.match(
  script,
  /await bookingApi\.createBooking\(payload\)/,
  "submitBooking must call the backend createBooking API",
);
assert.match(
  script,
  /const bookingId = created\.bookingId \|\| res\.bookingId \|\| ''/,
  "submitBooking must accept a persisted booking request before an order exists",
);
assert.match(
  script,
  /await this\.startBookingPayment\(bookingId\)/,
  "pending bookings must start deposit payment before entering the success page",
);
assert.match(
  script,
  /orderApi\.createPayment\(\{ bookingId, phase: 'deposit', idempotencyKey \}\)/,
  "pending bookings must create a deposit payment intent with the booking id",
);
assert.match(
  wxml,
  /调起定金支付/,
  "booking copy must explain the deposit-payment step",
);

const payload = booking.buildBookingPayload({
  name: "游客",
  phone: "13800000000",
  agreed: true,
  bookingConfig: { bookingNoticeVersion: "notice-2" },
  items: [{ packageId: "pkg-1", price: 699 }],
});
assert.deepEqual(
  payload.agreement,
  { version: "notice-2", current: true },
  "booking payload must carry the current agreed notice version",
);

console.log("Booking submit button wiring check passed.");
