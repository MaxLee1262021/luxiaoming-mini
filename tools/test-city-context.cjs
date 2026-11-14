"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const rpc = require("../../luxiaoming-admin-交付包/server/lib/rpc.cjs");

test("scan city persists through source capture, Explore switching, Home refresh and an empty city", async () => {
  const storage = new Map();
  const requests = [];
  let app;
  let definition;
  let navigation;
  const rows = {
    cities: [{ id: "cs", name: "长沙", enabled: true, sort: 1 }, { id: "hz", name: "杭州", enabled: true, sort: 2 }, { id: "empty", name: "重庆", enabled: true, sort: 3 }],
    shops: [{ id: "shop", name: "杭州店", cityId: "hz", city: "杭州", status: "合作中" }],
    merchantCodes: [{ id: "code", shopId: "shop", cityId: "hz", city: "杭州", status: "启用" }],
    spots: [{ id: "west-lake", name: "西湖", cityId: "hz", city: "杭州", status: "启用", latitude: 30.25, longitude: 120.15 }],
    homeConfig: [{ id: "homeStats", banners: [{ id: "hz-banner", cityId: "hz", url: "https://example.test/hz.jpg" }],
      exploreBanners: [{ id: "hz-explore", cityId: "hz", url: "https://example.test/hz-explore.jpg" }] }]
  };
  const source = {
    async list(key) { return structuredClone(rows[key] || []); },
    async get(key, id) { return structuredClone((rows[key] || []).find((row) => row.id === id) || null); }
  };
  global.wx = {
    getStorageSync: (key) => storage.get(key) || "",
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: (key) => storage.delete(key),
    getAccountInfoSync: () => ({ miniProgram: { envVersion: "develop" } }),
    showToast() {},
    navigateTo(value) { navigation = value; },
    request(options) {
      const name = options.url.split("/rpc/")[1];
      requests.push({ name, params: structuredClone(options.data.data) });
      rpc(source, name, options.data).then((data) => options.success({ statusCode: 200, data }), options.fail);
    }
  };
  global.Page = (config) => { definition = config; };
  global.App = (config) => { app = config; };
  global.getApp = () => app;
  require("../miniprogram/app.js");
  const cityStore = require("../miniprogram/store/cityStore.js");
  const sourceStore = require("../miniprogram/store/sourceStore.js");
  cityStore.setCity({ cityId: "cs", city: "长沙" });
  const scan = await app.resolveMerchantSource({ c: "code" });
  assert.equal(scan.cityId, "hz");
  assert.equal(cityStore.getCity().cityId, "hz", "新扫码覆盖此前浏览城市");
  assert.equal(sourceStore.captureSource({}).cityId, "hz", "空页面参数不丢失扫码城市");

  function page() {
    return { ...definition, data: structuredClone(definition.data), setData(patch, done) { Object.assign(this.data, patch); if (done) done(); } };
  }
  require("../miniprogram/pages/index/index.js");
  const home = page();
  await home.loadHomeData();
  assert.equal(home.data.cityId, "hz");
  assert.equal(home.data.banners[0]._id, "hz-banner");
  assert.equal(home.data.spots[0]._id, "west-lake");

  require("../miniprogram/pages/explore/explore.js");
  const explore = page();
  await explore.loadCities();
  await explore.loadSpots();
  await explore.loadExploreBanners();
  assert.equal(explore.data.selectedCity, "hz");
  assert.equal(explore.data.exploreBanners[0]._id, "hz-explore");
  assert.equal(requests.filter((request) => request.name === "getSpots").at(-1).params.cityId, "hz");
  await explore.selectCity({ currentTarget: { dataset: { value: "empty" } } });
  assert.equal(cityStore.getCity().cityId, "empty");
  assert.deepEqual(explore.data.filteredSpots, []);
  assert.deepEqual(explore.data.exploreBanners, []);
  await home.loadHomeData();
  assert.equal(home.data.cityId, "empty");
  assert.deepEqual(home.data.banners, []);
  assert.deepEqual(home.data.spots, []);
  assert.deepEqual(home.data.spotTabs, [], "空城市首页不显示商品货架或跨城市热榜");
  explore.goCityBooking();
  assert.match(navigation.url, /cityId=empty/);
  assert.match(navigation.url, /requestedSpot=/);
  const reopened = page();
  await reopened.loadCities();
  assert.equal(reopened.data.selectedCity, "empty", "重开页面保留用户所选城市");
  cityStore.setCity({ cityId: "future-city", city: "未录入城市" });
  const unknownCity = page();
  await unknownCity.loadCities();
  await unknownCity.loadSpots();
  assert.equal(unknownCity.data.selectedCity, "", "未录入城市保持空态，不伪造城市或展示其他城市点位");
  assert.deepEqual(unknownCity.data.filteredSpots, []);
});

test("home search catalog keeps public unbound photos without restoring cleared point bindings", () => {
  const { buildHomeViewData } = require("../miniprogram/service/homeData.js");
  const view = buildHomeViewData({
    spots: [{ _id: "s", name: "现有点位" }],
    series: [{ _id: "style", name: "风格", spotIds: ["s"] }],
    albums: [
      { id: "standalone", name: "独立照片留影", price: 199, status: "上架" },
      { _id: "unbound", name: "已取消点位关联", seriesId: "style", spotBindingExplicit: true, spotId: "", price: 299, status: "上架" },
      { _id: "hidden", name: "隐藏商品", price: 299, isShow: false }
    ]
  });
  assert.deepEqual(view.bookingAlbums.map((item) => item.albumId), ["standalone", "unbound"]);
  assert.equal(view.bookingAlbums[0].seriesId, "");
  assert.equal(view.bookingAlbums[1].seriesId, "style");
  assert.equal(view.bookingAlbums[1].spotId, "", "明确取消关联后不得从风格继承点位");
  let definition;
  global.Page = (value) => { definition = value; };
  delete require.cache[require.resolve("../miniprogram/pages/index/index.js")];
  require("../miniprogram/pages/index/index.js");
  const home = { ...definition, data: { ...structuredClone(definition.data), ...view, activeSpotId: "s" },
    setData(patch) { Object.assign(this.data, patch); } };
  assert.deepEqual(home.data.bookingAlbums.map((item) => item.albumId), ["standalone", "unbound"], "保留公开商品目录供首页搜索建议使用");
  assert.equal(typeof home.applySpotFilter, "undefined");
});

test("automatic city follows the oldest enabled record and ignores legacy default cache", async () => {
  const storage = new Map([
    ["lxm_selected_city", { cityId: "cq", city: "重庆" }],
    ["lxm_public_token", "existing-login-token"]
  ]);
  const requests = [];
  const rows = {
    cities: [
      { id: "cq", name: "重庆", enabled: true, createdAt: "2026-10-31T00:00:00Z", sort: -10, isDefault: true },
      { id: "disabled", name: "停用城市", enabled: false, createdAt: "2020-01-01T00:00:00Z" },
      { id: "cs", name: "长沙", enabled: true, createdAt: "2026-01-01T00:00:00Z" }
    ],
    homeConfig: [{ id: "homeStats", defaultCityId: "cq" }],
    spots: [
      { id: "cs-spot", name: "长沙点位", cityId: "cs", status: "启用" },
      { id: "cq-spot", name: "重庆点位", cityId: "cq", status: "启用" }
    ]
  };
  const source = {
    async list(key) { return structuredClone(rows[key] || []); },
    async get(key, id) { return structuredClone((rows[key] || []).find(row => row.id === id) || null); }
  };
  global.wx = {
    getStorageSync: key => storage.get(key) || "",
    setStorageSync: (key, value) => storage.set(key, value),
    getAccountInfoSync: () => ({ miniProgram: { envVersion: "develop" } }),
    request(options) {
      const name = options.url.split("/rpc/")[1];
      requests.push({ name, params: structuredClone(options.data.data) });
      rpc(source, name, options.data).then(data => options.success({ statusCode: 200, data }), options.fail);
    }
  };
  global.getApp = () => ({ captureSource: () => ({}), getSource: () => ({}) });
  let definition;
  global.Page = value => { definition = value; };
  function pageFor(relativePath) {
    const modulePath = require.resolve(relativePath);
    delete require.cache[modulePath];
    require(modulePath);
    return { ...definition, data: structuredClone(definition.data), setData(patch, done) {
      Object.assign(this.data, patch); if (done) done();
    } };
  }
  const cityStore = require("../miniprogram/store/cityStore.js");
  assert.deepEqual(cityStore.getCity(), {}, "旧缓存中的自动重庆不能覆盖新默认规则");
  const home = pageFor("../miniprogram/pages/index/index.js");
  await home.loadHomeData();
  assert.equal(home.data.cityId, "cs");
  assert.deepEqual(home.data.spots.map(row => row._id), ["cs-spot"]);
  assert.equal(requests.find(row => row.name === "getHomeData").params.cityId, "");
  assert.deepEqual(cityStore.getCity(), {}, "自动默认不能保存为主动选城");
  assert.equal(storage.get("lxm_public_token"), "existing-login-token", "城市迁移保留登录状态");

  const explore = pageFor("../miniprogram/pages/explore/explore.js");
  explore.data.selectedCity = "cq";
  await explore.loadCities();
  assert.equal(explore.data.selectedCity, "cs", "探索页自动默认不受 Tab 内旧城市影响");
  assert.deepEqual(cityStore.getCity(), {});

  rows.cities.push({ id: "older", name: "更早城市", enabled: true, createdAt: "2025-01-01T00:00:00Z" });
  await home.loadHomeData();
  await explore.loadCities();
  assert.equal(home.data.cityId, "older", "首页刷新重新读取最早城市");
  assert.equal(explore.data.selectedCity, "older", "探索刷新同步最早城市");

  explore.initMetrics = () => {};
  explore.refreshOnTabShow = async () => {};
  await explore.onLoad({ cityId: "cq", city: "重庆" });
  assert.equal(cityStore.getCity().cityId, "cq", "分享参数中的城市仍然持久保存");
  await home.loadHomeData();
  assert.equal(home.data.cityId, "cq", "显式城市优先于自动默认");

  storage.set("lxm_selected_city", { cityId: "cs", city: "长沙" });
  const legacySource = { cityId: "cq", city: "重庆", sourceType: "shop" };
  global.getApp = () => ({ captureSource: () => legacySource, getSource: () => legacySource });
  const upgradedExplore = pageFor("../miniprogram/pages/explore/explore.js");
  upgradedExplore.initMetrics = () => {};
  upgradedExplore.refreshOnTabShow = async () => {};
  await upgradedExplore.onLoad({});
  await upgradedExplore.loadCities();
  await upgradedExplore.loadCities();
  assert.equal(upgradedExplore.data.selectedCity, "cq", "旧扫码城市在连续 Tab 刷新后仍保留");
  const upgradedHome = pageFor("../miniprogram/pages/index/index.js");
  await upgradedHome.loadHomeData();
  assert.equal(upgradedHome.data.cityId, "cq", "首页与升级后的扫码城市一致");

  cityStore.setCity({ city: "长沙" });
  await upgradedHome.loadHomeData();
  assert.equal(upgradedHome.data.cityId, "cs", "明确城市名称不能被旧扫码城市 ID 覆盖");
  assert.equal(requests.filter(row => row.name === "getHomeData" && !row.params.spotProductsOnly).at(-1).params.cityId, "");
});
