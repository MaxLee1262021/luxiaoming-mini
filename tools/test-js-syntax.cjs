const fs = require('fs'); const path = require('path'); const cp = require('child_process');
const root = path.resolve(__dirname, '..', 'miniprogram');
function walk(d, out=[]) { for (const x of fs.readdirSync(d,{withFileTypes:true})) { const p=path.join(d,x.name); if(x.isDirectory()) walk(p,out); else if(x.name.endsWith('.js')) out.push(p); } return out; }
const files=walk(root); const bad=[]; for(const f of files){const r=cp.spawnSync(process.execPath,['--check',f],{encoding:'utf8'}); if(r.status!==0) bad.push({f,err:r.stderr});}
if(bad.length){console.error(JSON.stringify(bad,null,2));process.exit(1)} console.log(`JS syntax PASS (${files.length} files)`)
