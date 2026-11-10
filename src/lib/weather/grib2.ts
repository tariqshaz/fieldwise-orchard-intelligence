/**
 * Minimal, dependency-free GRIB2 (WMO FM 92) container reader.
 *
 * This module reads the framing and the grid geometry of a GRIB2 message. It
 * never decodes packed values: that is the job of `grib2-decode.server.ts`.
 * The split is deliberate. Everything here is pure and synchronous, so the
 * message rules can be unit-tested without a decoder, without a network and
 * without a runtime that can execute WebAssembly.
 *
 * What it establishes:
 *
 *   - the message boundaries: the "GRIB" indicator, the edition, the 8-octet
 *     total length and the "7777" terminator;
 *   - which sections are present and how long each one is, so a truncated or
 *     mis-offset byte range cannot be mistaken for a complete message;
 *   - the data representation template number, so a change of packing (for
 *     example away from the CCSDS/AEC template 5.42 that ECMWF Open Data
 *     uses) is noticed rather than silently decoded;
 *   - the regular latitude/longitude grid definition and its scan mode, so
 *     the nearest grid cell can be selected without trusting a decoder's own
 *     geometry.
 *
 * Section length fields
 * ---------------------
 * The WMO manual allows a three-octet length field for sections 2-5 and 7 and
 * a four-octet field for sections 1 and 6. ECMWF Open Data IFS writes
 * four-octet fields throughout. The reader therefore accepts either width and
 * resolves the ambiguity by requiring the walk to consume the message exactly
 * and end on the "7777" terminator, so the interpretation is self-checking
 * rather than assumed.
 *
 * The grid definition is read with the layout ECMWF Open Data uses, which is
 * the standard grid definition template 3.0 preceded by the section header
 * fields. The values it produces were checked against ecCodes 2.42.0 for the
 * real ECMWF fields used by this slice; see SITREP.md for the recorded
 * comparison.
 */

/** GRIB2 section numbers. */
export type Grib2SectionNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** How the values of a grid are laid out in memory (Section 3 scan mode). */
export interface Grib2ScanMode {
  /** Columns run east to west. */
  iScansNegatively: boolean;
  /** Rows run south to north. */
  jScansPositively: boolean;
  /** Columns are stored consecutively (column-major storage). */
  jPointsAreConsecutive: boolean;
  /** Rows alternate direction (boustrophedon storage). */
  alternativeRowScanning: boolean;
}

/** Regular latitude/longitude grid definition (grid definition template 3.0). */
export interface Grib2LatLonGrid extends RegularLatLonGrid {
  /** Number of data points the grid definition states. */
  numberOfDataPoints: number;
  /** Latitude of the last grid point, in degrees. */
  latitudeOfLastGridPoint: number;
  /** Longitude of the last grid point, in degrees. */
  longitudeOfLastGridPoint: number;
}

/**
 * The part of a regular latitude/longitude grid that the cell selection
 * needs.
 *
 * It is kept separate from the full grid definition so that a grid read from
 * a decoder's own geometry — where the last grid point is not stated — can
 * be used with the same selection rule as a grid read out of Section 3.
 */
export interface RegularLatLonGrid {
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
  /** Storage order of the values. */
  scanMode: Grib2ScanMode;
}

/** The framing of one GRIB2 message. */
export interface Grib2Structure {
  /** Total message length declared in octets 9-16. */
  declaredTotalLength: number;
  /** GRIB edition (2). */
  edition: number;
  /** Discipline (Code Table 0.0). */
  discipline: number;
  /** Section numbers present, in order. */
  sections: number[];
  /** Length of each section, in the same order as `sections`. */
  sectionLengths: number[];
  /** Data representation template number (Section 5); 42 is CCSDS/AEC. */
  dataRepresentationTemplateNumber: number;
  /** Grid definition, when the message carries a regular latitude/longitude grid. */
  grid: Grib2LatLonGrid | null;
}

/** Raised when a byte buffer is not a GRIB2 message this reader accepts. */
export class Grib2StructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Grib2StructureError";
  }
}

const GRIB_INDICATOR = 0x47524942; // "GRIB"
const SECTION_TERMINATOR = 0x37373737; // "7777"

/** Data representation template number for the CCSDS/AEC packing ECMWF uses. */
export const GRIB2_CSDS_TEMPLATE = 42;

/** Grid definition template number for a regular latitude/longitude grid. */
const GRID_TEMPLATE_LAT_LON = 0;

interface SectionHeader {
  /** Offset of the section start. */
  start: number;
  /** Total length of the section in octets. */
  length: number;
  /** Number of octets the length field itself occupies (3 or 4). */
  lengthOctets: number;
  /** Section number. */
  number: number;
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * Read a GRIB2 signed integer.
 *
 * GRIB2 does not use two's complement for signed values. The most
 * significant bit carries the sign and the remaining bits hold the magnitude,
 * which is how ECMWF encodes a latitude of last grid point of -90 degrees
 * (0x855D4A80) and how ecCodes reports it.
 */
function readGrib2SignedInt32(view: DataView, offset: number): number {
  const raw = view.getUint32(offset, false);
  const magnitude = raw & 0x7fffffff;
  return (raw & 0x80000000) !== 0 ? -magnitude : magnitude;
}

/**
 * Walk the sections of a GRIB2 message.
 *
 * Both the three- and four-octet length field widths are tried, and only a
 * walk that consumes the message exactly and ends on the "7777" terminator is
 * accepted. A message that satisfies neither is rejected.
 */
function walkSections(bytes: Uint8Array): SectionHeader[] {
  const view = viewOf(bytes);
  const attempts: SectionHeader[][] = [];

  for (const lengthOctets of [4, 3]) {
    const sections: SectionHeader[] = [];
    let offset = 16;
    let ok = true;
    while (offset < bytes.length) {
      // Section 8 is the "7777" terminator; it has no length field.
      if (offset + 4 === bytes.length && view.getUint32(offset, false) === SECTION_TERMINATOR) {
        sections.push({ start: offset, length: 4, lengthOctets, number: 8 });
        break;
      }
      if (offset + lengthOctets + 1 > bytes.length) {
        ok = false;
        break;
      }
      const length =
        lengthOctets === 4
          ? view.getUint32(offset, false)
          : (view.getUint8(offset) << 16) |
            (view.getUint8(offset + 1) << 8) |
            view.getUint8(offset + 2);
      const number = bytes[offset + lengthOctets];
      if (number < 1 || number > 7) {
        ok = false;
        break;
      }
      if (length < lengthOctets + 1 || offset + length > bytes.length) {
        ok = false;
        break;
      }
      sections.push({ start: offset, length, lengthOctets, number });
      offset += length;
    }
    if (ok && sections.length > 0) {
      const last = sections[sections.length - 1];
      if (last.number === 8 && last.start + last.length === bytes.length) attempts.push(sections);
    }
  }

  if (attempts.length === 0) {
    throw new Grib2StructureError(
      "GRIB2 section lengths are inconsistent with the message length.",
    );
  }
  // Prefer the widest length field when both readings are self-consistent.
  attempts.sort((a, b) => b[0].lengthOctets - a[0].lengthOctets);
  return attempts[0];
}

/** Read the framing and grid definition of a single GRIB2 message. */
export function readGrib2Structure(bytes: Uint8Array): Grib2Structure {
  if (bytes.length < 16) {
    throw new Grib2StructureError("Buffer is too short to contain a GRIB2 message.");
  }
  const view = viewOf(bytes);
  if (view.getUint32(0, false) !== GRIB_INDICATOR) {
    throw new Grib2StructureError("Buffer does not start with the GRIB indicator.");
  }
  const discipline = bytes[6];
  const edition = bytes[7];
  if (edition !== 2) {
    throw new Grib2StructureError(
      `Unsupported GRIB edition ${edition}; only edition 2 is supported.`,
    );
  }
  const declaredTotalLength = Number(view.getBigUint64(8, false));
  if (declaredTotalLength !== bytes.length) {
    throw new Grib2StructureError(
      `GRIB2 total length ${declaredTotalLength} does not match the ${bytes.length}-byte message.`,
    );
  }
  if (view.getUint32(bytes.length - 4, false) !== SECTION_TERMINATOR) {
    throw new Grib2StructureError("GRIB2 message is missing its 7777 terminator.");
  }

  const sections = walkSections(bytes);
  const section5 = sections.find((section) => section.number === 5);
  if (!section5) {
    throw new Grib2StructureError("GRIB2 message has no Section 5.");
  }
  // Section 5: length field, section number, number of data points (4 octets),
  // then the data representation template number.
  const templateOffset = section5.start + section5.lengthOctets + 5;
  if (templateOffset + 2 > bytes.length) {
    throw new Grib2StructureError("GRIB2 Section 5 is truncated.");
  }
  const dataRepresentationTemplateNumber = view.getUint16(templateOffset, false);

  const section3 = sections.find((section) => section.number === 3);
  const grid = section3 ? readLatLonGrid(bytes, section3) : null;

  return {
    declaredTotalLength,
    edition,
    discipline,
    sections: sections.map((section) => section.number),
    sectionLengths: sections.map((section) => section.length),
    dataRepresentationTemplateNumber,
    grid,
  };
}

/**
 * Read the regular latitude/longitude grid definition from Section 3.
 *
 * Returns null for any other grid type, so the caller decides whether an
 * unsupported grid is a failure.
 *
 * Section 3 layout
 * ---------------
 * The offsets below are the ones ECMWF Open Data IFS writes, and they were
 * settled against ecCodes 2.42.0 rather than assumed: `Ni`, `Nj`, the first
 * and last grid points and both increments are read from the octets the
 * section actually carries, and the geometry is then checked against itself
 * (see the end of this function). A layout that did not fit would fail those
 * checks and be refused rather than mis-read.
 *
 * The scanning mode is read from its first octet, which is where the four
 * flags live, and only from inside the section: the octet is read, not four
 * octets, so a short section cannot make the reader wander into the next one.
 */
function readLatLonGrid(bytes: Uint8Array, section: SectionHeader): Grib2LatLonGrid | null {
  const view = viewOf(bytes);
  // Section 3: length field, section number, source of grid definition,
  // number of data points, number of octets for the optional list, grid
  // definition template number, then grid template 3.0.
  const headerEnd = section.start + section.lengthOctets + 1;
  const numberOfDataPoints = view.getUint32(headerEnd + 1, false);
  const templateNumber = view.getUint16(headerEnd + 6, false);
  if (templateNumber !== GRID_TEMPLATE_LAT_LON) return null;

  // Grid template 3.0 begins after the section header.
  const template = headerEnd + 9;
  const ni = view.getUint32(template + 16, false);
  const nj = view.getUint32(template + 20, false);
  const latitudeOfFirstGridPoint = readGrib2SignedInt32(view, template + 32) / 1e6;
  const longitudeOfFirstGridPoint = readGrib2SignedInt32(view, template + 36) / 1e6;
  const latitudeOfLastGridPoint = readGrib2SignedInt32(view, template + 41) / 1e6;
  const longitudeOfLastGridPoint = readGrib2SignedInt32(view, template + 45) / 1e6;
  const iDirectionIncrement = view.getUint32(template + 49, false) / 1e6;
  const jDirectionIncrement = view.getUint32(template + 53, false) / 1e6;

  // The scanning mode is the last field of the grid template. Its first
  // octet carries the four flags; the rest of the field is reserved. It is
  // read as one octet, and only when it lies inside the section.
  const scanModeOffset = template + 57;
  if (scanModeOffset >= section.start + section.length) return null;
  const scanModeValue = view.getUint8(scanModeOffset);

  const grid: Grib2LatLonGrid = {
    ni,
    nj,
    numberOfDataPoints,
    latitudeOfFirstGridPoint,
    longitudeOfFirstGridPoint,
    latitudeOfLastGridPoint,
    longitudeOfLastGridPoint,
    iDirectionIncrement,
    jDirectionIncrement,
    scanMode: {
      iScansNegatively: (scanModeValue & 0x80) !== 0,
      jScansPositively: (scanModeValue & 0x40) !== 0,
      jPointsAreConsecutive: (scanModeValue & 0x20) !== 0,
      alternativeRowScanning: (scanModeValue & 0x10) !== 0,
    },
  };

  // A regular grid holds exactly one point per cell, and the stated
  // increments must reproduce the stated first and last grid points. Checking
  // the geometry against itself is what makes the offsets trustworthy: a
  // mis-read offset would not satisfy both conditions at once.
  if (grid.ni * grid.nj !== grid.numberOfDataPoints) return null;
  if (!grid.iDirectionIncrement || !grid.jDirectionIncrement) return null;
  const expectedLatitudeSpan = (grid.nj - 1) * grid.jDirectionIncrement;
  if (
    Math.abs(
      Math.abs(grid.latitudeOfLastGridPoint - grid.latitudeOfFirstGridPoint) - expectedLatitudeSpan,
    ) > 1e-3
  ) {
    return null;
  }
  const expectedLongitudeSpan = (grid.ni - 1) * grid.iDirectionIncrement;
  const rawLongitudeSpan = Math.abs(grid.longitudeOfLastGridPoint - grid.longitudeOfFirstGridPoint);
  const wrapsGlobally = Math.abs(grid.ni * grid.iDirectionIncrement - 360) < 1e-3;
  const longitudeSpanToCompare = wrapsGlobally
    ? 360 - grid.iDirectionIncrement
    : Math.min(rawLongitudeSpan, 360 - rawLongitudeSpan);
  if (Math.abs(longitudeSpanToCompare - expectedLongitudeSpan) > 1e-3) return null;
  return grid;
}

/** Normalize a longitude to the (-180, 180] range. */
export function normalizeLongitude(longitude: number): number {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

/** A grid cell selected for a geographic point. */
export interface Grib2GridSelection {
  /** Column index of the selected cell, counted from the first grid point. */
  column: number;
  /** Row index of the selected cell, counted from the first grid point. */
  row: number;
  /** Index of the selected cell in the message's value array. */
  index: number;
  /** Longitude of the selected cell centre, in degrees. */
  cellLongitude: number;
  /** Latitude of the selected cell centre, in degrees. */
  cellLatitude: number;
}

/**
 * Select the grid cell nearest to a geographic point on a regular
 * latitude/longitude grid.
 *
 * The cell whose centre is closest in longitude (wrapping around the globe on
 * global grids) and in latitude is chosen. When a point falls exactly halfway
 * between two cells the lower index is taken, which is the tie-break ecCodes
 * applies.
 *
 * Storage orders other than row-major (columns stored consecutively, rows
 * alternating direction) are rejected rather than guessed at, because the
 * value array index would otherwise be wrong.
 */
export function selectNearestGridCell(
  grid: RegularLatLonGrid,
  longitude: number,
  latitude: number,
): Grib2GridSelection {
  if (grid.scanMode.jPointsAreConsecutive || grid.scanMode.alternativeRowScanning) {
    throw new Grib2StructureError(
      "GRIB2 scan mode needs a coordinate-array mapping; refusing to assume a cell index.",
    );
  }
  const { ni, nj, iDirectionIncrement, jDirectionIncrement } = grid;
  if (!ni || !nj) {
    throw new Grib2StructureError("GRIB2 grid definition is incomplete.");
  }
  // A grid with a single column or a single row has no step on that axis; it
  // is still a usable grid, and the selection below treats it as the only
  // cell on that axis.
  if (ni > 1 && !iDirectionIncrement) {
    throw new Grib2StructureError("GRIB2 grid definition is incomplete.");
  }
  if (nj > 1 && !jDirectionIncrement) {
    throw new Grib2StructureError("GRIB2 grid definition is incomplete.");
  }

  const globalLongitudeGrid = Math.abs(ni * iDirectionIncrement - 360) < iDirectionIncrement * 1.1;

  let longitudeOffset = grid.scanMode.iScansNegatively
    ? grid.longitudeOfFirstGridPoint - longitude
    : longitude - grid.longitudeOfFirstGridPoint;
  if (globalLongitudeGrid) {
    longitudeOffset = ((longitudeOffset % 360) + 360) % 360;
  }
  const column =
    ni === 1 || !iDirectionIncrement
      ? 0
      : clampIndex(Math.floor(longitudeOffset / iDirectionIncrement + 0.5 - 1e-9), ni);

  const latitudeOffset = grid.scanMode.jScansPositively
    ? latitude - grid.latitudeOfFirstGridPoint
    : grid.latitudeOfFirstGridPoint - latitude;
  // A grid with a single row (or a single column) has no step on that axis,
  // and there is only one cell to choose.
  const row =
    nj === 1 || !jDirectionIncrement
      ? 0
      : clampIndex(Math.floor(latitudeOffset / jDirectionIncrement + 0.5 - 1e-9), nj);

  const cellLongitude =
    grid.longitudeOfFirstGridPoint +
    (grid.scanMode.iScansNegatively ? -1 : 1) * column * iDirectionIncrement;
  const cellLatitude =
    grid.latitudeOfFirstGridPoint +
    (grid.scanMode.jScansPositively ? 1 : -1) * row * jDirectionIncrement;

  return {
    column,
    row,
    // The first point in Section 3 is the first value in the array. The scan
    // direction changes the coordinate reached by each increment; it does
    // not reverse the index a second time.
    index: row * ni + column,
    cellLongitude: normalizeLongitude(cellLongitude),
    cellLatitude,
  };
}

function clampIndex(value: number, count: number): number {
  if (!Number.isFinite(value)) {
    throw new Grib2StructureError("GRIB2 grid selection produced a non-finite index.");
  }
  return Math.min(count - 1, Math.max(0, value));
}
