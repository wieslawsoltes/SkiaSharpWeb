// JavaScript callbacks for Skia's real memory tracing API. MIT, 2026.
// Included after skiasharp_gpu.cpp in the CanvasKit binding translation unit.
#include "include/core/SkTraceMemoryDump.h"
#include "include/core/SkGraphics.h"
#include <string>
namespace skiasharp_web {
class JavaScriptMemoryDump final : public SkTraceMemoryDump {
    emscripten::val fSink;
    bool fDetailed, fWrapped;
public:
    explicit JavaScriptMemoryDump(emscripten::val sink)
      : fSink(sink), fDetailed(sink["DetailedDump"].as<bool>()),
        fWrapped(sink["DumpWrappedObjects"].as<bool>()) {}
    ~JavaScriptMemoryDump() override = default;
    void dumpNumericValue(const char* name, const char* valueName,
                          const char* units, uint64_t value) override {
        // Keep ulong values exact rather than silently rounding past 2^53-1.
        auto number = value <= 9007199254740991ULL
          ? emscripten::val(static_cast<double>(value))
          : emscripten::val::global("BigInt")(std::to_string(value));
        fSink.call<void>("OnDumpNumericValue", std::string(name),
                        std::string(valueName), std::string(units), number);
    }
    void dumpStringValue(const char* name, const char* key, const char* value) override {
        fSink.call<void>("OnDumpStringValue", std::string(name),
                        std::string(key), std::string(value));
    }
    void setMemoryBacking(const char* name, const char* type, const char* id) override {
        fSink.call<void>("OnSetMemoryBacking", std::string(name),
                        std::string(type), std::string(id));
    }
    void setDiscardableMemoryBacking(const char* name, const SkDiscardableMemory&) override {
        fSink.call<void>("OnSetDiscardableMemoryBacking", std::string(name));
    }
    LevelOfDetail getRequestedDetails() const override {
        return fDetailed ? kObjectsBreakdowns_LevelOfDetail : kLight_LevelOfDetail;
    }
    bool shouldDumpWrappedObjects() const override { return fWrapped; }
    void dumpWrappedState(const char* name, bool value) override {
        fSink.call<void>("OnDumpWrappedState", std::string(name), value);
    }
};
}
EMSCRIPTEN_BINDINGS(SkiaSharpMemory) {
    using namespace emscripten;
    function("SkiaSharpGraphicsDumpMemoryStatistics", optional_override([](val sink) {
        skiasharp_web::JavaScriptMemoryDump dump(sink);
        SkGraphics::DumpMemoryStatistics(&dump);
    }));
#ifdef CK_ENABLE_WEBGL
    function("SkiaSharpGaneshDumpMemoryStatistics", optional_override([](sk_sp<GrDirectContext> ctx, val sink) {
        skiasharp_web::JavaScriptMemoryDump dump(sink);
        ctx->dumpMemoryStatistics(&dump);
    }));
#endif
    function("SkiaSharpImageUniqueID", optional_override([](sk_sp<SkImage> image) {
        return image->uniqueID();
    }));
}
