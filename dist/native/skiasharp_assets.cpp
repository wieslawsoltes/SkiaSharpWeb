// Native browser asset contracts. Include after CanvasKit's bindings so its Skia
// smart pointers/enums are registered in the same Embind module.
#include "include/codec/SkCodec.h"
#include "include/core/SkBitmap.h"
#include "include/core/SkImage.h"
#include "include/core/SkImageFilter.h"
#include "include/core/SkMatrix.h"
#include "include/core/SkShader.h"
#include "include/core/SkTextBlob.h"
#include "include/core/SkFont.h"
#include "include/core/SkPaint.h"
#include <emscripten/bind.h>
#include <algorithm>
#include <cstring>
#include <memory>
#include <vector>
namespace skiasharp_web_assets {
using emscripten::val;
static bool exists(const val& v) { return !v.isNull() && !v.isUndefined(); }
static int num(val v, int fallback=0) { if (!exists(v)) return fallback; if (v.typeOf().as<std::string>()=="object") v=v["value"]; return v.as<int>(); }
static bool yes(val v) { return exists(v) && (v.typeOf().as<std::string>()=="string" ? v.as<std::string>()=="Yes" : num(v)==0); }
static SkIRect rect(const val& v) { return SkIRect::MakeLTRB(num(v["Left"]),num(v["Top"]),num(v["Right"]),num(v["Bottom"])); }
static val toRect(const SkIRect& r) { val v=val::object();v.set("Left",r.left());v.set("Top",r.top());v.set("Right",r.right());v.set("Bottom",r.bottom());return v; }
static SkImageInfo info(const val& v) { return SkImageInfo::Make(num(v["Width"]),num(v["Height"]),static_cast<SkColorType>(num(v["ColorType"],kRGBA_8888_SkColorType)),static_cast<SkAlphaType>(num(v["AlphaType"],kUnpremul_SkAlphaType)),exists(v["ColorSpace"])?v["ColorSpace"].as<sk_sp<SkColorSpace>>():nullptr); }
static val infoValue(const SkImageInfo& i) {val v=val::object();v.set("Width",i.width());v.set("Height",i.height());v.set("ColorType",i.colorType());v.set("AlphaType",i.alphaType());v.set("ColorSpace",i.refColorSpace());return v;}
static std::vector<uint8_t> input(const val& v) {return emscripten::convertJSArrayToNumberVector<uint8_t>(v);}
static val copyBytes(const uint8_t* data,size_t size) {return val::global("Uint8Array").new_(emscripten::typed_memory_view(size,data));}
static const char* resultName(SkCodec::Result result) {switch(result){case SkCodec::kSuccess:return "Success";case SkCodec::kIncompleteInput:return "IncompleteInput";case SkCodec::kErrorInInput:return "ErrorInInput";case SkCodec::kInvalidConversion:return "InvalidConversion";case SkCodec::kInvalidScale:return "InvalidScale";case SkCodec::kInvalidParameters:return "InvalidParameters";case SkCodec::kInvalidInput:return "InvalidInput";case SkCodec::kCouldNotRewind:return "CouldNotRewind";case SkCodec::kInternalError:return "InternalError";case SkCodec::kUnimplemented:return "Unimplemented";case SkCodec::kOutOfMemory:return "OutOfMemory";}return "InternalError";}
class NativeCodec {
 std::unique_ptr<SkCodec> codec;
 std::vector<uint8_t> storage;
 SkImageInfo targetInfo;
 SkIRect subset;
 SkCodec::Options options;
 size_t stride=0;
 bool incremental=false, scanline=false;
 void readOptions(const val& o) {options=SkCodec::Options();if(!exists(o))return;options.fFrameIndex=num(o["FrameIndex"]);options.fPriorFrame=num(o["PriorFrame"],-1);options.fZeroInitialized=yes(o["ZeroInitialized"])?SkCodec::kYes_ZeroInitialized:SkCodec::kNo_ZeroInitialized;if(exists(o["Subset"])){subset=rect(o["Subset"]);options.fSubset=&subset;}}
 bool allocate(val i,size_t rowBytes) {targetInfo=info(i);if(targetInfo.width()<=0||targetInfo.height()<=0||!targetInfo.validRowBytes(rowBytes))return false;stride=rowBytes;size_t size=targetInfo.computeByteSize(rowBytes);if(SkImageInfo::ByteSizeOverflowed(size)||size>512*1024*1024)return false;storage.resize(size);return true;}
public:
 explicit NativeCodec(val data) {auto bytes=input(data);codec=SkCodec::MakeFromData(SkData::MakeWithCopy(bytes.data(),bytes.size()));}
 bool valid() const {return bool(codec);}
 val getInfo() const {return codec?infoValue(codec->getInfo()):val::null();}
 int origin() const {return codec?static_cast<int>(codec->getOrigin()):1;}
 int frameCount(){return codec?codec->getFrameCount():0;}
 int repetitionCount(){return codec?codec->getRepetitionCount():0;}
 val frameInfo(int index){if(!codec)return val::null();codec->getFrameCount();SkCodec::FrameInfo f;if(!codec->getFrameInfo(index,&f))return val::null();val v=val::object();v.set("RequiredFrame",f.fRequiredFrame);v.set("Duration",f.fDuration);v.set("FullyRecieved",f.fFullyReceived);v.set("AlphaType",f.fAlphaType);v.set("HasAlphaWithinBounds",f.fHasAlphaWithinBounds);v.set("DisposalMethod",static_cast<int>(f.fDisposalMethod));v.set("Blend",static_cast<int>(f.fBlend));v.set("FrameRect",toRect(f.fFrameRect));return v;}
 val validSubset(val desired){if(!codec)return val::null();auto r=rect(desired);return codec->getValidSubset(&r)?toRect(r):val::null();}
 val scaledDimensions(float scale){if(!codec)return val::null();auto d=codec->getScaledDimensions(scale);val v=val::object();v.set("Width",d.width());v.set("Height",d.height());return v;}
 std::string decode(val i,val destination,size_t rowBytes,val o){if(!codec||!allocate(i,rowBytes))return "InvalidParameters";readOptions(o);auto existing=input(destination);if(existing.size()<storage.size())return "InvalidParameters";std::copy_n(existing.data(),storage.size(),storage.data());auto result=codec->getPixels(targetInfo,storage.data(),stride,&options);destination.call<void>("set",emscripten::typed_memory_view(storage.size(),storage.data()));scanline=incremental=false;return resultName(result);}
 std::string startIncremental(val i,val destination,size_t rowBytes,val o){if(!codec||!allocate(i,rowBytes))return "InvalidParameters";readOptions(o);auto existing=input(destination);if(existing.size()<storage.size())return "InvalidParameters";std::copy_n(existing.data(),storage.size(),storage.data());auto result=codec->startIncrementalDecode(targetInfo,storage.data(),stride,&options);incremental=result==SkCodec::kSuccess;scanline=false;return resultName(result);}
 val decodeIncremental(val destination){val v=val::object();int rows=0;auto result=incremental?codec->incrementalDecode(&rows):SkCodec::kInvalidParameters;if(incremental)destination.call<void>("set",emscripten::typed_memory_view(storage.size(),storage.data()));v.set("Result",resultName(result));v.set("RowsDecoded",rows);return v;}
 std::string startScanline(val i,val o){if(!codec)return "InvalidParameters";targetInfo=info(i);readOptions(o);auto result=codec->startScanlineDecode(targetInfo,&options);scanline=result==SkCodec::kSuccess;incremental=false;return resultName(result);}
 int getScanlines(val destination,int count,size_t rowBytes){if(!codec||!scanline||count<0||!targetInfo.validRowBytes(rowBytes))return 0;size_t size=rowBytes*static_cast<size_t>(count);if(size>512*1024*1024)return 0;auto data=input(destination);if(data.size()<size)return 0;int rows=codec->getScanlines(data.data(),count,rowBytes);destination.call<void>("set",emscripten::typed_memory_view(size,data.data()));return rows;}
 bool skipScanlines(int count){return codec&&scanline&&count>=0&&codec->skipScanlines(count);}
 int nextScanline(){return codec&&scanline?codec->nextScanline():-1;}
 int outputScanline(int line){return codec?codec->outputScanline(line):-1;}
 int scanlineOrder(){return codec?static_cast<int>(codec->getScanlineOrder()):0;}
};
static val applyFilter(sk_sp<SkImage> image,sk_sp<SkImageFilter> filter,val subsetValue,val clipValue){SkIRect out;SkIPoint offset;auto result=SkImages::MakeWithFilter(image,filter.get(),rect(subsetValue),rect(clipValue),&out,&offset);if(!result)return val::null();val v=val::object();v.set("Image",result);v.set("Subset",toRect(out));val point=val::object();point.set("X",offset.x());point.set("Y",offset.y());v.set("Offset",point);return v;}
static sk_sp<SkShader> rawShader(sk_sp<SkImage> image,int tx,int ty,int filter,int mipmap,val matrix){SkMatrix m=SkMatrix::I();if(exists(matrix)){auto values=emscripten::convertJSArrayToNumberVector<float>(matrix);if(values.size()!=9)return nullptr;m.set9(values.data());}return image?image->makeRawShader(static_cast<SkTileMode>(tx),static_cast<SkTileMode>(ty),SkSamplingOptions(static_cast<SkFilterMode>(filter),static_cast<SkMipmapMode>(mipmap)),&m):nullptr;}
static val extractAlpha(sk_sp<SkImage> image,const SkPaint* paint){if(!image)return val::null();SkBitmap bitmap;auto i=image->imageInfo().makeColorType(kRGBA_8888_SkColorType).makeAlphaType(kUnpremul_SkAlphaType);if(!bitmap.tryAllocPixels(i)||!image->readPixels(i,bitmap.getPixels(),bitmap.rowBytes(),0,0))return val::null();SkBitmap alpha;SkIPoint offset;if(!bitmap.extractAlpha(&alpha,paint,&offset))return val::null();val v=val::object();v.set("Info",infoValue(alpha.info()));v.set("RowBytes",alpha.rowBytes());v.set("Pixels",copyBytes(static_cast<uint8_t*>(alpha.getPixels()),alpha.computeByteSize()));val p=val::object();p.set("X",offset.x());p.set("Y",offset.y());v.set("Offset",p);return v;}
static sk_sp<SkTextBlob> makeBlob(const SkFont& font,val glyphValues,val positionValues,bool rotation,val textValues,val clusterValues,val boundsValue){auto glyphs=emscripten::convertJSArrayToNumberVector<uint16_t>(glyphValues);auto positions=emscripten::convertJSArrayToNumberVector<float>(positionValues);auto text=input(textValues);auto clusters=emscripten::convertJSArrayToNumberVector<uint32_t>(clusterValues);const int count=glyphs.size();if(!count||positions.size()!=glyphs.size()*(rotation?4:2)||(!text.empty()&&clusters.size()!=glyphs.size()))return nullptr;SkTextBlobBuilder builder;SkRect bounds;const SkRect* boundsPtr=nullptr;if(exists(boundsValue)){bounds=SkRect::MakeLTRB(boundsValue["Left"].as<float>(),boundsValue["Top"].as<float>(),boundsValue["Right"].as<float>(),boundsValue["Bottom"].as<float>());boundsPtr=&bounds;}const SkTextBlobBuilder::RunBuffer& run=rotation?builder.allocRunTextRSXform(font,count,text.size(),boundsPtr):builder.allocRunTextPos(font,count,text.size(),boundsPtr);std::copy(glyphs.begin(),glyphs.end(),run.glyphs);std::copy(positions.begin(),positions.end(),run.pos);if(!text.empty()){std::copy(text.begin(),text.end(),run.utf8text);std::copy(clusters.begin(),clusters.end(),run.clusters);}return builder.make();}
struct ReadContext {val callback;SkImageInfo info;sk_sp<SkImage> image;};
static void requestPixels(sk_sp<SkImage> image,val infoArg,val rectArg,int gamma,int mode,val callback){if(!image){callback(val::null());return;}auto* context=new ReadContext{callback,info(infoArg),image};image->asyncRescaleAndReadPixels(context->info,rect(rectArg),static_cast<SkImage::RescaleGamma>(gamma!=0),static_cast<SkImage::RescaleMode>(mode),[](void* opaque,std::unique_ptr<const SkImage::AsyncReadResult> result){std::unique_ptr<ReadContext> context(static_cast<ReadContext*>(opaque));if(!result){context->callback(val::null());return;}val data=val::object();data.set("Pixels",copyBytes(static_cast<const uint8_t*>(result->data(0)),result->rowBytes(0)*context->info.height()));data.set("RowBytes",result->rowBytes(0));context->callback(data);},context);}
static val blobIntercepts(sk_sp<SkTextBlob> blob,float upper,float lower,const SkPaint* paint){if(!blob)return val::null();float bounds[]={upper,lower};int n=blob->getIntercepts(bounds,nullptr,paint);std::vector<float> intervals(n);blob->getIntercepts(bounds,intervals.data(),paint);return val::global("Float32Array").new_(emscripten::typed_memory_view(intervals.size(),intervals.data()));}
}
EMSCRIPTEN_BINDINGS(skiasharp_web_assets){
 using namespace emscripten;
 using namespace skiasharp_web_assets;
 class_<NativeCodec>("SkiaSharpCodec").constructor<val>()
 .function("valid",&NativeCodec::valid).function("getInfo",&NativeCodec::getInfo).function("origin",&NativeCodec::origin)
 .function("frameCount",&NativeCodec::frameCount).function("repetitionCount",&NativeCodec::repetitionCount).function("frameInfo",&NativeCodec::frameInfo)
 .function("validSubset",&NativeCodec::validSubset).function("scaledDimensions",&NativeCodec::scaledDimensions)
 .function("decode",&NativeCodec::decode).function("startIncremental",&NativeCodec::startIncremental).function("decodeIncremental",&NativeCodec::decodeIncremental)
 .function("startScanline",&NativeCodec::startScanline).function("getScanlines",&NativeCodec::getScanlines).function("skipScanlines",&NativeCodec::skipScanlines)
 .function("nextScanline",&NativeCodec::nextScanline).function("outputScanline",&NativeCodec::outputScanline).function("scanlineOrder",&NativeCodec::scanlineOrder);
 function("SkiaSharpApplyImageFilter",&applyFilter);
 function("SkiaSharpRawImageShader",&rawShader);
 function("SkiaSharpExtractAlpha",&extractAlpha,allow_raw_pointers());
 function("SkiaSharpMakeTextBlob",&makeBlob);
 function("SkiaSharpTextBlobIntercepts",&blobIntercepts,allow_raw_pointers());
 function("SkiaSharpRequestReadPixels",&requestPixels);
}
