/**
 * 死 CSS 检测：找出 .wxss 里定义了但 .wxml / .js 中从未出现的类名。
 * 保守策略——以下情况一律不报，避免误删：
 *   1) 类名在同目录 .js 中以字符串形式出现（动态拼接 class）
 *   2) 类名是某个模板插值前缀（如 .status-paid 对应 {{'status-'+x}}）
 *   3) 全局工具类（lxm- 开头）与 app.wxss 定义
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', 'miniprogram');

function walk(d, ext, out = []) {
  if (!fs.existsSync(d)) return out;
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p, ext, out);
    else if (f.name.endsWith(ext)) out.push(p);
  }
  return out;
}

const wxssFiles = [...walk(path.join(ROOT, 'pages'), '.wxss'), ...walk(path.join(ROOT, 'components'), '.wxss')];
const globalWxml = walk(ROOT, '.wxml').map(f => fs.readFileSync(f, 'utf8')).join('\n');
const globalJs = walk(ROOT, '.js').map(f => fs.readFileSync(f, 'utf8')).join('\n');

let total = 0;
const report = [];

for (const wxss of wxssFiles) {
  const wxml = wxss.replace(/\.wxss$/, '.wxml');
  const js = wxss.replace(/\.wxss$/, '.js');
  if (!fs.existsSync(wxml)) continue;
  const css = fs.readFileSync(wxss, 'utf8');
  const html = fs.readFileSync(wxml, 'utf8');
  const script = fs.existsSync(js) ? fs.readFileSync(js, 'utf8') : '';

  const classes = new Set();
  const re = /\.([a-zA-Z][a-zA-Z0-9_-]*)/g;
  let m;
  // 去掉注释再扫，避免注释里的类名被计入
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  while ((m = re.exec(clean))) classes.add(m[1]);

  const dead = [];
  for (const c of classes) {
    if (c.startsWith('lxm-')) continue;                 // 全局/组件根类
    if (html.includes(c)) continue;                     // 本页模板出现
    if (script.includes(c)) continue;                   // 本页脚本动态拼接
    if (globalWxml.includes(c)) continue;               // 其它模板（组件外部样式）
    if (globalJs.includes(c)) continue;                 // 其它脚本
    // 前缀匹配：.status-paid 而模板里写 {{'status-'+s}}
    const parts = c.split('-');
    let prefixHit = false;
    for (let i = 1; i < parts.length; i++) {
      const pre = parts.slice(0, i).join('-') + '-';
      if (html.includes(pre) || script.includes(pre)) { prefixHit = true; break; }
    }
    if (prefixHit) continue;
    dead.push(c);
  }
  if (dead.length) {
    total += dead.length;
    report.push({ file: path.relative(ROOT, wxss).replace(/\\/g, '/'), dead: dead.sort() });
  }
}

console.log('=== 疑似死 CSS 类（共 ' + total + ' 个，已排除动态类名）===');
for (const r of report.sort((a, b) => b.dead.length - a.dead.length)) {
  console.log('\n[' + r.file + ']  ' + r.dead.length + ' 个');
  console.log('  ' + r.dead.join(', '));
}
