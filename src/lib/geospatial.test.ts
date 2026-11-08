import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  clearImportedBoundary,
  loadImportedBoundary,
  saveImportedBoundary,
  validateBoundaryGeoJSON,
  type BoundaryMultiPolygon,
  type BoundaryRing,
  type ImportedBoundary,
} from "./geospatial.ts";

type Feature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
};
const square = (x0: number, y0: number, x1: number, y1: number): BoundaryRing => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];
const polygon = (...rings: BoundaryRing[]) => rings;
const feature = (
  properties: Record<string, unknown>,
  coordinates: unknown,
  type: "Polygon" | "MultiPolygon" = "Polygon",
): Feature => ({
  type: "Feature",
  properties,
  geometry: { type, coordinates },
});
const estate = (coordinates: unknown, type: "Polygon" | "MultiPolygon" = "Polygon") =>
  feature({ role: "estate" }, coordinates, type);
const sector = (id: string, coordinates: unknown, type: "Polygon" | "MultiPolygon" = "Polygon") =>
  feature({ sectorId: id }, coordinates, type);
function validate(features: Feature[], sectorIds: string[] = ["s1", "s2"]) {
  return validateBoundaryGeoJSON(JSON.stringify({ type: "FeatureCollection", features }), {
    estateId: "estate-1",
    knownSectorIds: sectorIds,
    sourceName: "acceptance.geojson",
    now: new Date("2026-01-01T00:00:00.000Z"),
  });
}
function errors(features: Feature[], ids?: string[]) {
  const result = validate(features, ids);
  assert.equal(result.ok, false, "expected invalid geometry to be rejected");
  return result.errors.join("\n");
}
const estateSquare = polygon(square(0, 0, 10, 10));
afterEach(() => {
  clearImportedBoundary();
  Reflect.deleteProperty(globalThis, "window");
});

describe("GeoJSON boundary acceptance", () => {
  it("accepts a valid Polygon and a valid MultiPolygon", () => {
    assert.equal(
      validate([estate(estateSquare), sector("s1", polygon(square(1, 1, 4, 4)))], ["s1"]).ok,
      true,
    );
    assert.equal(
      validate(
        [
          estate([polygon(square(0, 0, 5, 10)), polygon(square(5, 0, 10, 10))], "MultiPolygon"),
          sector("s1", [polygon(square(1, 1, 4, 4)), polygon(square(6, 1, 9, 4))], "MultiPolygon"),
        ],
        ["s1"],
      ).ok,
      true,
    );
  });

  it("accepts valid holes and two sectors sharing an edge", () => {
    const withHole = polygon(square(0, 0, 10, 10), square(4, 4, 6, 6));
    assert.equal(
      validate([estate(withHole), sector("s1", polygon(square(1, 1, 3, 3)))], ["s1"]).ok,
      true,
    );
    const result = validate([
      estate(estateSquare),
      sector("s1", polygon(square(0, 0, 5, 10))),
      sector("s2", polygon(square(5, 0, 10, 10))),
    ]);
    assert.equal(result.ok, true, result.ok ? "" : result.errors.join("\n"));
  });

  it("rejects unclosed, repeated, zero-area, out-of-range, and self-intersecting rings", () => {
    assert.match(
      errors(
        [
          estate(
            polygon([
              [0, 0],
              [10, 0],
              [10, 10],
              [0, 10],
            ]),
          ),
          sector("s1", polygon(square(1, 1, 2, 2))),
        ],
        ["s1"],
      ),
      /not closed/i,
    );
    assert.match(
      errors(
        [
          estate(
            polygon([
              [0, 0],
              [10, 0],
              [10, 0],
              [0, 10],
              [0, 0],
            ]),
          ),
          sector("s1", polygon(square(1, 1, 2, 2))),
        ],
        ["s1"],
      ),
      /repeated consecutive/i,
    );
    assert.match(
      errors(
        [
          estate(
            polygon([
              [0, 0],
              [1, 1],
              [2, 2],
              [0, 0],
            ]),
          ),
          sector("s1", polygon(square(1, 1, 2, 2))),
        ],
        ["s1"],
      ),
      /intersects itself|zero area/i,
    );
    assert.match(
      errors(
        [
          estate(
            polygon([
              [0, 0],
              [200, 0],
              [200, 10],
              [0, 10],
              [0, 0],
            ]),
          ),
          sector("s1", polygon(square(1, 1, 2, 2))),
        ],
        ["s1"],
      ),
      /outside the valid -180/,
    );
    assert.match(
      errors(
        [
          estate(
            polygon([
              [0, 0],
              [10, 10],
              [0, 10],
              [10, 0],
              [0, 0],
            ]),
          ),
          sector("s1", polygon(square(1, 1, 2, 2))),
        ],
        ["s1"],
      ),
      /intersects itself/i,
    );
  });

  it("rejects holes outside, touching or crossing their shell, and nested or intersecting holes", () => {
    assert.match(
      errors(
        [
          estate(polygon(square(0, 0, 10, 10), square(11, 2, 12, 3))),
          sector("s1", polygon(square(1, 1, 2, 2))),
        ],
        ["s1"],
      ),
      /hole.*outside/i,
    );
    assert.match(
      errors(
        [
          estate(
            polygon(square(0, 0, 10, 10), [
              [0, 2],
              [2, 2],
              [2, 4],
              [0, 4],
              [0, 2],
            ]),
          ),
          sector("s1", polygon(square(5, 5, 6, 6))),
        ],
        ["s1"],
      ),
      /hole.*touches|crosses or touches/i,
    );
    assert.match(
      errors(
        [
          estate(polygon(square(0, 0, 10, 10), square(2, 2, 8, 8), square(3, 3, 4, 4))),
          sector("s1", polygon(square(1, 1, 1.5, 1.5))),
        ],
        ["s1"],
      ),
      /nested/i,
    );
    assert.match(
      errors(
        [
          estate(polygon(square(0, 0, 10, 10), square(2, 2, 6, 6), square(5, 5, 8, 8))),
          sector("s1", polygon(square(0.5, 0.5, 1, 1))),
        ],
        ["s1"],
      ),
      /intersects or touches/i,
    );
  });

  it("rejects sectors outside/crossing the estate and sectors covering estate holes", () => {
    assert.match(
      errors([estate(estateSquare), sector("s1", polygon(square(9, 9, 11, 11)))], ["s1"]),
      /extends outside|extends beyond or crosses/i,
    );
    const estateWithHole = polygon(square(0, 0, 10, 10), square(4, 4, 6, 6));
    assert.match(
      errors([estate(estateWithHole), sector("s1", polygon(square(3, 3, 7, 7)))], ["s1"]),
      /estate hole/i,
    );
    assert.match(
      errors([estate(estateWithHole), sector("s1", polygon(square(3, 3, 4, 5)))], ["s1"]),
      /estate hole|extends beyond/i,
    );
  });

  it("rejects identical, contained, crossing, and collinearly overlapping sectors", () => {
    const a = sector("s1", polygon(square(1, 1, 6, 6)));
    const overlapCases: BoundaryRing[] = [
      square(1, 1, 6, 6),
      square(2, 2, 4, 4),
      square(5, 2, 8, 4),
      [
        [3, 1],
        [7, 1],
        [7, 4],
        [3, 4],
        [3, 1],
      ],
    ];
    for (const bRing of overlapCases) {
      assert.match(
        errors([estate(estateSquare), a, sector("s2", polygon(bRing))]),
        /overlapping outer boundaries/i,
      );
    }
  });

  it("rejects malformed input and configured feature, raw text, ring, and total-vertex limits", () => {
    assert.match(errors([]), /features must contain/i);
    const tooMany = Array.from(
      { length: 501 },
      () => ({ type: "Feature", properties: {}, geometry: null }) as unknown as Feature,
    );
    assert.match(errors(tooMany), /limit is 500/i);
    const oversizedText = " ".repeat(2_000_001);
    const oversized = validateBoundaryGeoJSON(oversizedText, {
      estateId: "e",
      knownSectorIds: ["s"],
      sourceName: "large",
    });
    assert.equal(oversized.ok, false);
    if (!oversized.ok) assert.match(oversized.errors.join(" "), /limit is 2 MB/i);
    const manyPositions: BoundaryRing = Array.from({ length: 10_001 }, (_, i) => [
      i % 2,
      Math.floor(i / 2),
    ]);
    assert.match(
      errors([estate(polygon(manyPositions)), sector("s1", polygon(square(1, 1, 2, 2)))], ["s1"]),
      /limit is 10000 vertices per ring/i,
    );
    const denseSimpleRing = (): BoundaryRing => {
      const points: BoundaryRing = [];
      const subdivisions = 2_500;
      for (let i = 0; i < subdivisions; i++) points.push([i / subdivisions, 0]);
      for (let i = 1; i <= subdivisions; i++) points.push([1, i / subdivisions]);
      for (let i = 1; i <= subdivisions; i++) points.push([1 - i / subdivisions, 1]);
      for (let i = 1; i < subdivisions; i++) points.push([0, 1 - i / subdivisions]);
      points.push(points[0]);
      return points;
    };
    const dense = denseSimpleRing();
    assert.equal(dense.length, 10_000);
    const total = validate(
      [
        estate(polygon(dense, ...Array.from({ length: 10 }, denseSimpleRing))),
        sector("s1", polygon(square(1, 1, 2, 2))),
      ],
      ["s1"],
    );
    assert.equal(total.ok, false);
    if (!total.ok) assert.match(total.errors.join(" "), /total vertex limit/i);
  });

  it("reports an unmapped sector as a warning without inventing its geometry", () => {
    const result = validate(
      [estate(estateSquare), sector("s1", polygon(square(1, 1, 2, 2)))],
      ["s1", "s2"],
    );
    assert.equal(result.ok, true);
    if (result.ok)
      assert.match(result.warnings.join(" "), /No polygon supplied for 1 of 2 sectors/);
  });
});

describe("boundary storage safety", () => {
  function memoryStorage() {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
  }
  it("retains a prior valid import when a later candidate fails validation", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: memoryStorage() } as unknown as Window,
    });
    const valid = validate(
      [estate(estateSquare), sector("s1", polygon(square(1, 1, 2, 2)))],
      ["s1"],
    );
    assert.equal(valid.ok, true);
    if (!valid.ok) return;
    assert.deepEqual(saveImportedBoundary(valid.boundary), { ok: true });
    const before = loadImportedBoundary("estate-1", ["s1"]);
    assert.ok(before);
    const invalid = validate(
      [estate(estateSquare), sector("s1", polygon(square(9, 9, 11, 11)))],
      ["s1"],
    );
    assert.equal(invalid.ok, false);
    assert.deepEqual(loadImportedBoundary("estate-1", ["s1"]), before);
  });

  it("clears invalid or orphaned stored geometry after revalidation", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: memoryStorage() } as unknown as Window,
    });
    const valid = validate(
      [estate(estateSquare), sector("s1", polygon(square(1, 1, 2, 2)))],
      ["s1"],
    );
    assert.equal(valid.ok, true);
    if (!valid.ok) return;
    const corrupted = structuredClone(valid.boundary);
    corrupted.sectors[0].polygons = [polygon(square(20, 20, 21, 21))];
    assert.deepEqual(saveImportedBoundary(corrupted), { ok: true });
    assert.equal(loadImportedBoundary("estate-1", ["s1"]), null);
    assert.equal(loadImportedBoundary("estate-1", ["s1"]), null);
  });
});
