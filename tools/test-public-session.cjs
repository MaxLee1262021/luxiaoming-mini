"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const storage = new Map();
const requests = [];
global.wx = {
  getStorageSync(key) { return storage.get(key) || ""; },
  setStorageSync(key, value) { storage.set(key, value); },
  removeStorageSync(key) { storage.delete(key); },
  getAccountInfoSync() { return { miniProgram: { envVersion: "develop" } }; },
  login({ success }) { success({ code: "synthetic-code" }); },
  request(options) {
    requests.push(options);
    if (options.url.endsWith("/rpc/login")) {
      options.success({ statusCode: 200, data: { success: true, openid: "synthetic-openid", token: "synthetic-public-token" } });
      return;
    }
    if (options.url.endsWith("/rpc/getMyProfile")) {
      options.success({ statusCode: 200, data: { success: true, data: { openid: "synthetic-openid", phone: "13900139000" } } });
      return;
    }
    if (options.url.endsWith("/rpc/bindPhone")) {
      options.success({ statusCode: 200, data: { success: true, data: { openid: "synthetic-openid", phone: "13900139000" } } });
      return;
    }
    options.success({ statusCode: 200, data: { success: true, data: [] } });
  },
};

const clientPath = path.resolve(__dirname, "..", "miniprogram", "api", "client.js");
const userStorePath = path.resolve(__dirname, "..", "miniprogram", "store", "userStore.js");
delete require.cache[clientPath];
delete require.cache[userStorePath];
const { callCloud, getOpenid, logout, requestAuthenticated } = require(clientPath);
const userStore = require(userStorePath);

(async () => {
  const result = await callCloud("getMyOrders", {});
  assert.equal(result.success, true);
  assert.equal(getOpenid(), "synthetic-openid");
  assert.equal(storage.get("lxm_public_token"), "synthetic-public-token");
  assert.equal(requests.length, 2);
  assert.equal(requests[1].header.Authorization, "Bearer synthetic-public-token");
  const profile = await userStore.syncUserProfile();
  assert.equal(profile.openid, "synthetic-openid");
  assert.equal(profile.phone, "13900139000");
  assert.equal(userStore.getBoundPhone(), "13900139000");
  assert.equal(requests.length, 3);
  assert.match(requests[2].url, /\/rpc\/getMyProfile$/);
  assert.equal(requests[2].header.Authorization, "Bearer synthetic-public-token");

  logout();
  userStore.clearUser();
  assert.equal(getOpenid(), "");
  assert.equal(storage.has("lxm_openid"), false);
  assert.equal(storage.has("lxm_public_token"), false);
  assert.equal(storage.has("lxm_user_profile"), false);
  assert.equal(storage.has("userInfo"), false);
  assert.equal(userStore.isLoggedOut(), true);
  assert.equal(userStore.isAuthed(), false);
  assert.equal(userStore.getBoundPhone(), "");
  await assert.rejects(() => callCloud("getMyOrders", {}), /当前已退出登录/);
  await assert.rejects(() => requestAuthenticated("/files/signed", {}), /当前已退出登录/);

  const restored = await userStore.bindPhoneByCode("restored-code");
  assert.equal(restored.phone, "13900139000");
  assert.equal(userStore.isLoggedOut(), false);
  assert.equal(userStore.isAuthed(), true);
  process.stdout.write("Public session token test passed.\n");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
