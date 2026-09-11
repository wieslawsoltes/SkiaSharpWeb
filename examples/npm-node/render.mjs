import { writeFile } from 'node:fs/promises';
import { Initialize } from 'skiasharp-web';
const S = await Initialize(); // Bundled WASM is loaded automatically; no font network requests.
const surface = S.SKSurface.Create(new S.SKImageInfo(256, 160));
const paint = new S.SKPaint({ IsAntialias:true, Color:S.SKColor.Parse('#1673D3') });
try {
  surface.Canvas.Clear(S.SKColors.White);
  surface.Canvas.DrawCircle(128, 80, 52, paint);
  const image=surface.Snapshot();
  try { const data=image.Encode(S.SKEncodedImageFormat.Png,100); try { await writeFile('example.png',data.ToArray()); } finally { data?.Dispose(); } }
  finally { image.Dispose(); }
} finally { paint.Dispose(); surface.Dispose(); }
