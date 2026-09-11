import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
export const root = fileURLToPath(new URL('../../', import.meta.url));
export const readJson = path => JSON.parse(readFileSync(resolve(root,path),'utf8'));
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const digest = path => hash(readFileSync(resolve(root,path)));
export function walk(directory) {
  const full = resolve(root,directory), files=[];
  for (const name of readdirSync(full).sort()) {
    const path=resolve(full,name),stat=lstatSync(path);
    if(stat.isSymbolicLink())throw new Error(`Symlinks are not permitted in release inputs: ${path}`);
    const rel=relative(root,path).split(sep).join('/');
    if(stat.isDirectory())files.push(...walk(rel));else if(stat.isFile())files.push(rel);
  }
  return files;
}
export function npm(args, options={}) {
  const cli=process.env.npm_execpath;
  if(cli&&existsSync(cli)&&cli.endsWith('.js'))return execFileSync(process.execPath,[cli,...args],{cwd:root,encoding:'utf8',...options});
  // On Windows npm.cmd needs a shell. Arguments are controlled by this repository,
  // never interpolated from release tags or untrusted package contents.
  return execFileSync(process.platform==='win32'?'npm.cmd':'npm',args,{cwd:root,encoding:'utf8',shell:process.platform==='win32',...options});
}
export function assertReleaseTag(tag, version) {
  if(!/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(tag)||tag!==`v${version}`)throw new Error('Release tag must exactly match package.json version.');
  return version.includes('-')?'next':'latest';
}
