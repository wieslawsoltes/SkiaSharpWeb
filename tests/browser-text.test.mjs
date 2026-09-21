import test from 'node:test';
import assert from 'node:assert/strict';
import { CanvasFont, ConfigureCanvasText, TextRasterSignature, GetDeviceTextGeometry, CreateTextRasterPlan } from '@wieslawsoltes/skiasharpweb/browser-text';
const metrics = { Width: 40, Left: 5, Right: 42, Ascent: 15, Descent: 4 };
const geometry = { ScaleX: 1.25, ScaleY: 1.75, PhaseX: .2, PhaseY: .7, AxisAligned: true };
test('browser text: import works without DOM or native runtime', () => {
    assert.equal(typeof globalThis.document, 'undefined');
    assert.equal(CanvasFont({FontFamily:'serif',Style:'Italic',Weight:600},14), 'italic 600 14px serif');
});
test('browser text: canvas typography is completely reset between callers', () => {
    const context = { fontStretch:'',fontKerning:'',textRendering:'',letterSpacing:'',wordSpacing:'' };
    ConfigureCanvasText(context,{FontFamily:'sans-serif',Stretch:3},16,{FlowDirection:'RightToLeft',LetterSpacing:1,WordSpacing:2,FontKerning:'none'});
    assert.equal(context.direction,'rtl'); assert.equal(context.fontStretch,'condensed'); assert.equal(context.letterSpacing,'1px');
    ConfigureCanvasText(context,{FontFamily:'serif'},14);
    assert.equal(context.direction,'ltr'); assert.equal(context.letterSpacing,'0px'); assert.equal(context.wordSpacing,'0px'); assert.equal(context.fontStretch,'normal'); assert.equal(context.fontKerning,'auto');
    assert.throws(()=>ConfigureCanvasText({}, {FontFamily:'serif'},14,{LetterSpacing:1}), /unavailable/);
});
test('browser text: signature distinguishes every supported shaping option', () => {
    const tf={FontFamily:'serif'}, initial=TextRasterSignature(tf,14);
    for(const [key,value] of [['FlowDirection','RightToLeft'],['LetterSpacing',1],['WordSpacing',2],['FontKerning','none'],['TextRendering','optimizeLegibility']]) assert.notDeepEqual(TextRasterSignature(tf,14,{[key]:value}),initial);
    assert.notDeepEqual(TextRasterSignature({...tf,Stretch:3},14),initial);
});
test('browser text: browser TextMetrics and PascalCase ink bounds agree', () => {
    const a=CreateTextRasterPlan(metrics,14,geometry), b=CreateTextRasterPlan({width:40,actualBoundingBoxLeft:5,actualBoundingBoxRight:42,actualBoundingBoxAscent:15,actualBoundingBoxDescent:4},14,geometry);
    assert.deepEqual([...a.Tiles()],[...b.Tiles()]); assert(a.Left < -5); assert(a.Top < -25);
});
test('browser text: fractional-origin tiles land on the destination device grid', () => {
    const m=[1.25,0,.7,0,1.75,.4,0,0,1],x=10.3,y=26.2,g=GetDeviceTextGeometry(m,x,y);
    for(const t of CreateTextRasterPlan(metrics,14,g,16).Tiles()) {
        const dx=m[0]*(x-t.OffsetX)+m[2],dy=m[4]*(y-t.Baseline)+m[5];
        assert(Math.abs(dx-Math.round(dx))<1e-5); assert(Math.abs(dy-Math.round(dy))<1e-5);
    }
});
test('browser text: tiles cover full ink exactly without oversized allocations', () => {
    const p=CreateTextRasterPlan({...metrics,Right:20000},14,geometry,256); let area=0;
    for(const t of p.Tiles()) { assert(t.PixelWidth<=256 && t.PixelHeight<=256); area+=t.PixelWidth*t.PixelHeight; }
    assert.equal(area,p.Width*p.Height); assert(Object.isFrozen(p));
});
test('browser text: clipped enumeration jumps directly into a billion-pixel line', () => {
    const p=CreateTextRasterPlan({...metrics,Right:1e9},14,{ScaleX:1,ScaleY:1},256);
    const clip={Left:900000000,Top:-20,Right:900000100,Bottom:10},tiles=[...p.Tiles(clip)];
    assert(tiles.length>0 && tiles.length<=2); for(const t of tiles) assert(t.Left+t.PixelWidth>clip.Left && t.Left<clip.Right);
    assert.deepEqual([...p.Tiles({Left:-50,Top:500,Right:50,Bottom:501})],[]);
    assert.deepEqual([...p.Tiles({Left:0,Top:0,Right:0,Bottom:0})],[]);
});
test('browser text: clipped enumeration equals exhaustive intersection for fractional clips', () => {
    const p=CreateTextRasterPlan({...metrics,Right:1000,Ascent:900},14,geometry,32),all=[...p.Tiles()];
    for(let i=0;i<100;i++) {
        const c={Left:i*11.3-60,Right:i*11.3+36.4,Top:i*9.7-1100,Bottom:i*9.7-1013};
        const expected=all.filter(t=>t.Left<c.Right && t.Left+t.PixelWidth>c.Left && t.Top<c.Bottom && t.Top+t.PixelHeight>c.Top);
        assert.deepEqual([...p.Tiles(c)],expected);
    }
});
test('browser text: matrix validation, degenerate transforms and singular-value scale', () => {
    const g=GetDeviceTextGeometry([1,4,0,0,1,0,0,0,1],0,0); assert(!g.AxisAligned); assert(g.ScaleX>4); assert.equal(g.ScaleX,g.ScaleY);
    const large=GetDeviceTextGeometry([1e200,1e200,0,0,1e200,0,0,0,1],0,0); assert(Number.isFinite(large.ScaleX));
    assert.equal(GetDeviceTextGeometry([0,0,0,0,0,0,0,0,1],0,0,2).ScaleX,2);
    assert.throws(()=>GetDeviceTextGeometry([1,0,0,0,1,0,.1,0,1],0,0),/Perspective/);
    assert.throws(()=>GetDeviceTextGeometry([1],0,0),/nine/);
});
test('browser text: invalid dimensions, phases and precision fail before iteration', () => {
    assert.throws(()=>CreateTextRasterPlan(metrics,14,{ScaleX:0,ScaleY:1}),/positive/);
    assert.throws(()=>CreateTextRasterPlan(metrics,14,geometry,2),/tile size/);
    assert.throws(()=>CreateTextRasterPlan(metrics,14,{...geometry,PhaseX:NaN}),/finite/);
    assert.throws(()=>CreateTextRasterPlan({...metrics,Right:1e20},14,geometry),/safe integer/);
    assert.throws(()=>[...CreateTextRasterPlan(metrics,14,geometry).Tiles({Left:NaN,Top:0,Right:1,Bottom:2})],/finite/);
    assert.throws(()=>CanvasFont({FontFamily:'serif'},Infinity),/finite/);
});
