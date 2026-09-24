"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const navigations = [];
const toasts = [];
let pageDefinition = null;

global.wx = {
  getStorageSync() { return ""; },
  getAccountInfoSync() { return { miniProgram: { envVersion: "develop" } }; },
  showToast(options) { toasts.push(options || {}); },
  navigateTo(options) { navigations.push(options || {}); },
  pageScrollTo() {}
};
global.getApp = () => ({ captureSource: () => ({}) });
global.Page = (definition) => { pageDefinition = definition; };

const pagePath = path.join(root, "miniprogram/pages/photoCollection/photoCollection.js");
delete require.cache[pagePath];
require(pagePath);
assert.ok(pageDefinition, "photo collection page should register");

function createPage() {
  return Object.assign({}, pageDefinition, {
    data: JSON.parse(JSON.stringify(pageDefinition.data)),
    setData(patch, callback) {
      Object.assign(this.data, patch || {});
      if (typeof callback === "function") callback();
    }
  });
}

const catalogData = {
  series: { _id: "series-catalog" },
  packages: [
    { _id: "pkg-main", name: "Catalog main", seriesId: "series-catalog", price: 999 },
    { id: "pkg-id", name: "Catalog id alias", seriesId: "series-catalog", price: 799 },
    { packageId: "pkg-package-id", name: "Catalog package alias", seriesId: "series-catalog", price: 699 },
    { productId: "pkg-product-id", name: "Catalog product alias", seriesId: "series-catalog", price: 599 },
    { _id: "pkg-main", name: "Duplicate must not replace catalog record", seriesId: "series-catalog", price: 1 }
  ],
  featuredPackages: [
    { _id: "stale-featured", name: "Stale featured" },
    { id: "pkg-main", name: "Stale metadata must not win" },
    { packageId: "pkg-id", name: "Another stale metadata record" }
  ],
  spotPackages: [
    { packageId: "pkg-main" },
    { id: "pkg-package-id" },
    { _id: "pkg-package-id" },
    { productId: "pkg-product-id" },
    { id: "stale-spot" }
  ],
  collections: []
};

const page = createPage();
page.applyCollectionData(catalogData);

assert.deepEqual(page.data.packages.map((item) => item._id), ["pkg-main", "pkg-id", "pkg-package-id", "pkg-product-id"]);
assert.ok(page.data.packages.every((item) => item._id === item.id && item.id === item.packageId));
assert.deepEqual(page.data.featuredPackages.map((item) => item._id), ["pkg-main", "pkg-id"]);
assert.equal(page.data.featuredPackage.name, "Catalog main", "recommendations must use catalog records");
assert.deepEqual(page.data.spotPackages.map((item) => item._id), ["pkg-package-id", "pkg-product-id"]);
assert.equal(page.data.hasPackageRecommendations, true);

page.goPackageDetail({ detail: { id: "stale-featured" } });
assert.equal(navigations.length, 0, "stale recommendation IDs must not navigate");
assert.equal(toasts.at(-1).title, "旅拍套餐不存在");

page.goPackageDetail({ detail: { packageId: "pkg-package-id" } });
assert.equal(navigations.length, 1, "catalog package aliases must still navigate");
assert.match(navigations[0].url, /packageId=pkg-package-id/);
assert.match(navigations[0].url, /productId=pkg-package-id/);

page.goPackageDetail({ detail: { productId: "pkg-product-id" } });
assert.equal(navigations.length, 2, "productId-only catalog records must still navigate");
assert.match(navigations[1].url, /packageId=pkg-product-id/);
assert.match(navigations[1].url, /productId=pkg-product-id/);

const staleOnlyPage = createPage();
staleOnlyPage.applyCollectionData({
  series: { _id: "series-catalog" },
  packages: [{ _id: "pkg-real", name: "Only real package", seriesId: "series-catalog" }],
  featuredPackages: [{ id: "removed-feature" }],
  spotPackages: [{ packageId: "removed-spot" }],
  collections: []
});
assert.equal(staleOnlyPage.data.hasPackageRecommendations, false);
assert.equal(staleOnlyPage.data.featuredPackage, null);
assert.deepEqual(staleOnlyPage.data.spotPackages, []);

const template = fs.readFileSync(path.join(root, "miniprogram/pages/photoCollection/photoCollection.wxml"), "utf8");
assert.match(template, /<block wx:if="\{\{hasPackageRecommendations\}\}">/);
assert.equal(/<lxm-empty-state[^>]*type="package"/.test(template), false);

const { buildPhotoPackageDetail } = require(path.join(root, "miniprogram/service/packageDetail.js"));
const detailData = {
  mainPushPackages: [{ _id: "photo-main", name: "Photo main", productType: "photo" }],
  spotPackages: [{ _id: "photo-secondary", name: "Photo secondary", productType: "photo" }],
  packages: [{ _id: "video-only", name: "Video product", productType: "video" }]
};
assert.equal(buildPhotoPackageDetail(detailData, { packageId: "missing-package" }).selectedPackage, null);
assert.equal(buildPhotoPackageDetail(detailData, { packageId: "video-only" }).selectedPackage, null);

process.stdout.write("Photo collection package guard test passed.\n");
