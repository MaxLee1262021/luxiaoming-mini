/**
 * 设计令牌一致性校验：
 *  1) 所有 .wxss 花括号配平
 *  2) 所有被引用的 var(--lxm-*) 都在 app.wxss 里有定义
 *  3) 品牌调色板硬编码（应改用令牌）
 *  4) 字号 / 字重是否落在既定刻度上
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
const rel = p => path.relative(ROOT, p).replace(/\\/g, '/');
const app = fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8');
const files = walk(ROOT, '.wxss');

// 1) 括号配平
const unbalanced = [];
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const o = (s.match(/{/g) || []).length, c = (s.match(/}/g) || []).length;
  if (o !== c) unbalanced.push(rel(f) + '  { =' + o + '  } =' + c);
}
console.log('【1】花括号配平：' + (unbalanced.length ? '✗ ' + unbalanced.length + ' 个文件失衡\n  ' + unbalanced.join('\n  ') : '✓ 全部 ' + files.length + ' 个 .wxss 通过'));

// 2) 令牌定义完整性
const defined = new Set();
let dm; const dre = /(--lxm-[a-z0-9-]+)\s*:/g;
while ((dm = dre.exec(app))) defined.add(dm[1]);
const missing = new Map();
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  let m; const re = /var\(\s*(--lxm-[a-z0-9-]+)\s*(?:,[^)]*)?\)/g;
  while ((m = re.exec(s))) {
    if (!defined.has(m[1])) {
      if (!missing.has(m[1])) missing.set(m[1], new Set());
      missing.get(m[1]).add(rel(f));
    }
  }
}
console.log('【2】令牌定义完整性：' + (missing.size ? '✗ ' + missing.size + ' 个未定义令牌' : '✓ 已定义 ' + defined.size + ' 个令牌，引用全部有效'));
for (const [k, v] of missing) console.log('  ' + k + '  ← ' + [...v].join(', '));

// 3) 品牌调色板硬编码
const palette = /#(2A211B|EE2C2C|FF8D52|FFD36A|FFF7EF|F6F1EC|CC1F1F|E0662A|766459|B8A8A0|9C877A|FFE8DC)/gi;
const hard = [];
for (const f of files) {
  if (rel(f) === 'app.wxss') continue;
  const s = fs.readFileSync(f, 'utf8');
  const hits = s.match(palette);
  if (hits) hard.push(rel(f) + '  ' + hits.length + ' 处');
}
console.log('【3】品牌色硬编码：' + (hard.length ? '✗\n  ' + hard.join('\n  ') : '✓ 无（全部走令牌）'));

// 4) 字号 / 字重刻度
const FZ = new Set([20, 23, 26, 28, 32, 38, 44, 52]);
const FW = new Set([400, 700, 900]);
const offScale = [];
for (const f of files) {
  if (rel(f) === 'app.wxss') continue;
  const s = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  let m;
  const fzRe = /font-size\s*:\s*([0-9.]+)rpx/g;
  while ((m = fzRe.exec(s))) if (!FZ.has(parseFloat(m[1]))) offScale.push(rel(f) + '  font-size:' + m[1] + 'rpx');
  const fwRe = /font-weight\s*:\s*([0-9]+)\b/g;
  while ((m = fwRe.exec(s))) if (!FW.has(parseInt(m[1]))) offScale.push(rel(f) + '  font-weight:' + m[1]);
}
console.log('【4】字号/字重刻度：' + (offScale.length ? '⚠ ' + offScale.length + ' 处越界\n  ' + offScale.join('\n  ') : '✓ 全部落在既定刻度'));
