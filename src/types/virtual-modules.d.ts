/**
 * Ambient declarations for the build-time virtual modules.
 *
 * `virtual:fieldglass-wasm` is provided by the Vite plugin in
 * `vite.config.ts`, which inlines the GRIB2 decoder's WebAssembly binary
 * into the server bundle so that a built artifact does not depend on a
 * filesystem or on `node_modules`.
 */
declare module "virtual:fieldglass-wasm" {
  /** The decoder binary as base64, or null when the package is not installed. */
  export const FIELDGLASS_WASM_BASE64: string | null;
}
