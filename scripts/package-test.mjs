// Test the supplied immutable tarball, or build one for local validation.
import { execFileSync } from 'node:child_process';
import { root } from './packaging/common.mjs';
import { resolve } from 'node:path';
execFileSync(process.execPath,[resolve(root,'scripts/verify-package.mjs'),...process.argv.slice(2)],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/verify-package-types.mjs')],{cwd:root,stdio:'inherit'});
