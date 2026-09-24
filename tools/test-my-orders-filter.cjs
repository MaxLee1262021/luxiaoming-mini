"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "miniprogram", "pages", "myOrders", "myOrders.js"),
  "utf8"
);
const requests = [];
let responseData = [];
let directResponse = false;
let pageDefinition;

const dependencies = {
  "../../api/order": {
    getMyOrders(query) {
      requests.push(query);
      return Promise.resolve(directResponse ? responseData : { success: true, data: responseData });
    }
  },
  "../../utils/query": {
    buildUrlWithSource() { return ""; }
  },
  "../../utils/order": {
    BUSINESS_STATUS: {
      PENDING_PAYMENT: "pending_payment",
      AWAITING_PHOTOGRAPHER: "awaiting_photographer",
      SHOT: "shot",
      PAID: "paid",
      DELIVERED: "delivered"
    },
    normalizeOrder(order) {
      return { ...order, customerStatusKey: order.businessStatus || "pending_payment" };
    },
    normalizeCustomerStatus(status) {
      return status || "pending";
    }
  }
};

vm.runInNewContext(source, {
  Page(definition) {
    pageDefinition = definition;
  },
  getApp() {
    return { captureSource() { return {}; } };
  },
  require(request) {
    return dependencies[request];
  },
  console,
  Promise
}, { filename: "myOrders.js" });

assert.ok(pageDefinition, "myOrders page must register");
assert.deepEqual(JSON.parse(JSON.stringify(pageDefinition.data.tabs)), [
  { key: "", text: "全部订单" },
  { key: "pending_payment", text: "待支付" },
  { key: "awaiting_photographer", text: "待安排" },
  { key: "shot", text: "已拍摄" },
  { key: "paid", text: "已支付" },
  { key: "delivered", text: "已交付" }
]);
const myMarkup = fs.readFileSync(
  path.join(__dirname, "..", "miniprogram", "pages", "my", "my.wxml"),
  "utf8"
);
const ordersStyles = fs.readFileSync(
  path.join(__dirname, "..", "miniprogram", "pages", "myOrders", "myOrders.wxss"),
  "utf8"
);
assert.match(ordersStyles, /\.tabs\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?overflow-x:\s*auto;/);
for (const [status, label] of [
  ["pending_payment", "待支付"],
  ["awaiting_photographer", "待安排"],
  ["shot", "已拍摄"],
  ["delivered", "已交付"],
  ["", "全部订单"]
]) {
  assert.match(myMarkup, new RegExp(`data-status="${status}"[\\s\\S]*?<text class="status-name">${label}</text>`));
}
assert.doesNotMatch(myMarkup, /data-status="after_sale"/);

(async () => {
  const page = {
    ...pageDefinition,
    data: { ...pageDefinition.data },
    setData(patch) {
      this.data = { ...this.data, ...patch };
    }
  };

  page.setData({ currentStatus: "pending_payment" });
  await page.loadOrders(true);
  assert.deepEqual(JSON.parse(JSON.stringify(requests)), [{ page: 1, pageSize: 10, status: "pending_payment" }]);

  responseData = {
    list: [{ id: "pending-1", businessStatus: "pending_payment" }],
    total: 1
  };
  await page.loadOrders(true);
  assert.equal(page.data.orders.length, 1, "list-wrapped order responses must be rendered");

  responseData = { data: { rows: [{ id: "pending-2", businessStatus: "pending_payment" }] } };
  await page.loadOrders(true);
  assert.equal(page.data.orders.length, 1, "nested rows responses must be rendered");

  directResponse = true;
  responseData = [{ id: "pending-3", businessStatus: "pending_payment" }];
  await page.loadOrders(true);
  assert.equal(page.data.orders.length, 1, "direct array responses must be rendered");

  page.setData({ currentStatus: "awaiting_photographer" });
  await page.loadOrders(true);
  assert.deepEqual(JSON.parse(JSON.stringify(requests.at(-1))), { page: 1, pageSize: 10, status: "awaiting_photographer" });

  page.setData({ currentStatus: "shot" });
  await page.loadOrders(true);
  assert.deepEqual(JSON.parse(JSON.stringify(requests.at(-1))), { page: 1, pageSize: 10, status: "shot" });

  page.setData({ currentStatus: "paid" });
  await page.loadOrders(true);
  assert.deepEqual(JSON.parse(JSON.stringify(requests.at(-1))), { page: 1, pageSize: 10, status: "paid" });

  page.setData({ currentStatus: "delivered" });
  await page.loadOrders(true);
  assert.deepEqual(JSON.parse(JSON.stringify(requests.at(-1))), { page: 1, pageSize: 10, status: "delivered" });

  directResponse = false;
  responseData = {
    list: [
      { id: "after-sale-1", businessStatus: "paid", isAfterSale: true },
      { id: "normal-1", businessStatus: "paid", isAfterSale: false }
    ]
  };
  page.setData({ currentStatus: "after_sale" });
  await page.loadOrders(true);
  assert.deepEqual(JSON.parse(JSON.stringify(requests.at(-1))), { page: 1, pageSize: 100 });
  assert.deepEqual(page.data.orders.map(item => item.id), ["after-sale-1"]);
  console.log("My orders business-status filter check passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
