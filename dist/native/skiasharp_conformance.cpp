// Included after canvaskit_bindings.cpp in builds with the conformance bridge.
#include "include/core/SkShader.h"
#include "include/core/SkColorSpace.h"
#include "include/effects/SkRuntimeEffect.h"
#include "modules/skcms/skcms.h"
#include <cstring>
#include "third_party/externals/harfbuzz/src/hb.h"
#include "third_party/externals/harfbuzz/src/hb-ot.h"
#include "include/core/SkMilestone.h"
namespace skiasharp_conformance {
using emscripten::val;
static SkMatrix matrix(val a){auto v=emscripten::vecFromJSArray<float>(a);SkMatrix m;if(v.size()!=9)return SkMatrix::I();m.set9(v.data());return m;}
static skcms_TransferFunction transfer(val a){auto v=emscripten::vecFromJSArray<float>(a);skcms_TransferFunction fn={};if(v.size()==7)std::memcpy(&fn,v.data(),28);return fn;}
static skcms_Matrix3x3 xyz(val a){auto v=emscripten::vecFromJSArray<float>(a);skcms_Matrix3x3 m={};if(v.size()==9)std::memcpy(&m,v.data(),36);return m;}
static sk_sp<SkData> data(val bytes){auto b=emscripten::vecFromJSArray<uint8_t>(bytes);return SkData::MakeWithCopy(b.data(),b.size());}
static std::vector<SkRuntimeEffect::ChildPtr> children(val array){std::vector<SkRuntimeEffect::ChildPtr> out;auto n=array["length"].as<size_t>();out.reserve(n);for(size_t i=0;i<n;i++){val entry=array[i];int type=entry["type"].as<int>();val value=entry["value"];if(value.isNull()||value.isUndefined())out.emplace_back();else if(type==0)out.emplace_back(value.as<sk_sp<SkShader>>());else if(type==1)out.emplace_back(value.as<sk_sp<SkColorFilter>>());else out.emplace_back(value.as<sk_sp<SkBlender>>());}return out;}
class HarfBuzzFont {
 hb_font_t* fFont;hb_buffer_t* fBuffer;
public:
 HarfBuzzFont(val bytes,unsigned index){auto b=emscripten::vecFromJSArray<char>(bytes);hb_blob_t* blob=hb_blob_create(b.data(),b.size(),HB_MEMORY_MODE_DUPLICATE,nullptr,nullptr);hb_face_t* face=hb_face_create(blob,index);fFont=hb_font_create(face);hb_ot_font_set_funcs(fFont);hb_font_set_scale(fFont,512,512);fBuffer=hb_buffer_create();hb_face_destroy(face);hb_blob_destroy(blob);}
 ~HarfBuzzFont(){hb_buffer_destroy(fBuffer);hb_font_destroy(fFont);}
 void setScale(int x,int y){hb_font_set_scale(fFont,x,y);}
 val getScale(){int x,y;hb_font_get_scale(fFont,&x,&y);val a=val::array();a.set(0,x);a.set(1,y);return a;}
 val shape(std::string text,std::string direction,std::string language,std::string script,val featureStrings,int clusterLevel){hb_buffer_reset(fBuffer);hb_buffer_set_cluster_level(fBuffer,(hb_buffer_cluster_level_t)clusterLevel);hb_buffer_add_utf8(fBuffer,text.data(),text.size(),0,text.size());if(!direction.empty())hb_buffer_set_direction(fBuffer,hb_direction_from_string(direction.data(),direction.size()));if(!language.empty())hb_buffer_set_language(fBuffer,hb_language_from_string(language.data(),language.size()));if(!script.empty())hb_buffer_set_script(fBuffer,hb_script_from_string(script.data(),script.size()));hb_buffer_guess_segment_properties(fBuffer);std::vector<hb_feature_t> features;const auto n=featureStrings["length"].as<unsigned>();for(unsigned i=0;i<n;i++){const auto string=featureStrings[i].as<std::string>();hb_feature_t feature;if(hb_feature_from_string(string.data(),string.size(),&feature))features.push_back(feature);}hb_shape(fFont,fBuffer,features.data(),features.size());unsigned count;auto info=hb_buffer_get_glyph_infos(fBuffer,&count);auto pos=hb_buffer_get_glyph_positions(fBuffer,&count);val out=val::object(),glyphs=val::array(),clusters=val::array(),positions=val::array();for(unsigned i=0;i<count;i++){glyphs.set(i,info[i].codepoint);clusters.set(i,info[i].cluster);val p=val::array();p.set(0,pos[i].x_advance);p.set(1,pos[i].y_advance);p.set(2,pos[i].x_offset);p.set(3,pos[i].y_offset);positions.set(i,p);}out.set("glyphs",glyphs);out.set("clusters",clusters);out.set("positions",positions);return out;}
};

}
EMSCRIPTEN_BINDINGS(skiasharp_conformance) {
 emscripten::function("_SkiaSharpPictureOpCount", emscripten::optional_override([](sk_sp<SkPicture> picture,bool nested){return picture->approximateOpCount(nested);}));
 emscripten::function("_SkiaSharpNullSurface", emscripten::optional_override([](int width,int height){return SkSurfaces::Null(width,height);}));
 using namespace emscripten;using namespace skiasharp_conformance;
 class_<HarfBuzzFont>("SkiaSharpHarfBuzzFont").constructor<val,unsigned>().function("setScale",&HarfBuzzFont::setScale).function("getScale",&HarfBuzzFont::getScale).function("shape",&HarfBuzzFont::shape);
 function("_SkiaSharpMilestone",optional_override([](){return SK_MILESTONE;}));
 function("_SkiaSharpMakeRGB",optional_override([](val fn,val m){return SkColorSpace::MakeRGB(transfer(fn),xyz(m));}));
 function("_SkiaSharpMakeCICP",optional_override([](int p,int t){return SkColorSpace::MakeCICP(static_cast<SkNamedPrimaries::CicpId>(p),static_cast<SkNamedTransferFn::CicpId>(t));}));
 function("_SkiaSharpColorSpaceInfo",optional_override([](sk_sp<SkColorSpace>space){val r=val::object();skcms_TransferFunction fn;space->transferFn(&fn);val f=val::array();const float* data=reinterpret_cast<const float*>(&fn);for(int i=0;i<7;i++)f.set(i,data[i]);r.set("transferFn",f);skcms_Matrix3x3 xyz;r.set("hasXyz",space->toXYZD50(&xyz));val m=val::array();for(int i=0;i<9;i++)m.set(i,reinterpret_cast<float*>(&xyz)[i]);r.set("toXyzD50",m);r.set("gammaIsLinear",space->gammaIsLinear());r.set("gammaIsCloseToSrgb",space->gammaCloseToSRGB());r.set("isSrgb",space->isSRGB());r.set("isNumerical",space->isNumericalTransferFn(nullptr));return r;}));
 function("_SkiaSharpShaderLocalMatrix",optional_override([](sk_sp<SkShader>s,val m){return s?s->makeWithLocalMatrix(matrix(m)):nullptr;}));
 function("_SkiaSharpShaderColorFilter",optional_override([](sk_sp<SkShader>s,sk_sp<SkColorFilter>f){return s?s->makeWithColorFilter(std::move(f)):nullptr;}));
 function("_SkiaSharpBlendShaders",optional_override([](sk_sp<SkBlender>b,sk_sp<SkShader>d,sk_sp<SkShader>s){return SkShaders::Blend(std::move(b),std::move(d),std::move(s));}));
 function("_SkiaSharpRuntimeColorFilter",optional_override([](std::string source,val onError){auto result=SkRuntimeEffect::MakeForColorFilter(SkString(source));if(!result.effect&&!onError.isNull()&&!onError.isUndefined())onError(std::string(result.errorText.c_str()));return result.effect;}));
 function("_SkiaSharpRuntimeShaderRaw",optional_override([](sk_sp<SkRuntimeEffect>e,val bytes,val kids,val m){auto d=data(bytes);auto c=children(kids);if(m.isNull()||m.isUndefined())return e->makeShader(d,c);auto local=matrix(m);return e->makeShader(d,c,&local);}));
 function("_SkiaSharpRuntimeColorFilterRaw",optional_override([](sk_sp<SkRuntimeEffect>e,val bytes,val kids){return e->makeColorFilter(data(bytes),children(kids));}));
 function("_SkiaSharpRuntimeBlenderRaw",optional_override([](sk_sp<SkRuntimeEffect>e,val bytes,val kids){return e->makeBlender(data(bytes),children(kids));}));
 function("_SkiaSharpCanvasSetMatrix",optional_override([](SkCanvas&c,val m){auto v=emscripten::vecFromJSArray<float>(m);if(v.size()==16)c.setMatrix(SkM44::RowMajor(v.data()));else c.setMatrix(matrix(m));}));
 function("_SkiaSharpCanvasAnnotation",optional_override([](SkCanvas&c,val bounds,std::string key,val bytes){auto v=emscripten::vecFromJSArray<float>(bounds);if(v.size()!=4)return;auto d=data(bytes);c.drawAnnotation(SkRect::MakeLTRB(v[0],v[1],v[2],v[3]),key.c_str(),d.get());}));
 function("_SkiaSharpCanvasIsClipRect",optional_override([](SkCanvas&c){return c.isClipRect();}));
 function("_SkiaSharpCanvasLocalClipBounds",optional_override([](SkCanvas&c){SkRect r=c.getLocalClipBounds();val result=val::array();result.set(0,r.left());result.set(1,r.top());result.set(2,r.right());result.set(3,r.bottom());return result;}));
 function("_SkiaSharpPathClassification",optional_override([](SkPath&p){val r=val::object();r.set("convex",p.isConvex());SkRect bounds;bool closed=false;SkPathDirection direction=SkPathDirection::kCW;bool rect=p.isRect(&bounds,&closed,&direction);r.set("isRect",rect);if(rect){val b=val::array();b.set(0,bounds.left());b.set(1,bounds.top());b.set(2,bounds.right());b.set(3,bounds.bottom());r.set("rect",b);r.set("closed",closed);r.set("direction",(int)direction);}return r;}));
 function("_SkiaSharpColorTypes",optional_override([](){val r=val::object();
 r.set("Unknown",(int)kUnknown_SkColorType);
 r.set("Alpha8",(int)kAlpha_8_SkColorType);
 r.set("Rgb565",(int)kRGB_565_SkColorType);
 r.set("Argb4444",(int)kARGB_4444_SkColorType);
 r.set("Rgba8888",(int)kRGBA_8888_SkColorType);
 r.set("Rgb888x",(int)kRGB_888x_SkColorType);
 r.set("Bgra8888",(int)kBGRA_8888_SkColorType);
 r.set("Rgba1010102",(int)kRGBA_1010102_SkColorType);
 r.set("Bgra1010102",(int)kBGRA_1010102_SkColorType);
 r.set("Rgb101010x",(int)kRGB_101010x_SkColorType);
 r.set("Bgr101010x",(int)kBGR_101010x_SkColorType);
 r.set("Bgr101010xXR",(int)kBGR_101010x_XR_SkColorType);
 r.set("Bgra10101010XR",(int)kBGRA_10101010_XR_SkColorType);
 r.set("Rgba10x6",(int)kRGBA_10x6_SkColorType);
 r.set("Gray8",(int)kGray_8_SkColorType);
 r.set("RgbaF16Clamped",(int)kRGBA_F16Norm_SkColorType);
 r.set("RgbaF16",(int)kRGBA_F16_SkColorType);
 r.set("RgbF16F16F16x",(int)kRGB_F16F16F16x_SkColorType);
 r.set("RgbaF32",(int)kRGBA_F32_SkColorType);
 r.set("Rg88",(int)kR8G8_unorm_SkColorType);
 r.set("AlphaF16",(int)kA16_float_SkColorType);
 r.set("RF16",(int)kR16_float_SkColorType);
 r.set("RgF16",(int)kR16G16_float_SkColorType);
 r.set("Alpha16",(int)kA16_unorm_SkColorType);
 r.set("R16Unorm",(int)kR16_unorm_SkColorType);
 r.set("Rg1616",(int)kR16G16_unorm_SkColorType);
 r.set("Rgba16161616",(int)kR16G16B16A16_unorm_SkColorType);
 r.set("Srgba8888",(int)kSRGBA_8888_SkColorType);
 r.set("R8Unorm",(int)kR8_unorm_SkColorType);
 return r;}));

}
