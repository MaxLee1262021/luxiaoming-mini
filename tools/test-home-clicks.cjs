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
  spots: [
    { _id: "spot-1", name: "橘子洲", city: "长沙", hotScore: 99, cover: "https://cdn.test/spot.jpg" },
    ...Array.from({ length: 14 }, (_, index) => ({ _id: `spot-${index + 2}`, name: `打卡点${index + 2}`, hotScore: 98 - index }))
  ],
  series: [{ _id: "series-1", name: "江景系列", spotIds: ["spot-1"] }],
  albums: [
    { _id: "album-1", seriesId: "series-1", spotId: "spot-1", name: "江景照片", price: 699, cover: "https://cdn.test/album.jpg" },
    { _id: "album-15", spotId: "spot-15", name: "点位15照片", price: 199 }
  ],
  packages: [
    { _id: "pkg-1", seriesId: "series-1", spotId: "spot-1", name: "橘子洲套餐", productType: "photo", isMainPush: true, price: 1299 },
    { _id: "pkg-15", spotId: "spot-15", name: "点位15套餐", productType: "photo", price: 399 }
  ],
  videoProducts: [
    { _id: "video-1", seriesId: "series-1", spotId: "spot-1", name: "江景短片", type: "video", productKind: "video_single", price: 299 },
    { _id: "video-15", spotId: "spot-15", name: "点位15短片", type: "video", productKind: "video_single", price: 299 }
  ],
  peripherals: [
    { _id: "gift-1", spotId: "spot-1", name: "江景相框", price: 29 },
    { _id: "gift-15", spotId: "spot-15", name: "点位15相框", price: 29 }
  ],
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
  if (name === "getBookingData") return { success: true, data: {
    spots: homeData.spots, allSeries: homeData.series, allAlbums: homeData.albums,
    allPackages: [...homeData.packages, ...homeData.videoProducts], allPeripherals: homeData.peripherals
  } };
  if (name === "getPeripherals") return { success: true, data: homeData.peripherals };
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

    page.goExplore();
    assert.deepEqual(lastNavigation(), { method: "switchTab", url: "/pages/explore/explore" });
    page.goPeripheralList();
    assert.deepEqual(lastNavigation(), { method: "navigateTo", url: "/pages/peripherals/peripherals" });
    page.setData({ shopId: 'shop-1', scene: 'qr' });
    page.goPeripheralList();
    const peripheralUrl = new URL(lastNavigation().url, 'https://mini.test');
    assert.equal(peripheralUrl.pathname, "/pages/peripherals/peripherals");
    assert.equal(peripheralUrl.searchParams.get('shopId'), 'shop-1');
    assert.equal(peripheralUrl.searchParams.get('scene'), 'qr');

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

    // 热榜选择在首页切换四类商品，重复点击与刷新均不产生打卡点导航。
    const firstCount = navigations.length;
    const firstTap = { currentTarget: { dataset: { id: 'spot-1' } } };
    await page.onSpotTabTap(firstTap);
    assert.equal(navigations.length, firstCount);
    assert.equal(page.data.filteredAlbums[0]._id, 'album-1');
    assert.equal(page.data.filteredVideos[0]._id, 'video-1');
    assert.equal(page.data.filteredPackages[0]._id, 'pkg-1');
    assert.equal(page.data.filteredPeripherals[0]._id, 'gift-1');
    await page.onSpotTabTap(firstTap);
    assert.equal(navigations.length, firstCount);
    page.onShow();
    await page._tabRefreshPromise;
    await page.onSpotTabTap(firstTap);
    assert.equal(navigations.length, firstCount);

    await page.onSpotTabTap({ currentTarget: { dataset: { id: 'spot-15' } } });
    assert.equal(navigations.length, firstCount);
    assert.equal(page.data.activeSpotId, 'spot-15');
    assert.deepEqual(page.data.filteredAlbums.map(item => item._id), ['album-15']);
    assert.deepEqual(page.data.filteredVideos.map(item => item._id), ['video-15']);
    assert.deepEqual(page.data.filteredPackages.map(item => item._id), ['pkg-15']);
    assert.deepEqual(page.data.filteredPeripherals.map(item => item._id), ['gift-15']);
    for (const [invoke, pathname, idField, id] of [
      [() => page.onAlbumTap({ detail: { albumId: 'album-15' } }), '/pages/photoCollection/photoCollection', 'albumId', 'album-15'],
      [() => page.onVideoTap({ detail: { id: 'video-15' } }), '/pages/videoProductDetail/videoProductDetail', 'productId', 'video-15'],
      [() => page.onPackageTap({ detail: { id: 'pkg-15' } }), '/pages/photoPackageDetail/photoPackageDetail', 'packageId', 'pkg-15'],
      [() => page.onPeripheralTap({ currentTarget: { dataset: { id: 'gift-15' } } }), '/pages/peripherals/peripherals', 'id', 'gift-15']
    ]) {
      invoke();
      const selectedUrl = new URL(lastNavigation().url, 'https://mini.test');
      assert.equal(selectedUrl.pathname, pathname);
      assert.equal(selectedUrl.searchParams.get(idField), id);
      assert.equal(selectedUrl.searchParams.get('spotId'), 'spot-15');
      assert.equal(selectedUrl.searchParams.get('shopId'), 'shop-1');
      assert.equal(selectedUrl.searchParams.get('scene'), 'qr');
    }
    homeData.spots[14].hotScore = 97.5;
    homeData.spots[14].name = '更新后的打卡点15';
    page.onShow();
    await page._tabRefreshPromise;
    assert.equal(page.data.spotTabs[2]._id, 'spot-15');
    assert.equal(page.data.activeSpotId, 'spot-15');
    assert.equal(page.data.activeSpotName, '更新后的打卡点15');
    homeData.spots = homeData.spots.filter(item => item._id !== 'spot-15');
    page.onShow();
    await page._tabRefreshPromise;
    assert.equal(page.data.activeSpotId, 'spot-1');
    homeData.spots = [];
    page.onShow();
    await page._tabRefreshPromise;
    assert.equal(page.data.activeSpotId, '');
    assert.deepEqual(page.data.spotTabs, []);

    const wxml = fs.readFileSync(path.resolve(__dirname, "..", "miniprogram", "pages", "index", "index.wxml"), "utf8");
    assert.match(wxml, /class="banner-click-area"[^>]*bindtap="goBanner"/);
    assert.match(wxml, /<video[^>]*catchtap="goBanner"[^>]*data-index=/);
    assert.match(wxml, /class="banner-copy"[^>]*catchtap="goBanner"/);
    assert.match(wxml, /class="feature-card goods-feature"[^>]*bindtap="goPeripheralList"/);
    assert.match(wxml, /class="feature-name">影像周边/);
    assert.match(wxml, /class="feature-link">点击查看/);
    assert.doesNotMatch(wxml, /store-home|影像定制/);
    assert.match(wxml, /class="brand-logo">麓/);
    assert.match(wxml, /class="mini-logo">麓/);
    const launch = fs.readFileSync(path.resolve(__dirname, "..", "miniprogram", "pages", "launch", "launch.wxml"), "utf8");
    assert.match(launch, /class="emblem-char">麓/);

    assert.match(wxml, /lxm-album-card[^>]*bind:tap="onAlbumTap"/);
    assert.match(wxml, /lxm-video-card[^>]*bind:tap="onVideoTap"/);
    assert.match(wxml, /lxm-package-card[^>]*bind:tap="onPackageTap"/);
    assert.match(wxml, /filteredPeripherals/);
    assert.match(wxml, /class="peripheral-card"[^>]*bindtap="onPeripheralTap"/);
    assert.match(wxml, /spotProductLoading/);

    process.stdout.write("Mini program home click test passed.\n");
  } finally {
    page.onUnload();
  }
})().catch((error) => {
  process.stderr.write((error && error.stack) || String(error));
  process.exitCode = 1;
});
