"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const rpc = require("../../luxiaoming-admin-交付包/server/lib/rpc.cjs");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture() {
  const rows = {
    cities: [{ id: "cs", name: "长沙", enabled: true }],
    spots: Array.from({ length: 125 }, (_, index) => ({
      id: `point-${index + 1}`, name: `点位${index + 1}`, cityId: "cs", sort: index + 1
    })),
    homeConfig: [{ id: "homeStats", bannerConfigVersion: 1, banners: [] }],
    series: [], albums: [], packages: [], peripherals: [], guides: [], samples: []
  };
  const source = {
    async list(key) { return structuredClone(rows[key] || []); },
    async get(key, id) { return structuredClone((rows[key] || []).find((row) => row.id === id) || null); }
  };
  const targetCalls = [];
  const state = { gate: null, fail: false };
  const targetStarted = deferred();
  const filename = path.resolve(__dirname, "../miniprogram/pages/spotSheet/spotSheet.js");
  const nativeRequire = createRequire(filename);
  let definition;
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    Page(value) { definition = value; },
    getApp: () => ({}), wx: {}, console,
    require(id) {
      if (id === "../../api/spot") return {
        async getSpots(params) {
          if (params.spotId) {
            targetCalls.push(params);
            targetStarted.resolve();
            if (state.gate) await state.gate.promise;
            if (state.fail) throw new Error("target unavailable");
          }
          return rpc(source, "getSpots", params);
        }
      };
      if (id === "../../api/home") return { getHomeData: (params) => rpc(source, "getHomeData", params) };
      if (id === "../../api/booking") return { getBookingData: (params) => rpc(source, "getBookingData", params) };
      if (id === "../../api/peripheral") return { getPeripherals: (params) => rpc(source, "getPeripherals", params) };
      if (id === "../../api/guide") return { getGuides: async () => [] };
      return nativeRequire(id);
    }
  }, { filename });
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) { Object.assign(this.data, patch); } };
  return { page, rows, targetCalls, state, targetStarted };
}

test("the 125th ranked point loads through the real public RPC without losing recommendations", async () => {
  const { page, targetCalls } = fixture();
  page.setData({ id: "point-125", shopId: "merchant-source" });
  await page.loadSpots();
  assert.equal(page.data.error, "");
  assert.equal(page.data.loading, false);
  assert.equal(page.data.selectedSpot._id, "point-125");
  assert.equal(page.data.selectedSpot.name, "点位125");
  assert.equal(page.data._spotList.length, 101, "the target is added to the existing first-100 catalogue");
  assert.deepEqual(Array.from(page.data.relatedRecs, (row) => row._id), ["point-1", "point-2", "point-3", "point-4", "point-5"]);
  assert.equal(targetCalls.length, 1);
  assert.equal(targetCalls[0].spotId, "point-125");
  assert.equal(targetCalls[0].shopId, "merchant-source");
  assert.equal(targetCalls[0].limit, 1);
});

test("points already in the catalogue avoid extra queries and hidden targets stay unavailable", async () => {
  const { page, rows, targetCalls } = fixture();
  page.setData({ id: "point-1" });
  await page.loadSpots();
  assert.equal(page.data.selectedSpot._id, "point-1");
  assert.equal(targetCalls.length, 0);
  rows.spots.find((row) => row.id === "point-125").isShow = false;
  page.setData({ id: "point-125" });
  await page.loadSpots();
  assert.equal(targetCalls.length, 1);
  assert.equal(page.data.error, "打卡点不存在");
  assert.equal(page.data._spotList.some((row) => row._id === "point-125"), false);
  assert.equal(page.data.loading, false);
});

test("a failed targeted lookup ends loading with the existing retryable error", async () => {
  const { page, state } = fixture();
  state.fail = true;
  page.setData({ id: "point-125" });
  await page.loadSpots();
  assert.equal(page.data.error, "打卡点数据加载失败，请返回探索页重试");
  assert.equal(page.data.loading, false);
});

test("late targeted lookups cannot overwrite a newer load or an unloaded detail page", async () => {
  for (const unload of [false, true]) {
    const { page, state, targetStarted } = fixture();
    state.gate = deferred();
    page.setData({ id: "point-125" });
    const pending = page.loadSpots();
    await targetStarted.promise;
    if (unload) page.onUnload();
    else {
      page.setData({ id: "point-1" });
      await page.loadSpots();
      assert.equal(page.data.selectedSpot._id, "point-1");
    }
    const current = JSON.stringify(page.data);
    state.gate.resolve();
    await pending;
    assert.equal(JSON.stringify(page.data), current, unload ? "unloaded page must remain untouched" : "a newer selection must win");
  }
});
