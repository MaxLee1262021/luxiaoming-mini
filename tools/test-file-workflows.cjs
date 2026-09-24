'use strict';

const assert = require('node:assert/strict');
const storage = new Map();
let requests = [];
let uploads = [];
let downloads = [];
let previews = [];
let saves = [];
let sequence = 0;
let state = {};

function reset() {
  requests = []; uploads = []; downloads = []; previews = []; saves = [];
  state = { size: 1200, imageType: 'png', completeFailures: 0, downloadCodes: [200] };
}
reset();
global.wx = {
  getStorageSync: key => storage.get(key) || '',
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: key => storage.delete(key),
  getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
  login({ success }) { success({ code: 'synthetic-code' }); },
  request(options) {
    requests.push(options);
    if (options.url.endsWith('/rpc/login')) {
      options.success({ statusCode: 200, data: { success: true, openid: 'owner', token: 'session-' + (++sequence) } });
    } else if (options.url.endsWith('/upload-intent')) {
      options.success({ statusCode: 200, data: { ok: true, data: { fileId: 'file-own', uploadUrl: 'https://storage.example.invalid/', fields: { key: 'private/test.png', policy: 'synthetic-policy' } } } });
    } else if (options.url.endsWith('/complete')) {
      const failed = state.completeFailures-- > 0;
      options.success({ statusCode: failed ? 503 : 200, data: failed ? { error: '确认暂时失败' } : { ok: true, data: { fileId: 'file-own', name: 'test.png', type: 'image', size: 1200 } } });
    } else if (options.url.endsWith('/access')) {
      const code = state.accessStatus || 200;
      const attempt = requests.filter(item => item.url.endsWith('/access')).length;
      options.success({ statusCode: code, data: code >= 400 ? { error: '没有文件访问权限' } : { ok: true, data: { url: 'https://storage.example.invalid/file?signature=' + attempt, expiresAt: '2099-01-01' } } });
    } else options.success({ statusCode: 200, data: { ok: true, data: {} } });
  },
  getImageInfo({ success }) { success({ type: state.imageType }); },
  getFileInfo({ success }) { success({ size: state.size }); },
  uploadFile(options) {
    uploads.push(options);
    if (!state.stallUpload) setImmediate(() => options.success({ statusCode: state.uploadStatus || 204 }));
    return { onProgressUpdate(callback) { callback({ progress: 100 }); }, abort() { options.fail({ errMsg: 'uploadFile:fail abort' }); } };
  },
  downloadFile(options) {
    downloads.push(options);
    setImmediate(() => options.success({ statusCode: state.downloadCodes.shift() || 200, tempFilePath: '/synthetic/file.png' }));
    return { onProgressUpdate(callback) { callback({ progress: 100 }); }, abort() { options.fail({ errMsg: 'downloadFile:fail abort' }); } };
  },
  previewImage(options) { previews.push(options); options.success(); },
  previewMedia(options) { previews.push(options); options.success(); },
  saveImageToPhotosAlbum(options) {
    saves.push(options);
    if (state.denySave) options.fail({ errMsg: 'saveImageToPhotosAlbum:fail auth deny' });
    else options.success();
  },
  saveVideoToPhotosAlbum(options) { saves.push(options); options.success(); },
  showToast() {},
};

const client = require('../miniprogram/api/client');
const upload = require('../miniprogram/service/fileUpload');
const media = require('../miniprogram/service/mediaFiles');
const orderApi = require('../miniprogram/api/order');
const orderFiles = require('../miniprogram/service/orderFileActions');

function page(extra = {}) {
  return { ...orderFiles.actions, data: { ...orderFiles.data, order: { _id: 'order-own', canAfterSale: true }, ...extra },
    setData(patch) { Object.assign(this.data, patch); }, async loadOrder() { this.reloaded = true; } };
}

async function test(name, run) {
  reset();
  await run();
  process.stdout.write('PASS ' + name + '\n');
}

(async () => {
  await test('relative public media expands without altering local assets or signatures', async () => {
    const data = client.normalizeMediaUrls({ cover: '/api/media/f1', images: ['/uploads/old.png', '/images/placeholder.png'], url: 'https://storage.example.invalid/a?signature=x%2Fy' });
    assert.equal(data.cover, 'http://localhost:5192/api/media/f1');
    assert.equal(data.images[0], 'http://localhost:5192/uploads/old.png');
    assert.equal(data.images[1], '/images/placeholder.png');
    assert.equal(data.url, 'https://storage.example.invalid/a?signature=x%2Fy');
  });
  await test('upload completes only after OSS success and never sends the app token to OSS', async () => {
    const result = await upload.uploadImage({ path: '/tmp/image.png' }, { purpose: 'after-sale', orderId: 'order-own' }).promise;
    assert.equal(result.fileId, 'file-own');
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].name, 'file');
    assert.equal(uploads[0].header, undefined);
    assert.deepEqual(uploads[0].formData, { key: 'private/test.png', policy: 'synthetic-policy' });
    const intent = requests.find(item => item.url.endsWith('/upload-intent'));
    assert.match(intent.header.Authorization, /^Bearer session-/);
    assert.equal(intent.data.orderId, 'order-own');
    assert.equal(intent.data.mimeType, 'image/png');
    assert.equal(intent.data.size, 1200);
  });
  await test('actual file size and format reject invalid images before reserving storage', async () => {
    state.size = 20 * 1024 * 1024 + 1;
    await assert.rejects(upload.uploadImage({ path: '/tmp/image.png', size: 1 }, { purpose: 'after-sale' }).promise, /20 MB/);
    state.size = 100;
    state.imageType = 'gif';
    await assert.rejects(upload.uploadImage({ path: '/tmp/image.png' }, { purpose: 'after-sale' }).promise, /JPG/);
    assert.equal(requests.length, 0);
    assert.equal(uploads.length, 0);
  });
  await test('cancel aborts transfer and prevents complete', async () => {
    state.stallUpload = true;
    const job = upload.uploadImage({ path: '/tmp/image.png' }, { purpose: 'after-sale' });
    const failure = assert.rejects(job.promise, error => error.cancelled === true);
    await new Promise(setImmediate);
    job.cancel();
    await failure;
    assert.equal(requests.some(item => item.url.endsWith('/complete')), false);
  });
  await test('failed completion can retry without sending the object twice', async () => {
    state.completeFailures = 1;
    const checkpoint = {};
    await assert.rejects(upload.uploadImage({ path: '/tmp/image.png' }, { purpose: 'after-sale', checkpoint }).promise, /确认/);
    assert.equal(checkpoint.uploaded, true);
    await upload.uploadImage({ path: '/tmp/image.png' }, { purpose: 'after-sale', checkpoint }).promise;
    assert.equal(uploads.length, 1);
    assert.equal(requests.filter(item => item.url.endsWith('/complete')).length, 2);
  });
  await test('OSS rejects do not mark files complete', async () => {
    state.uploadStatus = 403;
    await assert.rejects(upload.uploadImage({ path: '/tmp/image.png' }, { purpose: 'after-sale' }).promise, /上传失败/);
    assert.equal(requests.some(item => item.url.endsWith('/complete')), false);
  });
  await test('expired app session is cleared and retry authenticates again', async () => {
    const initialSequence = sequence;
    state.accessStatus = 401;
    await assert.rejects(client.requestAuthenticated('/files/own/access'), /权限/);
    assert.equal(storage.has('lxm_public_token'), false);
    state.accessStatus = 200;
    await client.requestAuthenticated('/files/own/access');
    assert.equal(sequence, initialSequence + 1);
  });
  await test('denied file access never falls back to an embedded URL or downloads bytes', async () => {
    state.accessStatus = 403;
    const file = { fileId: 'other-file', url: 'https://untrusted.example.invalid/bypass.png' };
    await assert.rejects(media.previewFile(file), /权限/);
    await assert.rejects(media.downloadToAlbum(file).promise, /权限/);
    assert.equal(previews.length, 0);
    assert.equal(downloads.length, 0);
  });
  await test('download reauthorizes one expired signed URL and saves the retried file', async () => {
    state.downloadCodes = [403, 200];
    await media.downloadToAlbum({ fileId: 'file-own', type: 'image' }).promise;
    assert.equal(downloads.length, 2);
    assert.notEqual(downloads[0].url, downloads[1].url);
    assert.equal(downloads[0].header, undefined);
    assert.equal(saves.length, 1);
    assert.ok(requests.filter(item => item.url.endsWith('/access')).every(item => item.data.download === true));
  });
  await test('album permission denial returns actionable feedback without success', async () => {
    state.denySave = true;
    await assert.rejects(media.downloadToAlbum({ fileId: 'file-own' }).promise, error => error.permissionDenied && /设置/.test(error.message));
  });
  await test('video preview gets a fresh authorized URL on each action', async () => {
    await media.previewFile({ fileId: 'file-video', type: 'video' });
    await media.previewFile({ fileId: 'file-video', type: 'video' });
    assert.equal(previews[0].sources[0].type, 'video');
    assert.notEqual(previews[0].sources[0].url, previews[1].sources[0].url);
  });
  await test('unfinished attachments block ticket creation; server failures preserve the draft', async () => {
    let called = 0;
    orderApi.submitAfterSale = async () => { called++; throw new Error('服务暂不可用'); };
    const instance = page({ afterSalePending: true, afterSaleReason: '希望补发照片文件', afterSaleFiles: [{ fileId: 'evidence-own' }] });
    await instance.submitAfterSale();
    assert.equal(called, 0);
    instance.data.afterSalePending = false;
    await instance.submitAfterSale();
    assert.equal(called, 1);
    assert.equal(instance.data.afterSaleFiles.length, 1);
    assert.equal(instance.data.afterSaleReason, '希望补发照片文件');
    assert.equal(instance.data.afterSaleSubmitting, false);
  });
  await test('successful ticket binds completed evidence and refreshes the order', async () => {
    let payload;
    orderApi.submitAfterSale = async data => { payload = data; return { success: true, data: { ticketId: 'ticket-own' } }; };
    const instance = page({ afterSaleVisible: true, afterSaleReason: '希望补发照片文件', afterSaleTypeIndex: 3, afterSaleFiles: [{ fileId: 'evidence-own' }] });
    await instance.submitAfterSale();
    assert.deepEqual(payload.attachmentFileIds, ['evidence-own']);
    assert.equal(payload.orderId, 'order-own');
    assert.equal(payload.type, '补发成片');
    assert.equal(instance.data.afterSaleVisible, false);
    assert.equal(instance.reloaded, true);
  });
  await test('existing active ticket prevents another application and exposes only returned evidence', async () => {
    orderApi.getMyAfterSales = async () => ({ success: true, data: [{ id: 'ticket', status: 'pending', attachments: [{ fileId: 'evidence', name: '凭证.png' }] }] });
    const instance = page();
    await instance.loadAfterSales();
    assert.equal(instance.data.canRequestAfterSale, false);
    assert.equal(instance.data.afterSaleRecords[0].attachments[0].fileId, 'evidence');
  });
  await test('evidence picker caps selection at nine and stays pending until failed items are retried or removed', async () => {
    const originalChoose = upload.chooseImages;
    const originalUpload = upload.uploadImage;
    let definition;
    global.Component = value => { definition = value; };
    require('../miniprogram/components/lxm-file-picker/lxm-file-picker');
    let failLast = true;
    upload.chooseImages = async () => Array.from({ length: 12 }, (_, index) => ({ path: '/tmp/evidence-' + index + '.png' }));
    upload.uploadImage = file => ({
      promise: failLast && file.path.includes('-8.') ? Promise.reject(new Error('模拟网络失败')) : Promise.resolve({ fileId: file.path }),
      cancel() {},
    });
    const changes = [];
    const instance = { ...definition.methods, properties: { orderId: 'order-own', disabled: false },
      data: { items: [], selecting: false }, setData(patch) { Object.assign(this.data, patch); },
      triggerEvent(name, detail) { changes.push(detail); } };
    definition.lifetimes.attached.call(instance);
    try {
      await instance.choose();
      await new Promise(setImmediate);
      assert.equal(instance.data.items.length, 9);
      assert.equal(changes.at(-1).files.length, 8);
      assert.equal(changes.at(-1).pending, true);
      failLast = false;
      instance.retry({ currentTarget: { dataset: { key: instance.data.items[8].key } } });
      await new Promise(setImmediate);
      assert.equal(changes.at(-1).files.length, 9);
      assert.equal(changes.at(-1).pending, false);
      instance.remove({ currentTarget: { dataset: { key: instance.data.items[0].key } } });
      assert.equal(changes.at(-1).files.length, 8);
    } finally {
      definition.lifetimes.detached.call(instance);
      upload.chooseImages = originalChoose;
      upload.uploadImage = originalUpload;
    }
  });
  process.stdout.write('File upload and customer delivery workflow checks passed.\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
