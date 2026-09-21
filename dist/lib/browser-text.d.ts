/** Framework-independent browser-system-font raster planning; does not initialize Skia. */
export interface CanvasTypeface { FontFamily: string | { toString(): string }; Style?: string; Weight?: number | string; Stretch?: number }
export interface CanvasTextOptions {
    FlowDirection?: 'LeftToRight' | 'RightToLeft'; LetterSpacing?: number; WordSpacing?: number;
    FontKerning?: 'auto' | 'normal' | 'none'; TextRendering?: 'auto' | 'optimizeSpeed' | 'optimizeLegibility' | 'geometricPrecision';
}
export interface CanvasTextContext {
    font: string; textAlign: string; textBaseline: string; direction: string;
    fontStretch?: string; fontKerning?: string; textRendering?: string; letterSpacing?: string; wordSpacing?: string;
}
export interface DeviceTextGeometry { ScaleX: number; ScaleY: number; PhaseX?: number; PhaseY?: number; AxisAligned?: boolean }
export interface TextInkMetrics { Width: number; Left?: number; Right?: number; Ascent?: number; Descent?: number }
export interface BrowserTextMetrics { width: number; actualBoundingBoxLeft?: number; actualBoundingBoxRight?: number; actualBoundingBoxAscent?: number; actualBoundingBoxDescent?: number }
export interface TextRasterClip { Left: number; Top: number; Right: number; Bottom: number }
export interface TextRasterTile { Left: number; Top: number; PixelWidth: number; PixelHeight: number; Width: number; Height: number; OffsetX: number; Baseline: number }
export interface TextRasterPlan extends Required<DeviceTextGeometry> {
    readonly Left: number; readonly Top: number; readonly Width: number; readonly Height: number; readonly TileSize: number;
    /** Clip is in plan device pixels. Returns complete, intersecting tiles, never cropped tiles. */
    Tiles(clip?: TextRasterClip | null): IterableIterator<TextRasterTile>;
}
export function CanvasFont(typeface: CanvasTypeface, size: number): string;
export function ConfigureCanvasText(context: CanvasTextContext, typeface: CanvasTypeface, size: number, options?: CanvasTextOptions): void;
export function TextRasterSignature(typeface: CanvasTypeface, size: number, options?: CanvasTextOptions): (string | number)[];
export function GetDeviceTextGeometry(matrix: ArrayLike<number> | { Values: ArrayLike<number> } | null | undefined, x: number, y: number, fallbackScale?: number): Required<DeviceTextGeometry>;
export function CreateTextRasterPlan(metrics: TextInkMetrics | BrowserTextMetrics, size: number, geometry: DeviceTextGeometry, tileSize?: number): TextRasterPlan;
