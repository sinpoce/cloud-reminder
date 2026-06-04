// Imported .wasm files are compiled to a WebAssembly.Module at build time by
// wrangler (runtime compilation from bytes is blocked in Workers).
declare module "*.wasm" {
  const wasmModule: WebAssembly.Module;
  export default wasmModule;
}
