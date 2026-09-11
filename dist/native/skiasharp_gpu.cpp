// SkiaSharp Web native GPU extension, API version 1.
// Include at the END of modules/canvaskit/canvaskit_bindings.cpp.
// This shares CanvasKit's registered SkSurface/SkImage/SimpleImageInfo and sk_sp traits.
// The bundled custom CanvasKit WASM includes this extension; see native-build-manifest.json.
#include <chrono>
#include <memory>
#include <vector>
#include <cstring>
#include <list>
#include <unordered_map>
#include "include/core/SkGraphics.h"

#ifdef CK_ENABLE_WEBGL
namespace skiasharp_web {
static sk_sp<SkSurface> WrapFramebuffer(sk_sp<GrDirectContext> context, int width, int height,
        int samples, int stencil, uint32_t framebuffer, uint32_t format, int origin,
        SkColorType colorType, sk_sp<SkColorSpace> colorSpace) {
    GrGLFramebufferInfo info{framebuffer, format};
    auto target = GrBackendRenderTargets::MakeGL(width, height, samples, stencil, info);
    return SkSurfaces::WrapBackendRenderTarget(context.get(), target,
        static_cast<GrSurfaceOrigin>(origin), colorType, std::move(colorSpace), nullptr);
}
static sk_sp<SkSurface> RenderTarget(sk_sp<GrDirectContext> context, bool budgeted,
        SimpleImageInfo info, int samples, int origin, bool mipmapped) {
    return SkSurfaces::RenderTarget(context.get(), budgeted ? skgpu::Budgeted::kYes : skgpu::Budgeted::kNo,
        toSkImageInfo(info), samples, static_cast<GrSurfaceOrigin>(origin), nullptr, mipmapped);
}
}
#endif

#if defined(SK_GRAPHITE) && defined(SK_DAWN)
#include <emscripten/html5_webgpu.h>
#include "include/gpu/graphite/Context.h"
#include "include/gpu/graphite/Image.h"
#include "include/gpu/graphite/ImageProvider.h"
#include "include/gpu/graphite/ContextOptions.h"
#include "include/gpu/graphite/Recorder.h"
#include "include/gpu/graphite/Recording.h"
#include "include/gpu/graphite/BackendTexture.h"
#include "include/gpu/graphite/Surface.h"
#include "include/gpu/graphite/dawn/DawnBackendContext.h"
#include "include/gpu/graphite/dawn/DawnGraphiteTypes.h"

namespace skiasharp_web {
namespace graphite = skgpu::graphite;
// Per-recorder cache: immutable SkImage IDs plus mipmap requirement form the key.
// Uploads use native Graphite transfer tasks and remain on the GPU across frames.
class WebImageProvider final : public graphite::ImageProvider {
    struct Entry { uint64_t key; sk_sp<SkImage> image; size_t bytes; };
    using Entries = std::list<Entry>;
    Entries fEntries;
    std::unordered_map<uint64_t, Entries::iterator> fLookup;
    size_t fBudget, fBytes=0;
    uint64_t fHits=0, fUploads=0;
public:
    explicit WebImageProvider(size_t budget) : fBudget(budget) {}
    sk_sp<SkImage> findOrCreate(graphite::Recorder* recorder, const SkImage* image,
                              SkImage::RequiredProperties props) override {
        const uint64_t base=uint64_t(image->uniqueID())<<1;
        auto find=[&](uint64_t key)->sk_sp<SkImage>{auto it=fLookup.find(key);if(it==fLookup.end())return nullptr;
            fEntries.splice(fEntries.begin(),fEntries,it->second);++fHits;return it->second->image;};
        if(!props.fMipmapped){if(auto cached=find(base|1))return cached;}
        if(auto cached=find(base|uint64_t(props.fMipmapped)))return cached;
        auto native=SkImages::TextureFromImage(recorder,image,props);if(!native)return nullptr;++fUploads;
        const size_t bytes=std::max(native->textureSize(),image->imageInfo().computeMinByteSize());
        if(bytes<=fBudget){while(!fEntries.empty()&&(fBytes+bytes>fBudget||fEntries.size()>=256)){
            const auto& last=fEntries.back();fBytes-=last.bytes;fLookup.erase(last.key);fEntries.pop_back();}
            const uint64_t key=base|uint64_t(props.fMipmapped);fEntries.push_front({key,native,bytes});fLookup.emplace(key,fEntries.begin());fBytes+=bytes;}
        return native;
    }
    void purge(){fLookup.clear();fEntries.clear();fBytes=0;}
    emscripten::val stats() const {auto result=emscripten::val::object();result.set("Hits",double(fHits));result.set("Uploads",double(fUploads));result.set("Bytes",double(fBytes));result.set("Count",unsigned(fEntries.size()));result.set("Budget",double(fBudget));return result;}
};
struct GraphiteTexture {
    // BackendTexture itself does not retain WGPUTexture. Keep the imported handle alive.
    wgpu::Texture retained;
    graphite::BackendTexture texture;
    bool isValid() const { return texture.isValid(); }
    int width() const { return texture.dimensions().width(); }
    int height() const { return texture.dimensions().height(); }
};
struct GraphiteTextureInfo {
    graphite::TextureInfo info;
    bool isValid() const { return info.isValid(); }
    int sampleCount() const { return static_cast<int>(info.sampleCount()); }
    bool mipmapped() const { return info.mipmapped() == skgpu::Mipmapped::kYes; }
};
struct GraphiteRecording {
    std::unique_ptr<graphite::Recording> recording;
};
struct GraphiteRecorder {
    std::unique_ptr<graphite::Recorder> recorder;
    sk_sp<WebImageProvider> images;
    emscripten::val imageCacheStats() const { return images->stats(); }
    void purgeImageCache() { images->purge(); }
    int maxTextureSize() const { return recorder->maxTextureSize(); }
    std::shared_ptr<GraphiteRecording> snap() {
        auto recording = recorder->snap(); if (!recording) return nullptr;
        auto result = std::make_shared<GraphiteRecording>(); result->recording = std::move(recording); return result;
    }
    std::shared_ptr<GraphiteTexture> createBackendTexture(int width, int height,
            const std::shared_ptr<GraphiteTextureInfo>& info) {
        auto result = std::make_shared<GraphiteTexture>();
        result->texture = recorder->createBackendTexture(SkISize::Make(width, height), info->info);
        return result->texture.isValid() ? result : nullptr;
    }
    void deleteBackendTexture(const std::shared_ptr<GraphiteTexture>& texture) {
        recorder->deleteBackendTexture(texture->texture); texture->texture = {};
    }
};
struct GraphiteContext {
    std::unique_ptr<graphite::Context> context;
    bool isDeviceLost() const { return context->isDeviceLost(); }
    int maxTextureSize() const { return context->maxTextureSize(); }
    bool supportsProtectedContent() const { return context->supportsProtectedContent(); }
    double currentBudgetedBytes() const { return context->currentBudgetedBytes(); }
    double maxBudgetedBytes() const { return context->maxBudgetedBytes(); }
    bool hasUnfinishedGpuWork() const { return context->hasUnfinishedGpuWork(); }
    std::shared_ptr<GraphiteRecorder> makeRecorder(double budget) {
        graphite::RecorderOptions options; if (budget >= 0) options.fGpuBudgetInBytes = size_t(budget);
        auto images=sk_make_sp<WebImageProvider>(std::min(options.fGpuBudgetInBytes/4,size_t(64*1024*1024)));
        options.fImageProvider=images;
        auto recorder = context->makeRecorder(options); if (!recorder) return nullptr;
        auto result = std::make_shared<GraphiteRecorder>(); result->images=std::move(images); result->recorder = std::move(recorder); return result;
    }
    int insertRecording(const std::shared_ptr<GraphiteRecording>& recording,
            sk_sp<SkSurface> surface, int tx, int ty, emscripten::val clip) {
        graphite::InsertRecordingInfo info; info.fRecording = recording->recording.get();
        info.fTargetSurface = surface.get(); info.fTargetTranslation = {tx, ty};
        info.fTargetClip = SkIRect::MakeLTRB(clip[0].as<int>(), clip[1].as<int>(), clip[2].as<int>(), clip[3].as<int>());
        return static_cast<int>(static_cast<graphite::InsertStatus::V>(context->insertRecording(info)));
    }
    bool submit(bool markBoundary, double frameID) {
        graphite::SubmitInfo info; info.fSync = graphite::SyncToCpu::kNo;
        info.fMarkBoundary = markBoundary ? graphite::MarkFrameBoundary::kYes : graphite::MarkFrameBoundary::kNo;
        info.fFrameID = uint64_t(frameID); return context->submit(info);
    }
    void checkAsyncWorkCompletion() { context->checkAsyncWorkCompletion(); }
    void freeGpuResources() { context->freeGpuResources(); }
    void performDeferredCleanup(double ms) { context->performDeferredCleanup(std::chrono::milliseconds(int64_t(ms))); }
    void deleteBackendTexture(const std::shared_ptr<GraphiteTexture>& texture) {
        context->deleteBackendTexture(texture->texture); texture->texture = {};
    }
    void readPixels(sk_sp<SkSurface> surface, SimpleImageInfo dst, emscripten::val rect,
            int gamma, int mode, emscripten::val callback) {
        struct CallbackData { emscripten::val callback; SkImageInfo info; };
        auto info = toSkImageInfo(dst);
        auto* data = new CallbackData{std::move(callback), info};
        context->asyncRescaleAndReadPixels(surface.get(), info,
            SkIRect::MakeLTRB(rect[0].as<int>(), rect[1].as<int>(), rect[2].as<int>(), rect[3].as<int>()),
            static_cast<SkImage::RescaleGamma>(gamma), static_cast<SkImage::RescaleMode>(mode),
            [](void* raw, std::unique_ptr<const SkImage::AsyncReadResult> pixels) {
                std::unique_ptr<CallbackData> cb(static_cast<CallbackData*>(raw));
                if (!pixels) { cb->callback(emscripten::val::null()); return; }
                const size_t stride = cb->info.minRowBytes();
                std::vector<uint8_t> copy(stride * cb->info.height());
                for (int y = 0; y < cb->info.height(); ++y)
                    std::memcpy(copy.data() + y * stride,
                        static_cast<const uint8_t*>(pixels->data(0)) + y * pixels->rowBytes(0), stride);
                auto owned = emscripten::val::global("Uint8Array").new_(
                    emscripten::val(emscripten::typed_memory_view(copy.size(), copy.data())));
                cb->callback(owned);
            }, data);
    }
};
static std::shared_ptr<GraphiteContext> MakeGraphiteDawn(int deviceHandle, double budget,
        bool ordered, bool labels, bool workarounds, int samples) {
    auto device = wgpu::Device::Acquire(emscripten_webgpu_import_device(deviceHandle));
    emscripten_webgpu_release_js_handle(deviceHandle);
    graphite::DawnBackendContext backend; backend.fDevice = device; backend.fQueue = device.GetQueue();
    backend.fTick = nullptr; // Browser main thread must yield. JS SubmitAsync owns waiting.
    graphite::ContextOptions options; options.fGpuBudgetInBytes = size_t(budget);
    options.fRequireOrderedRecordings = ordered; options.fSetBackendLabels = labels;
    options.fDisableDriverCorrectnessWorkarounds = workarounds;
    options.fInternalMultisampleCount = graphite::ToSampleCount(samples);
    auto context = graphite::ContextFactory::MakeDawn(backend, options); if (!context) return nullptr;
    auto result = std::make_shared<GraphiteContext>(); result->context = std::move(context); return result;
}
static std::shared_ptr<GraphiteTexture> MakeGraphiteTexture(int textureHandle) {
    auto result = std::make_shared<GraphiteTexture>();
    result->retained = wgpu::Texture::Acquire(emscripten_webgpu_import_texture(textureHandle));
    emscripten_webgpu_release_js_handle(textureHandle);
    result->texture = graphite::BackendTextures::MakeDawn(result->retained.Get());
    return result->texture.isValid() ? result : nullptr;
}
static std::shared_ptr<GraphiteTextureInfo> MakeGraphiteTextureInfo(int format, uint32_t usage,
        int samples, bool mipmapped) {
    graphite::DawnTextureInfo dawnInfo(graphite::ToSampleCount(samples),
        mipmapped ? skgpu::Mipmapped::kYes : skgpu::Mipmapped::kNo,
        static_cast<wgpu::TextureFormat>(format), static_cast<wgpu::TextureUsage>(usage), wgpu::TextureAspect::All);
    auto result = std::make_shared<GraphiteTextureInfo>(); result->info = graphite::TextureInfos::MakeDawn(dawnInfo);
    return result;
}
static sk_sp<SkSurface> MakeGraphiteSurface(const std::shared_ptr<GraphiteRecorder>& recorder,
        const std::shared_ptr<GraphiteTexture>& texture, SkColorType colorType,
        sk_sp<SkColorSpace> colorSpace) {
    return SkSurfaces::WrapBackendTexture(recorder->recorder.get(), texture->texture,
        colorType, std::move(colorSpace), nullptr);
}
}
#endif

EMSCRIPTEN_BINDINGS(SkiaSharpNativeGpu) {
    using namespace emscripten;
    constant("SkiaSharpNativeGpuVersion", 1);
    function("SkiaSharpFontCacheUsed", &SkGraphics::GetFontCacheUsed);
    function("SkiaSharpFontCacheLimit", &SkGraphics::GetFontCacheLimit);
    function("SkiaSharpSetFontCacheLimit", &SkGraphics::SetFontCacheLimit);
    function("SkiaSharpPurgeFontCache", &SkGraphics::PurgeFontCache);
    function("SkiaSharpPurgeAllCaches", &SkGraphics::PurgeAllCaches);
    function("SkiaSharpInit", &SkGraphics::Init);
    function("SkiaSharpGetFontCacheCountUsed", &SkGraphics::GetFontCacheCountUsed);
    function("SkiaSharpGetFontCacheCountLimit", &SkGraphics::GetFontCacheCountLimit);
    function("SkiaSharpSetFontCacheCountLimit", &SkGraphics::SetFontCacheCountLimit);
    function("SkiaSharpGetTypefaceCacheCountLimit", &SkGraphics::GetTypefaceCacheCountLimit);
    function("SkiaSharpSetTypefaceCacheCountLimit", &SkGraphics::SetTypefaceCacheCountLimit);
    function("SkiaSharpPurgePinnedFontCache", &SkGraphics::PurgePinnedFontCache);
    function("SkiaSharpGetResourceCacheTotalBytesUsed", &SkGraphics::GetResourceCacheTotalBytesUsed);
    function("SkiaSharpGetResourceCacheTotalByteLimit", &SkGraphics::GetResourceCacheTotalByteLimit);
    function("SkiaSharpSetResourceCacheTotalByteLimit", &SkGraphics::SetResourceCacheTotalByteLimit);
    function("SkiaSharpPurgeResourceCache", &SkGraphics::PurgeResourceCache);
    function("SkiaSharpGetResourceCacheSingleAllocationByteLimit", &SkGraphics::GetResourceCacheSingleAllocationByteLimit);
    function("SkiaSharpSetResourceCacheSingleAllocationByteLimit", &SkGraphics::SetResourceCacheSingleAllocationByteLimit);
#ifdef CK_ENABLE_WEBGL
    function("SkiaSharpGaneshWrapFramebuffer", &skiasharp_web::WrapFramebuffer);
    function("SkiaSharpGaneshRenderTarget", &skiasharp_web::RenderTarget);
    function("SkiaSharpImageToGaneshTexture", optional_override([](sk_sp<GrDirectContext> context, sk_sp<SkImage> image, bool mipmapped, bool budgeted) { return SkImages::TextureFromImage(context.get(), image.get(), mipmapped ? skgpu::Mipmapped::kYes : skgpu::Mipmapped::kNo, budgeted ? skgpu::Budgeted::kYes : skgpu::Budgeted::kNo); }));
    function("_SkiaSharpAdoptGLTexture", optional_override([](sk_sp<GrDirectContext> context, int width, int height, bool mipmapped, uint32_t target, uint32_t texture, uint32_t format, int origin, int color, int alpha, sk_sp<SkColorSpace> space) { GrGLTextureInfo info{target,texture,format};auto backend=GrBackendTextures::MakeGL(width,height,mipmapped ? skgpu::Mipmapped::kYes : skgpu::Mipmapped::kNo,info);return SkImages::AdoptTextureFrom(context.get(),backend,static_cast<GrSurfaceOrigin>(origin),static_cast<SkColorType>(color),static_cast<SkAlphaType>(alpha),std::move(space)); }));
    function("SkiaSharpGaneshResetContext", optional_override([](sk_sp<GrDirectContext> c, uint32_t mask) { c->resetContext(mask); }));
    function("SkiaSharpGaneshResourceCount", optional_override([](sk_sp<GrDirectContext> c) { int count; size_t bytes; c->getResourceCacheUsage(&count, &bytes); return count; }));
    function("SkiaSharpGaneshMaxSampleCount", optional_override([](sk_sp<GrDirectContext> c, SkColorType t) { return c->maxSurfaceSampleCountForColorType(t); }));
    function("SkiaSharpGaneshFlush", optional_override([](sk_sp<GrDirectContext> c) { c->flush(); }));
    function("SkiaSharpGaneshFlushImage", optional_override([](sk_sp<GrDirectContext> c, sk_sp<SkImage> i) { c->flush(i); }));
    function("SkiaSharpGaneshSubmit", optional_override([](sk_sp<GrDirectContext> c, bool sync) { return c->submit(sync ? GrSyncCpu::kYes : GrSyncCpu::kNo); }));
    function("SkiaSharpGaneshCheckAsync", optional_override([](sk_sp<GrDirectContext> c) { c->checkAsyncWorkCompletion(); }));
    function("SkiaSharpGaneshPurge", optional_override([](sk_sp<GrDirectContext> c) { c->freeGpuResources(); }));
    function("SkiaSharpGaneshDeferredCleanup", optional_override([](sk_sp<GrDirectContext> c, double ms) { c->performDeferredCleanup(std::chrono::milliseconds(int64_t(ms))); }));
    function("SkiaSharpGaneshPurgeUnlocked", optional_override([](sk_sp<GrDirectContext> c, double bytes, bool scratch) {
        if (bytes < 0) c->purgeUnlockedResources(scratch ? GrPurgeResourceOptions::kScratchResourcesOnly : GrPurgeResourceOptions::kAllResources);
        else c->purgeUnlockedResources(size_t(bytes), scratch);
    }));
    function("SkiaSharpGaneshAbandon", optional_override([](sk_sp<GrDirectContext> c, bool release) { if (release) c->releaseResourcesAndAbandonContext(); else c->abandonContext(); }));
#endif
#if defined(SK_GRAPHITE) && defined(SK_DAWN)
    using namespace skiasharp_web;
    function("_SkiaSharpMakeGraphiteDawn", &MakeGraphiteDawn);
    function("_SkiaSharpGraphiteTexture", &MakeGraphiteTexture);
    function("_SkiaSharpGraphiteTextureInfo", &MakeGraphiteTextureInfo);
    function("SkiaSharpGraphiteSurface", &MakeGraphiteSurface);
    function("SkiaSharpImageToGraphiteTexture", optional_override([](const std::shared_ptr<GraphiteRecorder>& recorder, sk_sp<SkImage> image, bool mipmapped) { return SkImages::TextureFromImage(recorder->recorder.get(), image.get(), SkImage::RequiredProperties{mipmapped}); }));
    class_<GraphiteContext>("SkiaSharpGraphiteContextNative")
        .smart_ptr<std::shared_ptr<GraphiteContext>>("SkiaSharpGraphiteContextPtr")
        .function("isDeviceLost", &GraphiteContext::isDeviceLost)
        .function("maxTextureSize", &GraphiteContext::maxTextureSize)
        .function("supportsProtectedContent", &GraphiteContext::supportsProtectedContent)
        .function("currentBudgetedBytes", &GraphiteContext::currentBudgetedBytes)
        .function("maxBudgetedBytes", &GraphiteContext::maxBudgetedBytes)
        .function("hasUnfinishedGpuWork", &GraphiteContext::hasUnfinishedGpuWork)
        .function("makeRecorder", &GraphiteContext::makeRecorder)
        .function("insertRecording", &GraphiteContext::insertRecording)
        .function("submit", &GraphiteContext::submit)
        .function("checkAsyncWorkCompletion", &GraphiteContext::checkAsyncWorkCompletion)
        .function("freeGpuResources", &GraphiteContext::freeGpuResources)
        .function("performDeferredCleanup", &GraphiteContext::performDeferredCleanup)
        .function("deleteBackendTexture", &GraphiteContext::deleteBackendTexture)
        .function("readPixels", &GraphiteContext::readPixels);
    class_<GraphiteRecorder>("SkiaSharpGraphiteRecorderNative")
        .smart_ptr<std::shared_ptr<GraphiteRecorder>>("SkiaSharpGraphiteRecorderPtr")
        .function("maxTextureSize", &GraphiteRecorder::maxTextureSize)
        .function("imageCacheStats", &GraphiteRecorder::imageCacheStats)
        .function("purgeImageCache", &GraphiteRecorder::purgeImageCache)
        .function("snap", &GraphiteRecorder::snap)
        .function("createBackendTexture", &GraphiteRecorder::createBackendTexture)
        .function("deleteBackendTexture", &GraphiteRecorder::deleteBackendTexture);
    class_<GraphiteRecording>("SkiaSharpGraphiteRecordingNative")
        .smart_ptr<std::shared_ptr<GraphiteRecording>>("SkiaSharpGraphiteRecordingPtr");
    class_<GraphiteTexture>("SkiaSharpGraphiteTextureNative")
        .smart_ptr<std::shared_ptr<GraphiteTexture>>("SkiaSharpGraphiteTexturePtr")
        .function("isValid", &GraphiteTexture::isValid)
        .function("width", &GraphiteTexture::width)
        .function("height", &GraphiteTexture::height);
    class_<GraphiteTextureInfo>("SkiaSharpGraphiteTextureInfoNative")
        .smart_ptr<std::shared_ptr<GraphiteTextureInfo>>("SkiaSharpGraphiteTextureInfoPtr")
        .function("isValid", &GraphiteTextureInfo::isValid)
        .function("sampleCount", &GraphiteTextureInfo::sampleCount)
        .function("mipmapped", &GraphiteTextureInfo::mipmapped);
#endif
}
