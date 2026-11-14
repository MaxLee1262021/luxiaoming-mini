"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

let pageConfig = null;
const locationCalls = [];
const toastCalls = [];
const navigations = [];
const homeRequests = [];
const pendingHomeRequests = [];
let deferHomeRequests = false;
const invalidSpots = [
  { _id: "missing" },
  { _id: "partial", latitude: 28.185 },
  { _id: "null", latitude: null, longitude: null },
  { _id: "blank", latitude: " ", longitude: "" },
  { _id: "malformed", latitude: "unknown", longitude: 112.976 },
  { _id: "nonfinite", latitude: Infinity, longitude: 112.976 },
  { _id: "latitude-range", latitude: 91, longitude: 112.976 },
  { _id: "longitude-range", latitude: 28.185, longitude: -181 }
];
const spotFixtures = [
  { _id: "spot-a", name: "橘子洲", address: "长沙市岳麓区橘子洲头", latitude: "28.185", longitude: "112.976", coordType: "gcj02" },
  { _id: "spot-b", name: "岳麓山", address: "长沙市岳麓区登高路", latitude: 28.183, longitude: 112.938, coordType: "gcj02" },
  { _id: "wgs84", name: "GPS 点位", latitude: 28.185, longitude: 112.976, coordType: "wgs84" },
  { _id: "bd09", name: "百度点位", latitude: 28.185, longitude: 112.976, coordType: "bd09" },
  { _id: "zero", name: "零坐标点位", latitude: 0, longitude: 0, coordType: "gcj02" },
  ...invalidSpots
].map((spot) => ({ cityId: "city-cs", city: "长沙", status: "启用", isShow: true, ...spot }));
const rankedSpots = [
  { ...spotFixtures[1], hotScore: 1 },
  { _id: "home-only", name: "首页推荐点位", address: "长沙市岳麓区", latitude: 28.185, longitude: 112.976, coordType: "wgs84", hotScore: 0 },
  { ...spotFixtures[0], hotScore: 999 },
  ...spotFixtures.slice(2, 7)
];
let homeResult = {
  success: true,
  data: {
    spots: rankedSpots,
    spotPagination: { offset: 0, limit: 20, nextOffset: rankedSpots.length, hasMore: false }
  }
};

global.wx = {
  getStorageSync() { return ""; },
  setStorageSync() {},
  removeStorageSync() {},
  getAccountInfoSync() { return { miniProgram: { envVersion: "develop" } }; },
  navigateTo(options) { navigations.push(options.url); },
  showToast(options) { toastCalls.push(options); },
  openLocation(options) { locationCalls.push(options); },
  request(options) {
    const name = String(options.url || "").split("/rpc/").pop();
    if (name === "getHomeData") {
      homeRequests.push(options.data.data);
      if (deferHomeRequests) pendingHomeRequests.push(options);
      else options.success({ statusCode: 200, data: homeResult });
      return;
    }
    const data = {
      getSpots: {
        success: true,
        data: spotFixtures
      },
      getBookingData: {
        success: true,
        data: {
          allSeries: [{ _id: "series-a", name: "江景", spotIds: ["spot-a"], status: "启用", isShow: true }],
          albums: [{ _id: "album-a", name: "江景照片", seriesId: "series-a", spotId: "spot-a", status: "上架", isShow: true }],
          allPackages: [{ _id: "pkg-a", name: "江景套餐", seriesId: "series-a", spotIds: ["spot-a"], status: "上架", isShow: true, price: 699 }]
        }
      },
      getPeripherals: {
        success: true,
        data: [
          { _id: "per-global", name: "全城相册", mode: "全城通用", status: "上架", isShow: true, price: 99, storeProductId: "store-global" },
          { _id: "per-a", name: "橘洲相册", spotIds: ["spot-a"], status: "上架", isShow: true, price: 129, storeProductId: "store-a" },
          { _id: "per-b", name: "其他点位相册", spotIds: ["spot-b"], status: "上架", isShow: true, price: 159, storeProductId: "store-b" },
          { _id: "per-unbound-global", name: "未绑定全城相册", mode: "全城通用", status: "上架", isShow: true, price: 99 },
          { _id: "per-unbound-a", name: "未绑定橘洲相册", spotIds: ["spot-a"], status: "上架", isShow: true, price: 129, storeProductId: "  " },
          { _id: "per-hidden", name: "隐藏相册", mode: "全城通用", status: "上架", isShow: false, storeProductId: "store-hidden" },
          { _id: "per-offline", name: "下架相册", mode: "全城通用", status: "下架", isShow: true }
        ]
      },
      listGuides: {
        success: true,
        data: [{ _id: "guide-multi", title: "双点路线", spotIds: ["spot-a", "spot-b"], status: "启用", isShow: true }]
      }
    }[name] || { success: true, data: [] };
    options.success({ statusCode: 200, data });
  }
};

global.getApp = () => ({ captureSource: () => ({}) });
global.Page = (config) => { pageConfig = config; };

const pagePath = path.resolve(__dirname, "..", "miniprogram", "pages", "spotSheet", "spotSheet.js");
delete require.cache[pagePath];
require(pagePath);
assert.ok(pageConfig, "spot sheet should register");

function createPage() {
  return Object.assign({}, pageConfig, {
    data: JSON.parse(JSON.stringify(pageConfig.data)),
    setData(patch, callback) {
      Object.assign(this.data, patch || {});
      if (typeof callback === "function") callback();
    }
  });
}

function selectSpot(page, id) {
  page.onRecTap({ currentTarget: { dataset: { id } } });
  assert.equal(page.data.selectedSpot._id, id);
}

function destination(options) {
  const { latitude, longitude, name, address, scale } = options;
  return { latitude, longitude, name, address, scale };
}

function completeLocation(options, error) {
  if (error) {
    if (options.fail) options.fail(error);
  } else if (options.success) {
    options.success({ errMsg: "openLocation:ok" });
  }
  if (options.complete) options.complete(error || { errMsg: "openLocation:ok" });
}

(async () => {
  const page = createPage();
  page.setData({ id: "spot-a" });
  await page.loadSpots();

  assert.equal(page.data.error, "");
  assert.equal(page.data.selectedSpot._id, "spot-a");
  assert.deepEqual(homeRequests[0], { shopId: "", spotOffset: 0, spotLimit: 20, spotsOnly: true });
  assert.equal(page.data.spotNoMedia, false);
  assert.deepEqual(page.data.relatedRecs.map(item => item._id), ["spot-b", "home-only", "wgs84", "bd09", "zero"], "recommendations should preserve home ranking, omit the current spot, and cap at five even when the spot has products");
  assert.deepEqual(page.data.selectedSpotGuides.map((item) => item._id), ["guide-multi"]);
  assert.deepEqual(
    page.data.selectedSpotProducts.peripherals.map((item) => item._id).sort(),
    ["per-a", "per-global", "per-unbound-a", "per-unbound-global"]
  );
  for (const id of ["per-unbound-global", "per-unbound-a"]) {
    assert.equal(page.data.catalog.peripherals.some((item) => item._id === id), true, `${id} must remain available for display without a WeChat store binding`);
    assert.equal(page.data.selectedSpotProducts.peripherals.some((item) => item._id === id), true, `${id} must appear when it matches the current spot`);
  }
  for (const id of ["per-hidden", "per-offline"]) {
    assert.equal(page.data.catalog.peripherals.some((item) => item._id === id), false, `${id} must remain hidden from the public catalog`);
  }
  const spotMarkup = fs.readFileSync(path.resolve(__dirname, '..', 'miniprogram/pages/spotSheet/spotSheet.wxml'), 'utf8');
  assert.doesNotMatch(spotMarkup, /peripheral-price/);
  page.setData({ shopId: 'source-shop', scene: 'source-scene' });
  page.onPeripheralTap({ currentTarget: { dataset: { id: 'per-a' } } });
  assert.equal(navigations.at(-1), '/pages/peripherals/peripherals?id=per-a&shopId=source-shop&scene=source-scene');
  assert.deepEqual(page.data.selectedSpotProducts.photoPackages.map((item) => item._id), ["pkg-a"]);

  assert.equal(page.data.canNavigate, true, "API string coordinates should enable navigation");
  page.onNavigate();
  const initialCall = locationCalls.at(-1);
  assert.deepEqual(destination(initialCall), {
    latitude: 28.185,
    longitude: 112.976,
    name: "橘子洲",
    address: "长沙市岳麓区橘子洲头",
    scale: 16
  });
  assert.equal(page.data.openingLocation, true);
  page.onNavigate();
  assert.equal(locationCalls.length, 1, "repeated taps must not open two location pages");
  completeLocation(initialCall);
  assert.equal(page.data.openingLocation, false);

  selectSpot(page, "spot-b");
  assert.equal(page.data.spotNoMedia, true);
  assert.deepEqual(page.data.relatedRecs.map(item => item._id), ["home-only", "spot-a", "wgs84", "bd09", "zero"], "switching recommendations must exclude the new spot without filtering out spots that have no products");
  assert.deepEqual(page.data.selectedSpotProducts.peripherals.map((item) => item._id).sort(), ["per-b", "per-global", "per-unbound-global"], "Peripheral displays must still respect the selected spot");
  page.onNavigate();
  assert.deepEqual(destination(locationCalls.at(-1)), {
    latitude: 28.183,
    longitude: 112.938,
    name: "岳麓山",
    address: "长沙市岳麓区登高路",
    scale: 16
  }, "recommendation navigation should target the newly selected spot");
  completeLocation(locationCalls.at(-1));

  for (const [id, expectedLatitude, expectedLongitude] of [
    ["wgs84", 28.181578196734648, 112.98155372130965],
    ["bd09", 28.179334772941093, 112.96940550386944]
  ]) {
    selectSpot(page, id);
    page.onNavigate();
    const call = locationCalls.at(-1);
    assert.ok(Math.abs(call.latitude - expectedLatitude) < 1e-8, `${id} latitude must be converted once`);
    assert.ok(Math.abs(call.longitude - expectedLongitude) < 1e-8, `${id} longitude must be converted once`);
    assert.equal(call.latitude, page.data.selectedSpot.latitude, "navigation should use the loaded map coordinates");
    assert.equal(call.longitude, page.data.selectedSpot.longitude);
    assert.equal(call.address, "", "missing address should not prevent navigation");
    completeLocation(call);
  }

  for (const spot of invalidSpots) {
    selectSpot(page, spot._id);
    assert.equal(page.data.canNavigate, false, `${spot._id} coordinates must disable navigation`);
    const before = locationCalls.length;
    page.onNavigate();
    assert.equal(locationCalls.length, before, `${spot._id} coordinates must not reach wx.openLocation`);
    assert.equal(toastCalls.at(-1).title, "该地点暂未配置位置");
    assert.equal(page.data.openingLocation, false);
  }

  selectSpot(page, "zero");
  assert.equal(page.data.canNavigate, true, "zero is a valid coordinate value");
  page.onNavigate();
  assert.equal(locationCalls.at(-1).latitude, 0);
  assert.equal(locationCalls.at(-1).longitude, 0);
  completeLocation(locationCalls.at(-1));

  selectSpot(page, "spot-a");
  page.onNavigate();
  completeLocation(locationCalls.at(-1), { errMsg: "openLocation:fail native map unavailable" });
  assert.equal(toastCalls.at(-1).title, "地图打开失败，请稍后重试");
  assert.equal(page.data.openingLocation, false, "failure should allow a retry");
  const beforeCancel = toastCalls.length;
  page.onNavigate();
  completeLocation(locationCalls.at(-1), { errMsg: "openLocation:fail cancel" });
  assert.equal(toastCalls.length, beforeCancel, "user cancellation should stay quiet");
  assert.equal(page.data.openingLocation, false);

  const nativeOpenLocation = wx.openLocation;
  wx.openLocation = () => { throw new Error("native API exception"); };
  assert.doesNotThrow(() => page.onNavigate());
  assert.equal(toastCalls.at(-1).title, "地图打开失败，请稍后重试");
  assert.equal(page.data.openingLocation, false, "synchronous failure must not leave navigation busy");
  wx.openLocation = nativeOpenLocation;
  const beforeRetry = locationCalls.length;
  page.onNavigate();
  assert.equal(locationCalls.length, beforeRetry + 1, "navigation should recover after a synchronous failure");
  completeLocation(locationCalls.at(-1));

  delete wx.openLocation;
  const beforeUnsupported = toastCalls.length;
  assert.doesNotThrow(() => page.onNavigate());
  assert.equal(toastCalls.length, beforeUnsupported + 1, "unsupported clients should receive feedback");
  assert.equal(page.data.openingLocation, false);
  wx.openLocation = nativeOpenLocation;

  const recommendationPage = createPage();
  recommendationPage.setData({ id: "spot-a", shopId: "ranking-shop" });
  await recommendationPage.loadSpots();
  assert.equal(homeRequests.at(-1).shopId, "ranking-shop", "the ranking should use the same shop context as the home page");
  selectSpot(recommendationPage, "home-only");
  assert.equal(recommendationPage.data.selectedSpot.name, "首页推荐点位", "a ranked spot outside the detail catalog must still open");
  assert.equal(recommendationPage.data.canNavigate, true);
  assert.ok(Math.abs(recommendationPage.data.selectedSpot.latitude - 28.181578196734648) < 1e-8, "ranked-only coordinates must be converted once");
  assert.deepEqual(recommendationPage.data.relatedRecs.map(item => item._id), ["spot-b", "spot-a", "wgs84", "bd09", "zero"]);
  await recommendationPage.loadSpots();
  assert.equal(recommendationPage.data.selectedSpot._id, "home-only", "reloading must retain a selected spot supplied by the home ranking");
  assert.equal(recommendationPage.data.error, "");

  recommendationPage.applyHomeHotSpots({ success: true, data: { spots: [
    { _id: "spot-a", hotScore: 10 }, { _id: "spot-b", hotScore: 20 }, { id: 42, hotScore: 30 }
  ] } });
  assert.deepEqual(recommendationPage.buildRelatedRecs({ _id: "spot-a" }).map(item => item._id), [42, "spot-b"], "legacy responses must use the same heat ordering as the home page and show only the available rows");
  assert.deepEqual(recommendationPage.buildRelatedRecs({ _id: "42" }).map(item => item._id), ["spot-b", "spot-a"], "numeric and string IDs must identify the same current spot");
  recommendationPage.applyHomeHotSpots({ success: true, data: { spots: [] } });
  assert.deepEqual(recommendationPage.buildRelatedRecs({ _id: "spot-a" }), [], "an empty home ranking must stay empty");
  homeResult = { success: false, message: "ranking unavailable" };
  recommendationPage.setData({ id: "spot-a" });
  await recommendationPage.loadSpots();
  assert.equal(recommendationPage.data.error, "", "a ranking failure must not hide the spot detail");
  assert.deepEqual(recommendationPage.data.relatedRecs, [], "a failed ranking must not fall back to an unrelated spot catalog order");

  deferHomeRequests = true;
  const staleLoad = recommendationPage.loadSpots();
  const freshLoad = recommendationPage.loadSpots();
  const [staleHome, freshHome] = pendingHomeRequests.splice(0);
  freshHome.success({ statusCode: 200, data: { success: true, data: { spots: [rankedSpots[0]] } } });
  await freshLoad;
  assert.deepEqual(recommendationPage.data.relatedRecs.map(item => item._id), ["spot-b"]);
  staleHome.success({ statusCode: 200, data: { success: true, data: { spots: [rankedSpots[1]] } } });
  await staleLoad;
  assert.deepEqual(recommendationPage.data.relatedRecs.map(item => item._id), ["spot-b"], "a stale request must not replace a newer ranking");
  const unloading = recommendationPage.loadSpots();
  const unloadHome = pendingHomeRequests.shift();
  recommendationPage.onUnload();
  const beforeUnloadResult = JSON.stringify(recommendationPage.data);
  unloadHome.success({ statusCode: 200, data: { success: true, data: { spots: [rankedSpots[1]] } } });
  await unloading;
  assert.equal(JSON.stringify(recommendationPage.data), beforeUnloadResult, "late responses must not update an unloaded detail page");
  deferHomeRequests = false;

  process.stdout.write("Mini program spot-sheet data-flow test passed.\n");
})().catch((error) => {
  process.stderr.write((error && error.stack) || String(error));
  process.exitCode = 1;
});
