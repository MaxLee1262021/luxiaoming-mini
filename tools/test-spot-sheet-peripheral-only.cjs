"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const filename = path.resolve(__dirname, "../miniprogram/pages/spotSheet/spotSheet.js");
const nativeRequire = createRequire(filename);
const markup = fs.readFileSync(filename.replace(/\.js$/, ".wxml"), "utf8");

function fixture() {
  let definition;
  const navigations = [];
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    Page(value) { definition = value; },
    getApp: () => ({}),
    wx: { navigateTo(options) { navigations.push(options.url); } },
    require: nativeRequire,
    console
  }, { filename });
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) { Object.assign(this.data, patch); } };
  return { page, navigations };
}

function peripheralSectionVisible(data) {
  const expression = markup.match(/<view class="sheet-section" wx:if="\{\{([^}]+)\}\}">\s*<view class="sheet-section-head">\s*<text class="sheet-section-title">影像周边<\/text>/)?.[1];
  assert.ok(expression, "the peripheral section must have its own visibility condition");
  return !!vm.runInNewContext(expression, data);
}

test("a point with only peripherals shows its matching shelf and keeps custom booking available", () => {
  const { page } = fixture();
  page.applyCatalog({ success: true, data: { allSeries: [], allAlbums: [], allPackages: [] } }, {
    success: true,
    data: [
      { _id: "per-only", name: "打卡纪念相框", spotIds: ["point-only"], status: "上架", isShow: true },
      { _id: "per-other", name: "其他点位周边", spotIds: ["point-other"], status: "上架", isShow: true },
      { _id: "per-hidden", name: "隐藏周边", spotIds: ["point-only"], status: "下架", isShow: false }
    ]
  });
  page.applySpot({ _id: "point-only", name: "江边" });
  assert.equal(page.data.spotNoMedia, true, "no photo or video product still permits the custom booking empty state");
  assert.equal(page.data.selectedSpotProducts.peripherals.length, 1);
  assert.equal(page.data.selectedSpotProducts.peripherals[0]._id, "per-only");
  assert.equal(peripheralSectionVisible(page.data), true, "peripherals must remain visible even without photo/video products");
  assert.match(markup, /<lxm-custom-booking-card\s+wx:if="\{\{spotNoMedia\}\}"/);
  page.applySpot({ _id: "point-empty", name: "空点位" });
  assert.equal(peripheralSectionVisible(page.data), false, "an empty peripheral shelf stays hidden");
});

test("the visible peripheral card opens the clicked product and preserves merchant source", () => {
  const { page, navigations } = fixture();
  page.setData({ shopId: "shop one", scene: "qr & referral" });
  assert.match(markup, /class="peripheral-card" bindtap="onPeripheralTap" data-id="\{\{item\._id\}\}"/);
  page.onPeripheralTap({ currentTarget: { dataset: { id: "per-only" } } });
  const url = new URL(navigations[0], "https://mini.test");
  assert.equal(url.pathname, "/pages/peripherals/peripherals");
  assert.equal(url.searchParams.get("id"), "per-only");
  assert.equal(url.searchParams.get("shopId"), "shop one");
  assert.equal(url.searchParams.get("scene"), "qr & referral");
});
