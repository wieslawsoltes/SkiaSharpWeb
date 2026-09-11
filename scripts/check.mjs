import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=new URL('../',import.meta.url).pathname;
const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else files.push(p);}}
walk(path.join(root,'dist'));walk(path.join(root,'tests'));let failures=0;
for(const file of files.filter(p=>/\.(js|mjs)$/.test(p))){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status){console.error(result.stderr);failures++;}}
const index=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');for(const [,value]of index.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)){if(!fs.existsSync(path.resolve(root,'dist',value))){console.error('Missing asset',value);failures++;}}
for(const file of files.filter(p=>/\.js$/.test(p)&&!p.includes('/vendor/'))){const source=fs.readFileSync(file,'utf8');for(const [,value]of source.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g)){if(!fs.existsSync(path.resolve(path.dirname(file),value))){console.error('Missing module',file,value);failures++;}}}
if(failures)process.exit(1);console.log(`Validated JavaScript syntax, local imports, and HTML entry assets (${files.length} files).`);
