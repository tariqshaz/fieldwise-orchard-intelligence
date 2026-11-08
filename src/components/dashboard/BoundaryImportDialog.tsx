import { useId, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileJson, Info, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { ImportedBoundary } from "@/lib/geospatial";
import {
  clearImportedBoundary,
  saveImportedBoundary,
  validateBoundaryGeoJSON,
} from "@/lib/geospatial";
import type { Sector } from "@/types/fieldwise";

const MAX_FILE_BYTES = 2_000_000;

export function BoundaryImportDialog({
  estateId,
  sectors,
  boundary,
  onImported,
  onCleared,
}: {
  estateId: string;
  sectors: Sector[];
  boundary: ImportedBoundary | null;
  onImported: (boundary: ImportedBoundary) => void;
  onCleared: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaId = useId();
  const fileInputId = useId();

  const knownSectorIds = sectors.map((sector) => sector.id);
  const mappedSectorCount = boundary?.sectors.length ?? 0;

  const resetMessages = () => {
    setErrors([]);
    setWarnings([]);
    setNotice(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) resetMessages();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    resetMessages();

    if (file.size > MAX_FILE_BYTES) {
      setText("");
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setErrors([
        `That file is ${(file.size / 1_000_000).toFixed(1)} MB. Keep boundary imports under 2 MB; ` +
          "simplify the geometry in your GIS tool if needed.",
      ]);
      return;
    }

    try {
      setText(await file.text());
      setFileName(file.name);
    } catch {
      setText("");
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setErrors(["Could not read that file. Choose a .geojson or .json text file."]);
    }
  };

  const handleImport = () => {
    resetMessages();

    if (!text.trim()) {
      setErrors(["Choose a GeoJSON file or paste a FeatureCollection first."]);
      return;
    }

    const result = validateBoundaryGeoJSON(text, {
      estateId,
      knownSectorIds,
      sourceName: fileName ?? "Pasted GeoJSON",
    });
    setWarnings(result.warnings);

    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    const saved = saveImportedBoundary(result.boundary);
    if (!saved.ok) {
      setErrors([saved.error]);
      return;
    }

    onImported(result.boundary);
    setNotice(
      `Imported the estate boundary and ${result.boundary.sectors.length} of ${sectors.length} sector polygons.`,
    );
    setText("");
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClear = () => {
    clearImportedBoundary();
    onCleared();
    resetMessages();
    setNotice("Imported boundary removed. The map is back to demo geometry.");
    setText("");
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 font-mono text-[9px] tracking-widest transition-colors"
          style={
            boundary
              ? {
                  borderColor: "oklch(0.78 0.17 150 / 0.45)",
                  color: "oklch(0.84 0.17 150)",
                  background: "oklch(0.78 0.17 150 / 0.08)",
                }
              : {
                  borderColor: "oklch(0.82 0.13 85 / 0.45)",
                  color: "oklch(0.82 0.13 85)",
                  background: "oklch(0.82 0.13 85 / 0.06)",
                }
          }
        >
          {boundary ? <CheckCircle2 className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
          {boundary ? `IMPORTED · ${mappedSectorCount}/${sectors.length}` : "DEMO GEOMETRY"}
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-border/70">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2 text-xl">
            <FileJson className="h-5 w-5 text-gold" />
            Field boundaries
          </DialogTitle>
          <DialogDescription>
            Import one surveyed or licensed estate boundary and its sector polygons as GeoJSON. The
            file is validated and kept in this browser only — it is not uploaded to a server.
          </DialogDescription>
        </DialogHeader>

        {boundary && (
          <div className="rounded-sm border border-border/70 bg-background/40 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="label-eyebrow">Current import</div>
                <div className="mt-1 font-mono text-xs text-foreground">{boundary.sourceName}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {mappedSectorCount} of {sectors.length} sectors mapped · imported{" "}
                  {new Date(boundary.importedAt).toLocaleString()}
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleClear}>
                <Trash2 className="h-3.5 w-3.5" />
                Remove import
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-sm border border-border/70 p-3">
          <div className="label-eyebrow mb-2 flex items-center gap-1.5">
            <Info className="h-3 w-3 text-gold" />
            Required format
          </div>
          <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
            <li>
              GeoJSON <span className="text-foreground">FeatureCollection</span> in WGS84
              longitude/latitude (RFC 7946).
            </li>
            <li>
              Exactly one estate feature with{" "}
              <code className="text-gold">properties.role = "estate"</code>.
            </li>
            <li>
              Sector features with <code className="text-gold">properties.sectorId</code> matching
              an existing sector.
            </li>
            <li>
              Geometry must be a Polygon or MultiPolygon with closed rings, non-zero area, and no
              self-intersections. Holes must sit inside the outer ring.
            </li>
            <li>
              Sector IDs may be omitted from the file; missing sectors are reported, not invented.
            </li>
          </ul>
          <div className="mt-2 flex flex-wrap gap-1">
            {knownSectorIds.map((sectorId) => (
              <span
                key={sectorId}
                className="rounded-sm border border-border/60 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground"
              >
                {sectorId}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor={fileInputId} className="label-eyebrow block">
            GeoJSON file
          </label>
          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            className="block w-full cursor-pointer rounded-sm border border-border/70 bg-background/40 px-3 py-2 text-xs text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-sm file:border-0 file:bg-gold/15 file:px-2.5 file:py-1 file:font-mono file:text-[10px] file:uppercase file:tracking-wider file:text-gold"
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
            }}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor={textareaId} className="label-eyebrow block">
            Or paste GeoJSON
          </label>
          <Textarea
            id={textareaId}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setFileName(null);
              resetMessages();
            }}
            spellCheck={false}
            rows={8}
            placeholder={`{\n  "type": "FeatureCollection",\n  "features": [\n    { "type": "Feature", "properties": { "role": "estate" }, "geometry": { ... } },\n    { "type": "Feature", "properties": { "sectorId": "sector-1" }, "geometry": { ... } }\n  ]\n}`}
            className="font-mono text-xs"
          />
        </div>

        {errors.length > 0 && (
          <div
            role="alert"
            className="rounded-sm border p-3"
            style={{
              borderColor: "oklch(0.62 0.2 28 / 0.5)",
              background: "oklch(0.62 0.2 28 / 0.08)",
            }}
          >
            <div
              className="label-eyebrow flex items-center gap-1.5"
              style={{ color: "oklch(0.75 0.18 35)" }}
            >
              <AlertTriangle className="h-3 w-3" />
              Import blocked
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-foreground/90">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {warnings.length > 0 && (
          <div
            className="rounded-sm border p-3"
            style={{
              borderColor: "oklch(0.82 0.15 85 / 0.4)",
              background: "oklch(0.82 0.15 85 / 0.06)",
            }}
          >
            <div className="label-eyebrow flex items-center gap-1.5 text-gold">
              <AlertTriangle className="h-3 w-3" />
              Review
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-foreground/90">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {notice && (
          <div
            className="flex items-start gap-2 rounded-sm border p-3 text-[11px] leading-relaxed"
            style={{
              borderColor: "oklch(0.78 0.17 150 / 0.4)",
              background: "oklch(0.78 0.17 150 / 0.07)",
            }}
          >
            <CheckCircle2
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              style={{ color: "oklch(0.84 0.17 150)" }}
            />
            <span className="text-foreground/90">{notice}</span>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button type="button" size="sm" onClick={handleImport} disabled={!text.trim()}>
            <Upload className="h-3.5 w-3.5" />
            Validate &amp; import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
