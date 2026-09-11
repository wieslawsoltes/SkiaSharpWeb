import initialize, { type Surface, type InitializationOptions, GetAssetUrls } from 'skiasharp-web';
import { RegisterWebComponent } from 'skiasharp-web/browser';
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
