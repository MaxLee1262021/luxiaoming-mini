"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

console.log("Booking submit button wiring check passed.");
