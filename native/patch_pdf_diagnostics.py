#!/usr/bin/env python3
"""Instrument the pinned PDF backend at actual raster decision sites.

No image-object heuristics. Each hook identifies its coordinate space and phase.
Strict replacement counts make an upstream change fail the build rather than
silently losing observability. The callback is C++-only; no JS is called by Skia.
"""
import pathlib, subprocess, sys, hashlib, json
root = pathlib.Path(sys.argv[1]).resolve()
revision = 'f446aec4ce9e0e95e0a504e875955de3eb521f75'
marker = 'SKIASHARP_PDF_DIAGNOSTICS_V1'
changes = {}
def edit(relative, replacements):
    path = root / relative
    original = subprocess.check_output(['git', 'show', revision + ':' + relative], cwd=root).decode()
    current = path.read_text()
    if current != original and marker not in current:
        raise RuntimeError('Refusing to overwrite unrelated changes in ' + relative)
    text = original
    for before, after in replacements:
        count = text.count(before)
        if count != 1:
            raise RuntimeError(f'{relative}: expected one patch anchor, found {count}: {before[:90]}')
        text = text.replace(before, after, 1)
    text = '// ' + marker + '\n' + text
    path.write_text(text)
    changes[relative] = {'sourceSHA256': hashlib.sha256(original.encode()).hexdigest(),
                         'patchedSHA256': hashlib.sha256(text.encode()).hexdigest(),
                         'anchors': len(replacements)}

edit('include/docs/SkPDFDocument.h', [
    ('#include "include/core/SkDocument.h"', '#include "include/core/SkDocument.h"\n#include "include/core/SkRect.h"'),
    ('struct Metadata {', '''struct Metadata {
    // Optional instrumentation for the standalone browser build. Not upstream API.
    using RasterDiagnostic = void (*)(void*, const char*, const SkRect&, const char*);
    RasterDiagnostic fRasterDiagnostic = nullptr;
    void* fRasterDiagnosticContext = nullptr;'''),
])
edit('src/pdf/SkPDFDocumentPriv.h', [
    ('    const SkPDF::Metadata& metadata() const { return fMetadata; }', '''    const SkPDF::Metadata& metadata() const { return fMetadata; }
    void reportRasterDiagnostic(const char* reason, const SkRect& bounds,
                                const char* coordinateSpace) const {
        if (fMetadata.fRasterDiagnostic) {
            fMetadata.fRasterDiagnostic(fMetadata.fRasterDiagnosticContext,
                                       reason, bounds, coordinateSpace);
        }
    }'''),
])
edit('src/pdf/SkPDFDevice.cpp', [
    ('        // need to return a raster device, which we will detect in drawDevice()', '''        fDocument->reportRasterDiagnostic(
            layerPaint && layerPaint->getImageFilter() ? "layer-image-filter" :
            layerPaint && layerPaint->getColorFilter() ? "layer-color-filter" : "layer-color-space",
            SkRect::Make(cinfo.fInfo.dimensions()), "layer-pixels");
        // need to return a raster device, which we will detect in drawDevice()'''),
    ('    SkIRect dstMaskBounds = dstMask.fBounds;', '''    SkIRect dstMaskBounds = dstMask.fBounds;
    fDocument->reportRasterDiagnostic("mask-filter", SkRect::Make(dstMaskBounds), "device-pixels");'''),
    ('        // must blend alpha image and shader before applying colorfilter.', '''        fDocument->reportRasterDiagnostic("alpha-image-color-filter",
            SkRect::Make(imageSubset.image()->dimensions()), "source-image-pixels");
        // must blend alpha image and shader before applying colorfilter.'''),
    ('        SkScalar deltaX = outlineBounds.left();', '''        fDocument->reportRasterDiagnostic("perspective-image", outlineBounds, "device-pixels");
        SkScalar deltaX = outlineBounds.left();'''),
    ('        sk_sp<SkImage> img = color_filter(imageSubset.image().get(), colorFilter);', '''        fDocument->reportRasterDiagnostic("image-color-filter",
            SkRect::Make(imageSubset.image()->dimensions()), "source-image-pixels");
        sk_sp<SkImage> img = color_filter(imageSubset.image().get(), colorFilter);'''),
    ('    if (device->peekPixels(&pmap)) {', '''    if (device->peekPixels(&pmap)) {
        fDocument->reportRasterDiagnostic("raster-device-composite",
            SkRect::Make(pmap.dimensions()), "layer-pixels");'''),
    ('    if (SkSpecialImages::AsBitmap(srcImg, &resultBM)) {', '''    if (SkSpecialImages::AsBitmap(srcImg, &resultBM)) {
        fDocument->reportRasterDiagnostic("filtered-image-composite",
            localToDevice.mapRect(SkRect::MakeWH(resultBM.width(), resultBM.height())),
            "device-pixels");'''),
    ('    return SkSurfaces::Raster(info, &props);', '''    fDocument->reportRasterDiagnostic("raster-surface-request",
        SkRect::Make(info.dimensions()), "surface-pixels");
    return SkSurfaces::Raster(info, &props);'''),
])
edit('src/pdf/SkPDFShader.cpp', [
    ('    // Don\'t bother to de-dup fallback shader.', '''    doc->reportRasterDiagnostic("shader-fallback", SkRect::Make(surfaceBBox), "pdf-device-pixels");
    // Don't bother to de-dup fallback shader.'''),
])
(root / 'modules/canvaskit/pdf-diagnostics-patch.json').write_text(json.dumps(changes, indent=2)+'\n')
print('Applied PDF raster decision instrumentation:', len(changes), 'source files')
