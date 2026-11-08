/**
 * Phase 1 geospatial foundation.
 *
 * This module accepts a GeoJSON FeatureCollection containing one estate boundary
 * and zero or more sector polygons, validates it without silently repairing the
 * data, and normalises it for map display. Coordinates are WGS84 longitude /
 * latitude per RFC 7946. Nothing here geocodes, guesses, or generates geometry.
 */

export type BoundaryPosition = [number, number];
export type BoundaryRing = BoundaryPosition[];
export type BoundaryPolygon = BoundaryRing[];
export type BoundaryMultiPolygon = BoundaryPolygon[];

export interface BoundaryBbox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface ImportedSectorBoundary {
  /** Must match an existing `Sector.id` in the typed domain model. */
  sectorId: string;
  polygons: BoundaryMultiPolygon;
}

export interface ImportedBoundary {
  version: 1;
  estateId: string;
  importedAt: string;
  sourceName: string;
  estate: BoundaryMultiPolygon;
  sectors: ImportedSectorBoundary[];
  bbox: BoundaryBbox;
}

export interface BoundaryValidationOptions {
  estateId: string;
  knownSectorIds: readonly string[];
  sourceName: string;
  now?: Date;
}

export type BoundaryValidationResult =
  | { ok: true; boundary: ImportedBoundary; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

export interface BoundarySummary {
  center: { lat: number; lon: number };
  extentKm: { width: number; height: number };
}

export interface ProjectedBoundary {
  estatePath: string;
  sectors: Array<{ sectorId: string; path: string; labelX: number; labelY: number }>;
  summary: BoundarySummary;
}

// ---------------------------------------------------------------------------
// Limits. These are documented, intentional caps that keep client-side
// validation predictable and never silently accept oversized geometry.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "fieldwise.imported-boundary.v1";
const MAP_PADDING = 6;

/** Maximum features in one FeatureCollection. */
const MAX_FEATURES = 500;
/** Maximum characters accepted for the raw GeoJSON input (covers paste and file). */
const MAX_INPUT_CHARS = 2_000_000;
/** Maximum vertices allowed in a single ring. Larger rings are rejected before
    any expensive pairwise processing. */
const MAX_RING_VERTICES = 10_000;
/** Maximum total vertices across every ring in the import. */
const MAX_TOTAL_VERTICES = 100_000;
/** Bound grid-cell allocation during ring self-intersection checks. */
const MAX_GRID_CELL_VISITS = 250_000;
/** Bound exact segment comparisons for one ring. */
const MAX_SELF_INTERSECTION_TESTS = 2_000_000;
/** Bound cross-geometry segment comparisons before relationship validation. */
const MAX_RELATIONSHIP_SEGMENT_COMPARISONS = 2_000_000;
type VertexBudget = {
  total: number;
  crossRingComparisons: number;
  gridCellVisits: number;
  selfIntersectionTests: number;
};
/** Maximum rings (outer + holes) allowed in one Polygon geometry. */
const MAX_RINGS_PER_GEOMETRY = 32;

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

class GeoJsonError extends Error {}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toFixed(6) : String(value);
}

function readPosition(value: unknown, label: string): BoundaryPosition {
  if (!Array.isArray(value) || value.length < 2) {
    throw new GeoJsonError(`${label} must be a [longitude, latitude] array.`);
  }

  const lon = value[0];
  const lat = value[1];

  if (typeof lon !== "number" || !Number.isFinite(lon)) {
    throw new GeoJsonError(`${label} has a non-numeric longitude.`);
  }
  if (typeof lat !== "number" || !Number.isFinite(lat)) {
    throw new GeoJsonError(`${label} has a non-numeric latitude.`);
  }
  if (lon < -180 || lon > 180) {
    throw new GeoJsonError(
      `${label} longitude ${formatNumber(lon)} is outside the valid -180…180 range. ` +
        "GeoJSON coordinates must be WGS84 longitude/latitude, not projected metres.",
    );
  }
  if (lat < -90 || lat > 90) {
    throw new GeoJsonError(
      `${label} latitude ${formatNumber(lat)} is outside the valid -90…90 range. ` +
        "GeoJSON coordinates must be WGS84 longitude/latitude, not projected metres.",
    );
  }

  return [lon, lat];
}

function ringSignedArea(ring: BoundaryRing) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return area / 2;
}

function orientation(a: BoundaryPosition, b: BoundaryPosition, c: BoundaryPosition) {
  const value = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(value) < 1e-12) return 0;
  return value > 0 ? 1 : -1;
}

function pointOnSegment(a: BoundaryPosition, b: BoundaryPosition, point: BoundaryPosition) {
  return (
    Math.min(a[0], b[0]) - 1e-12 <= point[0] &&
    point[0] <= Math.max(a[0], b[0]) + 1e-12 &&
    Math.min(a[1], b[1]) - 1e-12 <= point[1] &&
    point[1] <= Math.max(a[1], b[1]) + 1e-12
  );
}

/** True only for a proper crossing: the segments intersect in the interior of
 * both segments. Endpoint touching and collinear overlap are NOT proper
 * crossings; callers use this to distinguish "shared border" from overlap. */
function properSegmentsIntersect(
  a: BoundaryPosition,
  b: BoundaryPosition,
  c: BoundaryPosition,
  d: BoundaryPosition,
) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

/** True for collinear segments that overlap along a positive-length interval. */
function collinearSegmentsOverlap(
  a: BoundaryPosition,
  b: BoundaryPosition,
  c: BoundaryPosition,
  d: BoundaryPosition,
) {
  if (orientation(a, b, c) !== 0 || orientation(a, b, d) !== 0) return false;
  const useX = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  const a0 = useX ? a[0] : a[1];
  const a1 = useX ? b[0] : b[1];
  const b0 = useX ? c[0] : c[1];
  const b1 = useX ? d[0] : d[1];
  return (
    Math.min(Math.max(a0, a1), Math.max(b0, b1)) - Math.max(Math.min(a0, a1), Math.min(b0, b1)) >
    1e-12
  );
}

/** Detect a positive-length collinear edge overlap whose polygon interiors
 * lie on the same side. Opposite-side overlaps are valid shared borders. */
function collinearOverlapSameInterior(
  ringA: BoundaryRing,
  a: BoundaryPosition,
  b: BoundaryPosition,
  ringB: BoundaryRing,
  c: BoundaryPosition,
  d: BoundaryPosition,
) {
  if (!collinearSegmentsOverlap(a, b, c, d)) return false;
  const dot = (b[0] - a[0]) * (d[0] - c[0]) + (b[1] - a[1]) * (d[1] - c[1]);
  return Math.sign(ringSignedArea(ringA)) * Math.sign(ringSignedArea(ringB)) * Math.sign(dot) > 0;
}

function segmentsIntersect(
  a: BoundaryPosition,
  b: BoundaryPosition,
  c: BoundaryPosition,
  d: BoundaryPosition,
) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && pointOnSegment(a, b, c)) return true;
  if (o2 === 0 && pointOnSegment(a, b, d)) return true;
  if (o3 === 0 && pointOnSegment(c, d, a)) return true;
  if (o4 === 0 && pointOnSegment(c, d, b)) return true;

  return false;
}

/** True if `point` lies on any edge of `ring` (including a vertex). */
function pointOnRing(point: BoundaryPosition, ring: BoundaryRing) {
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (pointOnSegment(ring[j], ring[i], point)) return true;
  }
  return false;
}

function pointInRing(point: BoundaryPosition, ring: BoundaryRing) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const crosses = yi > point[1] !== yj > point[1];
    const xAtY = ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;

    if (crosses && point[0] < xAtY) inside = !inside;
  }

  return inside;
}

/** Find an interior point of a valid simple ring on a scanline between vertex levels. */
function interiorPointOfRing(ring: BoundaryRing): BoundaryPosition | null {
  const levels = [...new Set(ring.slice(0, -1).map((point) => point[1]))].sort((a, b) => a - b);
  let scanY: number | null = null;
  let largestGap = 0;
  for (let i = 0; i < levels.length - 1; i++) {
    const gap = levels[i + 1] - levels[i];
    if (gap > largestGap) {
      largestGap = gap;
      scanY = (levels[i] + levels[i + 1]) / 2;
    }
  }
  if (scanY === null) return null;
  const intersections: number[] = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    if (a[1] > scanY !== b[1] > scanY)
      intersections.push(a[0] + ((scanY - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
  }
  intersections.sort((a, b) => a - b);
  for (let i = 0; i + 1 < intersections.length; i += 2) {
    if (intersections[i + 1] > intersections[i]) {
      const point: BoundaryPosition = [(intersections[i] + intersections[i + 1]) / 2, scanY];
      if (pointStrictlyInRing(point, ring)) return point;
    }
  }
  return null;
}

/** True only when `point` is strictly inside `ring`: inside by ray casting and
 * not on any edge or vertex. */
function pointStrictlyInRing(point: BoundaryPosition, ring: BoundaryRing) {
  return pointInRing(point, ring) && !pointOnRing(point, ring);
}

/** Classify a point relative to a polygon-with-holes. */
function pointInPolygonWithHoles(
  point: BoundaryPosition,
  polygon: BoundaryPolygon,
): "inside" | "on" | "outside" {
  const outer = polygon[0];
  if (pointOnRing(point, outer)) return "on";
  if (!pointInRing(point, outer)) return "outside";
  for (let h = 1; h < polygon.length; h++) {
    const hole = polygon[h];
    if (pointOnRing(point, hole)) return "on";
    if (pointInRing(point, hole)) return "outside";
  }
  return "inside";
}

/** True if every vertex of `ringA` lies strictly inside `ringB`. */
function ringVerticesAllStrictlyInRing(ringA: BoundaryRing, ringB: BoundaryRing) {
  for (const vertex of ringA) {
    if (!pointStrictlyInRing(vertex, ringB)) return false;
  }
  return true;
}

/** True if `ring` intersects itself. Always runs; never silently skipped for
 * large rings. Uses a grid spatial index so cost stays near-linear for
 * well-distributed geometry, with a documented vertex cap as a safety net. */
function ringSelfIntersects(ring: BoundaryRing, budget: VertexBudget) {
  const edgeCount = ring.length - 1;
  if (edgeCount < 4) return false;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const edges: Array<{
    a: BoundaryPosition;
    b: BoundaryPosition;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }> = [];
  for (let i = 0; i < edgeCount; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    edges.push({
      a,
      b,
      minX: Math.min(a[0], b[0]),
      minY: Math.min(a[1], b[1]),
      maxX: Math.max(a[0], b[0]),
      maxY: Math.max(a[1], b[1]),
    });
    minX = Math.min(minX, a[0]);
    minY = Math.min(minY, a[1]);
    maxX = Math.max(maxX, a[0]);
    maxY = Math.max(maxY, a[1]);
  }
  const cellSize = Math.max(maxX - minX, maxY - minY, 1e-9) / Math.ceil(Math.sqrt(edgeCount));
  const grid = new Map<string, number[]>();
  const cellsOf = (edge: (typeof edges)[number]) => {
    const cx0 = Math.floor((edge.minX - minX) / cellSize);
    const cx1 = Math.floor((edge.maxX - minX) / cellSize);
    const cy0 = Math.floor((edge.minY - minY) / cellSize);
    const cy1 = Math.floor((edge.maxY - minY) / cellSize);
    budget.gridCellVisits += (cx1 - cx0 + 1) * (cy1 - cy0 + 1);
    if (budget.gridCellVisits > MAX_GRID_CELL_VISITS) {
      throw new GeoJsonError(
        `Ring is too complex for safe browser validation (grid work limit ${MAX_GRID_CELL_VISITS} exceeded). Simplify it in a GIS tool.`,
      );
    }
    const keys: string[] = [];
    for (let cx = cx0; cx <= cx1; cx++)
      for (let cy = cy0; cy <= cy1; cy++) keys.push(`${cx},${cy}`);
    return keys;
  };
  for (let i = 0; i < edgeCount; i++) {
    const edge = edges[i];
    const keys = cellsOf(edge);
    const candidates = new Set<number>();
    for (const key of keys) {
      const list = grid.get(key);
      if (list) for (const j of list) candidates.add(j);
    }
    for (const j of candidates) {
      if (j >= i || j === i - 1 || (i === edgeCount - 1 && j === 0)) continue;
      budget.selfIntersectionTests++;
      if (budget.selfIntersectionTests > MAX_SELF_INTERSECTION_TESTS) {
        throw new GeoJsonError(
          `Ring is too complex for safe browser validation (segment-check limit ${MAX_SELF_INTERSECTION_TESTS} exceeded). Simplify it in a GIS tool.`,
        );
      }
      if (segmentsIntersect(edge.a, edge.b, edges[j].a, edges[j].b)) return true;
    }
    for (const key of keys) {
      const list = grid.get(key);
      if (list) list.push(i);
      else grid.set(key, [i]);
    }
  }
  return false;
}

function readRing(value: unknown, label: string, budget: VertexBudget): BoundaryRing {
  if (!Array.isArray(value) || value.length < 4) {
    throw new GeoJsonError(`${label} must contain at least four positions (a closed ring).`);
  }

  if (value.length > MAX_RING_VERTICES) {
    throw new GeoJsonError(
      `${label} has ${value.length} positions; the limit is ${MAX_RING_VERTICES} vertices per ring. ` +
        "Simplify the geometry in your GIS tool and try again.",
    );
  }

  if (budget.total + value.length > MAX_TOTAL_VERTICES) {
    throw new GeoJsonError(
      `The import exceeds the total vertex limit of ${MAX_TOTAL_VERTICES}; simplify the geometry in your GIS tool.`,
    );
  }
  budget.total += value.length;
  const ring = value.map((position, index) => readPosition(position, `${label}[${index}]`));
  const first = ring[0];
  const last = ring[ring.length - 1];

  if (first[0] !== last[0] || first[1] !== last[1]) {
    throw new GeoJsonError(
      `${label} is not closed. The first and last longitude/latitude positions must match.`,
    );
  }

  // Repeated consecutive vertices create degenerate (zero-length) edges.
  for (let i = 0; i < ring.length - 1; i++) {
    if (ring[i][0] === ring[i + 1][0] && ring[i][1] === ring[i + 1][1]) {
      throw new GeoJsonError(
        `${label} has a repeated consecutive vertex at position ${i} (a degenerate edge). ` +
          "Remove duplicate positions and try again.",
      );
    }
  }

  // Self-intersection is always checked, for rings of any size.
  if (ringSelfIntersects(ring, budget)) {
    throw new GeoJsonError(
      `${label} intersects itself. Fix the polygon in your GIS tool and try again.`,
    );
  }

  if (Math.abs(ringSignedArea(ring)) < 1e-12) {
    throw new GeoJsonError(`${label} has zero area.`);
  }

  return ring;
}

/** Validate one Polygon geometry: outer ring plus holes, with full hole
 * containment, hole-edge vs shell-edge, and hole-vs-hole checks. */
function validatePolygon(value: unknown, label: string, budget: VertexBudget): BoundaryPolygon {
  if (!Array.isArray(value) || value.length === 0) {
    throw new GeoJsonError(`${label} must contain an outer ring.`);
  }

  if (value.length > MAX_RINGS_PER_GEOMETRY) {
    throw new GeoJsonError(
      `${label} has ${value.length} rings; the limit is ${MAX_RINGS_PER_GEOMETRY} rings per polygon.`,
    );
  }

  const rings = value.map((ring, index) =>
    readRing(ring, `${label} ring ${index + 1}${index === 0 ? " (outer)" : " (hole)"}`, budget),
  );

  const outer = rings[0];

  // Bound hole/shell and hole/hole edge comparisons before entering nested loops.
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      budget.crossRingComparisons += (rings[i].length - 1) * (rings[j].length - 1);
      if (budget.crossRingComparisons > MAX_RELATIONSHIP_SEGMENT_COMPARISONS) {
        throw new GeoJsonError(
          `Polygon relationships exceed the safe segment-comparison limit of ${MAX_RELATIONSHIP_SEGMENT_COMPARISONS.toLocaleString()}. Simplify the geometry in a GIS tool.`,
        );
      }
    }
  }

  for (let h = 1; h < rings.length; h++) {
    const hole = rings[h];
    const holeLabel = `${label} ring ${h + 1} (hole)`;

    // Every hole vertex must lie strictly inside the outer ring.
    let badVertex: BoundaryPosition | null = null;
    for (const vertex of hole) {
      if (!pointStrictlyInRing(vertex, outer)) {
        badVertex = vertex;
        break;
      }
    }
    if (badVertex) {
      const relation = pointOnRing(badVertex, outer)
        ? "touches the outer boundary"
        : "lies outside";
      throw new GeoJsonError(
        `${holeLabel} vertex (${formatNumber(badVertex[0])}, ${formatNumber(badVertex[1])}) ${relation}. ` +
          "A hole must be strictly inside its outer ring.",
      );
    }

    // Every hole edge must not cross or touch any outer-ring edge.
    let shellCrossing = false;
    outerRing: for (let i = 0; i < hole.length - 1; i++) {
      for (let j = 0; j < outer.length - 1; j++) {
        if (segmentsIntersect(hole[i], hole[i + 1], outer[j], outer[j + 1])) {
          shellCrossing = true;
          break outerRing;
        }
      }
    }
    if (shellCrossing) {
      throw new GeoJsonError(
        `${holeLabel} edge crosses or touches the outer ring. Fix the polygon in your GIS tool.`,
      );
    }

    // Holes must not intersect, overlap, or nest inside one another.
    for (let k = h + 1; k < rings.length; k++) {
      const other = rings[k];
      const otherLabel = `${label} ring ${k + 1} (hole)`;

      let holeCrossing = false;
      holePair: for (let i = 0; i < hole.length - 1; i++) {
        for (let j = 0; j < other.length - 1; j++) {
          if (segmentsIntersect(hole[i], hole[i + 1], other[j], other[j + 1])) {
            holeCrossing = true;
            break holePair;
          }
        }
      }
      if (holeCrossing) {
        throw new GeoJsonError(
          `${holeLabel} intersects or touches ${otherLabel}. Holes must be disjoint.`,
        );
      }

      if (ringVerticesAllStrictlyInRing(hole, other)) {
        throw new GeoJsonError(
          `${holeLabel} is nested inside ${otherLabel}. Holes must be disjoint.`,
        );
      }
      if (ringVerticesAllStrictlyInRing(other, hole)) {
        throw new GeoJsonError(
          `${otherLabel} is nested inside ${holeLabel}. Holes must be disjoint.`,
        );
      }
    }
  }

  return rings;
}

function readGeometry(value: unknown, label: string, budget: VertexBudget): BoundaryMultiPolygon {
  const geometry = asRecord(value);

  if (!geometry) {
    throw new GeoJsonError(`${label} has no geometry.`);
  }

  if (geometry.type === "Polygon") {
    return [validatePolygon(geometry.coordinates, `${label} geometry`, budget)];
  }

  if (geometry.type === "MultiPolygon") {
    if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
      throw new GeoJsonError(`${label} MultiPolygon has no polygon coordinates.`);
    }

    return geometry.coordinates.map((polygon, index) =>
      validatePolygon(polygon, `${label} geometry polygon ${index + 1}`, budget),
    );
  }

  throw new GeoJsonError(
    `${label} geometry must be a Polygon or MultiPolygon (received ${String(geometry.type)}).`,
  );
}

function computeBbox(polygons: BoundaryMultiPolygon): BoundaryBbox {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lat < minLat) minLat = lat;
        if (lon > maxLon) maxLon = lon;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }

  return { minLon, minLat, maxLon, maxLat };
}

/** Classify a point relative to the union of estate polygon components. */
function pointInEstateUnion(
  point: BoundaryPosition,
  estate: BoundaryMultiPolygon,
): "inside" | "on" | "outside" {
  let anyOn = false;
  for (const component of estate) {
    const relation = pointInPolygonWithHoles(point, component);
    if (relation === "inside") return "inside";
    if (relation === "on") anyOn = true;
  }
  return anyOn ? "on" : "outside";
}

/** Validate estate/sector relationships:
 * - every sector polygon must lie inside or on the estate boundary;
 * - no sector outer edge may properly cross an estate edge;
 * - sectors must not positively overlap one another (shared borders are OK).
 */
function validateEstateSectorRelationships(
  estate: BoundaryMultiPolygon,
  sectors: ImportedSectorBoundary[],
): string[] {
  const errors: string[] = [];
  const estateRings = estate.flatMap((polygon) => polygon);
  // Count positions (including closing coordinates) for a conservative upper bound
  // on ray-cast and segment-pair work.
  const estatePositions = estateRings.reduce((sum, ring) => sum + ring.length, 0);
  const sectorAllPositions = sectors.reduce(
    (sum, sector) =>
      sum +
      sector.polygons.reduce(
        (pSum, polygon) => pSum + polygon.reduce((rSum, ring) => rSum + ring.length, 0),
        0,
      ),
    0,
  );
  const sectorOuterPositions = sectors.map((sector) =>
    sector.polygons.reduce((sum, polygon) => sum + polygon[0].length, 0),
  );
  let estimatedComparisons = estatePositions * sectorAllPositions;
  for (let i = 0; i < sectorOuterPositions.length; i++) {
    for (let j = i + 1; j < sectorOuterPositions.length; j++) {
      estimatedComparisons += sectorOuterPositions[i] * sectorOuterPositions[j];
    }
  }
  if (estimatedComparisons > MAX_RELATIONSHIP_SEGMENT_COMPARISONS) {
    return [
      `Boundary relationships require up to ${estimatedComparisons.toLocaleString()} segment comparisons; the safe limit is ${MAX_RELATIONSHIP_SEGMENT_COMPARISONS.toLocaleString()}. Simplify the geometry in a GIS tool.`,
    ];
  }

  for (const sector of sectors) {
    const sectorLabel = `sector "${sector.sectorId}"`;
    for (const component of sector.polygons) {
      const outer = component[0];
      for (const vertex of outer) {
        if (pointInEstateUnion(vertex, estate) === "outside") {
          errors.push(
            `${sectorLabel} extends outside the estate boundary at vertex (${formatNumber(vertex[0])}, ${formatNumber(vertex[1])}).`,
          );
          break;
        }
      }
      let boundaryCrossing = false;
      outerRing: for (let i = 0; i < outer.length - 1; i++) {
        const midpoint: BoundaryPosition = [
          (outer[i][0] + outer[i + 1][0]) / 2,
          (outer[i][1] + outer[i + 1][1]) / 2,
        ];
        if (pointInEstateUnion(midpoint, estate) === "outside") {
          boundaryCrossing = true;
          break;
        }
        for (const estateRing of estateRings) {
          for (let j = 0; j < estateRing.length - 1; j++) {
            if (properSegmentsIntersect(outer[i], outer[i + 1], estateRing[j], estateRing[j + 1])) {
              boundaryCrossing = true;
              break outerRing;
            }
          }
        }
      }
      if (boundaryCrossing)
        errors.push(`${sectorLabel} extends beyond or crosses the estate boundary.`);

      for (const estatePolygon of estate)
        for (let h = 1; h < estatePolygon.length; h++) {
          const estateHole = estatePolygon[h];
          const sample = interiorPointOfRing(estateHole);
          const coveredHoleArea =
            estateHole.some((point) => pointInPolygonWithHoles(point, component) === "inside") ||
            (sample !== null && pointInPolygonWithHoles(sample, component) === "inside");
          if (coveredHoleArea) errors.push(`${sectorLabel} covers area inside an estate hole.`);

          let holeConflict = false;
          holePair: for (const sectorRing of component)
            for (let i = 0; i < sectorRing.length - 1; i++) {
              for (let j = 0; j < estateHole.length - 1; j++) {
                const crosses = properSegmentsIntersect(
                  sectorRing[i],
                  sectorRing[i + 1],
                  estateHole[j],
                  estateHole[j + 1],
                );
                const touchesAtPoint =
                  sectorRing === outer &&
                  segmentsIntersect(
                    sectorRing[i],
                    sectorRing[i + 1],
                    estateHole[j],
                    estateHole[j + 1],
                  ) &&
                  !collinearSegmentsOverlap(
                    sectorRing[i],
                    sectorRing[i + 1],
                    estateHole[j],
                    estateHole[j + 1],
                  );
                const entersHole =
                  sectorRing === outer &&
                  collinearOverlapSameInterior(
                    outer,
                    sectorRing[i],
                    sectorRing[i + 1],
                    estateHole,
                    estateHole[j],
                    estateHole[j + 1],
                  );
                if (crosses || touchesAtPoint || entersHole) {
                  holeConflict = true;
                  break holePair;
                }
              }
            }
          if (holeConflict)
            errors.push(`${sectorLabel} has a boundary crossing or entering an estate hole.`);
        }
    }
  }

  // Compare sector outer shells conservatively: if shells overlap, reject even
  // if a sector hole might remove the overlap. This prevents false acceptance.
  for (let s = 0; s < sectors.length; s++)
    for (let t = s + 1; t < sectors.length; t++) {
      const sectorA = sectors[s];
      const sectorB = sectors[t];
      const labelA = `sector "${sectorA.sectorId}"`;
      const labelB = `sector "${sectorB.sectorId}"`;
      let overlap = false;
      componentPair: for (const componentA of sectorA.polygons) {
        const outerA = componentA[0];
        for (const componentB of sectorB.polygons) {
          const outerB = componentB[0];
          for (let i = 0; i < outerA.length - 1; i++)
            for (let j = 0; j < outerB.length - 1; j++) {
              if (
                properSegmentsIntersect(outerA[i], outerA[i + 1], outerB[j], outerB[j + 1]) ||
                collinearOverlapSameInterior(
                  outerA,
                  outerA[i],
                  outerA[i + 1],
                  outerB,
                  outerB[j],
                  outerB[j + 1],
                )
              ) {
                overlap = true;
                break componentPair;
              }
            }
          if (
            ringVerticesAllStrictlyInRing(outerB, outerA) ||
            ringVerticesAllStrictlyInRing(outerA, outerB)
          ) {
            overlap = true;
            break componentPair;
          }
        }
      }
      if (overlap)
        errors.push(`${labelA} and ${labelB} have positive-area overlapping outer boundaries.`);
    }
  return errors;
}

// Public validation entry point
// ---------------------------------------------------------------------------

/**
 * Validate a GeoJSON FeatureCollection without repairing or inventing geometry.
 *
 * Contract:
 * - one estate feature: `properties.role === "estate"` (optional `properties.estateId`)
 * - sector features: `properties.sectorId` equal to an existing sector ID
 * - Polygon / MultiPolygon, closed non-zero-area rings, holes inside the shell
 * - unknown, duplicated, or missing sector mappings are reported
 */
export function validateBoundaryGeoJSON(
  input: string,
  options: BoundaryValidationOptions,
): BoundaryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const knownSectorIds = new Set(options.knownSectorIds);

  if (typeof input !== "string" || input.length === 0) {
    return {
      ok: false,
      errors: ["No GeoJSON content provided."],
      warnings,
    };
  }

  if (input.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      errors: [
        `GeoJSON input is ${(input.length / 1_000_000).toFixed(1)} MB of text; the limit is ${(MAX_INPUT_CHARS / 1_000_000).toFixed(0)} MB. ` +
          "Simplify the geometry in your GIS tool if needed.",
      ],
      warnings,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.replace(/^\uFEFF/, ""));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      errors: [`The file is not valid JSON: ${reason}`],
      warnings,
    };
  }

  const root = asRecord(parsed);
  if (!root) {
    return { ok: false, errors: ["The root value must be a GeoJSON FeatureCollection."], warnings };
  }

  if (root.type !== "FeatureCollection") {
    return {
      ok: false,
      errors: [`Root type must be "FeatureCollection" (received ${String(root.type)}).`],
      warnings,
    };
  }

  if (!Array.isArray(root.features) || root.features.length === 0) {
    return {
      ok: false,
      errors: ["FeatureCollection.features must contain at least one feature."],
      warnings,
    };
  }

  if (root.features.length > MAX_FEATURES) {
    return {
      ok: false,
      errors: [
        `FeatureCollection has ${root.features.length} features; the limit is ${MAX_FEATURES}.`,
      ],
      warnings,
    };
  }

  let estateFeatureCount = 0;
  const estatePolygons: BoundaryMultiPolygon = [];
  const sectorBoundaries: ImportedSectorBoundary[] = [];
  const seenSectorIds = new Set<string>();
  const vertexBudget: VertexBudget = {
    total: 0,
    crossRingComparisons: 0,
    gridCellVisits: 0,
    selfIntersectionTests: 0,
  };

  root.features.forEach((featureValue, index) => {
    const label = `Feature #${index + 1}`;
    const feature = asRecord(featureValue);

    if (!feature || feature.type !== "Feature") {
      errors.push(`${label} must be a GeoJSON Feature.`);
      return;
    }

    const properties = asRecord(feature.properties) ?? {};
    const role = typeof properties.role === "string" ? properties.role : undefined;
    const rawSectorId = typeof properties.sectorId === "string" ? properties.sectorId : undefined;
    const sectorId = rawSectorId?.trim();
    const name = typeof properties.name === "string" ? properties.name.trim() : undefined;
    const displayName = name ? `${label} ("${name}")` : label;

    if (role === "estate" && sectorId) {
      errors.push(
        `${displayName} is ambiguous: set either properties.role = "estate" or properties.sectorId, not both.`,
      );
      return;
    }

    if (role && role !== "estate") {
      errors.push(
        `${displayName} has unsupported properties.role "${role}". Use "estate" or omit it for sector parcels.`,
      );
      return;
    }

    if (role !== "estate" && !sectorId) {
      errors.push(
        `${displayName} needs properties.sectorId, or properties.role = "estate" for the estate boundary.`,
      );
      return;
    }

    let polygons: BoundaryMultiPolygon;
    try {
      polygons = readGeometry(feature.geometry, displayName, vertexBudget);
    } catch (error) {
      errors.push(
        error instanceof GeoJsonError ? error.message : `${displayName} has invalid geometry.`,
      );
      return;
    }

    if (role === "estate") {
      if (typeof properties.estateId === "string" && properties.estateId !== options.estateId) {
        errors.push(
          `${displayName} has estateId "${properties.estateId}", but this dashboard is for "${options.estateId}".`,
        );
        return;
      }

      estateFeatureCount += 1;
      estatePolygons.push(...polygons);
      return;
    }

    if (!knownSectorIds.has(sectorId as string)) {
      errors.push(
        `${displayName} uses sectorId "${sectorId}", which does not match a known sector. ` +
          `Allowed IDs: ${options.knownSectorIds.join(", ")}.`,
      );
      return;
    }

    if (seenSectorIds.has(sectorId as string)) {
      errors.push(
        `${displayName} repeats sectorId "${sectorId}". Each sector may appear only once.`,
      );
      return;
    }

    seenSectorIds.add(sectorId as string);
    sectorBoundaries.push({ sectorId: sectorId as string, polygons });
  });

  if (estateFeatureCount === 0) {
    errors.push('Missing estate boundary: add one feature with properties.role = "estate".');
  }
  if (estateFeatureCount > 1) {
    errors.push(
      `Found ${estateFeatureCount} estate boundaries. Import exactly one estate per file.`,
    );
  }
  if (sectorBoundaries.length === 0) {
    errors.push("No sector polygons found: add features with properties.sectorId.");
  }

  const missingSectorIds = options.knownSectorIds.filter((id) => !seenSectorIds.has(id));
  if (missingSectorIds.length > 0) {
    warnings.push(
      `No polygon supplied for ${missingSectorIds.length} of ${options.knownSectorIds.length} sectors ` +
        `(${missingSectorIds.join(", ")}). Unmapped sectors stay off the map until imported.`,
    );
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  // Estate/sector relationship validation. These errors block import because an
  // out-of-estate or overlapping sector would produce misleading spatial analysis.
  const relationshipErrors = validateEstateSectorRelationships(estatePolygons, sectorBoundaries);
  if (relationshipErrors.length > 0) {
    return { ok: false, errors: [...relationshipErrors], warnings };
  }

  const bbox = computeBbox([
    ...estatePolygons,
    ...sectorBoundaries.flatMap((sector) => sector.polygons),
  ]);
  const widthDegrees = bbox.maxLon - bbox.minLon;
  const heightDegrees = bbox.maxLat - bbox.minLat;

  if (widthDegrees > 2 || heightDegrees > 2) {
    warnings.push(
      `The boundary spans about ${widthDegrees.toFixed(2)}° × ${heightDegrees.toFixed(2)}°. ` +
        "Confirm these are WGS84 coordinates and cover only this estate.",
    );
  }

  return {
    ok: true,
    boundary: {
      version: 1,
      estateId: options.estateId,
      importedAt: (options.now ?? new Date()).toISOString(),
      sourceName: options.sourceName.trim() || "GeoJSON import",
      estate: estatePolygons,
      sectors: sectorBoundaries,
      bbox,
    },
    warnings,
  };
}

export type StandaloneGeometryValidationResult =
  | { ok: true; geometry: BoundaryMultiPolygon; bbox: BoundaryBbox; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

/**
 * Validate a standalone Polygon / MultiPolygon with no estate/sector
 * semantics, using exactly the Phase 1.1 geometry rules that back
 * `validateBoundaryGeoJSON`: per-ring and total vertex caps, ring closure,
 * finite WGS84 coordinates, degenerate-edge and zero-area rejection,
 * self-intersection detection, and full hole-containment checks.
 *
 * Used by the Sentinel-2 observation slice to check an AOI before any
 * provider request. Geometry is never repaired, simplified, or rewritten —
 * invalid input is rejected with the same messages the import dialog shows.
 */
export function validateStandaloneGeometry(
  value: unknown,
  label = "Area of interest",
): StandaloneGeometryValidationResult {
  const warnings: string[] = [];
  const budget: VertexBudget = {
    total: 0,
    crossRingComparisons: 0,
    gridCellVisits: 0,
    selfIntersectionTests: 0,
  };

  let geometry: BoundaryMultiPolygon;
  try {
    geometry = readGeometry(value, label, budget);
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof GeoJsonError ? error.message : `${label} has invalid geometry.`],
      warnings,
    };
  }

  const bbox = computeBbox(geometry);
  const widthDegrees = bbox.maxLon - bbox.minLon;
  const heightDegrees = bbox.maxLat - bbox.minLat;
  if (widthDegrees > 2 || heightDegrees > 2) {
    warnings.push(
      `The area of interest spans about ${widthDegrees.toFixed(2)}° × ${heightDegrees.toFixed(2)}°. ` +
        "Confirm these are WGS84 coordinates and cover only this area.",
    );
  }

  return { ok: true, geometry, bbox, warnings };
}

// ---------------------------------------------------------------------------
// Summary, projection, storage
// ---------------------------------------------------------------------------

export function getBoundarySummary(boundary: ImportedBoundary): BoundarySummary {
  const centerLat = (boundary.bbox.minLat + boundary.bbox.maxLat) / 2;
  const centerLon = (boundary.bbox.minLon + boundary.bbox.maxLon) / 2;
  const lonKmPerDegree = 111.32 * Math.cos((centerLat * Math.PI) / 180);

  return {
    center: { lat: centerLat, lon: centerLon },
    extentKm: {
      width: Math.abs(boundary.bbox.maxLon - boundary.bbox.minLon) * Math.abs(lonKmPerDegree),
      height: Math.abs(boundary.bbox.maxLat - boundary.bbox.minLat) * 110.574,
    },
  };
}

function ringCentroid(ring: BoundaryRing): BoundaryPosition {
  let twiceArea = 0;
  let x = 0;
  let y = 0;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    x += (x1 + x2) * cross;
    y += (y1 + y2) * cross;
  }

  if (Math.abs(twiceArea) < 1e-12) {
    const sum = ring.reduce<BoundaryPosition>(
      (accumulator, [ringX, ringY]) => [accumulator[0] + ringX, accumulator[1] + ringY],
      [0, 0],
    );
    return [sum[0] / ring.length, sum[1] / ring.length];
  }

  return [x / (3 * twiceArea), y / (3 * twiceArea)];
}

/**
 * Project WGS84 rings into the map's 0–100 SVG coordinate space.
 * Equirectangular with a centre-latitude correction is sufficient for a
 * single-estate overview; this is not a survey-grade projection.
 */
export function projectBoundary(boundary: ImportedBoundary): ProjectedBoundary {
  const { bbox } = boundary;
  const summary = getBoundarySummary(boundary);
  const centerLatRadians = (summary.center.lat * Math.PI) / 180;
  const lonScale = Math.max(Math.cos(centerLatRadians), 1e-6);
  const projectedWidth = (bbox.maxLon - bbox.minLon) * lonScale;
  const projectedHeight = bbox.maxLat - bbox.minLat;
  const scale = Math.min(
    (100 - MAP_PADDING * 2) / Math.max(projectedWidth, 1e-9),
    (100 - MAP_PADDING * 2) / Math.max(projectedHeight, 1e-9),
  );
  const offsetX = (100 - projectedWidth * scale) / 2;
  const offsetY = (100 - projectedHeight * scale) / 2;

  const project = ([lon, lat]: BoundaryPosition): BoundaryPosition => [
    offsetX + (lon - bbox.minLon) * lonScale * scale,
    offsetY + (bbox.maxLat - lat) * scale,
  ];

  const ringToPath = (ring: BoundaryRing) =>
    ring
      .map((position, index) => {
        const [x, y] = project(position);
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ") + " Z";

  const polygonsToPath = (polygons: BoundaryMultiPolygon) =>
    polygons.map((polygon) => polygon.map(ringToPath).join(" ")).join(" ");

  const sectorPaths = boundary.sectors.map((sector) => {
    const largestPolygon = sector.polygons.reduce((largest, polygon) => {
      const largestArea = Math.abs(ringSignedArea(largest[0]));
      const polygonArea = Math.abs(ringSignedArea(polygon[0]));
      return polygonArea > largestArea ? polygon : largest;
    }, sector.polygons[0]);
    const [labelLon, labelLat] = ringCentroid(largestPolygon[0]);
    const [labelX, labelY] = project([labelLon, labelLat]);

    return {
      sectorId: sector.sectorId,
      path: polygonsToPath(sector.polygons),
      labelX,
      labelY,
    };
  });

  return {
    estatePath: polygonsToPath(boundary.estate),
    sectors: sectorPaths,
    summary,
  };
}

export function saveImportedBoundary(
  boundary: ImportedBoundary,
): { ok: true } | { ok: false; error: string } {
  if (typeof window === "undefined") {
    return { ok: false, error: "Boundary storage is only available in the browser." };
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(boundary));
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Could not save the boundary in this browser. Storage may be full or disabled.",
    };
  }
}

function isImportedBoundary(value: unknown): value is ImportedBoundary {
  const record = asRecord(value);
  if (!record) return false;
  if (record.version !== 1) return false;
  if (typeof record.estateId !== "string") return false;
  if (typeof record.importedAt !== "string") return false;
  if (typeof record.sourceName !== "string") return false;
  if (!Array.isArray(record.estate) || record.estate.length === 0) return false;
  if (!Array.isArray(record.sectors) || record.sectors.length === 0) return false;

  const bbox = asRecord(record.bbox);
  if (!bbox) return false;
  if (
    typeof bbox.minLon !== "number" ||
    typeof bbox.minLat !== "number" ||
    typeof bbox.maxLon !== "number" ||
    typeof bbox.maxLat !== "number"
  ) {
    return false;
  }

  return record.sectors.every((sector) => {
    const entry = asRecord(sector);
    return (
      !!entry &&
      typeof entry.sectorId === "string" &&
      Array.isArray(entry.polygons) &&
      entry.polygons.length > 0
    );
  });
}

function boundaryToFeatureCollection(boundary: ImportedBoundary) {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { role: "estate", estateId: boundary.estateId },
        geometry: { type: "MultiPolygon", coordinates: boundary.estate },
      },
      ...boundary.sectors.map((sector) => ({
        type: "Feature",
        properties: { sectorId: sector.sectorId },
        geometry: { type: "MultiPolygon", coordinates: sector.polygons },
      })),
    ],
  };
}

export function loadImportedBoundary(
  estateId: string,
  knownSectorIds?: readonly string[],
): ImportedBoundary | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw.replace(/^\uFEFF/, ""));
    if (!isImportedBoundary(parsed) || parsed.estateId !== estateId) return null;
    if (!knownSectorIds) return parsed;

    // Re-run the same validation used at import time so stale or hand-edited
    // storage cannot render invalid geometry or orphaned sector IDs.
    const revalidated = validateBoundaryGeoJSON(
      JSON.stringify(boundaryToFeatureCollection(parsed)),
      {
        estateId,
        knownSectorIds,
        sourceName: parsed.sourceName,
      },
    );

    if (!revalidated.ok) {
      clearImportedBoundary();
      return null;
    }

    return {
      ...revalidated.boundary,
      importedAt: parsed.importedAt,
      sourceName: parsed.sourceName,
    };
  } catch {
    return null;
  }
}

export function clearImportedBoundary() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be disabled; there is nothing useful to do here.
  }
}
