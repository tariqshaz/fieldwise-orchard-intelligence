# ERA5-Land GRIB1 fixtures

This directory contains two kinds of fixtures: small synthetic/ecCodes-authored
decoder cases and a pair of genuine Copernicus Climate Data Store payloads used
to regression-test live ERA5-Land decoding. The latter are source observations,
not synthetic values; attribution and the independent oracle are recorded
below.

Each file is a minimal GRIB edition 1 message for total precipitation
(`indicatorOfParameter` 228, ECMWF local table 128) at the surface, on a 2×2
regular latitude/longitude grid over the Khanewal sample area
(first point 71.5 °E, 30.7 °N; last point 71.6 °E, 30.6 °N; increments 0.1°;
scanning mode 64). They were **authored with ecCodes 2.42.0** (the
independent oracle used for this project's GRIB work), so their metadata is
ecCodes' own output rather than this project's.

The reference date and time in every file is 2007-11-04 00:00 UTC, which is
the start of the forecast cycle the messages belong to.

| File                | ecCodes `step` | ecCodes `stepRange` | Time range indicator | P1  | P2  | Values at the cell nearest the AOI centroid (index 3) |
| ------------------- | -------------- | ------------------- | -------------------- | --- | --- | ----------------------------------------------------- |
| `era5-step1.grib1`  | 1              | `1`                 | 0                    | 1   | 0   | 0.0010 m                                              |
| `era5-step2.grib1`  | 2              | `2`                 | 0                    | 2   | 0   | 0.0025 m                                              |
| `era5-step3.grib1`  | 3              | `3`                 | 0                    | 3   | 0   | 0.0040 m                                              |
| `era5-period.grib1` | 3              | `0-3`               | 2                    | 0   | 3   | 0.0040 m (the total over the whole period)            |

Two of them exist to pin down the ERA5-Land accumulation convention:

- the three `step` files are one forecast cycle whose accumulated total grows
  through the first three hours, which is how the Climate Data Store publishes
  an accumulated parameter;
- the `period` file states the same total with a _period_ time range
  (indicator 2, P1 = 0, P2 = 3). ecCodes reports it as step 3 over the range
  `0-3`, while the WebAssembly decoder's derived forecast hours are 0 — the
  reason the adapter reads the raw PDS timing fields instead.

The synthetic fixtures were produced with ecCodes' own writer; the values are
chosen by hand so that the hourly differences are exact and distinguishable.

## Genuine CDS samples and ecCodes oracle

`era5-live-khanewal-20261103-04.grib1` and
`era5-live-okara-20261103-04.grib1` are genuine GRIB1 responses retrieved from
the CDS `reanalysis-era5-land` process on 2026-11-10 for the fixed public sample
AOIs, for valid dates 2026-11-03 through 2026-11-04. Each file contains 48
messages for each of `2t`, `2d`, `tp`, `10u`, and `10v`. Their selected cell is
the same 0.1° point reported by the application for that sample AOI.

The corresponding `*.ecCodes.json` files contain the independently decoded
message metadata and selected point values from ecCodes 2.50.0. They are test
oracles: the weather tests compare Fieldglass GRIB1 output, timestamps, P1/P2,
time-range indicators, units, and assembled hourly observations with these
values. In this payload, every `tp` message has time-range indicator 4 and a
one-hour P1–P2 interval (including the 23–24 interval at 00 UTC); its value is
already the amount for that interval and must not be differenced as a running
total.

The data are from the Copernicus Climate Change Service (C3S) ERA5-Land data
product, licensed CC-BY 4.0. Attribution: “Contains modified Copernicus Climate
Change Service information 2026.” Product page:
<https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land>.
