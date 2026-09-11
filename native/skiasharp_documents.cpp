// Included after canvaskit_bindings.cpp. Build with skia_enable_pdf=true.
#include "include/core/SkDocument.h"
#include "include/core/SkStream.h"
#include "include/docs/SkPDFDocument.h"
#include "include/docs/SkPDFJpegHelpers.h"
#include "include/svg/SkSVGCanvas.h"
#include <emscripten/bind.h>
#include <vector>
#include <string>
#include <algorithm>

class SkiaSharpWebDocument {
public:
  explicit SkiaSharpWebDocument(bool pdf) : fPDF(pdf), fMetadata(SkPDF::JPEG::MetadataWithCallbacks()) {
    fMetadata.fRasterDiagnostic = &SkiaSharpWebDocument::recordRaster;
    fMetadata.fRasterDiagnosticContext = this;
  }
  struct Diagnostic { unsigned page; std::string reason; SkRect bounds; std::string coordinates; };
  static void recordRaster(void* context, const char* reason, const SkRect& bounds, const char* coordinates) {
    auto* self = static_cast<SkiaSharpWebDocument*>(context);
    ++self->fTotalDiagnostics;
    if (self->fDiagnostics.size() < self->fDiagnosticLimit) {
      self->fDiagnostics.push_back({self->fPageNumber, reason, bounds, coordinates});
    }
  }
  emscripten::val rasterDiagnostics() const {
    using emscripten::val;
    val report = val::object(), rows = val::array();
    for (const auto& entry : fDiagnostics) {
      val row=val::object(), bounds=val::array();
      bounds.call<void>("push",entry.bounds.left(),entry.bounds.top(),entry.bounds.right(),entry.bounds.bottom());
      row.set("Page",entry.page); row.set("Reason",entry.reason); row.set("Bounds",bounds);
      row.set("CoordinateSpace",entry.coordinates); row.set("Stage","NativeRasterDecision");
      rows.call<void>("push",row);
    }
    report.set("Events",rows); report.set("Total",fTotalDiagnostics);
    report.set("Dropped",fTotalDiagnostics-fDiagnostics.size()); report.set("Limit",fDiagnosticLimit);
    report.set("Source","SkiaPDF-instrumented-v1"); return report;
  }
  // Legacy bridge clients expect outlines; the current JS API explicitly sets .NET flags (default 0).
  void setSvgFlags(unsigned flags) { if (!fCanvas && !fClosed) fSvgFlags = flags; }
  void setMetadata(emscripten::val value) {
    if (fDocument || fClosed) return;
    auto field = [&](const char* name, SkString* target) { auto v=value[name]; if(!v.isNull()&&!v.isUndefined()) *target=SkString(v.as<std::string>().c_str()); };
    field("Title",&fMetadata.fTitle); field("Author",&fMetadata.fAuthor);
    field("Subject",&fMetadata.fSubject);field("Keywords",&fMetadata.fKeywords);
    field("Creator",&fMetadata.fCreator);field("Producer",&fMetadata.fProducer);
    field("Language",&fMetadata.fLang);
    auto dpi=value["RasterDpi"];if(dpi.isUndefined())dpi=value["Dpi"];if(!dpi.isNull()&&!dpi.isUndefined())fMetadata.fRasterDPI=dpi.as<float>();
    auto date = [&](const char* name, SkPDF::DateTime* target) {auto v=value[name];if(v.isNull()||v.isUndefined())return;auto d=emscripten::val::global("Date").new_(v);target->fYear=d.call<int>("getUTCFullYear");target->fMonth=d.call<int>("getUTCMonth")+1;target->fDay=d.call<int>("getUTCDate");target->fDayOfWeek=d.call<int>("getUTCDay");target->fHour=d.call<int>("getUTCHours");target->fMinute=d.call<int>("getUTCMinutes");target->fSecond=d.call<int>("getUTCSeconds");target->fTimeZoneMinutes=0;};
    date("Creation",&fMetadata.fCreation);date("Modified",&fMetadata.fModified);
    auto pdfa=value["PdfA"];if(!pdfa.isNull()&&!pdfa.isUndefined())fMetadata.fPDFA=pdfa.as<bool>();
    auto limit=value["DiagnosticsLimit"];if(!limit.isNull()&&!limit.isUndefined())fDiagnosticLimit=std::min<unsigned>(65536,limit.as<unsigned>());
    auto alphaGradients=value["RasterizeAlphaGradientsForPrinting"];if(!alphaGradients.isNull()&&!alphaGradients.isUndefined())fMetadata.fRasterizeAlphaGradientsForPrinting=alphaGradients.as<bool>();
    auto compression=value["CompressionLevel"];if(!compression.isNull()&&!compression.isUndefined())fMetadata.fCompressionLevel=static_cast<SkPDF::Metadata::CompressionLevel>(compression.as<int>());
    auto quality=value["EncodingQuality"];if(!quality.isNull()&&!quality.isUndefined())fMetadata.fEncodingQuality=quality.as<int>();
  }
  SkCanvas* beginPage(float width, float height) {
    if (fClosed || fCanvas) return nullptr;
    ++fPageNumber;
    if (fPDF) { if(!fDocument)fDocument=SkPDF::MakeDocument(&fStream,fMetadata); fCanvas=fDocument?fDocument->beginPage(width,height):nullptr; }
    else {
      fSVG = SkSVGCanvas::Make(SkRect::MakeWH(width, height), &fStream,
                              fSvgFlags);
      fCanvas = fSVG.get();
    }
    return fCanvas;
  }
  void endPage() {
    if (!fCanvas) return;
    if (fPDF) fDocument->endPage(); else fSVG.reset();
    fCanvas = nullptr;
  }
  emscripten::val close() {
    if (!fClosed) { endPage(); if(fDocument) fDocument->close(); fClosed=true; fData=fStream.detachAsData(); }
    if(!fData) return emscripten::val::null();
    return emscripten::val(emscripten::typed_memory_view(fData->size(), static_cast<const uint8_t*>(fData->data())));
  }
  void abort() { if(fDocument)fDocument->abort(); fSVG.reset();fCanvas=nullptr;fClosed=true; }
private:
  bool fPDF, fClosed=false;
  unsigned fPageNumber=0, fSvgFlags=1, fDiagnosticLimit=4096;
  size_t fTotalDiagnostics=0;
  std::vector<Diagnostic> fDiagnostics;
  SkDynamicMemoryWStream fStream;
  sk_sp<SkDocument> fDocument;
  SkPDF::Metadata fMetadata;
  std::unique_ptr<SkCanvas> fSVG;
  SkCanvas* fCanvas=nullptr;
  sk_sp<SkData> fData;
};
EMSCRIPTEN_BINDINGS(skiasharp_web_documents) {
  emscripten::class_<SkiaSharpWebDocument>("_SkiaSharpDocument")
    .constructor<bool>()
    .function("setMetadata", &SkiaSharpWebDocument::setMetadata)
    .function("setSvgFlags", &SkiaSharpWebDocument::setSvgFlags)
    .function("rasterDiagnostics", &SkiaSharpWebDocument::rasterDiagnostics)
    .function("beginPage", &SkiaSharpWebDocument::beginPage, emscripten::allow_raw_pointers())
    .function("endPage", &SkiaSharpWebDocument::endPage)
    .function("close", &SkiaSharpWebDocument::close)
    .function("abort", &SkiaSharpWebDocument::abort);
}
