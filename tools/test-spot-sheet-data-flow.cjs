"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

let pageConfig = null;
const locationCalls = [];
const toastCalls = [];
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

global.wx = {
  getStorageSync() { return ""; },
  setStorageSync() {},
  removeStorageSync() {},
  getAccountInfoSync() { return { miniProgram: { envVersion: "develop" } }; },
  navigateTo() {},
  showToast(options) { toastCalls.push(options); },
  openLocation(options) { locationCalls.push(options); },
  request(options) {
    const name = String(options.url || "").split("/rpc/").pop();
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
          { _id: "per-global", name: "全城相册", mode: "全城通用", status: "上架", isShow: true, price: 99 },
          { _id: "per-a", name: "橘洲相册", spotIds: ["spot-a"], status: "上架", isShow: true, price: 129 },
          { _id: "per-b", name: "其他点位相册", spotIds: ["spot-b"], status: "上架", isShow: true, price: 159 }
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
  assert.deepEqual(page.data.selectedSpotGuides.map((item) => item._id), ["guide-multi"]);
  assert.deepEqual(
    page.data.selectedSpotProducts.peripherals.map((item) => item._id).sort(),
    ["per-a", "per-global"]
  );
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

  process.stdout.write("Mini program spot-sheet data-flow test passed.\n");
})().catch((error) => {
  process.stderr.write((error && error.stack) || String(error));
  process.exitCode = 1;
});
