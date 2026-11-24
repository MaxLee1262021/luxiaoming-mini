"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const script = fs.readFileSync(path.join(__dirname, "../miniprogram/api/client.js"), "utf8");
function fixture(reply) {
  const storage = new Map([["lxm_openid", "synthetic-openid"], ["lxm_public_token", "synthetic-token"]]);
  const requests = [];
  const sandbox = { module: { exports: {} }, console, wx: {
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: key => storage.delete(key),
    login() { assert.fail("cached fixture session must be used"); },
    request(options) { requests.push(options); queueMicrotask(() => reply.network ? options.fail(reply.network) : options.success(reply)); },
  }, require(name) {
    if (name === "../config/env") return { API_BASE: "https://synthetic.test/api", API_ERROR: "" };
    throw new Error(name);
  } };
  vm.runInNewContext(script, sandbox);
  return { client: sandbox.module.exports, storage, requests };
}
(async () => {
  const stopped = fixture({ statusCode: 200, data: { success: false, code: "SHARE_4004", statusCode: 400, error: "该码已停用，请联系门店" } });
  await assert.rejects(stopped.client.callCloud("reportShareScan", { scene: "SSTOPPED" }), error => error.code === "SHARE_4004" && error.statusCode === 400 && error.message.includes("已停用"));
  const unavailable = fixture({ statusCode: 503, data: { success: false, code: "SHARE_4004", statusCode: 400, error: "unavailable" } });
  await assert.rejects(unavailable.client.callCloud("reportShareScan"), error => error.code === "SHARE_4004" && error.statusCode === 503);
  const forbidden = fixture({ statusCode: 401, data: { code: "SHARE_4030", error: "请重新登录" } });
  await assert.rejects(forbidden.client.callCloud("reportShareScan"), error => error.code === "SHARE_4030" && error.statusCode === 401);
  assert.equal(forbidden.storage.has("lxm_public_token"), false);
  const rateLimited = fixture({ statusCode: 429, data: { code: "RATE_LIMITED", error: "too many requests" } });
  await assert.rejects(rateLimited.client.callCloud("reportShareClick"), error => error.code === "RATE_LIMITED" && error.statusCode === 429);
  const network = fixture({ network: { errMsg: "request:fail timeout", errCode: "ETIMEDOUT" } });
  await assert.rejects(network.client.callCloud("reportShareScan"), error => error.code === "ETIMEDOUT" && !error.statusCode);
  const unknown = fixture({ statusCode: 200, data: { success: false, error: "来源采集失败" } });
  await assert.rejects(unknown.client.callCloud("reportShareScan"), error => error.code === undefined && error.statusCode === 200);
  const bounded = fixture({ statusCode: 200, data: { success: true } });
  await bounded.client.callCloud("reportShareScan", { scene: "SBOUNDED123" }, { timeout: 15000 });
  assert.equal(bounded.requests[0].timeout, 15000, "scan RPC transport uses the bounded timeout supplied by its drain");
  await bounded.client.callCloud("getMyOrders");
  assert.equal(Object.hasOwn(bounded.requests[1], "timeout"), false, "other RPC defaults are preserved");
  console.log("PASS RPC Error preserves safe code and HTTP status; 401 clears session and network errors remain retryable");
})().catch(error => { console.error(error); process.exitCode = 1; });
