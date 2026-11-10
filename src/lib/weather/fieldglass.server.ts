/**
 * WebAssembly GRIB/NetCDF decoder for the weather adapters — server-only.
 *
 * Why this module exists
 * ----------------------
 * ECMWF Open Data IFS files are packed with CCSDS/AEC (GRIB2 data
 * representation template 5.42). The earlier attempt in this repository used
 * the ecCodes WASM build, which aborts the process under Bun 1.3.9 because it
 * requires WebAssembly Memory64, which that runtime does not enable. That
 * failure mode is unacceptable in a server process: it takes the whole app
 * down rather than failing one request.
 *
 * `@fieldglass/wasm` is a pure-Rust decoder compiled to WebAssembly. It
 * supports template 5.42, it loads under Bun 1.3.9 without Memory64, and its
 * decoded values were verified to be bit-for-bit identical to ecCodes 2.42.0
 * over every point of the real ECMWF fields used in this slice (see SITREP.md
 * for the recorded comparison).
 *
 * What lives here
 * ---------------
 * The decoder itself: loading it once per process, and opening a container
 * (GRIB1, GRIB2 or NetCDF) into plain messages with their values, their
 * presence mask and their grid geometry.
 *
 * - `grib2-decode.server.ts` adds the GRIB2-specific container checks on top
 *   of this module and is what the ECMWF forecast path uses.
 * - `era5-land.server.ts` uses this module directly, because the Copernicus
 *   Climate Data Store serves ERA5-Land in GRIB edition 1, which the GRIB2
 *   reader cannot parse.
 *
 * The binary is inlined into the server bundle by the Vite plugin in
 * `vite.config.ts`, so a built artifact does not need a filesystem. When the
 * module runs outside a bundle (the test runner, a plain script) it falls
 * back to the installed package on disk.
 */

/** A regular latitude/longitude grid, as a message declares it. */
export interface WeatherGrid {
  /** Number of columns (Ni). */
  ni: number;
  /** Number of rows (Nj). */
  nj: number;
  /** Longitude of the first grid point, in degrees. */
  longitudeOfFirstGridPoint: number;
  /** Latitude of the first grid point, in degrees. */
  latitudeOfFirstGridPoint: number;
  /** Longitude increment between columns, in degrees. */
  iDirectionIncrement: number;
  /** Latitude increment between rows, in degrees. */
  jDirectionIncrement: number;
  /** How the values are laid out in memory. */
  scanMode: {
    /** Columns run east to west. */
    iScansNegatively: boolean;
    /** Rows run south to north. */
    jScansPositively: boolean;
    /** Columns are stored consecutively (column-major storage). */
    jPointsAreConsecutive: boolean;
    /** Rows alternate direction (boustrophedon storage). */
    alternativeRowScanning: boolean;
  };
}

/** One decoded message of a container. */
export interface DecodedWeatherMessage {
  /** Resolved parameter name, e.g. "Temperature". */
  parameter: string | null;
  /** Resolved parameter abbreviation, e.g. "2t". Null when no table resolves it. */
  abbreviation: string | null;
  /** Units as the parameter tables state them, e.g. "K". Null when unresolved. */
  units: string | null;
  /** Level description, e.g. "2" for 2 m above ground. */
  level: string | null;
  /** Level type description. */
  levelType: string | null;
  /** Reference (analysis) time as an RFC 3339 instant. */
  referenceTime: string;
  /** Forecast lead time in hours, when the message states one. */
  forecastHours: number | null;
  /** Packing description, e.g. "ccsds". */
  packing: string | null;
  /** GRIB2 discipline, when the message is GRIB2. */
  discipline: number | null;
  /** GRIB2 product definition template number, when the message is GRIB2. */
  productTemplate: number | null;
  /**
   * The raw GRIB1 timing fields, when the message is GRIB1.
   *
   * They are kept because the derived `forecastHours` is P1 whatever the
   * time range indicator says: for a message whose indicator states a period
   * (P1 to P2), P1 is the *start* of that period, not the end of the
   * accumulation. Reading the accumulation's end from these fields is the
   * only unambiguous way to place a value in time.
   */
  grib1Timing: {
    /** The unit of the time range (Code Table 4). */
    timeUnit: number;
    /** P1, the first value of the time range (PDS octet 20). */
    p1: number;
    /** P2, the second value of the time range (PDS octet 21). */
    p2: number;
    /** The time range indicator (PDS octet 22, Code Table 5). */
    timeRange: number;
  } | null;
  /** GRIB2 parameter category, when the message is GRIB2. */
  parameterCategory: number | null;
  /** GRIB2 parameter number, when the message is GRIB2. */
  parameterNumber: number | null;
  /** The originating centre, when the parameter comes from a local table. */
  localCentre: number | null;
  /** Originating centre number from the WMO Common Code Table C-11. */
  originatingCentreCode: number | null;
  /** End of the overall time interval, for accumulated fields. */
  rangeEnd: string | null;
  /** Statistical processes applied over the time range. */
  statistics: { process: number; lengthUnit: number; length: number }[];
  /** Decoded values in scan order. */
  values: Float64Array;
  /** Per-cell presence flag: 1 = present, 0 = absent (bitmap). */
  mask: Uint8Array;
  /** The grid the values sit on, when it is a regular latitude/longitude grid. */
  grid: WeatherGrid | null;
}

/** A container opened for decoding. */
export interface DecodedWeatherContainer {
  /** The container format the decoder detected, e.g. "grib2". */
  format: string;
  /** The messages the container holds. */
  messages: DecodedWeatherMessage[];
}

interface FieldglassFieldHandle {
  ni(): number;
  nj(): number;
  dtype(): "f32" | "f64";
  values(): Float32Array | Float64Array;
  mask(): Uint8Array;
  georef(): {
    kind: string;
    ni: number | null;
    nj: number | null;
    affine: { x0: number; y0: number; dx: number | null; dy: number | null } | null;
    scan: { iNegative: boolean; jPositive: boolean; jConsecutive: boolean };
    periodicX: boolean;
  };
  free(): void;
}

interface FieldglassMessageInfo {
  parameter: string | null;
  abbreviation: string | null;
  units: string | null;
  level: string | null;
  levelType: string | null;
  referenceTime: string;
  forecastHours: number | null;
  offsetHours?: number | null;
  packing: string | null;
  originatingCentreCode?: number | null;
  fingerprint: {
    edition: "grib1" | "grib2";
    discipline?: number;
    /** GRIB1: the unit of the time range (Code Table 4). */
    timeUnit?: number;
    /** GRIB1: P1, the first value of the time range (PDS octet 20). */
    p1?: number;
    /** GRIB1: P2, the second value of the time range (PDS octet 21). */
    p2?: number;
    /** GRIB1: the time range indicator (PDS octet 22, Code Table 5). */
    timeRange?: number;
    productTemplate?: number;
    parameterCategory?: number | null;
    parameterNumber?: number | null;
    localCentre?: number | null;
    rangeEnd?: string | null;
    statistics?: { process: number; lengthUnit: number; length: number }[];
  };
}

export interface FieldglassModule {
  initSync(input: { module: Uint8Array }): void;
  open(bytes: Uint8Array): {
    format(): string;
    count(): number;
    message(index: number): FieldglassMessageInfo;
    decode(index: number, options?: { dtype?: "auto" | "f32" | "f64" }): FieldglassFieldHandle;
    free(): void;
  };
}

let decoderPromise: Promise<FieldglassModule> | undefined;

/** Raised when a byte range is not a container this decoder accepts. */
export class WeatherDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeatherDecodeError";
  }
}

/**
 * Decode base64 into bytes.
 *
 * `atob` is available in every runtime this app targets (browser, Bun,
 * Node, and a Worker) and avoids pulling in a Node-only Buffer.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Read the decoder binary that the build inlined into the server bundle.
 *
 * The bundle has no filesystem and no `node_modules`, so the binary travels
 * with the code. This is a dynamic import so that a runtime without the
 * bundle (the test runner, a plain script) simply falls through to the
 * installed package on disk.
 */
async function readInlinedDecoderBytes(): Promise<Uint8Array | null> {
  try {
    const module = (await import("virtual:fieldglass-wasm")) as {
      FIELDGLASS_WASM_BASE64?: string | null;
    };
    if (!module.FIELDGLASS_WASM_BASE64) return null;
    return base64ToBytes(module.FIELDGLASS_WASM_BASE64);
  } catch {
    return null;
  }
}

/**
 * Locate the decoder's WebAssembly binary.
 *
 * The copy inlined into the bundle comes first: it is the one that works
 * without a filesystem, and preferring it keeps the two paths from disagreeing
 * about which binary is loaded. Otherwise the binary is read from the
 * installed package on disk, which is how the test runner and plain scripts
 * reach it. The binary is never fetched over the network, so decoding never
 * depends on an external request.
 */
async function readDecoderBytes(): Promise<Uint8Array> {
  const inlined = await readInlinedDecoderBytes();
  if (inlined) return inlined;

  // The filesystem fallback is only reached outside a bundle. It is reached
  // lazily, and every step of it is optional, so a runtime without a
  // filesystem or without `node:module` simply has no fallback rather than
  // failing to import this module at all.
  const candidates: string[] = [];
  try {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    candidates.push(require.resolve("@fieldglass/wasm/fieldglass_wasm_bg.wasm"));
  } catch {
    /* the package is not resolvable from this module's location */
  }
  try {
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    candidates.push(
      join(
        here,
        "..",
        "..",
        "..",
        "node_modules",
        "@fieldglass",
        "wasm",
        "fieldglass_wasm_bg.wasm",
      ),
    );
    candidates.push(
      join(process.cwd(), "node_modules", "@fieldglass", "wasm", "fieldglass_wasm_bg.wasm"),
    );
  } catch {
    /* this runtime has no usable module URL */
  }

  const tried: string[] = [];
  for (const candidate of candidates) {
    try {
      const { readFile } = await import("node:fs/promises");
      return new Uint8Array(await readFile(candidate));
    } catch {
      tried.push(candidate);
    }
  }
  throw new WeatherDecodeError(
    `The GRIB2 decoder binary could not be read from any known location (tried: ${tried.join(", ")}).`,
  );
}

/**
 * Load and initialise the decoder once per process.
 *
 * `initSync` is idempotent, so a repeated call is harmless; the module is
 * cached anyway so the WebAssembly binary is read only once.
 */
export async function loadFieldglass(): Promise<FieldglassModule> {
  decoderPromise ??= (async () => {
    const wasmBytes = await readDecoderBytes();
    const module = (await import("@fieldglass/wasm")) as unknown as FieldglassModule;
    module.initSync({ module: wasmBytes });
    return module;
  })();
  return decoderPromise;
}

/** Read the grid a decoded field sits on, when it is a regular lat/lon grid. */
function readGrid(field: FieldglassFieldHandle): WeatherGrid | null {
  const georef = field.georef();
  if (georef.kind !== "latlon") return null;
  if (!georef.affine) return null;
  // A grid with a single row or a single column has no step on that axis,
  // and the decoder leaves it unset. Such a grid is still usable, so the step
  // is recorded as zero and the cell selection treats the single row or
  // column as the only one there is.
  if (georef.affine.dx === null && field.ni() > 1) return null;
  if (georef.affine.dy === null && field.nj() > 1) return null;
  const ni = field.ni();
  const nj = field.nj();
  if (!ni || !nj) return null;
  // The scan direction is taken from the *signed* increments rather than from
  // the decoder's scan flags. The two GRIB editions number their scanning-mode
  // bits differently, so the same grid reports opposite flags in GRIB1 and in
  // GRIB2, while the affine geometry — the first point and the signed steps —
  // says the same thing in both. A negative longitude step means the columns
  // run east to west; a negative latitude step means the rows run north to
  // south.
  const iStep = georef.affine.dx ?? 0;
  const jStep = georef.affine.dy ?? 0;
  return {
    ni,
    nj,
    longitudeOfFirstGridPoint: georef.affine.x0,
    latitudeOfFirstGridPoint: georef.affine.y0,
    iDirectionIncrement: Math.abs(iStep),
    jDirectionIncrement: Math.abs(jStep),
    scanMode: {
      iScansNegatively: iStep < 0,
      jScansPositively: jStep > 0,
      jPointsAreConsecutive: georef.scan.jConsecutive,
      alternativeRowScanning: false,
    },
  };
}

/**
 * Open a container and decode every message in it.
 *
 * The decoder detects the format from the bytes, so the same call reads the
 * GRIB edition 1 files the Climate Data Store serves and the GRIB edition 2
 * files ECMWF publishes.
 */
export async function decodeWeatherContainer(bytes: Uint8Array): Promise<DecodedWeatherContainer> {
  const decoder = await loadFieldglass();
  const handle = decoder.open(bytes);
  try {
    const format = handle.format();
    const count = handle.count();
    const messages: DecodedWeatherMessage[] = [];
    for (let index = 0; index < count; index += 1) {
      const info = handle.message(index);
      const field = handle.decode(index, { dtype: "f64" });
      try {
        const values = field.values();
        if (!(values instanceof Float64Array)) {
          throw new WeatherDecodeError("Decoder did not return double-precision values.");
        }
        messages.push({
          parameter: info.parameter,
          abbreviation: info.abbreviation,
          units: info.units,
          level: info.level,
          levelType: info.levelType,
          referenceTime: info.referenceTime,
          forecastHours: info.forecastHours,
          packing: info.packing,
          discipline:
            info.fingerprint.edition === "grib2" ? (info.fingerprint.discipline ?? null) : null,
          productTemplate:
            info.fingerprint.edition === "grib2"
              ? (info.fingerprint.productTemplate ?? null)
              : null,
          grib1Timing:
            info.fingerprint.edition === "grib1" &&
            info.fingerprint.timeUnit !== undefined &&
            info.fingerprint.p1 !== undefined &&
            info.fingerprint.p2 !== undefined &&
            info.fingerprint.timeRange !== undefined
              ? {
                  timeUnit: info.fingerprint.timeUnit,
                  p1: info.fingerprint.p1,
                  p2: info.fingerprint.p2,
                  timeRange: info.fingerprint.timeRange,
                }
              : null,
          parameterCategory: info.fingerprint.parameterCategory ?? null,
          parameterNumber: info.fingerprint.parameterNumber ?? null,
          localCentre: info.fingerprint.localCentre ?? null,
          originatingCentreCode: info.originatingCentreCode ?? null,
          rangeEnd: info.fingerprint.rangeEnd ?? null,
          statistics: info.fingerprint.statistics ?? [],
          values,
          mask: field.mask(),
          grid: readGrid(field),
        });
      } finally {
        field.free();
      }
    }
    return { format, messages };
  } finally {
    handle.free();
  }
}
