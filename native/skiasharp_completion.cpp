#include "include/core/SkFont.h"
#include "include/core/SkPath.h"
#include "include/core/SkPathBuilder.h"
#include "include/core/SkPathUtils.h"
#include "include/core/SkPaint.h"
#include "include/core/SkMatrix.h"
#include <emscripten/bind.h>

namespace skiasharp_completion {
using emscripten::val;
// Copy canonical verbs, including rational conics, without exporting borrowed pointers.
val describe(const SkPath& path) {
 val row=val::object(), verbs=val::array(), points=val::array(), weights=val::array();
 SkPath::RawIter iter(path); SkPoint p[4]; SkPath::Verb verb;
 while ((verb=iter.next(p)) != SkPath::kDone_Verb) {
  verbs.call<void>("push",static_cast<int>(verb));
  int first=verb==SkPath::kMove_Verb?0:1;
  int end=verb==SkPath::kMove_Verb?1:verb==SkPath::kLine_Verb?2:
          (verb==SkPath::kQuad_Verb||verb==SkPath::kConic_Verb)?3:
          verb==SkPath::kCubic_Verb?4:0;
  for(int i=first;i<end;i++)points.call<void>("push",p[i].x(),p[i].y());
  if(verb==SkPath::kConic_Verb)weights.call<void>("push",iter.conicWeight());
 }
 row.set("Verbs",verbs);row.set("Points",points);row.set("Weights",weights);
 row.set("FillType",static_cast<int>(path.getFillType()));return row;
}
}
EMSCRIPTEN_BINDINGS(skiasharp_completion_bindings) {
 using namespace emscripten;
 function("SkiaSharpFontGetPaths", optional_override([](const SkFont& font, val input) {
  const auto glyphs=convertJSArrayToNumberVector<SkGlyphID>(input);
  val rows=val::array();struct Context {val* rows;} context{&rows};
  font.getPaths(SkSpan<const SkGlyphID>(glyphs.data(),glyphs.size()),
   [](const SkPath* path,const SkMatrix& matrix,void* data) {
    auto* context=static_cast<Context*>(data);
    val row=path?skiasharp_completion::describe(*path):val::object(), transform=val::array();
    SkScalar values[9];matrix.get9(values);for(float value:values)transform.call<void>("push",value);
    row.set("Matrix",transform);row.set("HasPath",path!=nullptr);context->rows->call<void>("push",row);
   }, &context);
  return rows;
 }));
 function("SkiaSharpPaintFastBounds",optional_override([](const SkPaint& paint,val input) {
  val result=val::object(), bounds=val::array();
  const auto values=convertJSArrayToNumberVector<SkScalar>(input);
  bool ok=values.size()==4&&paint.canComputeFastBounds();SkRect r=SkRect::MakeEmpty(),storage;
  if(ok) {const SkRect original=SkRect::MakeLTRB(values[0],values[1],values[2],values[3]);r=paint.computeFastBounds(original,&storage);}
  bounds.call<void>("push",r.left(),r.top(),r.right(),r.bottom());
  result.set("Success",ok);result.set("Bounds",bounds);return result;
 }));
 function("SkiaSharpPaintGetFillPath",optional_override([](const SkPaint& paint,const SkPath& src,val cull,val transform) {
  SkMatrix matrix=SkMatrix::I();const auto values=convertJSArrayToNumberVector<SkScalar>(transform);
  if(values.size()==9)matrix.set9(values.data());
  SkRect bounds;const SkRect* ptr=nullptr;
  if(!cull.isNull()&&!cull.isUndefined()) {const auto v=convertJSArrayToNumberVector<SkScalar>(cull);if(v.size()==4){bounds=SkRect::MakeLTRB(v[0],v[1],v[2],v[3]);ptr=&bounds;}}
  SkPathBuilder dst;const bool ok=skpathutils::FillPathWithPaint(src,paint,&dst,ptr,matrix);
  val result=skiasharp_completion::describe(dst.detach());result.set("Success",ok);return result;
 }));
}
