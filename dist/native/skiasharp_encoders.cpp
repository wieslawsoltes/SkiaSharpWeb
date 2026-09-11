// Included after canvaskit_bindings.cpp. The input image belongs to its CanvasKit
// module. Output bytes are copied before SkData is released.
#include "include/core/SkBitmap.h"
#include "include/core/SkImage.h"
#include "include/core/SkStream.h"
#include "include/encode/SkPngEncoder.h"
#include "include/encode/SkJpegEncoder.h"
#include "include/encode/SkWebpEncoder.h"
#include <emscripten/bind.h>
#include <string>
#include <vector>

namespace skiasharp_web_encoders {
static int number(const emscripten::val& options, const char* key, int fallback) {
    auto value = options[key];
    return value.isUndefined() || value.isNull() ? fallback : value.as<int>();
}
static std::string string(const emscripten::val& options, const char* key, const char* fallback) {
    auto value = options[key];
    return value.isUndefined() || value.isNull() ? fallback : value.as<std::string>();
}
static emscripten::val encode(sk_sp<SkImage> image, const std::string& format, emscripten::val options) {
    if (!image) return emscripten::val::null();
    SkBitmap bitmap;
    auto info = image->imageInfo().makeColorType(kRGBA_8888_SkColorType).makeAlphaType(kUnpremul_SkAlphaType);
    if (!bitmap.tryAllocPixels(info) || !image->readPixels(info, bitmap.getPixels(), bitmap.rowBytes(), 0, 0)) {
        return emscripten::val::null();
    }
    sk_sp<SkData> data;
    if (format == "Png") {
        SkPngEncoder::Options opts;
        opts.fFilterFlags = static_cast<SkPngEncoder::FilterFlag>(number(options, "FilterFlags", 248));
        opts.fZLibLevel = number(options, "ZLibLevel", 6);
        SkDynamicMemoryWStream stream;
        if (SkPngEncoder::Encode(&stream, bitmap.pixmap(), opts)) data = stream.detachAsData();
    } else if (format == "Jpeg") {
        SkJpegEncoder::Options opts;
        opts.fQuality = number(options, "Quality", 100);
        auto downsample = string(options, "Downsample", "Downsample420");
        opts.fDownsample = downsample == "Downsample444" ? SkJpegEncoder::Downsample::k444 :
                          downsample == "Downsample422" ? SkJpegEncoder::Downsample::k422 : SkJpegEncoder::Downsample::k420;
        opts.fAlphaOption = string(options, "AlphaOption", "Ignore") == "BlendOnBlack" ?
                            SkJpegEncoder::AlphaOption::kBlendOnBlack : SkJpegEncoder::AlphaOption::kIgnore;
        SkDynamicMemoryWStream stream;
        if (SkJpegEncoder::Encode(&stream, bitmap.pixmap(), opts)) data = stream.detachAsData();
    } else if (format == "Webp") {
        SkWebpEncoder::Options opts;
        opts.fQuality = options["Quality"].isUndefined() ? 100.0f : options["Quality"].as<float>();
        opts.fCompression = string(options, "Compression", "Lossy") == "Lossless" ?
                            SkWebpEncoder::Compression::kLossless : SkWebpEncoder::Compression::kLossy;
        SkDynamicMemoryWStream stream;
        if (SkWebpEncoder::Encode(&stream, bitmap.pixmap(), opts)) data = stream.detachAsData();
    }
    if (!data) return emscripten::val::null();
    return emscripten::val::global("Uint8Array").new_(emscripten::typed_memory_view(data->size(), data->bytes()));
}
static emscripten::val encodeAnimated(emscripten::val inputFrames, emscripten::val options) {
    const int count = inputFrames["length"].as<int>();
    if (count <= 0) return emscripten::val::null();
    std::vector<SkBitmap> bitmaps(count);
    std::vector<SkEncoder::Frame> frames;
    frames.reserve(count);
    for (int i = 0; i < count; ++i) {
        auto item = inputFrames[i];
        auto image = item["Image"].as<sk_sp<SkImage>>();
        if (!image) return emscripten::val::null();
        auto info = image->imageInfo().makeColorType(kRGBA_8888_SkColorType).makeAlphaType(kUnpremul_SkAlphaType);
        if (!bitmaps[i].tryAllocPixels(info) || !image->readPixels(info,bitmaps[i].getPixels(),bitmaps[i].rowBytes(),0,0)) return emscripten::val::null();
        frames.push_back({bitmaps[i].pixmap(),item["Duration"].as<int>()});
    }
    SkWebpEncoder::Options opts;
    opts.fQuality = options["Quality"].isUndefined() ? 100.0f : options["Quality"].as<float>();
    opts.fCompression = string(options,"Compression","Lossy") == "Lossless" ? SkWebpEncoder::Compression::kLossless : SkWebpEncoder::Compression::kLossy;
    SkDynamicMemoryWStream stream;
    if (!SkWebpEncoder::EncodeAnimated(&stream,SkSpan<const SkEncoder::Frame>(frames),opts)) return emscripten::val::null();
    auto data=stream.detachAsData();
    return emscripten::val::global("Uint8Array").new_(emscripten::typed_memory_view(data->size(),data->bytes()));
}
}
EMSCRIPTEN_BINDINGS(skiasharp_web_encoders) {
    emscripten::function("SkiaSharpEncodeImage", &skiasharp_web_encoders::encode);
    emscripten::function("SkiaSharpEncodeWebpAnimation", &skiasharp_web_encoders::encodeAnimated);
}
