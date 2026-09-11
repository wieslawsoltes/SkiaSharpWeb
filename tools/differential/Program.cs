using SkiaSharp;
using System.Text.Json;
// Deterministic corpus independent of JavaScript implementation and RNG.
uint state = 0x53c1a202;
float Next(float scale = 1) { state = unchecked(state * 1664525u + 1013904223u); return ((int)(state >> 16) - 32768) / 4096f * scale; }
float[] Point(SKPoint p) => new[] { p.X, p.Y };
float[] Rect(SKRect r) => new[] { r.Left, r.Top, r.Right, r.Bottom };
SKMatrix Matrix(int i) {
    var sx = Next(), kx = Next(.2f), tx = Next(10), ky = Next(.2f), sy = Next(), ty = Next(10);
    var px = i % 3 == 0 ? Next(.0001f) : 0, py = i % 3 == 0 ? Next(.0001f) : 0;
    if (i % 64 == 0) sx = sy = kx = ky = px = py = 0;
    return new SKMatrix(sx, kx, tx, ky, sy, ty, px, py, 1);
}
var matrices = new List<object>();
for (int i = 0; i < 512; i++) {
    var a = Matrix(i), b = Matrix(i+1); var point = new SKPoint(Next(10), Next(10));
    var r = SKRect.Create(Next(), Next(), Math.Abs(Next(5)) + 1, Math.Abs(Next(5)) + 1);
    var other = SKRect.Create(Next(), Next(), Math.Abs(Next(5)) + 1, Math.Abs(Next(5)) + 1);
    var invertible = a.TryInvert(out var inverse);
    matrices.Add(new { input = a.Values, other = b.Values, point = Point(point), rectangle = Rect(r), otherRectangle = Rect(other),
        expected = new { invertible, inverse = invertible ? inverse.Values : null,
          mappedPoint = Point(a.MapPoint(point)), mappedVector = Point(a.MapVector(point)), mappedRect = Rect(a.MapRect(r)), radius = a.MapRadius(3),
          pre = a.PreConcat(b).Values, post = a.PostConcat(b).Values,
          intersection = Rect(SKRect.Intersect(r, other)), contains = r.Contains(point.X, point.Y), intersects = r.IntersectsWith(other) } });
}
var paths = new List<object>();
for (int i=0;i<64;i++) {
    var rectangle=SKRect.Create(Next(2),Next(2),Math.Abs(Next(3))+5,Math.Abs(Next(3))+5);
    var cx=Next(2),cy=Next(2),radius=Math.Abs(Next(2))+2;
    using var a=new SKPath();a.AddRect(rectangle);
    using var b=new SKPath();b.AddCircle(cx,cy,radius);
    foreach (var op in new[]{SKPathOp.Difference,SKPathOp.Intersect,SKPathOp.Union,SKPathOp.Xor,SKPathOp.ReverseDifference}) {
        using var result=a.Op(b,op);
        var samples=new List<object>();
        for(int y=-3;y<=3;y++)for(int x=-3;x<=3;x++)samples.Add(new { point=new[]{x*8+.125f,y*8+.375f}, contains=result.Contains(x*8+.125f,y*8+.375f) });
        paths.Add(new{ rectangle=Rect(rectangle), circle=new[]{cx,cy,radius}, operation=op.ToString(), bounds=Rect(result.Bounds), empty=result.IsEmpty, samples });
    }
}
var output = new { format=1,seed="0x53c1a202",assembly=typeof(SKMatrix).Assembly.FullName,matrices,paths };
var destination=args.Length>0?args[0]:"reference.json";
Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(destination))!);
File.WriteAllText(destination,JsonSerializer.Serialize(output,new JsonSerializerOptions{WriteIndented=true}));
Console.WriteLine($"Generated {matrices.Count} matrix/rectangle and {paths.Count} path-operation fixtures: {destination}");
