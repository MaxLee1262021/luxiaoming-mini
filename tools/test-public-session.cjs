"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const storage = new Map();
const requests = [];
global.wx = {
  getStorageSync(key) { return storage.get(key) || ""; },
  setStorageSync(key, value) { storage.set(key, value); },
  removeStorageSync(key) { storage.delete(key); },
  getAccountInfoSync() { return { miniProgram: { envVersion: "develop" } }; },
  login({ success }) { success({ code: "synthetic-code" }); },
  request(options) {
    requests.push(options);
    if (options.url.endsWith("/rpc/login")) {
      options.success({ statusCode: 200, data: { success: true, openid: "synthetic-openid", token: "synthetic-public-token" } });
      return;
    }
    options.success({ statusCode: 200, data: { success: true, data: [] } });
  },
};

const clientPath = path.resolve(__dirname, "..", "miniprogram", "api", "client.js");
delete require.cache[clientPath];
const { callCloud, getOpenid } = require(clientPath);

(async () => {
  const result = await callCloud("getMyOrders", {});
  assert.equal(result.success, true);
  assert.equal(getOpenid(), "synthetic-openid");
  assert.equal(storage.get("lxm_public_token"), "synthetic-public-token");
  assert.equal(requests.length, 2);
  assert.equal(requests[1].header.Authorization, "Bearer synthetic-public-token");
  process.stdout.write("Public session token test passed.\n");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
