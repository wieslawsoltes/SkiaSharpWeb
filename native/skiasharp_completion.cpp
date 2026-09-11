#include "include/core/SkFont.h"
#include "include/core/SkPath.h"
#include "include/core/SkMatrix.h"
#include <emscripten/bind.h>

// Preserve SkFont::getPaths' canonical path and separate scale/skew matrix.
// Numeric path arrays carry all conic weights and do not export borrowed pointers.
EMSCRIPTEN_BINDINGS(skiasharp_font_path_callbacks) {
 using namespace emscripten;
 function("SkiaSharpFontGetPaths", optional_override([](const SkFont& font, val input) {
   const auto glyphs = convertJSArrayToNumberVector<SkGlyphID>(input);
   val rows = val::array();
   struct Context { val* rows; } context{&rows};
   font.getPaths(SkSpan<const SkGlyphID>(glyphs.data(), glyphs.size()),
     [](const SkPath* path, const SkMatrix& matrix, void* data) {
       auto* context = static_cast<Context*>(data);
       val row=val::object(), transform=val::array();
       SkScalar values[9]; matrix.get9(values);
       for (float value : values) transform.call<void>("push",value);
       row.set("Matrix",transform); row.set("HasPath",path != nullptr);
       if (path) {
         val verbs=val::array(), points=val::array(), weights=val::array();
         SkPath::RawIter iter(*path); SkPoint p[4]; SkPath::Verb verb;
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
         row.set("FillType",static_cast<int>(path->getFillType()));
       }
       context->rows->call<void>("push",row);
     }, &context);
   return rows;
 }));
}
