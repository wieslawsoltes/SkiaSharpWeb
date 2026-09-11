import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=process.env.SKIA_TEST_ROOT?pathToFileURL(process.env.SKIA_TEST_ROOT+'/'):new URL('../',import.meta.url);
const require=createRequire(import.meta.url);
const K=await require(new URL('dist/vendor/canvaskit.cjs',root).pathname)({wasmBinary:readFileSync(new URL('dist/vendor/canvaskit.wasm',root))});
const {Initialize}=await import(new URL('dist/lib/index.js',root));
const api=await Initialize({CanvasKit:K,fonts:false,isolated:true});
const moduleURL=process.env.SKIA_ANIMATION_MODULE?pathToFileURL(process.env.SKIA_ANIMATION_MODULE):new URL('dist/lib/animation.js',root);
const {createAnimationAPI}=await import(moduleURL);Object.assign(api,createAnimationAPI(K,api));
const fixtureURL=process.env.SKIA_ANIMATION_FIXTURE?pathToFileURL(process.env.SKIA_ANIMATION_FIXTURE):new URL('dist/samples/orbit.json',root);
const sample=readFileSync(fixtureURL,'utf8');
const {Animation,SKRect,SKImageInfo,SKColors,SKPaint,SKMatrix,InvalidationController,ResourceProvider,CachingResourceProvider,DataUriResourceProvider,FileResourceProvider,AnimationBuilderFlags}=api;
const pixels=s=>s.Canvas.ReadPixels(new SKImageInfo(320,180));
const pixel=(bytes,x,y)=>Array.from(bytes.slice((y*320+x)*4,(y*320+x+1)*4));
function frame(animation,frameIndex=0){const s=api.SKSurface.Create(new SKImageInfo(320,180));s.Canvas.Clear(SKColors.Transparent);if(frameIndex!==null)animation.SeekFrame(frameIndex);animation.Render(s.Canvas);const p=pixels(s);s.Dispose();return p;}
function identity(position=[0,0,0]){return {o:{a:0,k:100},r:{a:0,k:0},p:{a:0,k:position},a:{a:0,k:[0,0,0]},s:{a:0,k:[100,100,100]}};}
test('Skottie executes native animated frames, timing, markers, seek and damage',()=>{
  const animation=Animation.Parse(sample);assert(animation?._native);assert.equal(animation.Duration.TotalSeconds,2);assert.equal(animation.Fps,60);assert.deepEqual(animation.Size.ToArray(),[320,180]);assert.equal(animation.InPoint,0);assert.equal(animation.OutPoint,120);
  const a=frame(animation,0),b=frame(animation,60);assert(pixel(a,60,90)[3]>250);assert.equal(pixel(a,260,90)[3],0);assert(pixel(b,260,90)[3]>250);assert.equal(pixel(b,60,90)[3],0);
  const ic=new InvalidationController();animation.SeekFrameTime({TotalSeconds:0},ic);assert(!ic.Bounds.IsEmpty);assert.deepEqual(animation.Markers.map(m=>m.Name),['start','return']);assert.equal(animation.Markers[1].StartFrame,60);animation.Dispose();ic.Dispose();assert.throws(()=>animation.Seek(0),/disposed/);
});
test('Skottie color, transform, opacity overrides change actual native pixels',()=>{
  const a=Animation.Parse(sample);a.SeekFrame(0);const colorKey=a.GetColorProperties()[0].Key;assert(a.SetColor(colorKey,SKColors.Red));assert.deepEqual(pixel(frame(a),60,90),[255,0,0,255]);
  const transformKey=a.GetTransformProperties().find(x=>x.Key.includes('Mover')).Key;assert(a.SetTransform(transformKey,{Position:[160,90],Scale:[100,100]}));assert.deepEqual(pixel(frame(a,null),160,90),[255,0,0,255]);
  const opacityKey=a.GetOpacityProperties().find(x=>x.Key.includes('Mover')).Key;assert(a.SetOpacity(opacityKey,50));const p=pixel(frame(a,null),160,90);assert(p[3]>=126&&p[3]<=129);assert.equal(a.SetColor('does-not-exist',SKColors.Blue),false);a.Dispose();
});
test('Skottie parses bytes/streams, deferred build and invalid JSON safely',()=>{
  assert.equal(Animation.Parse('{broken'),null);assert.equal(Animation.TryParse('{}').Success,false);assert.throws(()=>Animation.Parse(null),/required/);
  const data=api.SKData.CreateCopy(new TextEncoder().encode('\ufeff'+sample));const stream=data.AsStream();const builder=Animation.CreateBuilder(AnimationBuilderFlags.DeferImageLoading);const a=builder.Build(stream);assert(a);assert.equal(a._native,null);builder.Dispose();data.Dispose();stream.Dispose();assert(pixel(frame(a),60,90)[3]>250);a.Dispose();
  const flags=Animation.CreateBuilder();const statsAnimation=flags.Build(sample);assert(flags.Stats.JsonSize>200);assert.equal(flags.Stats.AnimatorCount,null);assert.equal(flags.Stats.JsonAnimatedPropertyCount,1);statsAnimation.Dispose();flags.Dispose();
});
test('Resources copy byte inputs and survive source/proxy disposal with retained builder',()=>{
  const input=new Uint8Array([1,2,3]),provider=new ResourceProvider().Register('folder/asset.bin',input).Register('animation.json',sample);input[0]=9;
  const proxy=new CachingResourceProvider(provider);let data=proxy.Load('folder','asset.bin');assert.deepEqual(Array.from(data.ToArray()),[1,2,3]);data.Dispose();provider.Register('folder/asset.bin',new Uint8Array([7]));data=proxy.Load('folder/asset.bin');assert.deepEqual(Array.from(data.ToArray()),[1,2,3]);data.Dispose();
  const builder=Animation.CreateBuilder().SetResourceProvider(proxy);provider.Dispose();proxy.Dispose();const a=builder.Build('animation.json');builder.Dispose();assert(pixel(frame(a),60,90)[3]>250);a.Dispose();
});
test('Data URI provider decodes binary escapes/base64 and file provider loads async URLs',async()=>{
  const provider=new DataUriResourceProvider();for(const [uri,wanted]of [['data:application/octet-stream;base64,AP+A',[0,255,128]],['data:application/octet-stream,%00%FF%80',[0,255,128]]]){const data=provider.Load(uri);assert.deepEqual(Array.from(data.ToArray()),wanted);data.Dispose();}
  const file=new FileResourceProvider('https://example.invalid/');file.RegisterUrl('test.txt','data:text/plain,loaded');const loaded=await file.LoadAsync('test.txt');assert.equal(new TextDecoder().decode(loaded.ToArray()),'loaded');loaded.Dispose();file.Dispose();provider.Dispose();
});
test('External and embedded images render after provider and original data disposal',async()=>{
  const s=api.SKSurface.Create(new SKImageInfo(12,12));s.Canvas.Clear(SKColors.Blue);const image=s.Snapshot();const data=image.Encode();const imageBytes=data.ToArray();data.Dispose();image.Dispose();s.Dispose();
  const doc=JSON.parse(sample);doc.layers=[{ddd:0,ind:1,ty:2,nm:'Image',refId:'img_0',sr:1,ks:identity([20,20,0]),ip:0,op:120,st:0,bm:0}];doc.assets=[{id:'img_0',w:12,h:12,u:'images/',p:'pixel.png',e:0}];
  const provider=new ResourceProvider().Register('images/pixel.png',imageBytes);const builder=Animation.CreateBuilder().SetResourceProvider(provider);const a=await builder.BuildAsync(doc);provider.Dispose();builder.Dispose();assert.deepEqual(pixel(frame(a),24,24),[0,0,255,255]);a.Dispose();
  doc.assets[0].p='data:image/png;base64,'+Buffer.from(imageBytes).toString('base64');doc.assets[0].e=1;const b=Animation.Parse(doc);assert.deepEqual(pixel(frame(b),24,24),[0,0,255,255]);b.Dispose();
});
test('Font manager assets shape text and editable text properties render changes',()=>{
  const manager=new api.SKFontManager();const font=manager.RegisterFont(readFileSync(new URL('dist/fonts/DejaVuSans.ttf',root)),'DejaVu Sans');font.Dispose();
  const doc=JSON.parse(sample);doc.fonts={list:[{fName:'DejaVuSans',fFamily:'DejaVu Sans',fStyle:'Book',ascent:92.8}]};doc.layers=[{ddd:0,ind:1,ty:5,nm:'Headline',sr:1,ks:identity([20,100,0]),t:{d:{k:[{s:{s:36,f:'DejaVuSans',t:'HELLO',j:0,tr:0,lh:43.2,ls:0,fc:[1,1,1]},t:0}]}},ip:0,op:120,st:0,bm:0}];
  const builder=Animation.CreateBuilder().SetFontManager(manager);manager.Dispose();const a=builder.Build(doc);builder.Dispose();assert(a);const before=frame(a);const props=a.GetTextProperties();assert.equal(props[0].Value.Text,'HELLO');assert(a.SetText(props[0].Key,'SKIA',36));const after=frame(a);assert.notDeepEqual(before,after);assert(after.some(x=>x));assert(a.AttachEditor(props[0].Key));a.EnableEditor(true);frame(a,null);assert(a.DispatchEditorKey('Z'));assert(a.GetTextProperties()[0].Value.Text.includes('Z'));a.EnableEditor(false);a.Dispose();
});
test('Native slots mutate color/scalar/vector properties and reject unknown slots',()=>{
  const doc=JSON.parse(sample);doc.slots={accent:{p:{a:0,k:[1,0,0,1]}},opacity:{p:{a:0,k:100}},position:{p:{a:0,k:[60,90,0]}}};doc.layers[0].shapes[1].c={sid:'accent'};doc.layers[0].ks.o={sid:'opacity'};doc.layers[0].ks.p={sid:'position'};
  const a=Animation.Parse(doc);a.SeekFrame(0);const info=a.GetSlotInfo();assert(info.ColorSlotIds.includes('accent'));assert(a.SetColorSlot('accent',SKColors.Blue));assert(a.SetScalarSlot('opacity',50));assert(a.SetVectorSlot('position',[160,90]));const p=pixel(frame(a,null),160,90);assert(p[2]>=126&&p[3]>=126&&p[3]<=129);assert.equal(a.SetScalarSlot('missing',30),false);a.Dispose();
});
test('Invalidation controller maps dirty rectangles and reset/iteration retain value semantics',()=>{
  const ic=new InvalidationController(),rect=SKRect.Create(0,0,10,20);ic.Invalidate(rect,SKMatrix.CreateTranslation(4,5));rect.Right=500;ic.Invalidate(SKRect.Create(30,30,2,2));assert.deepEqual(ic.Bounds.ToArray(),[4,5,32,32]);assert.equal([...ic].length,2);ic.Begin();ic.End();assert.equal([...ic].length,2);ic.Reset();assert(ic.Bounds.IsEmpty);ic.Dispose();
});
test('Retained scene graph owns leaf resources, tracks mutations, clips opacity and hit tests',()=>{
  const {GroupNode,GeometryNode,Scene}=api.SceneGraph;const paint=new SKPaint({Color:SKColors.Red});const node=GeometryNode.Rectangle(SKRect.Create(0,0,30,20),paint);paint.Dispose();node.Matrix=SKMatrix.CreateTranslation(10,10);const rootNode=new GroupNode([node]);rootNode.Matrix=SKMatrix.CreateTranslation(40,20);const scene=new Scene(rootNode),s=api.SKSurface.Create(new SKImageInfo(320,180));scene.Render(s.Canvas,{clearColor:SKColors.Transparent});assert.deepEqual(pixel(pixels(s),55,35),[255,0,0,255]);assert.equal(scene.HitTest(new api.SKPoint(55,35)),node);assert.deepEqual(scene.Invalidation.Bounds.ToArray(),[50,30,80,50]);scene.ResetInvalidation();
  node.Matrix=SKMatrix.CreateTranslation(110,10);node.Opacity=.5;scene.Render(s.Canvas,{clearColor:SKColors.Transparent});assert.deepEqual(scene.Invalidation.Bounds.ToArray(),[50,30,180,50]);assert.equal(scene.HitTest(new api.SKPoint(55,35)),null);assert.equal(scene.HitTest(new api.SKPoint(155,35)),node);assert(pixel(pixels(s),155,35)[3]>=126);assert.throws(()=>rootNode.Add(rootNode),/cycle/);node.Dispose();assert.equal(rootNode.Children.length,0);scene.Dispose();rootNode.Dispose();s.Dispose();
});
test('Skottie render flags cannot silently pretend to alter native clipping/isolation',()=>{
  const a=Animation.Parse(sample),s=api.SKSurface.Create(new SKImageInfo(320,180));assert.throws(()=>a.Render(s.Canvas,SKRect.Create(320,180),api.AnimationRenderFlags.DisableTopLevelClipping),/does not expose/);a.Dispose();s.Dispose();
});
test('Scene image/text/clip nodes retain resources and narrow transformed hit tests',()=>{
  const {GeometryNode,ClipNode,ImageNode,TextNode,GroupNode,Scene}=api.SceneGraph;
  const surface=api.SKSurface.Create(new SKImageInfo(320,180)),source=api.SKSurface.Create(new SKImageInfo(8,8));source.Canvas.Clear(SKColors.Blue);const image=source.Snapshot();const imageNode=new ImageNode(image,SKRect.Create(0,0,40,40));image.Dispose();source.Dispose();
  const paint=new SKPaint({Color:SKColors.Red}),shape=GeometryNode.Rectangle(SKRect.Create(0,0,40,40),paint);shape.Matrix=SKMatrix.CreateTranslation(80,20).PreConcat(SKMatrix.CreateRotationDegrees(45));assert.equal(shape.HitTest(new api.SKPoint(53,22)),null);
  const clip=new ClipNode(SKRect.Create(10,10,10,10),[imageNode]);assert.equal(clip.HitTest(new api.SKPoint(4,4)),null);assert.equal(clip.HitTest(new api.SKPoint(15,15)),imageNode);
  const face=api.SKTypeface.FromData(readFileSync(new URL('dist/fonts/DejaVuSans.ttf',root))),font=new api.SKFont(face,24);const textNode=new TextNode('HELLO',font,paint,new api.SKPoint(140,40));font.Dispose();face.Dispose();paint.Dispose();
  const group=new GroupNode([clip,shape,textNode]),scene=new Scene(group);scene.Render(surface.Canvas,{clearColor:SKColors.Transparent});const data=pixels(surface);assert.deepEqual(pixel(data,15,15),[0,0,255,255]);assert.equal(pixel(data,4,4)[3],0);assert(textNode.Bounds.Width>50);const before=textNode.Bounds.Width;textNode.Text='I';assert(textNode.Bounds.Width<before);
  for(const item of[scene,group,clip,imageNode,shape,textNode,surface])item.Dispose();
});
test('All four animation/resource showcase scenes render native frames and uploaded JSON',async()=>{
  api.SKFontManager.Default.RegisterFont(readFileSync(new URL('dist/fonts/DejaVuSans.ttf',root)),'DejaVu Sans').Dispose();
  const sampleURL=process.env.SKIA_ANIMATION_MODULE?new URL('./animation-samples.js',moduleURL):new URL('dist/animation-samples.js',root);
  const {createAnimationScenes}=await import(sampleURL);const lab=createAnimationScenes(api),surface=api.SKSurface.Create(new SKImageInfo(960,600));
  for(const scene of lab.scenes){surface.Canvas.Clear(SKColors.Transparent);scene.draw(surface.Canvas,960,600,{time:.7,amount:8});const bytes=surface.Canvas.ReadPixels(new SKImageInfo(960,600));assert(bytes.some((v,i)=>i%4===3&&v>0),scene.id);}
  const uploaded=await lab.loadAnimation(JSON.parse(sample));assert.equal(uploaded.Duration.TotalSeconds,2);lab.Dispose();surface.Dispose();
});
test('Native audio tracks call class-based sound map players without fetching audio as images',async()=>{
  const doc=JSON.parse(sample),calls=[];doc.assets=[{id:'track',u:'audio/',p:'track.wav'}];doc.layers.push({ddd:0,ind:2,ty:6,nm:'Audio',refId:'track',sr:1,ks:identity(),ip:0,op:120,st:0,bm:0});
  class Player{seek(time){calls.push(time);}}class SoundMap{getPlayer(id){assert.equal(id,'track');return new Player();}}
  const builder=Animation.CreateBuilder().SetSoundMap(new SoundMap()),animation=await builder.BuildAsync(doc);builder.Dispose();animation.SeekFrame(30);animation.SeekFrame(60);assert.deepEqual(calls,[.5,1]);assert(!animation.Diagnostics.some(d=>d.Message.includes('Image resource')));animation.Dispose();
});
