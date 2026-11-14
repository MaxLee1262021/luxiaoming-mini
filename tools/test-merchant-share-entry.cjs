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
  const sandbox = { module: { exports: {} }, Date: EntryDate, Math, wx: {
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), showToast: value => toasts.push(value),
  }, require(name) {
    if (name === "../api/client") return { isLoggedOut: () => state.loggedOut, callCloud: async (name, data) => {
      calls.push({ name, data }); return state.respond(name, data);
    } };
    if (name === "../utils/query") return require("../miniprogram/utils/query");
    throw new Error(name);
  } };
  vm.runInNewContext(script, sandbox);
  return { service: sandbox.module.exports, calls, storage, toasts, state, wx: sandbox.wx, pending: () => storage.get(KEY) || [] };
}
function appWithShare(f, existingSource) {
  let app;
  let legacyResolveCalls = 0;
  const sandbox = { App: value => { app = value; }, Page: value => value, wx: f.wx, getCurrentPages: () => [], console,
    require(name) {
      if (name === "./service/merchantShare") return f.service;
      if (name === "./store/sourceStore") return { getSource: () => existingSource, captureSource: () => existingSource };
      if (name === "./utils/query") return require("../miniprogram/utils/query");
      if (name === "./config/env") return { API_BASE: "https://synthetic.test/api" };
      if (name === "./api/client") return { callCloud: async () => { legacyResolveCalls++; }, login: async () => "synthetic-user" };
      if (name === "./store/userStore") return {};
      if (name === "./utils/share") return {};
      if (name === "./utils/analytics") return {};
      throw new Error(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../miniprogram/app.js"), "utf8"), sandbox);
  app.globalData.source = existingSource;
  return { app, legacyResolveCalls: () => legacyResolveCalls };
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
  await check("a failed A is retained once while newly queued B still reports in the same flush", async () => {
    const f = fixture(), started = deferred(), gate = deferred();
    f.state.respond = async (_name, data) => { if (data.scene === "SFAILAAA") { started.resolve(); await gate.promise; throw failure(undefined, 503); } return { success: true }; };
    f.service.capture({ scene: "SFAILAAA" }); const running = f.service.flush(); await started.promise;
    f.service.capture({ scene: "SVALIDBBB" }); const joined = f.service.flush(); gate.resolve(); await Promise.all([running, joined]);
    assert.deepEqual(f.calls.map(row => row.data.scene), ["SFAILAAA", "SVALIDBBB"]);
    assert.equal(f.pending().length, 1); assert.equal(f.pending()[0].data.scene, "SFAILAAA");
  });
  await check("merchant landing returns immediately while reporting never resolves, preserving the queued event and existing source", async () => {
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
    assert.equal(returned, previous);
    await started.promise;
    assert.equal(f.pending().length, 1, "an unresolved request is still durably queued");
    assert.equal(f.storage.get("lxm_source"), previous);
    assert.equal(loaded.app.globalData.source, previous);
    assert.equal(loaded.legacyResolveCalls(), 0);
    gate.resolve(); await f.service.flush();
    assert.equal(f.pending().length, 0, "the background report can complete after returning to the homepage");
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].name, "reportShareScan");
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
