"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

let pageConfig = null;

global.wx = {
  getStorageSync() { return ""; },
  setStorageSync() {},
  removeStorageSync() {},
  getAccountInfoSync() { return { miniProgram: { envVersion: "develop" } }; },
  navigateTo() {},
  showToast() {},
  request(options) {
    const name = String(options.url || "").split("/rpc/").pop();
    const data = {
      getSpots: {
        success: true,
        data: [{ _id: "spot-a", name: "橘子洲", cityId: "city-cs", city: "长沙", status: "启用", isShow: true }]
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

  process.stdout.write("Mini program spot-sheet data-flow test passed.\n");
})().catch((error) => {
  process.stderr.write((error && error.stack) || String(error));
  process.exitCode = 1;
});
