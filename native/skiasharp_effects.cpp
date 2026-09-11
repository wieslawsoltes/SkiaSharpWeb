// SkiaSharp Web native effect/region bindings, API 1.
// Include at END of CanvasKit's canvaskit_bindings.cpp after its SkPath/sk_sp registrations.
// Target: Skia f446aec4ce9e0e95e0a504e875955de3eb521f75.
#include <emscripten/bind.h>
#include <vector>
#include <string>
#include "include/core/SkColorFilter.h"
#include "include/core/SkPathEffect.h"
#include "include/core/SkPathBuilder.h"
#include "include/core/SkRegion.h"
#include "include/core/SkStrokeRec.h"
#include "include/effects/SkHighContrastFilter.h"
#include "include/effects/SkOverdrawColorFilter.h"
#include "include/effects/SkTrimPathEffect.h"
#include "include/effects/SkImageFilters.h"
#include "include/core/SkSurface.h"
#include "include/core/SkSurfaceProps.h"
#include "include/effects/SkTableMaskFilter.h"
#include "include/effects/SkShaderMaskFilter.h"
namespace skiasharp_effects {
using emscripten::val;
static sk_sp<SkSurface> makeRasterSurface(int width,int height,int colorType,int alphaType,sk_sp<SkColorSpace> colorSpace,uintptr_t pixels,size_t rowBytes,int flags,int geometry) {
    SkSurfaceProps props(static_cast<uint32_t>(flags),static_cast<SkPixelGeometry>(geometry));
    return SkSurfaces::WrapPixels(SkImageInfo::Make(width,height,static_cast<SkColorType>(colorType),static_cast<SkAlphaType>(alphaType),std::move(colorSpace)),reinterpret_cast<void*>(pixels),rowBytes,&props);
}
static val surfaceProperties(sk_sp<SkSurface> surface) {auto result=val::object();result.set("Flags",surface->props().flags());result.set("PixelGeometry",static_cast<int>(surface->props().pixelGeometry()));return result;}
static sk_sp<SkMaskFilter> makeMaskTable(val values) {uint8_t table[256];if(values["length"].as<unsigned>()!=256)return nullptr;for(int i=0;i<256;i++)table[i]=values[i].as<uint8_t>();return sk_sp<SkMaskFilter>(SkTableMaskFilter::Create(table));}
static SkRect rect(val v) { return SkRect::MakeLTRB(v[0].as<float>(),v[1].as<float>(),v[2].as<float>(),v[3].as<float>()); }
static SkPoint3 point(val v) { return {v[0].as<float>(),v[1].as<float>(),v[2].as<float>()}; }
static SkColor color(val v) { return SkColor4f{v[0].as<float>(),v[1].as<float>(),v[2].as<float>(),v[3].as<float>()}.toSkColor(); }
static sk_sp<SkImageFilter> child(val v,int i) { return v["length"].as<unsigned>()>unsigned(i)&&!v[i].isNull()&&!v[i].isUndefined()?v[i].as<sk_sp<SkImageFilter>>():nullptr; }
static SkPath filterPath(sk_sp<SkPathEffect> effect,const SkPath& source,const SkPaint& paint,float scale,val crop) {
    SkPathBuilder builder;SkStrokeRec rec(paint,scale);SkRect cull;
    const SkRect* ptr=nullptr;if(!crop.isNull()&&!crop.isUndefined()){cull=rect(crop);ptr=&cull;}
    return effect&&effect->filterPath(&builder,source,&rec,ptr,SkMatrix::I())?builder.detach():source;
}
static val regionSetPath(const SkPath& path,val rectangles) {
    SkRegion region,clip;const unsigned count=rectangles["length"].as<unsigned>();
    for(unsigned i=0;i+3<count;i+=4)clip.op(SkIRect::MakeLTRB(rectangles[i].as<int>(),rectangles[i+1].as<int>(),rectangles[i+2].as<int>(),rectangles[i+3].as<int>()),SkRegion::kUnion_Op);
    region.setPath(path,clip);std::vector<uint8_t> data(region.writeToMemory(nullptr));region.writeToMemory(data.data());
    return val(emscripten::typed_memory_view(data.size(),data.data())).call<val>("slice");
}
static sk_sp<SkColorFilter> colorFilter(const std::string& kind,val o) {
    if(kind=="table") {uint8_t tables[4][256];for(int c=0;c<4;c++)for(int i=0;i<256;i++)tables[c][i]=o["tables"][c][i].as<uint8_t>();return SkColorFilters::TableARGB(tables[0],tables[1],tables[2],tables[3]);}
    if(kind=="hsla") {float m[20];for(int i=0;i<20;i++)m[i]=o["matrix"][i].as<float>();return SkColorFilters::HSLAMatrix(m);}
    if(kind=="contrast") {SkHighContrastConfig config;config.fGrayscale=o["grayscale"].as<bool>();config.fInvertStyle=static_cast<SkHighContrastConfig::InvertStyle>(o["invert"].as<int>());config.fContrast=o["contrast"].as<float>();return SkHighContrastFilter::Make(config);}
    if(kind=="overdraw") {SkColor colors[6];for(int i=0;i<6;i++)colors[i]=color(o["colors"][i]);return SkOverdrawColorFilter::MakeWithSkColors(colors);}
    return nullptr;
}
static sk_sp<SkImageFilter> imageFilter(const std::string& kind,val o,val children) {
    auto in=child(children,0);auto num=[&](const char* key){return o[key].as<float>();};
    if(kind=="empty")return SkImageFilters::Empty();
    if(kind=="crop")return SkImageFilters::Crop(rect(o["rect"]),static_cast<SkTileMode>(o["tile"].as<int>()),in);
    if(kind=="tile")return SkImageFilters::Tile(rect(o["src"]),rect(o["dst"]),in);
    if(kind=="arithmetic")return SkImageFilters::Arithmetic(num("k1"),num("k2"),num("k3"),num("k4"),o["enforce"].as<bool>(),in,child(children,1));
    if(kind=="compose")return SkImageFilters::Compose(in,child(children,1));
    if(kind=="merge") {std::vector<sk_sp<SkImageFilter>> filters;for(unsigned i=0;i<children["length"].as<unsigned>();i++)filters.push_back(child(children,i));return SkImageFilters::Merge(filters.data(),int(filters.size()));}
    if(kind=="convolution") {std::vector<float> kernel;for(unsigned i=0;i<o["kernel"]["length"].as<unsigned>();i++)kernel.push_back(o["kernel"][i].as<float>());return SkImageFilters::MatrixConvolution(SkISize::Make(o["kw"].as<int>(),o["kh"].as<int>()),kernel.data(),num("gain"),num("bias"),SkIPoint::Make(o["ox"].as<int>(),o["oy"].as<int>()),static_cast<SkTileMode>(o["tile"].as<int>()),o["alpha"].as<bool>(),in);}
    if(kind=="magnifier") {SkSamplingOptions sampling(SkFilterMode::kNearest);val sample=o["sampling"];if(!sample.isNull()&&!sample.isUndefined()){if(!sample["B"].isUndefined())sampling=SkSamplingOptions(SkCubicResampler{sample["B"].as<float>(),sample["C"].as<float>()});else if(!sample["filter"].isUndefined())sampling=SkSamplingOptions(static_cast<SkFilterMode>(sample["filter"].isNumber()?sample["filter"].as<int>():sample["filter"]["value"].as<int>()));}return SkImageFilters::Magnifier(rect(o["rect"]),num("zoom"),num("inset"),sampling,in);}
    if(kind=="lighting") {const std::string type=o["type"].as<std::string>();const bool spec=o["specular"].as<bool>();const auto pos=point(o["position"]);const SkColor c=color(o["color"]);const float scale=num("scale"),coefficient=num("coefficient"),shine=num("shininess");
        if(type=="distant")return spec?SkImageFilters::DistantLitSpecular(pos,c,scale,coefficient,shine,in):SkImageFilters::DistantLitDiffuse(pos,c,scale,coefficient,in);
        if(type=="point")return spec?SkImageFilters::PointLitSpecular(pos,c,scale,coefficient,shine,in):SkImageFilters::PointLitDiffuse(pos,c,scale,coefficient,in);
        const auto target=point(o["target"]);return spec?SkImageFilters::SpotLitSpecular(pos,target,num("exponent"),num("cutoff"),c,scale,coefficient,shine,in):SkImageFilters::SpotLitDiffuse(pos,target,num("exponent"),num("cutoff"),c,scale,coefficient,in);
    }
    return nullptr;
}
}
EMSCRIPTEN_BINDINGS(skiasharp_effects_extension) {
    using namespace emscripten;using namespace skiasharp_effects;
    function("_SkiaSharpMakeRasterSurface",&makeRasterSurface);
    function("_SkiaSharpSurfaceProperties",&surfaceProperties);
    function("_SkiaSharpSurfaceNotifyContentWillChange",optional_override([](sk_sp<SkSurface> surface){surface->notifyContentWillChange(SkSurface::kRetain_ContentChangeMode);}));
    function("_SkiaSharpMaskFilterTable",&makeMaskTable);
    function("_SkiaSharpMaskFilterGamma",optional_override([](float gamma){return sk_sp<SkMaskFilter>(SkTableMaskFilter::CreateGamma(gamma));}));
    function("_SkiaSharpMaskFilterClip",optional_override([](int min,int max){return sk_sp<SkMaskFilter>(SkTableMaskFilter::CreateClip(static_cast<uint8_t>(min),static_cast<uint8_t>(max)));}));
    function("_SkiaSharpMaskFilterShader",&SkShaderMaskFilter::Make);
    function("_SkiaSharpFilterPath",&filterPath);
    function("_SkiaSharpMakeComposePathEffect",&SkPathEffect::MakeCompose);
    function("_SkiaSharpMakeSumPathEffect",&SkPathEffect::MakeSum);
    function("_SkiaSharpMakeTrimPathEffect",optional_override([](float start,float stop,int mode){return SkTrimPathEffect::Make(start,stop,static_cast<SkTrimPathEffect::Mode>(mode));}));
    function("_SkiaSharpRegionSetPath",&regionSetPath);
    function("_SkiaSharpMakeColorFilter",&colorFilter);
    function("_SkiaSharpMakeImageFilter",&imageFilter);
}
