"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const storage = new Map();
let pageConfig = null;
let failSpots = false;
let failCities = false;
let toastText = "";
let lastNavigation = null;

global.wx = {
  getStorageSync(key) { return storage.get(key) || ""; },
  setStorageSync(key, value) { storage.set(key, value); },
  removeStorageSync(key) { storage.delete(key); },
  getAccountInfoSync() { return { miniProgram: { envVersion: "develop" } }; },
  getSystemSetting() { return {}; },
  getSystemInfoSync() { return { windowWidth: 375, statusBarHeight: 20 }; },
  getWindowInfo() { return { windowWidth: 375, statusBarHeight: 20, safeAreaInsets: { bottom: 0 } }; },
  getMenuButtonBoundingClientRect() { return null; },
  showToast({ title }) { toastText = title; },
  navigateTo(options) { lastNavigation = options; },
  request(options) {
    if (failCities && /\/rpc\/getCities$/.test(options.url)) {
      options.fail({ errMsg: "request:fail simulated" });
      return;
    }
    if (failSpots && /\/rpc\/getSpots$/.test(options.url)) {
      options.fail({ errMsg: "request:fail simulated" });
      return;
    }
    if (/\/rpc\/getCities$/.test(options.url)) {
      options.success({
        statusCode: 200,
        data: {
          success: true,
          data: [
            { _id: "city-changsha", name: "长沙", enabled: true, spotCount: 1, latitude: 28.195, longitude: 112.95, coordType: "gcj02" },
            { _id: "city-yueyang", name: "岳阳", enabled: false, spotCount: 1, latitude: 29.357, longitude: 113.129, coordType: "gcj02" }
          ]
        }
      });
      return;
    }
    if (/\/rpc\/getSpots$/.test(options.url)) {
      options.success({
        statusCode: 200,
        data: {
          success: true,
          data: [
            { _id: "spot-cs", name: "橘子洲", cityId: "city-changsha", city: "长沙", district: "岳麓区", latitude: 28.1863, longitude: 112.9498, coordType: "gcj02", seriesCount: 2, tags: ["江景"] },
            { _id: "spot-yy", name: "岳阳楼", cityId: "city-yueyang", city: "岳阳", district: "岳阳楼区", latitude: 29.357, longitude: 113.129, coordType: "gcj02", seriesCount: 1, tags: ["古建"] }
          ]
        }
      });
      return;
    }
    if (/\/rpc\/getHomeData$/.test(options.url)) {
      options.success({ statusCode: 200, data: { success: true, data: { exploreBanners: [], packages: [], videoSingles: [], albums: [], guides: [] } } });
      return;
    }
    options.success({ statusCode: 200, data: { success: true, data: [] } });
  }
};

global.getApp = () => ({ captureSource: () => ({}) });
global.Page = (config) => { pageConfig = config; };

const pagePath = path.resolve(__dirname, "..", "miniprogram", "pages", "explore", "explore.js");
delete require.cache[pagePath];
require(pagePath);
assert.ok(pageConfig, "explore page should register");

function createPage() {
  const page = Object.assign({}, pageConfig, {
    data: JSON.parse(JSON.stringify(pageConfig.data)),
    setData(patch, callback) {
      Object.assign(this.data, patch || {});
      if (typeof callback === "function") callback();
    }
  });
  return page;
}

(async () => {
  const page = createPage();
  const hasActiveCity = await page.loadCities();
  assert.equal(hasActiveCity, true);
  assert.equal(page.data.selectedCity, "city-changsha");
  assert.equal(page.data.selectedCityName, "长沙");
  assert.equal(page.data.cityOptions[1].disabled, true);
  assert.equal(page.data.cityOptions[1].displayName, "岳阳（敬请期待）");

  await page.loadSpots();
  assert.deepEqual(page.data.filteredSpots.map((item) => item._id), ["spot-cs"]);
  assert.equal(page.data.markers.length, 1);
  assert.equal(page.data.includePoints, null, "map bounds must stay unset for a single point");
  assert.deepEqual(
    { latitude: page.data.markers[0].latitude, longitude: page.data.markers[0].longitude },
    { latitude: 28.1863, longitude: 112.9498 }
  );

  page.setData({ selectedSpotId: "spot-cs", selectedSpotName: "橘子洲" });
  page.onMapTap();
  assert.equal(page.data.selectedSpotId, "");
  assert.equal(page.data.selectedSpotName, "");

  page.setData({ selectedDistrict: "岳麓区", selectedSpotId: "spot-cs", selectedSpotName: "橘子洲" });
  assert.doesNotThrow(() => page.resetFilters());
  assert.equal(page.data.selectedDistrict, "");
  assert.equal(page.data.selectedSpotId, "");

  page.setData({
    spots: [
      { _id: "spot-without-coordinate", name: "待定位点位", cityId: "city-changsha", city: "长沙", latitude: null, longitude: null },
      { _id: "spot-mappable", name: "可定位点位", cityId: "city-changsha", city: "长沙", latitude: 28.2, longitude: 112.96, coordType: "gcj02" }
    ]
  });
  page.applyFilters();
  assert.equal(page.data.filteredSpots.length, 2);
  assert.equal(page.data.markers.length, 1);
  assert.equal(page.data.includePoints, null, "invalid coordinates must not enter map bounds");
  page.onMarkerTap({ detail: { markerId: 0 } });
  assert.match(lastNavigation.url, /id=spot-mappable/);

  page.setData({
    spots: [
      { _id: "spot-a", name: "A", cityId: "city-changsha", city: "长沙", latitude: 28.2, longitude: 112.96 },
      { _id: "spot-b", name: "B", cityId: "city-changsha", city: "长沙", latitude: "28.21", longitude: "112.97" }
    ]
  });
  page.applyFilters();
  assert.equal(page.data.includePoints.length, 2);
  assert.ok(page.data.includePoints.every((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)));

  await page.loadExploreBanners();
  assert.deepEqual(page.data.exploreBanners, []);

  page.selectCity({ currentTarget: { dataset: { value: "city-yueyang", disabled: true } } });
  assert.equal(page.data.selectedCity, "city-changsha");
  assert.equal(toastText, "该城市即将上线");

  failSpots = true;
  const previousConsoleError = console.error;
  console.error = () => {};
  try {
    await page.loadSpots();
  } finally {
    console.error = previousConsoleError;
  }
  assert.deepEqual(page.data.spots, []);
  assert.deepEqual(page.data.filteredSpots, []);
  assert.match(page.data.error, /打卡点数据加载失败/);
  assert.equal(page.data.degraded, false);

  failCities = true;
  const previousConsoleWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await page.loadCities(), false);
  } finally {
    console.warn = previousConsoleWarn;
  }
  assert.match(page.data.error, /城市配置加载失败/);

  process.stdout.write("Mini program city/spot backend data-flow test passed.\n");
})().catch((error) => {
  process.stderr.write((error && error.stack) || String(error));
  process.exitCode = 1;
});
