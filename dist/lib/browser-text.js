/**
 * Browser-system-font helpers. No DOM, Skia runtime, font download or UI framework
 * is required at module evaluation. This is a web extension, not a SkiaSharp API.
 * Matrices use Skia row-major 3x3 storage. Raster bounds are device pixels.
 */
const stretches = ['ultra-condensed', 'extra-condensed', 'condensed', 'semi-condensed', 'normal', 'semi-expanded', 'expanded', 'extra-expanded', 'ultra-expanded'];
const finiteOr = (value, fallback) => Number.isFinite(value) ? value : fallback;
function positive(value, name) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive and finite.`);
    return value;
}
function finite(value, name) {
    if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
    return value;
}
export function CanvasFont(typeface, size) {
    positive(size, 'Font size');
    return `${String(typeface.Style ?? 'Normal').toLowerCase()} ${typeface.Weight ?? 400} ${size}px ${typeface.FontFamily}`;
}
export function ConfigureCanvasText(context, typeface, size, options = {}) {
    context.font = CanvasFont(typeface, size);
    context.textAlign = 'left'; context.textBaseline = 'alphabetic';
    context.direction = options.FlowDirection === 'RightToLeft' ? 'rtl' : 'ltr';
    if ('fontStretch' in context) context.fontStretch = stretches[(typeface.Stretch ?? 5) - 1] ?? 'normal';
    if ('fontKerning' in context) context.fontKerning = options.FontKerning ?? 'auto';
    if ('textRendering' in context) context.textRendering = options.TextRendering ?? 'auto';
    for (const [option, key] of [['LetterSpacing', 'letterSpacing'], ['WordSpacing', 'wordSpacing']]) {
        const value = finite(options[option] ?? 0, option);
        if (key in context) context[key] = `${value}px`;
        else if (value) throw new Error(`Canvas2D ${key} is unavailable in this browser.`);
    }
}
/** All Canvas2D typography fields set by ConfigureCanvasText, for caller-owned caches. */
export function TextRasterSignature(typeface, size, options = {}) {
    return [CanvasFont(typeface, size), typeface.Stretch ?? 5, options.FlowDirection ?? 'LeftToRight', options.LetterSpacing ?? 0,
        options.WordSpacing ?? 0, options.FontKerning ?? 'auto', options.TextRendering ?? 'auto'];
}
function phase(value) {
    finite(value, 'Device origin');
    // Remove floating-point noise only; preserve the actual fractional origin.
    return Math.round((value - Math.floor(value)) * 1e6) / 1e6;
}
export function GetDeviceTextGeometry(matrix, x, y, fallbackScale = 1) {
    positive(fallbackScale, 'Fallback scale'); finite(x, 'Text x'); finite(y, 'Text y');
    const m = matrix?.Values ?? matrix ?? [fallbackScale, 0, 0, 0, fallbackScale, 0, 0, 0, 1];
    if (m.length !== 9 || !Array.from(m).every(Number.isFinite)) throw new TypeError('Text matrix must have nine finite components.');
    if (m[6] !== 0 || m[7] !== 0 || m[8] !== 1) throw new RangeError('Perspective text matrices are not supported by this affine raster planner.');
    const axisAligned = Math.abs(m[1]) < 1e-10 && Math.abs(m[3]) < 1e-10 && m[0] > 0 && m[4] > 0;
    if (axisAligned) return { ScaleX: m[0], ScaleY: m[4], PhaseX: phase(m[0] * x + m[2]), PhaseY: phase(m[4] * y + m[5]), AxisAligned: true };
    // Normalize before squaring to keep the largest singular value stable.
    const norm = Math.max(Math.abs(m[0]), Math.abs(m[1]), Math.abs(m[3]), Math.abs(m[4]));
    if (!norm) return { ScaleX: fallbackScale, ScaleY: fallbackScale, PhaseX: 0, PhaseY: 0, AxisAligned: false };
    const a = (m[0] / norm) ** 2 + (m[3] / norm) ** 2, b = (m[1] / norm) ** 2 + (m[4] / norm) ** 2;
    const c = (m[0] / norm) * (m[1] / norm) + (m[3] / norm) * (m[4] / norm);
    const scale = positive(norm * Math.sqrt((a + b + Math.hypot(a - b, 2 * c)) / 2), 'Affine raster scale');
    return { ScaleX: scale, ScaleY: scale, PhaseX: 0, PhaseY: 0, AxisAligned: false };
}
/**
 * Accepts either native Canvas2D TextMetrics or PascalCase ink metrics.
 * Tiles(clip) visits only intersecting tiles; clip uses the plan's device-pixel
 * coordinates, not logical coordinates. It does not crop the returned tiles.
 */
export function CreateTextRasterPlan(metrics, size, geometry, tileSize = 2048) {
    positive(size, 'Font size');
    const sx = positive(geometry.ScaleX, 'Text raster scales'), sy = positive(geometry.ScaleY, 'Text raster scales');
    const px = finite(geometry.PhaseX ?? 0, 'PhaseX'), py = finite(geometry.PhaseY ?? 0, 'PhaseY');
    if (!Number.isInteger(tileSize) || tileSize < 16 || tileSize > 8192) throw new RangeError('Text tile size must be an integer from 16 to 8192.');
    const advance = finite(metrics.Width ?? metrics.width, 'Text advance');
    const inkLeft = finiteOr(metrics.Left ?? metrics.actualBoundingBoxLeft, 0);
    const inkRight = finiteOr(metrics.Right ?? metrics.actualBoundingBoxRight, advance);
    const ascent = finiteOr(metrics.Ascent ?? metrics.actualBoundingBoxAscent, size * .8);
    const descent = finiteOr(metrics.Descent ?? metrics.actualBoundingBoxDescent, size * .2);
    const left = Math.floor(-inkLeft * sx + px) - 2, right = Math.ceil(inkRight * sx + px) + 2;
    const top = Math.floor(-ascent * sy + py) - 2, bottom = Math.ceil(descent * sy + py) + 2;
    const width = Math.max(1, right - left), height = Math.max(1, bottom - top);
    if (![left, right, top, bottom, width, height, left + width, top + height].every(Number.isSafeInteger))
        throw new RangeError('Text raster bounds exceed safe integer precision.');
    return Object.freeze({ Left: left, Top: top, Width: width, Height: height, TileSize: tileSize,
        ScaleX: sx, ScaleY: sy, PhaseX: px, PhaseY: py, AxisAligned: geometry.AxisAligned ?? false,
        *Tiles(clip = null) {
            let startX = 0, startY = 0, endX = width, endY = height;
            if (clip) {
                for (const k of ['Left', 'Top', 'Right', 'Bottom']) finite(clip[k], `Clip.${k}`);
                if (clip.Right <= clip.Left || clip.Bottom <= clip.Top || clip.Right <= left || clip.Bottom <= top || clip.Left >= left + width || clip.Top >= top + height) return;
                startX = Math.max(0, Math.floor((clip.Left - left) / tileSize) * tileSize);
                startY = Math.max(0, Math.floor((clip.Top - top) / tileSize) * tileSize);
                endX = Math.min(width, clip.Right - left); endY = Math.min(height, clip.Bottom - top);
            }
            for (let y = startY; y < endY; y += tileSize) for (let x = startX; x < endX; x += tileSize) {
                const w = Math.min(tileSize, width - x), h = Math.min(tileSize, height - y);
                yield { Left: left + x, Top: top + y, PixelWidth: w, PixelHeight: h, Width: w / sx, Height: h / sy,
                    OffsetX: (px - left - x) / sx, Baseline: (py - top - y) / sy };
            }
        }
    });
}
