import initialize, { type Surface, type InitializationOptions, GetAssetUrls } from '@wieslawsoltes/skiasharpweb';
import { RegisterWebComponent } from '@wieslawsoltes/skiasharpweb/browser';
const options: InitializationOptions = { fonts:false, assetBaseUrl:'/skia/' };
const S = await initialize(options);
const surface: Surface = S.SKSurface.Create(new S.SKImageInfo(16,16));
const paint = new S.SKPaint({ Color: S.SKColors.Blue });
surface.Canvas.DrawRect(1,2,3,4,paint);
surface.Canvas.DrawRect(S.SKRect.Create(1,2,3,4),paint);
const screen = await S.SKSurface.Create(document.createElement('canvas'), {backend:'webgpu'});
await screen.DisposeAsync();surface.Dispose();paint.Dispose();
const view=document.createElement('skia-canvas');
view.addEventListener('paintsurface', event => event.detail.Canvas.Clear(S.SKColors.White));
await view.InvalidateSurface();
await RegisterWebComponent({fonts:[]});GetAssetUrls(new URL('https://example.test/assets/'));
// @ts-expect-error no true/implicit-font option in the package API
await initialize({fonts:true});
// @ts-expect-error unknown browser backend
await S.SKSurface.Create(document.createElement('canvas'),{backend:'metal'});
// @ts-expect-error misspelled initialization option
await initialize({assetBaseURL:'/skia/'});

import { ConfigureCanvasText, GetDeviceTextGeometry, CreateTextRasterPlan } from '@wieslawsoltes/skiasharpweb/browser-text';
const context = document.createElement('canvas').getContext('2d')!;
ConfigureCanvasText(context, { FontFamily: 'system-ui' }, 14, { LetterSpacing: .25 });
const geometry = GetDeviceTextGeometry(new Float32Array([1,0,0,0,1,0,0,0,1]), 10, 20);
const plan = CreateTextRasterPlan(context.measureText('Hello'), 14, geometry);
for (const tile of plan.Tiles({Left:0,Top:-20,Right:200,Bottom:20})) console.log(tile.PixelWidth);
// @ts-expect-error missing vertical scale must be diagnosed
CreateTextRasterPlan({Width:20},14,{ScaleX:1});
