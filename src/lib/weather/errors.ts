/**
 * User-facing messages for the Phase 3 weather / environmental context slice.
 *
 * Every string here is safe to show in the browser and to log: none contain
 * credentials, tokens, or raw provider response bodies. Messages are built in
 * one place so the client's pre-flight checks and the server's authoritative
 * checks always say exactly the same thing.
 */

import type { WeatherErrorCode } from "./types.ts";

/** Input problems the server can detect before contacting the provider. */
export type WeatherInputErrorCode = Extract<WeatherErrorCode, "invalid_input">;

export const WEATHER_ERROR_MESSAGES = {
  unknown_sample: (sampleId: string) =>
    `That sample area of interest (${sampleId}) no longer exists. Choose another one.`,
  credentials_missing_era5:
    "ERA5-Land historical weather requires CDS API credentials. Set CDS_API_URL and CDS_API_KEY " +
    "(server-only, see .env.example) to enable reanalysis retrieval. Without credentials this " +
    "product shows a setup state instead of fabricating values.",
  credentials_missing_ecmwf:
    "ECMWF Open Data forecast retrieval failed. The forecast product is unavailable until the " +
    "server can reach data.ecmwf.int.",
  rate_limited: "The weather provider is rate-limiting requests. Wait a moment and try again.",
  timeout: "The weather provider did not respond in time. Try again in a moment.",
  provider_error: (status: number) =>
    `The weather provider returned an error (HTTP ${status}). Try again later.`,
  provider_response_invalid:
    "The weather provider returned an unexpected response. Try again later.",
  internal:
    "Something went wrong while retrieving weather data. Check the server logs and try again.",
  grid_cell_missing: "No grid cell could be selected for this area of interest. Try again.",
  no_flood_records:
    "No reviewed flood-event records are currently available for this region. This is not " +
    "evidence that the area is flood-free; it means no usable dated record has been published " +
    "and reviewed.",
  no_crop_estimates:
    "No district crop estimates are currently available for this region. District-level " +
    "statistics do not indicate crop presence in the sample AOI.",
} as const;
