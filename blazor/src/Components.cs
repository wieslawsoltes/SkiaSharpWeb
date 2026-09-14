using System.Text.Json;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;
namespace SkiaSharpWeb.Blazor;

/// <summary>A retained browser drawing operation; values use native backing-store pixel coordinates.</summary>
public sealed record SkiaDrawCommand(string Op, double[]? Values = null, string? Color = null, bool Stroke = false, double StrokeWidth = 1, bool Antialias = true)
{
    public static SkiaDrawCommand Clear(string color) => new("clear", Color: color);
    public static SkiaDrawCommand Rect(double x, double y, double width, double height, string color) => new("rect", [x, y, width, height], color);
    public static SkiaDrawCommand Circle(double x, double y, double radius, string color) => new("circle", [x, y, radius], color);
    public static SkiaDrawCommand Line(double x1, double y1, double x2, double y2, string color, double width = 1) => new("line", [x1, y1, x2, y2], color, true, width);
}
public sealed record SkiaSurfaceInfo(int Width, int Height, string Backend, JsonElement Statistics);
/// <summary>A native Skia/WASM canvas with retained batched drawing, resize/DPR handling and full engine references.</summary>
public sealed class SkiaCanvas : BrowserComponent
{
    [Parameter] public string Backend { get; set; } = "auto";
    [Parameter] public int? Width { get; set; }
    [Parameter] public int? Height { get; set; }
    [Parameter] public IReadOnlyList<SkiaDrawCommand> DrawCommands { get; set; } = [];
    [Parameter] public object? Render { get; set; }
    protected override IReadOnlyList<string> DefaultEvents => ["dom:surfaceerror", "dom:devicelost"];
    protected override Dictionary<string, object?> BuildOptions()
    {
        var values = base.BuildOptions(); values["backend"] = Backend; values["width"] = Width; values["height"] = Height;
        values["drawCommands"] = DrawCommands; values["render"] = Render; return values;
    }
    public ValueTask<bool> InvalidateAsync() => InvokeAsync<bool>("Invalidate");
    public ValueTask<bool> DrawAsync(IEnumerable<SkiaDrawCommand> commands) => InvokeAsync<bool>("Draw", commands);
    public ValueTask FlushAsync() => InvokeVoidAsync("Flush");
    public ValueTask<SkiaSurfaceInfo> GetInfoAsync() => InvokeAsync<SkiaSurfaceInfo>("GetInfo");
    public ValueTask<byte[]> SnapshotAsync(string format = "Png", int quality = 100) => InvokeBytesAsync("Snapshot", format, quality);
    public ValueTask<byte[]> ReadPixelAsync(int x, int y) => InvokeBytesAsync("ReadPixel", x, y);
    public ValueTask<IJSObjectReference> GetSurfaceAsync() => Module is not null && Control is not null ? Module.GetAsync<IJSObjectReference>(Control, "Surface") : ValueTask.FromException<IJSObjectReference>(new InvalidOperationException("Wait for Ready."));
    public ValueTask<IJSObjectReference> GetCanvasAsync() => Module is not null && Control is not null ? Module.GetAsync<IJSObjectReference>(Control, "Canvas") : ValueTask.FromException<IJSObjectReference>(new InvalidOperationException("Wait for Ready."));
}
public sealed class SkiaProvider : BrowserProvider { }
public sealed class SkiaModule(IJSRuntime js) : BrowserModule(js);
