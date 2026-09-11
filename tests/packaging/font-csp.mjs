// Executed by native CI with --disallow-code-generation-from-strings.
// Uses existing repository test assets; none enter the runtime package.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Initialize } from '../../dist/package/node.js';
const S=await Initialize(),bytes=readFileSync(new URL('../fixtures/RobotoFlex-Variable.woff2',import.meta.url));
const face=S.SKTypeface.FromData(bytes);
try {
 assert.equal(face.FamilyName,'Roboto Flex');
 const variable=face.Clone(new S.SKFontArguments().SetVariationDesignPosition({wght:900}));
 try {const font=new S.SKFont(variable,32);try{assert(font.MeasureText('Package CSP')>0);const path=font.GetGlyphPath(variable.GetGlyphs('A')[0]);try{assert(path.PointCount>0);}finally{path.Dispose();}}finally{font.Dispose();}}
 finally {variable.Dispose();}
} finally {face.Dispose();}
console.log('WOFF2 decode, variable instancing, text metrics and glyph outline passed without JavaScript string compilation.');
