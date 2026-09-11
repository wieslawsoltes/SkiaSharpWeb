import fs from 'node:fs';
const root=new URL('../',import.meta.url),dist=new URL('dist/',root);
for(const file of ['README.md','COMPATIBILITY.md'])fs.copyFileSync(new URL(file,root),new URL(file,dist));
for(const folder of ['docs','native'])fs.cpSync(new URL(folder,root),new URL(folder,dist),{recursive:true});
console.log('Copied release documentation and native build sources into the sample distribution.');
