export interface WasmCompilationOptions {
  /** Requests with a signal are independent, not entered into the shared cache. */
  signal?: AbortSignal;
  /** Bypass the four-entry, realm-local cache. Defaults to true. */
  cache?: boolean;
}
/** Fetch and compile once without instantiating or allocating a native heap. */
export function CompileWasmAsync(url: string | URL, options?: WasmCompilationOptions): Promise<WebAssembly.Module>;
/** Release cache references without cancelling existing consumers. */
export function ClearWasmModuleCache(): void;
/** Instantiate an Emscripten factory with shared code but independent imports and memory. */
export function InstantiateWasmAsync<T>(factory: (options: Record<string, any>) => T | PromiseLike<T>, module: WebAssembly.Module, options?: Record<string, any>): Promise<T>;
