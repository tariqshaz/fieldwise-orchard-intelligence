// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/** Virtual module that carries the GRIB2 decoder's binary inside the bundle. */
const DECODER_BINARY_ID = "virtual:fieldglass-wasm";
const RESOLVED_DECODER_BINARY_ID = "\0virtual:fieldglass-wasm";

/**
 * Read the GRIB2 decoder's WebAssembly binary from the installed package.
 *
 * Returns null when the package is not installed, in which case the decoder
 * falls back to resolving the file from disk at runtime.
 */
function readDecoderBinary(): Buffer | null {
  const require = createRequire(import.meta.url);
  try {
    return readFileSync(require.resolve("@fieldglass/wasm/fieldglass_wasm_bg.wasm"));
  } catch {
    return null;
  }
}

/**
 * Inline the GRIB2 decoder's binary into the server bundle.
 *
 * The decoder loads its WebAssembly binary from disk, which only works when
 * the package sits next to the running code. A built Nitro bundle has no
 * filesystem and no `node_modules` — the repository's production build
 * targets the Nitro `cloudflare-module` (Cloudflare Worker) preset — so the
 * binary has to travel with the bundle. Inlining it as base64 keeps the
 * decoder self-contained in every runtime (the Bun container that runs this
 * app, Node, and a Worker) without adding a runtime fetch, and the decoder
 * still prefers the inlined copy so the two paths cannot disagree.
 */
function inlineDecoderBinary() {
  return {
    name: "fieldwise-inline-grib-decoder-binary",
    enforce: "pre" as const,
    resolveId(id: string) {
      return id === DECODER_BINARY_ID ? RESOLVED_DECODER_BINARY_ID : null;
    },
    load(id: string) {
      if (id !== RESOLVED_DECODER_BINARY_ID) return null;
      const bytes = readDecoderBinary();
      const base64 = bytes ? bytes.toString("base64") : null;
      return `export const FIELDGLASS_WASM_BASE64 = ${JSON.stringify(base64)};\n`;
    },
  };
}

export default defineConfig({
  vite: {
    plugins: [inlineDecoderBinary()],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
