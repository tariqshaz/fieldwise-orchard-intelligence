/**
 * User-facing messages for the Sentinel-2 observation slice.
 *
 * Every string here is safe to show in the browser and to log: none contain
 * credentials, tokens, or raw provider response bodies. Messages are built in
 * one place so the client's pre-flight checks and the server's authoritative
 * checks always say exactly the same thing.
 */

import type { SentinelErrorCode } from "./types.ts";

/** Input problems the server can detect before contacting the provider. */
export type SentinelInputErrorCode = Extract<
  SentinelErrorCode,
  "invalid_input" | "geometry_invalid" | "aoi_too_large" | "date_range_too_long"
>;

export const SENTINEL_ERROR_MESSAGES = {
  invalid_date: "Enter the dates as YYYY-MM-DD.",
  date_order: "The end date must be on or after the start date.",
  date_before_mission: "Sentinel-2 data begins on 2015-06-23; choose a start date on or after it.",
  date_future: "The end date is in the future. Choose today or an earlier date.",
  date_too_long: (days: number, max: number) =>
    `The date range is ${days} days long; this slice searches at most ${max} days at a time. ` +
    "Shorten the range and search again.",
  geometry_empty: "The area of interest has no measurable extent.",
  aoi_too_large: (maxSpanDeg: number) =>
    `This area of interest is wider or taller than ${maxSpanDeg}° (about 33 km), which is more ` +
    "than one satellite request should cover. Simplify the boundary or pick a smaller area.",
  aoi_too_many_vertices: (maxVertices: number) =>
    `This boundary has more than ${maxVertices.toLocaleString("en-US")} vertices — more than one ` +
    "satellite request may carry. Simplify the boundary in a GIS tool and import it again.",
  missing_geometry: "No area of interest was supplied for this request.",
  unknown_sample: "That sample area of interest no longer exists. Choose another one.",
  acquired_at_invalid:
    "The selected scene's acquisition time is missing or out of range. Search for scenes again " +
    "and retry.",

  credentials_missing:
    "Satellite credentials are not configured on this server. Set CDSE_OAUTH_CLIENT_ID and " +
    "CDSE_OAUTH_CLIENT_SECRET (server-only) — see .env.example.",
  auth_failed:
    "The satellite provider rejected the configured credentials. Check the OAuth client ID and " +
    "secret in the server environment.",
  rate_limited: "The satellite provider is rate-limiting requests. Wait a moment and try again.",
  timeout: "The satellite provider did not respond in time. Try again in a moment.",
  provider_error: (status: number) =>
    `The satellite provider returned an error (HTTP ${status}). Try again later.`,
  provider_unreachable:
    "The satellite provider could not be reached. Check connectivity and try again.",
  provider_response_invalid:
    "The satellite provider returned an unexpected response. Try again later.",
  internal:
    "Something went wrong while contacting the satellite provider. Check the server logs and try again.",
} as const;
