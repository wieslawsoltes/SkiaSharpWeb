// Included after CanvasKit's bindings. MIT, 2026.
#include "include/core/SkFont.h"
#include "include/core/SkFontMgr.h"
#include "include/core/SkFontMetrics.h"
#include "include/core/SkTypeface.h"
#include "include/core/SkPath.h"
#include "modules/skparagraph/include/TypefaceFontProvider.h"
#include "include/core/SkString.h"
#include "third_party/externals/harfbuzz/src/hb-subset.h"
#include <emscripten/bind.h>
#include <vector>
#include <string>
#include <unordered_map>
#include <algorithm>
#include <cctype>
namespace skiasharp_fonts {
using emscripten::val;
class FontProvider : public skia::textlayout::TypefaceFontProvider {
public:
 static std::string lower(std::string s){std::transform(s.begin(),s.end(),s.begin(),[](unsigned char c){return char(std::tolower(c));});return s;}
 void setLanguages(const SkTypeface& face,val tags){auto& out=fLanguages[face.uniqueID()];out.clear();for(unsigned i=0;i<tags["length"].as<unsigned>();i++)out.push_back(lower(tags[i].as<std::string>()));}
 sk_sp<SkTypeface> onMatchFamilyStyleCharacter(const char family[],const SkFontStyle& style,const char* languages[],int languageCount,SkUnichar character) const override {
   if(family){auto set=this->matchFamily(family);if(set){auto face=set->matchStyle(style);if(face&&face->unicharToGlyph(character))return face;}}
   auto candidates=sk_make_sp<skia::textlayout::TypefaceFontStyleSet>(SkString("Fallback"));int bestRank=languageCount*2;
   for(int i=0;i<this->countFamilies();i++){auto set=this->createStyleSet(i);for(int j=0;j<set->count();j++){auto face=set->createTypeface(j);if(!face||!face->unicharToGlyph(character))continue;int rank=languageCount*2;auto found=fLanguages.find(face->uniqueID());if(found!=fLanguages.end())for(int k=languageCount-1;k>=0;k--){const auto wanted=lower(languages[k]);for(const auto& available:found->second){if(available==wanted)rank=std::min(rank,(languageCount-1-k)*2);else if(available.substr(0,available.find('-'))==wanted.substr(0,wanted.find('-')))rank=std::min(rank,(languageCount-1-k)*2+1);}}if(rank<bestRank){bestRank=rank;candidates=sk_make_sp<skia::textlayout::TypefaceFontStyleSet>(SkString("Fallback"));}if(rank==bestRank)candidates->appendTypeface(face);}}
   return candidates->matchStyle(style);
 }
private: std::unordered_map<SkTypefaceID,std::vector<std::string>> fLanguages;
};
val Metrics(const SkFont& font) {
 SkFontMetrics m; font.getMetrics(&m);val o=val::object();
 o.set("Top",m.fTop);o.set("Ascent",m.fAscent);o.set("Descent",m.fDescent);o.set("Bottom",m.fBottom);o.set("Leading",m.fLeading);o.set("AverageCharacterWidth",m.fAvgCharWidth);o.set("MaxCharacterWidth",m.fMaxCharWidth);o.set("XMin",m.fXMin);o.set("XMax",m.fXMax);o.set("XHeight",m.fXHeight);o.set("CapHeight",m.fCapHeight);
 float value; o.set("UnderlineThickness",m.hasUnderlineThickness(&value)?val(value):val::null());o.set("UnderlinePosition",m.hasUnderlinePosition(&value)?val(value):val::null());o.set("StrikeoutThickness",m.hasStrikeoutThickness(&value)?val(value):val::null());o.set("StrikeoutPosition",m.hasStrikeoutPosition(&value)?val(value):val::null());return o;
}
sk_sp<SkTypeface> MatchCharacter(const SkFontMgr& manager,const std::string& family,int weight,int width,int slant,val languages,int character){std::vector<std::string> strings;for(unsigned i=0;i<languages["length"].as<unsigned>();i++)strings.push_back(languages[i].as<std::string>());std::vector<const char*> tags;for(const auto& s:strings)tags.push_back(s.c_str());return manager.matchFamilyStyleCharacter(family.empty()?nullptr:family.c_str(),SkFontStyle(weight,width,static_cast<SkFontStyle::Slant>(slant)),tags.data(),tags.size(),character);}
val Instance(val bytes,val settings,bool downgradeCff2){
 std::vector<uint8_t> source=emscripten::convertJSArrayToNumberVector<uint8_t>(bytes);
 hb_blob_t* blob=hb_blob_create(reinterpret_cast<const char*>(source.data()),source.size(),HB_MEMORY_MODE_READONLY,nullptr,nullptr);hb_face_t* face=hb_face_create(blob,0);hb_subset_input_t* input=hb_subset_input_create_or_fail();if(!input){hb_face_destroy(face);hb_blob_destroy(blob);return val::null();}
 hb_subset_input_keep_everything(input);unsigned flags=hb_subset_input_get_flags(input)|HB_SUBSET_FLAGS_RETAIN_GIDS|HB_SUBSET_FLAGS_NOTDEF_OUTLINE;if(downgradeCff2)flags|=HB_SUBSET_FLAGS_DOWNGRADE_CFF2;hb_subset_input_set_flags(input,flags);
 bool valid=hb_subset_input_pin_all_axes_to_default(input,face);val keys=val::global("Object").call<val>("keys",settings);for(unsigned i=0;valid&&i<keys["length"].as<unsigned>();i++){const auto key=keys[i].as<std::string>();valid=key.size()==4&&hb_subset_input_pin_axis_location(input,face,hb_tag_from_string(key.data(),4),settings[key].as<float>());}
 hb_face_t* result=valid?hb_subset_or_fail(face,input):nullptr;val output=val::null();if(result){hb_blob_t* out=hb_face_reference_blob(result);unsigned length;const char* data=hb_blob_get_data(out,&length);if(length)output=val(emscripten::typed_memory_view(length,reinterpret_cast<const uint8_t*>(data))).call<val>("slice");hb_blob_destroy(out);hb_face_destroy(result);}hb_subset_input_destroy(input);hb_face_destroy(face);hb_blob_destroy(blob);return output;
}
}
EMSCRIPTEN_BINDINGS(skiasharp_font_extensions){using namespace emscripten;
 function("SkiaSharpMakeFontProvider",optional_override([]()->sk_sp<skia::textlayout::TypefaceFontProvider>{return sk_make_sp<skiasharp_fonts::FontProvider>();}));
 function("SkiaSharpFontGetForceAutoHinting",optional_override([](const SkFont& f){return f.isForceAutoHinting();}));
 function("SkiaSharpFontSetForceAutoHinting",optional_override([](SkFont& f,bool v){f.setForceAutoHinting(v);}));
 function("SkiaSharpFontGetBaselineSnap",optional_override([](const SkFont& f){return f.isBaselineSnap();}));
 function("SkiaSharpFontSetBaselineSnap",optional_override([](SkFont& f,bool v){f.setBaselineSnap(v);}));
 function("SkiaSharpFontGetMetrics",&skiasharp_fonts::Metrics);
 function("SkiaSharpFontGetPath",optional_override([](const SkFont& f,uint16_t glyph)->SkPath*{auto path=f.getPath(glyph);return path?new SkPath(*path):nullptr;}),allow_raw_pointers());
 function("SkiaSharpFontProviderRegister",optional_override([](skia::textlayout::TypefaceFontProvider& m,sk_sp<SkTypeface> f,const std::string& family){return m.registerTypeface(std::move(f),SkString(family));}));
 function("SkiaSharpFontProviderSetLanguages",optional_override([](skia::textlayout::TypefaceFontProvider& m,const SkTypeface& f,val languages){static_cast<skiasharp_fonts::FontProvider&>(m).setLanguages(f,languages);}));
 function("SkiaSharpFontMatchCharacter",&skiasharp_fonts::MatchCharacter);
 function("SkiaSharpTypefaceEmpty",&SkTypeface::MakeEmpty);
 function("SkiaSharpTypefaceEqual",optional_override([](sk_sp<SkTypeface> a,sk_sp<SkTypeface> b){return SkTypeface::Equal(a.get(),b.get());}));
 function("SkiaSharpTypefaceUniqueID",optional_override([](const SkTypeface& f){return f.uniqueID();}));
 function("SkiaSharpFontInstance",&skiasharp_fonts::Instance);
}
