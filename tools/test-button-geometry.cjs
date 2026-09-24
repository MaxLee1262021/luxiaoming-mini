"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "miniprogram");
const baseRule = /button\s*\{[\s\S]*?box-sizing:\s*border-box;[\s\S]*?display:\s*flex;[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;[\s\S]*?line-height:\s*1\s*!important;[\s\S]*?text-align:\s*center;/;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

assert.match(read("app.wxss"), baseRule, "page buttons must use geometric flex centering");
assert.match(read("app.wxss"), /button\[size="mini"\]\s*\{\s*display:\s*inline-flex;/, "mini buttons must retain inline sizing");

for (const component of [
  "components/lxm-file-picker/lxm-file-picker.wxss",
  "components/lxm-album-card/lxm-album-card.wxss",
  "components/lxm-video-card/lxm-video-card.wxss",
  "components/lxm-empty-state/lxm-empty-state.wxss",
  "components/lxm-privacy-modal/lxm-privacy-modal.wxss"
]) {
  assert.match(read(component), baseRule, `${component} must center buttons inside its isolated style scope`);
}

assert.match(read("components/lxm-file-picker/lxm-file-picker.wxss"), /button\[size="mini"\]\s*\{\s*display:\s*inline-flex;/);
const myStyles = read("pages/my/my.wxss");
assert.match(myStyles, /\.logout-area\s*\{[\s\S]*?display:\s*flex;[\s\S]*?width:\s*100%;/);
assert.match(myStyles, /\.logout-btn\s*\{[\s\S]*?flex:\s*1\s+1\s+0;[\s\S]*?padding:\s*0;[\s\S]*?display:\s*flex;[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;/);
assert.match(myStyles, /\.contact-hit\s*\{\s*display:\s*block;/);

process.stdout.write("Mini-program button geometry checks passed.\n");
