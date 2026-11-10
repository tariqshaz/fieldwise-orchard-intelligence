import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { retrieveEra5LandHistorical, toEra5LandError } from "../weather/era5-land.server";
import { retrieveEcmwfIfsForecast, toEcmwfError } from "../weather/ecmwf-ifs.server";
import type {
  EcmwfIfsForecast,
  WeatherContextResponse,
  WeatherContextResult,
  WeatherError,
  WeatherProductResult,
} from "../weather/types.ts";
import type { Era5LandHistorical } from "../weather/types.ts";
import { selectGridCell, weatherSampleAoiById } from "../weather/aoi.ts";
import type { WeatherAoiDescriptor } from "../weather/types.ts";

// ---------------------------------------------------------------------------
// Input contracts. Zod bounds every field before any provider call.
// ---------------------------------------------------------------------------

const sampleAoiIdSchema = z.enum(["sample-khanewal-orchards", "sample-okara-farmland"]);

const era5HistoryInputSchema = z
  .object({
    sampleId: sampleAoiIdSchema,
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict()
  .refine((value) => Boolean(value.from) === Boolean(value.to), {
    message: "Provide both from and to dates, or neither.",
  })
  .refine((value) => !value.from || isValidIsoDate(value.from), {
    path: ["from"],
    message: "from must be a real calendar date.",
  })
  .refine((value) => !value.to || isValidIsoDate(value.to), {
    path: ["to"],
    message: "to must be a real calendar date.",
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ["to"],
    message: "to must be on or after from.",
  })
  .refine(
    (value) =>
      !value.from ||
      !value.to ||
      Date.parse(`${value.to}T00:00:00Z`) - Date.parse(`${value.from}T00:00:00Z`) < 31 * 86_400_000,
    {
      path: ["to"],
      message: "Historical requests are limited to 31 calendar days.",
    },
  );

const ecmwfForecastInputSchema = z.object({
  sampleId: sampleAoiIdSchema,
  resolution: z.enum(["0.1_deg", "0.25_deg"]).optional(),
});

export type WeatherForecastInput = z.infer<typeof ecmwfForecastInputSchema>;
export type WeatherHistoricalInput = {
  sampleId: string;
  from?: string;
  to?: string;
};

/** Resolve a sample AOI descriptor, throwing on unknown IDs. */
function resolveWeatherAoiDescriptor(sampleId: string): WeatherAoiDescriptor {
  const sample = weatherSampleAoiById(sampleId);
  if (!sample) {
    throw new Error(`Unknown sample AOI: ${sampleId}`);
  }
  return {
    kind: "sample",
    label: sample.label,
    provenance: sample.provenance,
    bbox: sample.bbox,
  };
}

/** Default historical period: last 7 days, bounded. */
function defaultHistoricalPeriod(): { from: string; to: string } {
  const to = new Date();
  to.setUTCDate(to.getUTCDate() - 1);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

function isValidIsoDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

/**
 * Retrieve ERA5-Land historical reanalysis for one sample AOI.
 * Returns a credentials_required product when CDS credentials are not configured.
 */
export const retrieveEra5LandHistory = createServerFn({ method: "POST" })
  .inputValidator(era5HistoryInputSchema)
  .handler(async ({ data }): Promise<Era5LandHistorical | { ok: false; error: WeatherError }> => {
    try {
      resolveWeatherAoiDescriptor(data.sampleId);
      const period =
        data.from && data.to ? { from: data.from, to: data.to } : defaultHistoricalPeriod();
      const product = await retrieveEra5LandHistorical(data.sampleId, period);
      return product as Era5LandHistorical;
    } catch (error) {
      return { ok: false, error: toEra5LandError(error) };
    }
  });

/**
 * Retrieve ECMWF Open Data IFS forecast for one sample AOI.
 */
export const retrieveEcmwfForecast = createServerFn({ method: "POST" })
  .inputValidator(ecmwfForecastInputSchema)
  .handler(async ({ data }): Promise<EcmwfIfsForecast | { ok: false; error: WeatherError }> => {
    try {
      const product = await retrieveEcmwfIfsForecast(data.sampleId, data.resolution);
      return product as EcmwfIfsForecast;
    } catch (error) {
      return { ok: false, error: toEcmwfError(error) };
    }
  });

/**
 * Retrieve all weather context products for one sample AOI in a single call.
 * Returns each product independently so one provider's failure doesn't block others.
 */
export const retrieveWeatherContext = createServerFn({ method: "POST" })
  .inputValidator(
    z
      .object({
        sampleId: sampleAoiIdSchema,
      })
      .strict(),
  )
  .handler(async ({ data }): Promise<WeatherContextResponse> => {
    try {
      const aoi = resolveWeatherAoiDescriptor(data.sampleId);
      const retrievedAt = new Date().toISOString();
      const period = defaultHistoricalPeriod();

      // Fetch all products independently; failures are captured per-product.
      const [era5Product, ecmwfProduct] = await Promise.allSettled([
        retrieveEra5LandHistorical(data.sampleId, period),
        retrieveEcmwfIfsForecast(data.sampleId),
      ]);

      const products: WeatherProductResult[] = [];

      if (era5Product.status === "fulfilled") {
        products.push(era5Product.value);
      } else {
        const failure = toEra5LandError(era5Product.reason);
        products.push({
          type: "era5-land-historical",
          source: "ERA5-Land (Copernicus CDS)",
          attribution:
            "Contains modified Copernicus Climate Data Service information. ERA5-Land, CC BY. " +
            "https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land",
          retrievedAt,
          aoi,
          gridCell: {
            method: "nearest 0.1° grid point to AOI centroid",
            gridResolutionDeg: 0.1,
            cellCenter: selectGridCell(
              (aoi.bbox[0] + aoi.bbox[2]) / 2,
              (aoi.bbox[1] + aoi.bbox[3]) / 2,
              0.1,
            ).cellCenter,
          },
          status: "unavailable",
          message: `ERA5-Land retrieval failed [${failure.code}]: ${failure.message}`,
          version: "ERA5-Land-T",
          variables: [],
          temporalResolution: "hourly",
          spatialResolution: "0.1_deg",
          period,
          observations: [],
          precipitationValidated: false,
          caveats: [failure.message],
        });
      }

      if (ecmwfProduct.status === "fulfilled") {
        products.push(ecmwfProduct.value);
      } else {
        const failure = toEcmwfError(ecmwfProduct.reason);
        products.push({
          type: "ecmwf-ifs-forecast",
          source: "ECMWF Open Data IFS",
          attribution:
            "Contains modified Copernicus data. ECMWF Open Data IFS forecast, CC BY 4.0. " +
            "https://www.ecmwf.int/en/forecasts/datasets/open-data",
          retrievedAt,
          aoi,
          gridCell: {
            method: "nearest 0.1° grid point to AOI centroid",
            gridResolutionDeg: 0.1,
            cellCenter: selectGridCell(
              (aoi.bbox[0] + aoi.bbox[2]) / 2,
              (aoi.bbox[1] + aoi.bbox[3]) / 2,
              0.1,
            ).cellCenter,
          },
          status: "unavailable",
          message: `ECMWF forecast retrieval failed [${failure.code}]: ${failure.message}`,
          model: "ifs",
          resolution: "0.1_deg",
          issueTime: retrievedAt,
          horizonHours: 72,
          steps: [],
          frames: [],
          caveats: [failure.message],
        });
      }

      products.push(buildPmdReference(data.sampleId, aoi, retrievedAt));
      products.push(buildFloodContext(data.sampleId, aoi, retrievedAt));
      products.push(buildCropContext(data.sampleId, aoi, retrievedAt));

      return { ok: true, aoi, retrievedAt, products };
    } catch (error) {
      return { ok: false, error: toWeatherError(error) };
    }
  });

// ---------------------------------------------------------------------------
// Contextual reference builders (link-only, no scraping)
// ---------------------------------------------------------------------------

/**
 * The PMD station observations page, verified in a browser during QA.
 *
 * PMD publishes current and last-24-hour observations for its stations here.
 * The page embeds the station records in its own HTML, answers 403 to plain
 * HTTP clients, and offers no documented API or reuse terms, so this product
 * links to the page instead of scraping it.
 */
const PMD_OBSERVATIONS_URL = "https://weather.gov.pk/nwfc/weather-observations";
const PMD_PUNJAB_URL = "https://weather.gov.pk/regional/Punjab";

/** The PMD stations nearest the two sample AOIs, as the provider lists them. */
const PMD_STATIONS: Record<
  string,
  { code: string; latitude: number; longitude: number; distanceKm: number }
> = {
  "sample-khanewal-orchards": {
    code: "41677 (KHANEWAL)",
    latitude: 30.29,
    longitude: 71.93,
    distanceKm: 45,
  },
  "sample-okara-farmland": {
    code: "41646 (OKARA)",
    latitude: 30.8,
    longitude: 73.4,
    distanceKm: 42,
  },
};

function buildPmdReference(
  sampleId: string,
  aoi: WeatherAoiDescriptor,
  retrievedAt: string,
): WeatherProductResult {
  const station = sampleId.includes("khanewal") ? "Khanewal" : "Okara";
  const stationRecord = PMD_STATIONS[sampleId];
  return {
    type: "pmd-station",
    source: "Pakistan Meteorological Department (PMD)",
    attribution:
      "Pakistan Meteorological Department — official station pages and regional reports.",
    retrievedAt,
    aoi,
    gridCell: {
      method: "station reference, not grid-sampled",
      gridResolutionDeg: 0,
      cellCenter: null,
    },
    status: "missing",
    station,
    referenceUrl: PMD_OBSERVATIONS_URL,
    note:
      `PMD publishes current and last-24-hour observations for its stations on the official ` +
      `page this product links to. ${stationRecord.code} is listed at ` +
      `${stationRecord.latitude.toFixed(2)}°N, ${stationRecord.longitude.toFixed(2)}°E, about ` +
      `${stationRecord.distanceKm} km from this sample area's centroid, so it is regional ` +
      `context and not an observation of the area itself. This product does not retrieve ` +
      `observations: PMD publishes them inside the page, offers no documented API, and the ` +
      `page refuses plain HTTP clients, so nothing is fetched, decoded or claimed here. ` +
      `See also the PMD Punjab regional page (${PMD_PUNJAB_URL}).`,
    caveats: [
      "PMD station data is a reference link only in this slice; no observation was retrieved.",
      "The PMD station nearest this sample area is tens of kilometres away; station readings " +
        "are not area readings.",
      "Station observations are not grid estimates and not AOI-specific.",
    ],
  };
}

/**
 * Dated flood references.
 *
 * The first record is a district-level assessment that names both sample
 * districts; the rest are the Flood Forecasting Division's own river-level
 * publications, which are listed as background rather than as events for
 * these districts.
 */
const FFD_PUBLICATIONS_URL = "https://ffd.pmd.gov.pk/";
/**
 * The Rapid Needs Assessment of the 2025 monsoon floods, published by the
 * Government of Pakistan and UN OCHA and hosted by ReliefWeb. It names
 * Khanewal and Okara among the 18 flood-affected districts assessed.
 */
const PUNJAB_FLOOD_RNA_URL =
  "https://reliefweb.int/report/pakistan/rapid-needs-assessment-report-floods-punjab-23-september-2025";

function buildFloodContext(
  sampleId: string,
  aoi: WeatherAoiDescriptor,
  retrievedAt: string,
): WeatherProductResult {
  const district = sampleId.includes("khanewal") ? "Khanewal" : "Okara";
  const priority = district === "Khanewal" ? "high" : "medium";
  return {
    type: "flood-event",
    source: "Government of Pakistan / UN OCHA, and PMD Flood Forecasting Division",
    attribution:
      "Dated official flood assessments and the PMD Flood Forecasting Division's bulletins, " +
      "advisories and annual flood reports; no machine-readable GIS feed for AOI intersection.",
    retrievedAt,
    aoi,
    gridCell: {
      method: "district-level event geography, not grid-sampled",
      gridResolutionDeg: 0,
      cellCenter: null,
    },
    status: "ok",
    events: [
      {
        date: "2025-09-23",
        geography: `${district} district, Punjab (one of 18 flood-affected districts assessed)`,
        description:
          "The Rapid Needs Assessment of the 2025 monsoon floods was carried out from 8 to 18 " +
          "September 2025, covering 1,928 mouzas in 18 flood-affected districts of Punjab, " +
          "among them Khanewal and Okara. The districts were prioritised as high, medium or " +
          `low using four indicators — people affected, people displaced, houses damaged and ` +
          `cropland damaged — and ${district} was assessed as ${priority} priority. Across the ` +
          "assessed locations the monsoon floods affected 4.2 million people and displaced " +
          "nearly 2.8 million.",
        sourceUrl: PUNJAB_FLOOD_RNA_URL,
        publisher:
          "Government of Pakistan and UN Office for the Coordination of Humanitarian Affairs",
        caveat:
          "The assessment names the district and its priority category; it does not state that " +
          "the sample rectangle inside that district was flooded, and it describes the 2025 " +
          "monsoon, not a longer flood history.",
      },
      {
        date: "2025-08-28",
        geography:
          "Khanewal district (Kabirwala), Punjab — one of the districts covered by the assessment",
        description:
          "Strengthening Participatory Organisation's situational analysis of the 2025 Punjab floods " +
          "records focus-group discussions across the high-risk districts of Layyah, Multan, Kasur, " +
          "Bahawalnagar, Gujranwala, Wazirabad, Vehari, Bahawalpur, Khanewal (Kabirwala) and " +
          "Muzaffargarh, and reports a hazardous situation with tens of thousands of households " +
          "facing displacement.",
        sourceUrl:
          "https://reliefweb.int/report/pakistan/situational-analysis-report-punjab-floods-2025",
        publisher:
          "Strengthening Participatory Organisation (SPO), published on ReliefWeb (UN OCHA)",
        caveat:
          "A pre-monsoon assessment of the districts at risk; it names Khanewal but not Okara, and " +
          "it does not establish that the sample rectangle inside Khanewal was flooded.",
      },
      {
        date: "2026-01-07",
        geography:
          "Khanewal district, Punjab — one of the districts with flood-affected communities",
        description:
          "The International Medical Corps' ninth flooding response situation report records that, " +
          "according to UN OCHA, flood-affected communities across several districts of Punjab — " +
          "including Bahawalpur, Bahawalnagar, Dera Ghazi Khan, Jhang, Khanewal, Multan, " +
          "Muzaffargarh, Rahim Yar Khan and Rajanpur — continued to face significant humanitarian " +
          "and early-recovery challenges into January 2026, though floodwaters had largely receded.",
        sourceUrl:
          "https://reliefweb.int/report/pakistan/pakistan-flooding-response-situation-report-9-january-7-2026",
        publisher: "International Medical Corps (IMC), published on ReliefWeb (UN OCHA)",
        caveat:
          "A dated statement about the aftermath of the 2025 monsoon in the named district. It does " +
          "not establish that the sample rectangle inside Khanewal was flooded, and it does not " +
          "name Okara.",
      },
      {
        date: "2026-06-15/2026-10-15",
        geography:
          "Indus, Kabul, Jhelum, Chenab, Ravi and Sutlej river systems (Punjab and upper Indus)",
        description:
          "The 2026 flood season ran from 15 June to 15 October 2026 and closed on 15 October " +
          "after 123 daily bulletins were issued. The last flood advisory was issued on 22 July " +
          "2026. The bulletins and advisories describe river stages and discharges, not " +
          "district-level flooding.",
        sourceUrl: FFD_PUBLICATIONS_URL,
        publisher: "PMD Flood Forecasting Division, Lahore",
        caveat:
          "River-level record. It does not establish that either sample district was flooded, " +
          "and the district-level Punjab Disaster Management Authority situation reports could " +
          "not be reached from the QA environment to be checked.",
      },
      {
        date: "2022",
        geography: "Indus, Kabul, Jhelum, Chenab, Ravi and Sutlej river systems",
        description:
          "The Flood Forecasting Division's Annual Flood Report 2022 covers the 2022 monsoon " +
          "season. The report is a hydrological record of river levels, discharges and flood " +
          "limits; a text search of the report found no mention of Khanewal or Okara.",
        sourceUrl: "https://ffd.pmd.gov.pk/flood-reports/15/download",
        publisher: "PMD Flood Forecasting Division, Lahore",
        caveat:
          "River-level record. The report does not substantiate a dated flood event for " +
          "Khanewal or Okara, so it is listed as background, not as an event for this area.",
      },
      {
        date: "2025",
        geography: "Indus, Kabul, Jhelum, Chenab, Ravi and Sutlej river systems",
        description:
          "The Annual Flood Report 2025 is the most recent edition published by the Flood " +
          "Forecasting Division. It records the 2025 monsoon season, including a 14-17 July " +
          "spell during which Okara recorded the country's highest rainfall total (412 mm).",
        sourceUrl: "https://ffd.pmd.gov.pk/flood-reports/20/download",
        publisher: "PMD Flood Forecasting Division, Lahore",
        caveat:
          "River-level record, and the Okara mention is a rainfall observation at the PMD " +
          "station, not a flood event for the district.",
      },
    ],
    // The assessment names the district the sample area sits in, so the event
    // is relevant at district level; it says nothing about the rectangle.
    aoiRelevant: true,
    message:
      `Dated district-level flood evidence is listed first: the 2025 monsoon assessments and ` +
      "reports name " +
      (district === "Khanewal"
        ? "Khanewal in three of them (August and September 2025, and the January 2026 " +
          "aftermath), and Okara in the September assessment"
        : "Okara in the September 2025 assessment, and not in the other two") +
      ". Every one of them is a district-level statement; none establishes that this sample " +
      "area was flooded. The remaining records are the Flood Forecasting Division's river-level " +
      "publications, and the district-level Punjab Disaster Management Authority situation " +
      "reports — which would carry the earlier floods — could not be reached from the QA " +
      "environment, so the flood history of these districts is still only partly documented.",
    caveats: [
      "PDMA Punjab and PMD FFD publish dated situation reports and maps, often as PDFs at " +
        "district or river-corridor level.",
      "No stable, machine-readable GIS feed for AOI intersection was established; flood " +
        "context here is dated reference records, not an extent layer.",
      "A historic flood layer is exposure context, not evidence of current inundation.",
      "A district-level flood assessment does not mean the sample rectangle inside that " +
        "district was flooded.",
    ],
  };
}

/**
 * District crop context.
 *
 * Two authoritative publications are used:
 *
 *   - the federal compilation of the provincial Crop Reporting Service
 *     estimates (crop area and production), and
 *   - the Pakistan Bureau of Statistics' Agricultural Census 2024 for Punjab,
 *     which counts farms reporting orchards and the mango trees on them.
 *
 * The census is a count, not an estimate, and it is the only readable
 * orchard-specific district source found; the mango rows of the Crop
 * Reporting Service publication are page images whose figures could not be
 * read, so none are taken from it.
 */
const CROP_PUBLICATION_URL = "https://mnfsr.gov.pk/SiteImage/Publication/CAP.pdf";
const CENSUS_PUBLICATION_URL =
  "https://www.pbs.gov.pk/wp-content/uploads/2020/07/IAC-Punjab-Report-25-05-2026-1-1.pdf";

/** The census figures for the two districts, as published (June 2026). */
const CENSUS_FIGURES: Record<
  string,
  {
    orchardFarms: number;
    orchardAreaAcres: number;
    orchardSharePercent: number;
    mangoFarms: number;
    mangoTrees: number;
    mangoBearing: number;
  }
> = {
  "sample-khanewal-orchards": {
    orchardFarms: 4338,
    orchardAreaAcres: 25162,
    orchardSharePercent: 18,
    mangoFarms: 8230,
    mangoTrees: 932284,
    mangoBearing: 169345,
  },
  "sample-okara-farmland": {
    orchardFarms: 1270,
    orchardAreaAcres: 3943,
    orchardSharePercent: 8,
    mangoFarms: 3485,
    mangoTrees: 14018,
    mangoBearing: 2272,
  },
};

function buildCropContext(
  sampleId: string,
  aoi: WeatherAoiDescriptor,
  retrievedAt: string,
): WeatherProductResult {
  const district = sampleId.includes("khanewal") ? "Khanewal" : "Okara";
  const census = CENSUS_FIGURES[sampleId];
  const cropRows =
    district === "Khanewal"
      ? [
          { crop: "Wheat", area: 214.88, production: 792.89 },
          { crop: "Fodder", area: 143.2, production: 7820.6 },
        ]
      : [
          { crop: "Wheat", area: 133.14, production: 502.58 },
          { crop: "Fodder", area: 112.4, production: 6499.5 },
        ];
  return {
    type: "crop-district",
    source: "Pakistan Bureau of Statistics, and Crop Reporting Service figures",
    attribution:
      "Pakistan Bureau of Statistics, 'Agricultural Census 2024 — Punjab Report' (June 2026), and " +
      "the Ministry of National Food Security & Research's compilation of the Crop Reporting " +
      "Services' district estimates.",
    retrievedAt,
    aoi,
    gridCell: {
      method: "district-level estimate, not grid-sampled",
      gridResolutionDeg: 0,
      cellCenter: null,
    },
    status: "ok",
    estimates: [
      ...cropRows.map((row) => ({
        crop: row.crop,
        district,
        year: "2021-22",
        areaValue: row.area,
        unit: "'000 hectares sown",
        yieldValue: row.production,
        yieldUnit: "'000 tonnes produced (total production, not a per-hectare yield)",
        sourceUrl: CROP_PUBLICATION_URL,
        caveat:
          "District-level regional statistic from the Crop Reporting Service, not a farm-level " +
          "measurement, and not an indication that this crop is present in the sample area. The " +
          "mango and citrus district tables in the same publication are page images whose rows " +
          "could not be read as text, so no figure is taken from them.",
      })),
      {
        crop: "Orchards",
        district,
        year: "2024 census",
        areaValue: census.orchardAreaAcres,
        unit: "acres of orchard area",
        yieldValue: null,
        yieldUnit: null,
        count: census.orchardFarms,
        countLabel: "farms reporting orchards",
        sourceUrl: CENSUS_PUBLICATION_URL,
        caveat:
          `Table 6.3 of the Agricultural Census 2024 (Punjab Report, June 2026), a census count ` +
          `for the whole district: the orchard area is ${census.orchardSharePercent}% of the cropped ` +
          "area of the farms that report orchards. It is a district total, not a measurement of " +
          "the sample area.",
      },
      {
        crop: "Mango",
        district,
        year: "2024 census",
        areaValue: null,
        unit: "",
        yieldValue: null,
        yieldUnit: null,
        count: census.mangoTrees,
        countLabel: `mango trees (${census.mangoBearing} bearing)`,
        sourceUrl: CENSUS_PUBLICATION_URL,
        caveat:
          `Table 6.4 of the Agricultural Census 2024 (Punjab Report, June 2026), a census count ` +
          `for the whole district: ${census.mangoFarms} farms reported mango trees. A tree count ` +
          "is not an area, a yield or a statement about this sample area.",
      },
    ],
    message:
      `District crop and orchard context for ${district}: crop area and production estimates ` +
      "from the Crop Reporting Services, and orchard and mango tree counts from the 2024 " +
      "Agricultural Census. These are district totals, not measurements of this sample area.",
    caveats: [
      "The Crop Reporting Service publishes district-wise crop area and production estimates; " +
        "the figures here are the federal compilation of those estimates.",
      "The orchard and mango figures are census counts for the whole district (tables 6.3 and " +
        "6.4 of the Agricultural Census 2024 Punjab Report), published by the Pakistan Bureau " +
        "of Statistics.",
      "Geography is district, not farm/parcel. Do not infer crop presence in the sample AOI.",
      "The crop year is 2021-22; later estimate editions were not reachable from the QA " +
        "environment.",
    ],
  };
}

/** Map a thrown value to a non-sensitive {code, message} error. */
function toWeatherError(error: unknown): WeatherError {
  console.error("[weather] unexpected error:", error instanceof Error ? error.name : "unknown");
  return { code: "internal", message: "Something went wrong while retrieving weather context." };
}
