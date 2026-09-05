const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', 'miniprogram');
function walk(d, out = []) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p, out);
    else if (f.name.endsWith('.wxml')) out.push(p);
  }
  return out;
}
const files = [...walk(path.join(ROOT, 'pages')), ...walk(path.join(ROOT, 'components'))];
const results = [];
for (const wxml of files) {
  const wxssPath = wxml.replace(/\.wxml$/, '.wxss');
  if (!fs.existsSync(wxssPath)) continue;
  const html = fs.readFileSync(wxml, 'utf8');
  const css = fs.readFileSync(wxssPath, 'utf8');
  const tapClasses = new Set();
  const tagRe = /<[a-z-]+[^>]*?(?:bind|catch)(?::)?tap[^>]*?>/gi;
  let m;
  while ((m = tagRe.exec(html))) {
    const cm = /class="([^"]*)"/.exec(m[0]);
    if (!cm) continue;
    cm[1].split(/\s+/).forEach(c => {
      c = c.replace(/\{\{.*?\}\}/g, '').trim();
      if (c && /^[A-Za-z][A-Za-z0-9_-]*$/.test(c)) tapClasses.add(c);
    });
  }
  for (const cls of tapClasses) {
    const re = new RegExp('(^|[,\\s])\\.' + cls.replace(/-/g, '\\-') + '\\s*(,[^{]*)?\\{([^}]*)\\}', 'm');
    const rm = re.exec(css);
    if (!rm) { results.push({ wxml, cls, note: 'NORULE' }); continue; }
    const body = rm[3];
    const h = /(?:^|[;\s])height\s*:\s*([0-9.]+)rpx/.exec(body);
    const minh = /min-height\s*:\s*([0-9.]+)rpx/.exec(body);
    const pad = /padding\s*:\s*([^;]+)/.exec(body);
    let height = h ? parseFloat(h[1]) : (minh ? parseFloat(minh[1]) : null);
    let via = h ? 'height' : (minh ? 'min-height' : null);
    if (height === null && pad) {
      const parts = pad[1].trim().split(/\s+/).map(v => {
        const mm = /([0-9.]+)rpx/.exec(v); return mm ? parseFloat(mm[1]) : 0;
      });
      const vpad = parts.length ? parts[0] * 2 : 0;
      const fsz = /font-size\s*:\s*([0-9.]+)rpx/.exec(body);
      const lh = /line-height\s*:\s*([0-9.]+)rpx/.exec(body);
      const text = lh ? parseFloat(lh[1]) : (fsz ? parseFloat(fsz[1]) * 1.4 : 28 * 1.4);
      height = vpad + text; via = 'padding';
    }
    // 已通过伪元素扩展热区的视为达标
    const hitRe = new RegExp('\\.' + cls.replace(/-/g, '\\-') + '(\\s*,[^{]*)?::(after|before)\\s*\\{[^}]*88rpx', 'm');
    const hitRe2 = new RegExp('[,\\s]\\.' + cls.replace(/-/g, '\\-') + '::(after|before)\\s*\\{[^}]*88rpx', 'm');
    if (hitRe.test(css) || hitRe2.test(css)) continue;
    if (height !== null && height < 88) results.push({ wxml, cls, height: Math.round(height), via });
  }
}
const rel = p => path.relative(ROOT, p).replace(/\\/g, '/');
const small = results.filter(r => r.height !== undefined);
const norule = results.filter(r => r.note === 'NORULE');
const byFile = {};
small.forEach(r => { (byFile[rel(r.wxml)] = byFile[rel(r.wxml)] || []).push(r); });
console.log('=== 触摸目标 < 88rpx  共 ' + small.length + ' 处 ===');
for (const f of Object.keys(byFile).sort()) {
  console.log('\n[' + f + ']');
  byFile[f].sort((a, b) => a.height - b.height).forEach(r => {
    console.log('  .' + r.cls.padEnd(28) + ' ' + String(r.height).padStart(3) + 'rpx  (' + r.via + ')');
  });
}
console.log('\n=== 可点击但无样式规则 共 ' + norule.length + ' 处 ===');
norule.forEach(r => console.log('  ' + rel(r.wxml) + '  .' + r.cls));
