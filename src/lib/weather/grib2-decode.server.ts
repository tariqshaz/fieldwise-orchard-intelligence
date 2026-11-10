/**
 * GRIB2 container checks for the ECMWF adapter — server-only (`.server.ts`).
 *
 * Division of labour
 * ------------------
 * `fieldglass.server.ts` owns the WebAssembly decoder and the values.
 * `grib2.ts` (pure, dependency-free) owns the container: the message
 * boundaries, the section walk, the data representation template number and
 * the grid definition. This module joins the two and adds what the ECMWF path
 * needs on top:
 *
 *   - the GRIB2 framing checks, so a truncated or mis-offset byte range is
 *     never mistaken for a complete message;
 *   - the data representation template number, so a change of packing (for
 *     example away from the CCSDS/AEC template 5.42 that ECMWF Open Data
 *     uses) is noticed rather than silently decoded;
 *   - a cross-check of the two independent readings of the grid — the
 *     Section 3 offsets and the decoder's own geometry — so that a
 *     disagreement is a failure rather than a silently wrong cell index.
 *
 * All provider access, byte range handling and grid selection live in
 * `ecmwf-ifs.server.ts`.
 */

import {
  GRIB2_CSDS_TEMPLATE,
  readGrib2Structure,
  type Grib2LatLonGrid,
  type Grib2Structure,
} from "./grib2.ts";
import {
  decodeWeatherContainer,
  WeatherDecodeError,
  type WeatherGrid,
} from "./fieldglass.server.ts";

/** One statistical process of a GRIB2 time range (Code Table 4.10 and 4.4). */
export interface Grib2StatisticalStep {
  /** The process: 1 = accumulation, 0 = average. */
  process: number;
  /** The unit of `length` (Code Table 4.4). */
  lengthUnit: number;
  /** How long the process runs over, in `lengthUnit`s. */
  length: number;
}

/** A decoded GRIB2 message: container, grid, metadata and values. */
export interface DecodedGrib2Field {
  /** Message framing and the data representation template. */
  structure: Grib2Structure;
  /** The regular latitude/longitude grid the message declares. */
  grid: Grib2LatLonGrid;
  /** Resolved parameter name, e.g. "Temperature". */
  parameter: string | null;
  /** Resolved parameter abbreviation, e.g. "TMP". Null when no table resolves it. */
  abbreviation: string | null;
  /** Units as the parameter tables state them, e.g. "K". Null when unresolved. */
  units: string | null;
  /** Level description, e.g. "2" for 2 m above ground. */
  level: string | null;
  /** Level type description. */
  levelType: string | null;
  /** Reference (issue) time as an RFC 3339 instant. */
  referenceTime: string;
  /** Forecast lead time in hours, when the message states one. */
  forecastHours: number | null;
  /** End of the overall time interval, for accumulated fields. */
  rangeEnd: string | null;
  /** Statistical processes applied over the time range. */
  statistics: Grib2StatisticalStep[];
  /** GRIB2 discipline. */
  discipline: number;
  /** GRIB2 product definition template number. */
  productTemplate: number;
  /** GRIB2 parameter category. */
  parameterCategory: number | null;
  /** GRIB2 parameter number. */
  parameterNumber: number | null;
  /** Local centre identifier, when the message uses a local parameter table. */
  localCentre: number | null;
  /** Originating centre number from the WMO Common Code Table C-11. */
  originatingCentreCode: number | null;
  /** Packing description, e.g. "ccsds". */
  packing: string | null;
  /** Decoded values in scan order. */
  values: Float64Array;
  /** Per-cell presence flag: 1 = present, 0 = absent (bitmap). */
  mask: Uint8Array;
}

/** Raised when a byte range is not a GRIB2 message this decoder accepts. */
export class Grib2DecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Grib2DecodeError";
  }
}

/**
 * Decode a single GRIB2 message.
 *
 * The container is read by `grib2.ts` (which also rejects a truncated or
 * mis-framed byte range), the values and metadata come from the WebAssembly
 * decoder, and the two readings of the grid are compared. Any disagreement
 * about the shape of the grid is a failure, because the cell index depends
 * on it.
 */
export async function decodeGrib2Field(bytes: Uint8Array): Promise<DecodedGrib2Field> {
  const structure = readGrib2Structure(bytes);
  if (structure.dataRepresentationTemplateNumber !== GRIB2_CSDS_TEMPLATE) {
    throw new Grib2DecodeError(
      `GRIB2 data representation template ${structure.dataRepresentationTemplateNumber} is not the CCSDS/AEC packing (template ${GRIB2_CSDS_TEMPLATE}) this adapter expects.`,
    );
  }
  const grid = structure.grid;
  if (!grid) {
    throw new Grib2DecodeError(
      "GRIB2 message does not declare a regular latitude/longitude grid; this adapter only samples those.",
    );
  }

  const container = await decodeWeatherContainer(bytes);
  if (container.messages.length !== 1) {
    throw new Grib2DecodeError(
      `Expected a single GRIB2 message in the byte range, found ${container.messages.length}.`,
    );
  }
  const message = container.messages[0];
  const decodedGrid = message.grid;
  if (!decodedGrid) {
    throw new Grib2DecodeError(
      "The decoded field is not on a regular latitude/longitude grid; this adapter only samples those.",
    );
  }
  assertGridsAgree(grid, decodedGrid);

  return {
    structure,
    grid,
    parameter: message.parameter,
    abbreviation: message.abbreviation,
    units: message.units,
    level: message.level,
    levelType: message.levelType,
    referenceTime: message.referenceTime,
    forecastHours: message.forecastHours,
    rangeEnd: message.rangeEnd,
    statistics: message.statistics,
    discipline: message.discipline ?? structure.discipline,
    productTemplate: message.productTemplate ?? 0,
    parameterCategory: message.parameterCategory,
    parameterNumber: message.parameterNumber,
    localCentre: message.localCentre,
    originatingCentreCode: message.originatingCentreCode,
    packing: message.packing,
    values: message.values,
    mask: message.mask,
  };
}

/**
 * Check the two independent readings of the grid against each other.
 *
 * `grib2.ts` reads the grid definition out of Section 3; the WebAssembly
 * decoder reads the same grid out of the message it parsed. They are read by
 * different code over the same bytes, so agreement between them is evidence
 * that the value array is indexed the way `grib2.ts` expects. A disagreement
 * means the cell index would be wrong, so it is refused rather than guessed.
 */
function assertGridsAgree(grid: Grib2LatLonGrid, decoded: WeatherGrid): void {
  if (decoded.ni !== grid.ni || decoded.nj !== grid.nj) {
    throw new Grib2DecodeError(
      `GRIB2 grid shape disagreement: the message declares ${grid.ni}x${grid.nj}, the decoder read ${decoded.ni}x${decoded.nj}.`,
    );
  }
  if (Math.abs(decoded.longitudeOfFirstGridPoint - grid.longitudeOfFirstGridPoint) > 1e-4) {
    throw new Grib2DecodeError(
      "GRIB2 grid definition disagrees with the decoder about the first longitude.",
    );
  }
  if (Math.abs(decoded.latitudeOfFirstGridPoint - grid.latitudeOfFirstGridPoint) > 1e-4) {
    throw new Grib2DecodeError(
      "GRIB2 grid definition disagrees with the decoder about the first latitude.",
    );
  }
  if (Math.abs(decoded.iDirectionIncrement - grid.iDirectionIncrement) > 1e-6) {
    throw new Grib2DecodeError(
      "GRIB2 grid definition disagrees with the decoder about the longitude increment.",
    );
  }
  if (Math.abs(decoded.jDirectionIncrement - grid.jDirectionIncrement) > 1e-6) {
    throw new Grib2DecodeError(
      "GRIB2 grid definition disagrees with the decoder about the latitude increment.",
    );
  }
}

/** Re-exported so callers can catch both decoder failures with one type. */
export { WeatherDecodeError };
