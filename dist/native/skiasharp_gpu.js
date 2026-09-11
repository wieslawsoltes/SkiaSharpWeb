// Add as --pre-js after cpu.js or webgl.js. Exported property names survive Closure.
(function(K) {
  K._extraInitializations = K._extraInitializations || [];
  K._extraInitializations.push(function() {
    if (K._SkiaSharpMakeGraphiteDawn) {
      K['SkiaSharpMakeGraphiteDawn'] = function(device, o) {
        o = o || {};
        return K._SkiaSharpMakeGraphiteDawn(K.JsValStore.add(device),
          o.GpuBudgetInBytes === undefined ? 268435456 : o.GpuBudgetInBytes,
          !!o.RequireOrderedRecordings, !!o.SetBackendLabels,
          !!o.DisableDriverCorrectnessWorkarounds, o.InternalMultisampleCount || 4);
      };
      K['SkiaSharpGraphiteTexture'] = function(texture) {
        return K._SkiaSharpGraphiteTexture(K.JsValStore.add(texture));
      };
      K['SkiaSharpGraphiteTextureInfo'] = function(format, usage, samples, mipmapped) {
        var index = K.WebGPU.TextureFormat.indexOf(format);
        if (index < 0) throw new TypeError('Unsupported WebGPU texture format: ' + format);
        return K._SkiaSharpGraphiteTextureInfo(index, usage, samples || 1, !!mipmapped);
      };
    }
    if (K._SkiaSharpAdoptGLTexture) {
      K['SkiaSharpAdoptWebGLTexture'] = function(context, webglHandle, texture, width, height, mipmapped, target, format, origin, color, alpha, space) {
        if (!K.setCurrentContext(webglHandle)) throw new Error('The WebGL context is unavailable.');
        var gl = GL.currentContext.GLctx;
        if (!gl.isTexture(texture)) throw new TypeError('Expected a live WebGLTexture in this context.');
        var handle = GL.getNewId(GL.textures); GL.textures[handle] = texture;
        var adopted;
        try { adopted = K._SkiaSharpAdoptGLTexture(context,width,height,!!mipmapped,target,handle,format,origin,color,alpha,space); }
        catch (error) { GL.textures[handle] = null; throw error; }
        if (!adopted) GL.textures[handle] = null;
        return adopted;
      };
    }
    if (K.setCurrentContext) K['SkiaSharpSetCurrentContext'] = function(handle) { return K.setCurrentContext(handle); };
  });
})(Module);
