using SkiaSharp;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;

var output = args.Length > 0 ? args[0] : "reference.json";
var fontFile = args.Length > 1 ? args[1] : "dist/fonts/DejaVuSans.ttf";
var assembly = typeof(SKPixmap).Assembly;
PropertyInfo[] Fields(Type t) => t.GetProperties(BindingFlags.Instance | BindingFlags.Public).Where(p => p.GetMethod != null && p.SetMethod != null).ToArray();
object? JsonValue(object? value) {
    if(value == null) return null;
    if(value is ulong u) return u.ToString();
    if(value is IntPtr ptr) return unchecked((ulong)ptr.ToInt64()).ToString();
    if(value is bool || value is int || value is uint || value is string) return value;
    return Fields(value.GetType()).ToDictionary(p=>p.Name,p=>JsonValue(p.GetValue(value)));
}
object FieldValue(Type t, int seed) {
    if(t==typeof(ulong)) return 9007199254740993UL+(ulong)seed;
    if(t==typeof(uint)) return seed%2==0?uint.MaxValue-(uint)seed:(uint)seed;
    if(t==typeof(int)) return -seed;
    if(t==typeof(bool)) return seed%2!=0;
    if(t==typeof(IntPtr)) return new IntPtr(seed);
    var o=Activator.CreateInstance(t)!;int n=seed;
    foreach(var property in Fields(t))property.SetValue(o,FieldValue(property.PropertyType,++n));
    return o;
}
var descriptors=new List<object>();
foreach(var name in new[]{"GRVkAlloc","GRVkYcbcrComponents","GRVkYcbcrConversionInfo","GRVkImageInfo","SKGraphiteVkTextureInfo","GrVkYcbcrConversionInfo","GRGlFramebufferInfo","GRGlTextureInfo"}) {
    var type=assembly.GetType("SkiaSharp."+name,true)!;var initial=Activator.CreateInstance(type)!;
    descriptors.Add(new{name,values=JsonValue(initial),input=(object?)null});
    for(int seed=1;seed<=7;seed++) {
        var value=FieldValue(type,seed);descriptors.Add(new{name,values=JsonValue(value),input=JsonValue(value)});
    }
}
float[] XY(SKPoint p)=>new[]{p.X,p.Y};
var measures=new List<object>();
for(int i=0;i<16;i++) {
    using var path=new SKPath();
    if(i!=0){path.MoveTo(10,20);path.LineTo(40+i,60);if(i%2==0)path.QuadTo(80,100,100,10);path.MoveTo(3,5);path.LineTo(30,41);}
    foreach(bool force in new[]{false,true}) {
        using var m=new SKPathMeasure(path,force);
        var contours=new List<object>();
        do {
            var samples=new List<object>();
            foreach(float d in new[]{float.NegativeInfinity,-10,0,5,20,55,1000,float.PositiveInfinity,float.NaN}) {
                var ok=m.GetPositionAndTangent(d,out var position,out var tangent);
                samples.Add(new{distance=d,ok,position=XY(m.GetPosition(d)),tangent=XY(m.GetTangent(d)),matrices=Enumerable.Range(0,4).Select(f=>m.GetMatrix(d,(SKPathMeasureMatrixFlags)f).Values).ToArray()});
            }
            contours.Add(new{length=m.Length,closed=m.IsClosed,samples});
        } while(m.NextContour());
        measures.Add(new{i,force,contours});
    }
}
var segments=new List<object>();
using(var source=new SKPath()) {
    source.MoveTo(10,10);source.LineTo(100,10);using var m=new SKPathMeasure(source);
    foreach(bool move in new[]{false,true})foreach(bool builder in new[]{false,true}) {
        using var destination=new SKPath();destination.MoveTo(1,1);destination.LineTo(2,3);
        bool result;
        if(builder){using var b=new SKPathBuilder(destination);result=m.GetSegment(10,40,b,move);using var snapshot=b.Snapshot();segments.Add(new{builder,move,result,points=snapshot.Points.Select(XY).ToArray(),verbs=snapshot.VerbCount});}
        else {result=m.GetSegment(10,40,destination,move);segments.Add(new{builder,move,result,points=destination.Points.Select(XY).ToArray(),verbs=destination.VerbCount});}
    }
}
var pixels=new List<object>();uint state=0x50315811;
unsafe {
    foreach(var color in Enum.GetValues<SKColorType>().Distinct().Where(c=>c!=SKColorType.Unknown)) {
        foreach(var alpha in new[]{SKAlphaType.Premul,SKAlphaType.Unpremul,SKAlphaType.Opaque})for(int sample=0;sample<10;sample++) {
            var info=new SKImageInfo(3,2,color,alpha);int rowBytes=info.BytesPerPixel*5;byte[] data=new byte[rowBytes*2];
            for(int n=0;n<data.Length;n++){state=unchecked(state*1664525+1013904223);data[n]=sample==0?(byte)0:sample==1?(byte)255:(byte)(state>>24);}
            fixed(byte* ptr=data) {
                using var pixmap=new SKPixmap(info,(IntPtr)ptr,rowBytes);
                var values=new List<float>();for(int y=0;y<2;y++)for(int x=0;x<3;x++)values.Add(pixmap.GetPixelAlpha(x,y));
                pixels.Add(new{color=color.ToString(),alpha=alpha.ToString(),rowBytes,data=Convert.ToBase64String(data),values,opaque=pixmap.ComputeIsOpaque()});
            }
        }
    }
}
var glyphPaths=new List<object>();
using(var face=SKTypeface.FromFile(fontFile)) {
    foreach(float size in new[]{10,24,51})foreach(float scale in new[]{.75f,1.25f})foreach(float skew in new[]{0f,.2f}) {
        using var font=new SKFont(face,size,scale,skew);var glyphs=font.GetGlyphs("Ag ĄΩ");var rows=new List<object>();
        font.GetGlyphPaths(glyphs,(path,matrix)=>{rows.Add(new{hasPath=path!=null,matrix=matrix.Values,points=path?.Points.Select(XY).ToArray(),verbs=path?.VerbCount});});
        glyphPaths.Add(new{size,scale,skew,glyphs,rows});
    }
}
var document=new{format=2,assembly=assembly.FullName,descriptors,measures,segments,pixels,glyphPaths};
Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(output))!);
File.WriteAllText(output,JsonSerializer.Serialize(document,new JsonSerializerOptions{WriteIndented=true,NumberHandling=JsonNumberHandling.AllowNamedFloatingPointLiterals}));
Console.WriteLine($"{descriptors.Count} descriptor, {measures.Count} measure, {pixels.Count} raw pixel and {glyphPaths.Count} canonical font-path cases");
