import Skia = require('@wieslawsoltes/skiasharpweb');
async function render() {
  const S = await Skia.Initialize({fonts:false});
  const surface=S.SKSurface.Create(new S.SKImageInfo(1,1));
  surface.Canvas.Clear(S.SKColors.Red);surface.Dispose();
  const version: string = Skia.Version; return version;
}
void render;
