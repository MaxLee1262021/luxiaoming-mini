"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const navigations = [];
const toasts = [];
const storage = new Map();
let pageConfig = null;

const homeData = {
  banners: [{ _id: "hero-1", type: "image", url: "https://cdn.test/hero.jpg" }],
  spots: [{ _id: "spot-1", name: "橘子洲", city: "长沙", hotScore: 99, cover: "https://cdn.test/spot.jpg" }],
  series: [{ _id: "series-1", name: "江景系列", spotIds: ["spot-1"] }],
  albums: [{ _id: "album-1", seriesId: "series-1", spotId: "spot-1", name: "江景照片", price: 699, cover: "https://cdn.test/album.jpg" }],
  packages: [{ _id: "pkg-1", seriesId: "series-1", spotId: "spot-1", name: "橘子洲套餐", productType: "photo", isMainPush: true, price: 1299 }],
  videoProducts: [{ _id: "video-1", seriesId: "series-1", spotId: "spot-1", name: "江景短片", type: "video", productKind: "video_single", price: 299 }],
  quickNav: [
    { targetType: "all_spots", label: "打卡点", icon: "📍" },
    { targetType: "package_list", label: "旅拍套餐", icon: "📷" },
    { targetType: "videos", label: "视频摄像", icon: "🎬" },
    { targetType: "peripherals", label: "影像周边", icon: "🎁" },
    { targetType: "guides", label: "旅拍灵感", icon: "✦" },
    { targetType: "my", label: "我的订单", icon: "♙" }
  ]
};

function rpcResponse(name) {
  if (name === "getHomeData") return { success: true, data: homeData };
  if (name === "getSearchConfig") return { success: true, data: { hotWords: ["橘子洲", "岳麓山"] } };
  return { success: true, data: [] };
}

global.wx = {
  getStorageSync(key) { return storage.get(key) || ""; },
  setStorageSync(key, value) { storage.set(key, value); },
  removeStorageSync(key) { storage.delete(key); },
  getAccountInfoSync() { return { miniProgram: { envVersion: "develop" } }; },
  getSystemInfoSync() { return { windowWidth: 375, statusBarHeight: 20 }; },
  getWindowInfo() { return { windowWidth: 375, statusBarHeight: 20 }; },
  getMenuButtonBoundingClientRect() { return null; },
  createSelectorQuery() {
    return {
      in() { return this; },
      select() { return this; },
      boundingClientRect() { return this; },
      exec() { return this; }
    };
  },
  showToast(options) { toasts.push(options || {}); },
  switchTab(options) { navigations.push({ method: "switchTab", ...(options || {}) }); },
  navigateTo(options) { navigations.push({ method: "navigateTo", ...(options || {}) }); },
  request(options) {
    const name = String(options.url || "").split("/rpc/").pop();
    const result = rpcResponse(name);
    options.success({ statusCode: 200, data: result });
  }
};

global.getApp = () => ({ captureSource: () => ({}) });
global.Page = (config) => { pageConfig = config; };

const pagePath = path.resolve(__dirname, "..", "miniprogram", "pages", "index", "index.js");
delete require.cache[pagePath];
require(pagePath);
assert.ok(pageConfig, "index page should register");

function createPage() {
  return Object.assign({}, pageConfig, {
    data: JSON.parse(JSON.stringify(pageConfig.data)),
    setData(patch, callback) {
      Object.assign(this.data, patch || {});
      if (typeof callback === "function") callback();
    }
  });
}

function lastNavigation() {
  return navigations[navigations.length - 1];
}

(async () => {
  const page = createPage();
  try {
    await page.onLoad({});
    assert.equal(page.data.loading, false);
    assert.equal(page.data.activeSpotId, "spot-1");
    assert.equal(page.data.quickNav.length, 5);
    assert.equal(page.data.quickNav.some(item => item.targetType === "all_spots"), false);
    assert.equal(page.data.quickNav[0].targetType, "package_list");
    const { buildHomeViewData, getBannerTarget } = require(path.resolve(__dirname, "..", "miniprogram", "service", "homeData.js"));
    assert.deepEqual(buildHomeViewData({ quickNav: null }).quickNav, []);
    assert.equal(getBannerTarget({ targetType: "packageList" }).path, "/pages/search/search");

    // A legacy banner with no target must still provide a useful click result.
    page.goBanner({ currentTarget: { dataset: { index: 0 } } });
    assert.deepEqual(lastNavigation(), { method: "switchTab", url: "/pages/explore/explore" });
    page.setData({ banners: [{ _id: "static-1", type: "image", url: "https://cdn.test/static.jpg", targetType: "none" }] });
    page.goBanner({ currentTarget: { dataset: { index: 0 } } });
    assert.equal(toasts.at(-1).title, "该轮播为展示内容");
    page.setData({ banners: homeData.banners });

    page.goQuickNav({ currentTarget: { dataset: { index: 0, targetType: "all_spots" } } });
    assert.deepEqual(lastNavigation(), { method: "switchTab", url: "/pages/explore/explore" });
    page.goQuickNav({ currentTarget: { dataset: { index: 0, targetType: "package_list" } } });
    assert.match(lastNavigation().url, /^\/pages\/search\/search(?:\?|$)/);
    page.goQuickNav({ currentTarget: { dataset: { index: 4, targetType: "my" } } });
    assert.deepEqual(lastNavigation(), { method: "switchTab", url: "/pages/my/my" });
    page.goQuickNav({ currentTarget: { dataset: { targetType: "package" } } });
    assert.equal(toasts.at(-1).title, "该入口暂未配置");

    const filteredQuickNav = buildHomeViewData({ quickNav: [
      { targetType: "all_spots", label: "全部打卡点" },
      { targetType: "package_list", label: "旅拍套餐" }
    ] }).quickNav;
    assert.deepEqual(filteredQuickNav.map(item => item.targetType), ["package_list"]);

    const router = require(path.resolve(__dirname, "..", "miniprogram", "utils", "router.js"));
    assert.equal(router.normalizeRouteKey("bookingAlbums"), "booking_albums");
    assert.equal(router.buildTarget("bookingAlbums").path, "/pages/search/search");
    assert.equal(router.buildTarget("video").method, "switchTab");
    assert.equal(router.buildTarget("video", "video-1").method, "navigateTo");

    // Card handlers accept both custom-component detail and native dataset payloads.
    page.goPackage({ currentTarget: { dataset: { id: "pkg-1" } } });
    assert.match(lastNavigation().url, /packageId=pkg-1/);
    page.goVideoProduct({ currentTarget: { dataset: { productId: "video-1", spotId: "spot-1" } } });
    assert.match(lastNavigation().url, /productId=video-1/);
    page.goBookingAlbum({ currentTarget: { dataset: { albumId: "album-1", seriesId: "series-1", spotId: "spot-1" } } });
    assert.match(lastNavigation().url, /albumId=album-1/);

    page.goPackage({ detail: { id: "missing-package" } });
    assert.equal(toasts.at(-1).title, "旅拍套餐不存在");

    const wxml = fs.readFileSync(path.resolve(__dirname, "..", "miniprogram", "pages", "index", "index.wxml"), "utf8");
    assert.match(wxml, /class="banner-click-area"[^>]*bindtap="goBanner"/);
    assert.match(wxml, /<video[^>]*catchtap="goBanner"[^>]*data-index=/);
    assert.match(wxml, /class="banner-copy"[^>]*bindtap="goBanner"/);
    assert.match(wxml, /bindtap="goQuickNav"/);
    assert.match(wxml, /data-album-id="\{\{item\.albumId \|\| item\._id\}\}"/);
    assert.match(wxml, /data-product-id="\{\{item\._id\}\}"/);
    assert.match(wxml, /data-package-id="\{\{item\._id\}\}"/);

    process.stdout.write("Mini program home click test passed.\n");
  } finally {
    page.onUnload();
  }
})().catch((error) => {
  process.stderr.write((error && error.stack) || String(error));
  process.exitCode = 1;
});
