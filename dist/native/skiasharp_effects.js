// Include as --pre-js next to skiasharp_gpu.js in the native CanvasKit build.
(function(K){
  K._extraInitializations=K._extraInitializations||[];
  K._extraInitializations.push(function(){
    K.SkiaSharpNative=K.SkiaSharpNative||{};
    K.SkiaSharpNative.Effects={Version:1,MakeRasterSurface:(info,pixels,rowBytes,flags,geometry)=>K._SkiaSharpMakeRasterSurface(info.width,info.height,info.colorType.value??info.colorType,info.alphaType.value??info.alphaType,info.colorSpace,pixels,rowBytes,flags,geometry),SurfaceProperties:K._SkiaSharpSurfaceProperties,NotifyContentWillChange:K._SkiaSharpSurfaceNotifyContentWillChange,MakeMaskTable:K._SkiaSharpMaskFilterTable,MakeMaskGamma:K._SkiaSharpMaskFilterGamma,MakeMaskClip:K._SkiaSharpMaskFilterClip,MakeMaskShader:K._SkiaSharpMaskFilterShader,FilterPath:K._SkiaSharpFilterPath,MakeComposePathEffect:K._SkiaSharpMakeComposePathEffect,MakeSumPathEffect:K._SkiaSharpMakeSumPathEffect,MakeTrimPathEffect:K._SkiaSharpMakeTrimPathEffect,RegionSetPath:K._SkiaSharpRegionSetPath,MakeColorFilter:K._SkiaSharpMakeColorFilter,MakeImageFilter:K._SkiaSharpMakeImageFilter};
  });
})(Module);
