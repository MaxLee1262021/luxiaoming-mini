"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const script = fs.readFileSync(path.join(__dirname, "../miniprogram/service/merchantShare.js"), "utf8");
const KEY = "lxm_share_pending_events";
function fixture() {
  const calls = [], storage = new Map(), toasts = [];
  const state = { loggedOut: false, now: Date.now(), respond: async () => ({ success: true }) };
  class EntryDate extends Date {
    constructor(...args) { super(...(args.length ? args : [state.now])); }
    static now() { return state.now; }
  }
  const client = { isLoggedOut: () => state.loggedOut, callCloud: async (name, data, options) => {
    calls.push({ name, data, options }); return state.respond(name, data);
  } };
  const sandbox = { module: { exports: {} }, Date: EntryDate, Math, setTimeout, clearTimeout, wx: {
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key), showToast: value => toasts.push(value),
  }, require(name) {
    if (name === "../api/client") return client;
    if (name === "../utils/query") return require("../miniprogram/utils/query");
    throw new Error(name);
  } };
  vm.runInNewContext(script, sandbox);
  return { service: sandbox.module.exports, client, calls, storage, toasts, state, wx: sandbox.wx, pending: () => storage.get(KEY) || [] };
}
function paymentApis(f) {
  const result = {};
  for (const name of ["order", "physical"]) {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, `../miniprogram/api/${name}.js`), "utf8"), {
      module, require(id) {
        if (id === "./client") return f.client;
        if (id === "../service/merchantShare") return f.service;
        throw new Error(id);
      }
    });
    result[name] = module.exports;
  }
  return result;
}
function appWithShare(f, existingSource = {}, resolveLegacy = async () => undefined) {
  let app;
  let legacyResolveCalls = 0;
  const storeModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../miniprogram/store/sourceStore.js"), "utf8"), {
    module: storeModule, wx: f.wx, require: () => require("../miniprogram/utils/query"),
  });
  const sourceStore = storeModule.exports;
  sourceStore.setSource(existingSource);
  const sandbox = { App: value => { app = value; }, Page: value => value, wx: f.wx, getCurrentPages: () => [], console,
    require(name) {
      if (name === "./service/merchantShare") return f.service;
      if (name === "./service/customerService") return require("../miniprogram/service/customerService");
      if (name === "./store/sourceStore") return sourceStore;
      if (name === "./store/cityStore") return { setCity() {} };
      if (name === "./utils/query") return require("../miniprogram/utils/query");
      if (name === "./config/env") return { API_BASE: "https://synthetic.test/api" };
      if (name === "./api/client") return { callCloud: async (name, data) => {
        if (name === "resolveMerchantCode") { legacyResolveCalls++; return resolveLegacy(data); }
        return { success: true, data: {} };
      }, login: async () => "synthetic-user" };
      if (name === "./store/userStore") return { isLoggedOut: () => true };
      if (name === "./utils/share") return {};
      if (name === "./utils/analytics") return { track() {} };
      throw new Error(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../miniprogram/app.js"), "utf8"), sandbox);
  app.globalData.source = existingSource;
  return { app, sourceStore, legacyResolveCalls: () => legacyResolveCalls };
}
function failure(code, statusCode) { return Object.assign(new Error("synthetic request failure"), { code, statusCode }); }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function check(name, work) { await work(); console.log("PASS " + name); }
(async () => {
  await check("cold/hot entry dedup, click isolation, explicit logout and retry", async () => {
    const f = fixture();
    assert.equal(f.service.capture({ query: { scene: "SABC123" } }, 1), true);
    f.service.capture({ query: { scene: "SABC123" } }, 2);
    await f.service.flush();
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].name, "reportShareScan"); assert.equal(f.calls[0].data.launchType, 1);
    f.service.capture({ query: { scene: "SDEF456" } }, 2); await f.service.flush();
    assert.equal(f.calls[1].data.launchType, 2);
    f.service.capture({ query: { scene: "SAAA999", staffWecomId: "staff", linkId: "link" } }); await f.service.flush();
    assert.equal(f.calls.at(-1).name, "reportShareClick"); assert.equal(f.calls.at(-1).data.scene, undefined);
    const before = f.calls.length;
    f.service.capture({ scene: "c=old-code" }); await f.service.flush(); assert.equal(f.calls.length, before);
    f.state.loggedOut = true; f.service.capture({ query: { scene: "SOFFLINE123" } }); await f.service.flush(); assert.equal(f.calls.length, before);
    f.state.loggedOut = false; f.state.respond = async () => { throw new Error("offline"); };
    await f.service.flush(); assert.equal(f.calls.length, before + 1); assert.equal(f.pending().length, 1);
    f.state.respond = async () => ({ success: true }); await f.service.flush();
    assert.equal(f.calls.length, before + 2); assert.equal(f.pending().length, 0);
  });
  await check("slow cold-start callbacks count one scan, while a later scan of the same QR counts again", async () => {
    const f = fixture(), options = { query: { scene: "SSLOWCOLD123" } };
    f.service.capture(options, 1, "launch"); await f.service.flush();
    f.state.now += 6000;
    f.service.capture(options, 2, "show"); await f.service.flush();
    f.state.now += 6000;
    f.service.capture({ scene: options.query.scene }, 1, "landing"); await f.service.flush();
    assert.equal(f.calls.length, 1, "launch, first show and landing remain one entry after the dedup window");
    assert.equal(f.calls[0].data.launchType, 1);
    f.state.now += 6000;
    f.service.capture(options, 2, "show"); await f.service.flush();
    f.state.now += 6000;
    f.service.capture({ scene: options.query.scene }, 1, "landing"); await f.service.flush();
    assert.equal(f.calls.length, 2, "another actual app entry is not swallowed by the previous scene");
    assert.equal(f.calls[1].data.launchType, 2);
    assert.notEqual(f.calls[0].data.requestKey, f.calls[1].data.requestKey);
  });
  await check("timeout retries preserve a stable request key, including events saved by an older client", async () => {
    const f = fixture();
    f.storage.set(KEY, [{ id: "saved-before-upgrade", name: "reportShareScan", data: { scene: "SREPLAY123", launchType: 1 } }]);
    f.state.respond = async () => { throw new Error("response lost after commit"); };
    await f.service.flush();
    assert.equal(f.pending().length, 1);
    f.state.now += 10000;
    f.state.respond = async () => ({ success: true });
    await f.service.flush();
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[0].data.requestKey, "entry_saved-before-upgrade");
    assert.equal(f.calls[1].data.requestKey, f.calls[0].data.requestKey);
    assert.equal(f.pending().length, 0);
  });
  await check("disabled QR events are removed and notify once without changing existing source", async () => {
    const f = fixture(), previous = { shopId: "existing-shop", codeId: "existing-code" };
    f.storage.set("lxm_source", previous);
    f.state.respond = async () => { throw failure("SHARE_4004", 400); };
    f.service.capture({ scene: "SDISABLED1" }); f.service.capture({ scene: "SDISABLED2" });
    await f.service.flush(); await f.service.flush();
    assert.equal(f.pending().length, 0); assert.equal(f.calls.length, 2); assert.equal(f.toasts.length, 1);
    assert.equal(f.toasts[0].title, "该码已停用，请联系门店"); assert.equal(f.toasts[0].icon, "none");
    assert.equal(f.storage.get("lxm_source"), previous);
  });
  await check("invalid scene, merchant and parameter failures are dropped silently", async () => {
    const f = fixture();
    const codes = ["SHARE_4001", "SHARE_4002", "SHARE_4003"];
    f.state.respond = async (_name, data) => { throw failure(codes[Number(data.scene.slice(-1))], 400); };
    for (let index = 0; index < 3; index++) f.service.capture({ scene: "SINVALID" + index });
    await f.service.flush();
    assert.equal(f.calls.length, 3); assert.equal(f.pending().length, 0); assert.equal(f.toasts.length, 0);
  });
  await check("401, 429, 5xx and network failures remain for the next flush and never spin", async () => {
    for (const error of [failure("SHARE_4030", 401), failure("RATE_LIMITED", 429), failure("SHARE_4004", 503), failure(undefined, 500), new Error("network offline")]) {
      const f = fixture(); f.state.respond = async () => { throw error; };
      f.service.capture({ scene: "SRETRY123" }); await f.service.flush();
      assert.equal(f.calls.length, 1); assert.equal(f.pending().length, 1); assert.equal(f.toasts.length, 0);
      await f.service.flush(); assert.equal(f.calls.length, 2, "one attempt per ID per flush");
    }
  });
  await check("events arriving during A's request are drained in order, including a click that never writes a scan", async () => {
    const f = fixture(), started = deferred(), gate = deferred();
    f.state.respond = async (_name, data) => { if (data.scene === "SWAITAAA") { started.resolve(); await gate.promise; } return { success: true }; };
    f.service.capture({ scene: "SWAITAAA" }); const first = f.service.flush(); await started.promise;
    f.service.capture({ scene: "SWAITBBB" }, 2);
    f.service.capture({ query: { scene: "SNOTASCAN", staffWecomId: "staff", linkId: "late-click" } }, 2);
    const second = f.service.flush(); assert.equal(second, first);
    gate.resolve(); await Promise.all([first, second]);
    assert.deepEqual(f.calls.map(row => row.name + ":" + (row.data.scene || row.data.linkId)), ["reportShareScan:SWAITAAA", "reportShareScan:SWAITBBB", "reportShareClick:late-click"]);
    assert.equal(f.pending().length, 0); assert.equal(f.calls[2].data.scene, undefined);
  });
  await check("a failed scan A holds scan B until retry success while clicks continue draining", async () => {
    const f = fixture(), started = deferred(), gate = deferred();
    f.state.respond = async (_name, data) => { if (data.scene === "SFAILAAA") { started.resolve(); await gate.promise; throw failure(undefined, 503); } return { success: true }; };
    f.service.capture({ scene: "SFAILAAA" }); const running = f.service.flush(); await started.promise;
    f.service.capture({ scene: "SVALIDBBB" });
    f.service.capture({ staffWecomId: "staff", linkId: "later-click" });
    const joined = f.service.flush(); gate.resolve(); await Promise.all([running, joined]);
    assert.deepEqual(f.calls.map(row => row.data.scene || row.data.linkId), ["SFAILAAA", "later-click"]);
    assert.equal(f.pending().length, 2); assert.equal(f.pending()[0].data.scene, "SFAILAAA");
    f.state.respond = async () => ({ success: true });
    await f.service.flush();
    assert.deepEqual(f.calls.map(row => row.data.scene || row.data.linkId), ["SFAILAAA", "later-click", "SFAILAAA", "SVALIDBBB"]);
    assert.equal(f.pending().length, 0);
    assert.equal(f.calls[0].data.requestKey, f.calls[2].data.requestKey);
  });
  await check("service and physical payment RPCs wait for all pending merchant scans before creating payment", async () => {
    for (const kind of ["order", "physical"]) {
      const f = fixture(), apis = paymentApis(f), started = deferred(), gate = deferred();
      f.state.respond = async (_name, data) => { if (data.scene === "SWAITAAA") { started.resolve(); await gate.promise; } return { success: true }; };
      f.service.capture({ scene: "SWAITAAA" });
      const paying = kind === "order" ? apis.order.createPayment({ orderId: "service-order", phase: "final" }) : apis.physical.createPhysicalPayment({ orderId: "physical-order" });
      await started.promise;
      f.service.capture({ scene: "SWAITBBB" });
      assert.deepEqual(f.calls.map(row => row.name), ["reportShareScan"]);
      assert.equal(f.calls[0].options.timeout, 15000);
      gate.resolve(); await paying;
      assert.deepEqual(f.calls.map(row => row.data.scene || row.name), ["SWAITAAA", "SWAITBBB", kind === "order" ? "createPayment" : "createPhysicalPayment"]);
    }
  });
  await check("failed scan synchronization prevents either payment API until the original scan sequence succeeds", async () => {
    const f = fixture(), apis = paymentApis(f);
    f.service.capture({ scene: "SRETRYAAA" }); f.service.capture({ scene: "SRETRYBBB" });
    f.state.respond = async () => { throw failure(undefined, 503); };
    await assert.rejects(apis.order.createPayment({ orderId: "service-order" }), { code: "SHARE_SCAN_SYNC_PENDING" });
    await assert.rejects(apis.physical.createPhysicalPayment({ orderId: "physical-order" }), { code: "SHARE_SCAN_SYNC_PENDING" });
    assert.equal(f.calls.some(row => /create.*Payment/.test(row.name)), false);
    assert.equal(f.pending().length, 2);
    f.state.respond = async () => ({ success: true });
    await apis.physical.createPhysicalPayment({ orderId: "physical-order" });
    assert.deepEqual(f.calls.slice(-3).map(row => row.data.scene || row.name), ["SRETRYAAA", "SRETRYBBB", "createPhysicalPayment"]);
  });
  await check("scan synchronization has a bounded wait and a click-only queue does not delay payment", async () => {
    const f = fixture(), gate = deferred();
    f.state.respond = async () => gate.promise;
    f.service.capture({ scene: "STIMEOUTAAA" });
    await assert.rejects(f.service.ensureScanSynced({ timeoutMs: 5 }), { code: "SHARE_SCAN_SYNC_PENDING" });
    assert.equal(f.pending().length, 1);
    gate.resolve({ success: true }); await f.service.flush();
    f.service.capture({ staffWecomId: "staff", linkId: "pending-click" });
    const before = f.calls.length;
    await f.service.ensureScanSynced();
    assert.equal(f.calls.length, before, "click-only events do not start a blocking drain");
    assert.equal(f.pending().length, 1);
  });
  await check("merchant landing preserves its raw order source immediately while scan reporting is unresolved", async () => {
    const f = fixture(), started = deferred(), gate = deferred();
    const previous = { shopId: "existing-binding-shop", codeId: "existing-code" };
    f.storage.set("lxm_source", previous);
    f.state.respond = async () => { started.resolve(); await gate.promise; return { success: true }; };
    const loaded = appWithShare(f, previous);
    let timer;
    const returned = await Promise.race([
      loaded.app.resolveMerchantSource({ scene: "SNONBLOCKING123" }),
      new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error("landing waited for its reporting request")), 500); }),
    ]).finally(() => clearTimeout(timer));
    assert.equal(returned.scene, "SNONBLOCKING123");
    assert.equal(returned.shopId, ""); assert.equal(returned.codeId, "");
    await started.promise;
    assert.equal(f.pending().length, 1, "an unresolved request is still durably queued");
    assert.equal(f.storage.get("lxm_source"), returned);
    assert.equal(loaded.app.globalData.source, returned);
    assert.equal(loaded.app.captureSource({}).scene, returned.scene, "empty internal page options retain the new scene");
    assert.equal(loaded.legacyResolveCalls(), 0);
    gate.resolve(); await f.service.flush();
    assert.equal(f.pending().length, 0, "the background report can complete after returning to the homepage");
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].name, "reportShareScan");
  });
  await check("a natural cold launch and foreground return retain the latest merchant until another scan", async () => {
    const previous = { shopId: "old-shop", codeId: "old-code", scene: "c=old-code" };
    const f = fixture(), loaded = appWithShare(f, previous);
    loaded.app.onLaunch({ query: {} });
    for (const [key, value] of Object.entries(previous)) assert.equal(loaded.app.getSource()[key], value);
    assert.equal(f.storage.get("lxm_source"), loaded.app.getSource());
    loaded.app.onShow({ query: {} });
    loaded.app.onShow({ query: { staffWecomId: "staff", linkId: "link" } });
    for (const [key, value] of Object.entries(previous)) assert.equal(loaded.app.getSource()[key], value, "ordinary launches and customer-service clicks cannot replace the merchant");
    await f.service.flush();
    assert.equal(f.calls.filter(row => row.name === "reportShareScan").length, 0, "restoring attribution never records another scan");
    loaded.app.onShow({ query: { scene: "SNEWENTRY123" } });
    assert.equal(loaded.app.getSource().scene, "SNEWENTRY123");
    loaded.app.onShow({ query: {} });
    assert.equal(loaded.app.getSource().scene, "SNEWENTRY123", "payment or authorization foreground return retains source");
    assert.equal(loaded.app.captureSource({}).scene, "SNEWENTRY123");
    await f.service.flush();
  });
  await check("a first direct launch starts without a merchant and a new cold scan replaces the persisted merchant", async () => {
    const f = fixture(), loaded = appWithShare(f);
    loaded.app.onLaunch({ query: {} });
    for (const field of ["shopId", "scene", "codeId"]) assert.equal(loaded.app.getSource()[field] || "", "");
    loaded.sourceStore.setSource({ scene: "SOLDMERCHANT123", sourceType: "merchant_qrcode" });
    loaded.app.onLaunch({ query: { scene: "SNEWMERCHANT456" } });
    assert.equal(loaded.app.getSource().scene, "SNEWMERCHANT456");
    assert.equal(f.storage.get("lxm_source").scene, "SNEWMERCHANT456");
    await f.service.flush();
    assert.deepEqual(f.calls.filter(row => row.name === "reportShareScan").map(row => row.data.scene), ["SNEWMERCHANT456"]);
  });
  await check("cold and hot raw merchant scenes replace old code and distributor fields, including encoded scene input", async () => {
    const f = fixture(), loaded = appWithShare(f, { shopId: "old-shop", codeId: "old-code", distributorId: "old-distributor" });
    loaded.app.onLaunch({ query: { scene: "SSTOREAAA123" } });
    assert.equal(loaded.app.getSource().scene, "SSTOREAAA123");
    loaded.app.onShow({ query: { scene: "%53STOREBBB123" } });
    const current = loaded.app.captureSource({});
    assert.equal(current.scene, "SSTOREBBB123");
    assert.equal(current.shopId, ""); assert.equal(current.codeId, ""); assert.equal(current.distributorId, "");
    loaded.app.captureSource({ scene: "SNOTMERCHANT", staffWecomId: "staff", linkId: "link" });
    assert.equal(loaded.app.getSource().scene, "SSTOREBBB123", "customer-service clicks cannot introduce appended merchant scenes");
    await f.service.flush();
  });
  await check("legacy hot-entry candidates replace old attribution before lookup and a late response cannot override a newer merchant", async () => {
    const f = fixture(), gate = deferred();
    const loaded = appWithShare(f, { shopId: "prior-shop", codeId: "prior-code" }, async () => gate.promise);
    loaded.app.onShow({ query: { c: "legacy-A" } });
    assert.equal(loaded.app.getSource().scene, "c=legacy-A");
    assert.equal(loaded.app.getSource().shopId, "");
    const resolving = loaded.app.resolveMerchantSource({ c: "legacy-A" });
    loaded.app.onShow({ query: { scene: "SSTOREBBB123" } });
    gate.resolve({ success: true, shopId: "shop-A", scene: "c=legacy-A" });
    assert.equal((await resolving).scene, "SSTOREBBB123");
    assert.equal(loaded.app.getSource().shopId, "");
    assert.equal(loaded.app.getSource().codeId, "");
    await f.service.flush();
  });
  await check("internal navigation carrying the resolved legacy code retains its city and placement", async () => {
    const f = fixture(), loaded = appWithShare(f, {}, async () => ({
      success: true, shopId: "legacy-shop", scene: "c=current-code",
      cityId: "city-current", city: "Current city", placementType: "counter", placementLabel: "Front counter",
    }));
    await loaded.app.resolveMerchantSource({ c: "current-code" });
    const current = loaded.app.captureSource({ scene: "c=current-code", shopId: "legacy-shop" });
    assert.equal(current.shopId, "legacy-shop"); assert.equal(current.cityId, "city-current");
    assert.equal(current.placementType, "counter"); assert.equal(current.placementLabel, "Front counter");
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
