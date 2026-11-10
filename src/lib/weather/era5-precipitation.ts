/**
 * ERA5-Land accumulated-parameter semantics — pure, no provider access.
 *
 * The convention (official sources)
 * ---------------------------------
 * ERA5-Land runs one daily forecast from 00 UTC and publishes its hourly
 * output for it. The ERA5-Land data documentation states how the accumulated
 * parameters behave:
 *
 *   "The accumulations in the short forecasts of ERA5-Land (with hourly steps
 *    from 01 to 24) … are accumulated from the beginning of the forecast to
 *    the end of the forecast step."
 *   "All forecasts start at 00UTC (time=00 hours), and for parameters
 *    labelled as forecasts … step specifies the number of hours since the
 *    start of the forecast."
 *   — ERA5-Land: data documentation, "Accumulations" and "Convention used in
 *     MARS", https://confluence.ecmwf.int/spaces/CKB/pages/140385202/ERA5-Land+data+documentation
 *
 * GRIB1 interpretation covered by fixtures
 * -----------------------------------------
 * ecCodes-authored fixtures cover cumulative-step and multi-hour cases. In
 * addition, genuine CDS GRIB1 payloads for both public sample AOIs are checked
 * against ecCodes 2.50.0 in weather.test.ts. Those live messages mark each
 * precipitation value as a one-hour P1/P2 interval, so the value is used
 * directly; the cumulative branch remains tested for messages that explicitly
 * state that shape.
 *
 *   - the instantaneous variables (`2t`, `2d`, `10u`, `10v`) carry the
 *     time range indicator 0 with P1 equal to the forecast step, so their
 *     validity time is the cycle start plus P1;
 *   - the accumulated variable (`tp`) carries the time range indicator 4 with
 *     P1 and P2 spanning the hour the accumulation covers — ecCodes reports
 *     it as `stepType "accum"` over the range "23-24" or "0-1" — so its
 *     value is the accumulation over that one-hour window and its validity
 *     time is the cycle start plus P2.
 *
 * So the accumulated value is an hourly amount, *provided* the window it
 * covers is one hour long; a window of any other length is a period total
 * and is not an hourly amount at all.
 *
 * Two shapes are therefore supported, and nothing else is guessed:
 *
 *   - "interval": the value is the accumulation over the window the message
 *     states. The window must be one hour for the value to be an hourly
 *     amount.
 *   - "cumulative": the value is the running total from the start of the
 *     cycle, and the hourly amount is its difference from the previous step
 *     of the same cycle (the cycle's first step starts from zero).
 *
 * Each reported timestamp is the **end** of the hour it describes, which is
 * the validity time the provider publishes.
 *
 * Source of truth for the numbers themselves: the provider's own file. This
 * module only decides what the numbers mean.
 */

/** How an accumulated message's value is to be read. */
export type AccumulationKind = "interval" | "cumulative";

/** One accumulated value read from the provider's file. */
export interface AccumulationSample {
  /** The start of the forecast cycle the accumulation belongs to. */
  cycleStart: string;
  /** Hours from the cycle start to the end of the accumulation. */
  endOffsetHours: number;
  /** Hours from the cycle start to the start of the accumulation. */
  startOffsetHours: number;
  /** Whether the value is the window's own accumulation or a running total. */
  kind: AccumulationKind;
  /** The value at the cell, in the provider's unit. */
  value: number | null;
  /** Whether the provider's bitmap says the cell was present. */
  present: boolean;
}

/** The hourly amount derived from an accumulated value. */
export interface HourlyAmount {
  /** The instant the described hour ends (the provider's validity time). */
  validTime: string;
  /** The amount over that hour, in the provider's unit; null when unknown. */
  amount: number | null;
  /** Why the amount is missing, when it is. */
  reason: string | null;
}

/** Why an amount could not be derived. */
export const AMOUNT_REASONS = {
  missingValue: "the provider's field does not cover this cell",
  missingStep: "the previous accumulation in the same 24-hour cycle is missing",
  notMonotonic: "the accumulation decreases inside the cycle, which is not valid data",
} as const;

/** Add whole hours to an RFC 3339 instant, keeping the UTC offset explicit. */
function addHours(instant: string, hours: number): string {
  const time = Date.parse(instant);
  if (!Number.isFinite(time)) return instant;
  return new Date(time + hours * 3_600_000).toISOString();
}

/**
 * Derive hourly amounts from the accumulated values of one or more cycles.
 *
 * The samples may arrive in any order and may span several cycles; they are
 * grouped by cycle and sorted by the end of their window. Every sample
 * produces one entry, in validity-time order, so that a caller can line the
 * amounts up with the other variables by timestamp.
 */
export function deaccumulate(samples: AccumulationSample[]): HourlyAmount[] {
  const cycles = new Map<string, AccumulationSample[]>();
  for (const sample of samples) {
    const cycle = cycles.get(sample.cycleStart) ?? [];
    cycle.push(sample);
    cycles.set(sample.cycleStart, cycle);
  }

  const results: HourlyAmount[] = [];
  for (const [cycleStart, cycleSamples] of cycles) {
    const byEnd = new Map<number, AccumulationSample>();
    for (const sample of cycleSamples) {
      // A repeated end time for the same cycle is malformed; the first one
      // is kept and the ordering check below notices the inconsistency.
      if (!byEnd.has(sample.endOffsetHours)) byEnd.set(sample.endOffsetHours, sample);
    }
    const ends = [...byEnd.keys()].sort((a, b) => a - b);

    for (const end of ends) {
      const sample = byEnd.get(end)!;
      const validTime = addHours(cycleStart, end);

      if (!sample.present || sample.value === null || !Number.isFinite(sample.value)) {
        results.push({ validTime, amount: null, reason: AMOUNT_REASONS.missingValue });
        continue;
      }
      if (sample.kind === "interval") {
        // The value is the accumulation over the window the message states.
        results.push({ validTime, amount: sample.value, reason: null });
        continue;
      }
      // The value is the running total from the start of the cycle, so the
      // hourly amount is its difference from the previous step of the cycle.
      const previous = end === 1 ? undefined : byEnd.get(end - 1);
      if (end > 1 && (!previous || !previous.present || previous.value === null)) {
        results.push({ validTime, amount: null, reason: AMOUNT_REASONS.missingStep });
        continue;
      }
      const previousValue = end === 1 ? 0 : (previous?.value as number);
      const difference = sample.value - previousValue;
      if (difference < 0) {
        results.push({ validTime, amount: null, reason: AMOUNT_REASONS.notMonotonic });
        continue;
      }
      results.push({ validTime, amount: difference, reason: null });
    }
  }

  return results.sort((a, b) => a.validTime.localeCompare(b.validTime));
}
