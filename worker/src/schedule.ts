// ─────────────────────────────────────────────────────────────────────────────
// Timezone-aware scheduling utilities.
//
//  - getZonedParts: wall-clock fields for an instant in an IANA timezone
//  - zonedTimeToEpoch: convert a wall-clock time in a timezone to epoch seconds
//  - parseCron / cronMatches / nextCronRun: 5-field cron, evaluated in a timezone
// All "epoch" values are Unix seconds (UTC).
// ─────────────────────────────────────────────────────────────────────────────

export interface ZonedParts {
  y: number;
  mo: number; // 1-12
  d: number; // 1-31
  h: number; // 0-23
  mi: number; // 0-59
  dow: number; // 0-6, 0 = Sunday
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    partsCache.set(tz, f);
  }
  return f;
}

export function getZonedParts(date: Date, tz: string): ZonedParts {
  const parts = formatter(tz).formatToParts(date);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = parseInt(p.value, 10);
  }
  let h = map.hour;
  if (h === 24) h = 0; // some runtimes emit "24" for midnight
  const y = map.year;
  const mo = map.month;
  const d = map.day;
  // Derive weekday from the zoned calendar date (0 = Sunday).
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return { y, mo, d, h, mi: map.minute, dow };
}

// Convert a wall-clock time in `tz` to epoch seconds.
export function zonedTimeToEpoch(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  tz: string,
): number {
  const asUTC = Date.UTC(y, mo - 1, d, h, mi, 0);
  const shown = getZonedParts(new Date(asUTC), tz);
  const shownUTC = Date.UTC(shown.y, shown.mo - 1, shown.d, shown.h, shown.mi, 0);
  const offset = shownUTC - asUTC; // ms the zone is ahead of UTC
  return Math.floor((asUTC - offset) / 1000);
}

// ── Cron parsing ─────────────────────────────────────────────────────────────
interface ParsedCron {
  minutes: Set<number>;
  hours: Set<number>;
  doms: Set<number>;
  months: Set<number>;
  dows: Set<number>;
  domRestricted: boolean;
  dowRestricted: boolean;
}

function parseField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart ? parseInt(stepPart, 10) : 1;
    if (!step || step < 1) throw new Error(`Invalid step in cron field: ${part}`);
    let lo = min;
    let hi = max;
    if (rangePart !== "*" && rangePart !== "") {
      const [a, b] = rangePart.split("-");
      lo = parseInt(a, 10);
      hi = b !== undefined ? parseInt(b, 10) : (stepPart ? max : lo);
      if (Number.isNaN(lo) || Number.isNaN(hi)) {
        throw new Error(`Invalid cron field: ${part}`);
      }
    }
    for (let v = lo; v <= hi; v += step) {
      if (v < min || v > max) continue;
      out.add(v);
    }
  }
  return out;
}

export function parseCron(expr: string): ParsedCron {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error("Cron expression must have exactly 5 fields");
  }
  const [mi, h, dom, mo, dow] = fields;
  const dows = parseField(dow, 0, 7);
  if (dows.has(7)) {
    dows.delete(7);
    dows.add(0); // normalise Sunday
  }
  return {
    minutes: parseField(mi, 0, 59),
    hours: parseField(h, 0, 23),
    doms: parseField(dom, 1, 31),
    months: parseField(mo, 1, 12),
    dows,
    domRestricted: dom.trim() !== "*",
    dowRestricted: dow.trim() !== "*",
  };
}

export function validateCron(expr: string): string | null {
  try {
    parseCron(expr);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid cron expression";
  }
}

function matches(cron: ParsedCron, p: ZonedParts): boolean {
  if (!cron.minutes.has(p.mi)) return false;
  if (!cron.hours.has(p.h)) return false;
  if (!cron.months.has(p.mo)) return false;
  // Vixie-cron semantics: when both DOM and DOW are restricted, match either.
  const domOk = cron.doms.has(p.d);
  const dowOk = cron.dows.has(p.dow);
  if (cron.domRestricted && cron.dowRestricted) {
    if (!domOk && !dowOk) return false;
  } else if (cron.domRestricted) {
    if (!domOk) return false;
  } else if (cron.dowRestricted) {
    if (!dowOk) return false;
  }
  return true;
}

// First epoch second strictly after `afterEpochSec` that matches `expr` in `tz`.
// Returns null if no match within ~2 years (e.g. an impossible expression).
export function nextCronRun(
  expr: string,
  tz: string,
  afterEpochSec: number,
): number | null {
  const cron = parseCron(expr);
  // Start at the next whole minute after `after`.
  let t = (Math.floor(afterEpochSec / 60) + 1) * 60;
  const limit = afterEpochSec + 60 * 60 * 24 * 750; // ~2 years
  for (; t <= limit; t += 60) {
    const p = getZonedParts(new Date(t * 1000), tz);
    if (matches(cron, p)) return t;
  }
  return null;
}

// ── Interval ("every N units") scheduling ────────────────────────────────────
export type IntervalUnit = "minute" | "hour" | "day" | "week" | "month" | "year";

const INTERVAL_UNITS: IntervalUnit[] = ["minute", "hour", "day", "week", "month", "year"];
// Rough seconds-per-unit, used only to jump close before refining exactly.
const APPROX_STEP: Record<IntervalUnit, number> = {
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
  month: 2629800,
  year: 31557600,
};

function daysInMonth(y: number, mo1to12: number): number {
  return new Date(Date.UTC(y, mo1to12, 0)).getUTCDate();
}

// Occurrence k (k >= 0) of an interval schedule, as epoch seconds.
// minute/hour are fixed durations; day/week/month/year are calendar-aligned in
// `tz` so the local wall-clock time stays stable (and month/year clamp the day).
function intervalOccurrence(
  anchorEpoch: number,
  a: ZonedParts,
  unit: IntervalUnit,
  value: number,
  tz: string,
  k: number,
): number {
  if (unit === "minute") return anchorEpoch + k * value * 60;
  if (unit === "hour") return anchorEpoch + k * value * 3600;
  if (unit === "day" || unit === "week") {
    const addDays = k * value * (unit === "week" ? 7 : 1);
    const dt = new Date(Date.UTC(a.y, a.mo - 1, a.d + addDays));
    return zonedTimeToEpoch(
      dt.getUTCFullYear(),
      dt.getUTCMonth() + 1,
      dt.getUTCDate(),
      a.h,
      a.mi,
      tz,
    );
  }
  // month or year
  const addMonths = k * value * (unit === "year" ? 12 : 1);
  const total = a.mo - 1 + addMonths;
  const ny = a.y + Math.floor(total / 12);
  const nmo = (total % 12) + 1;
  const nd = Math.min(a.d, daysInMonth(ny, nmo));
  return zonedTimeToEpoch(ny, nmo, nd, a.h, a.mi, tz);
}

// First occurrence strictly after `afterEpoch`. Occurrence 0 is the anchor,
// so a future anchor returns itself.
export function nextIntervalRun(
  anchorEpoch: number,
  unit: IntervalUnit,
  value: number,
  tz: string,
  afterEpoch: number,
): number | null {
  if (!Number.isFinite(anchorEpoch) || !INTERVAL_UNITS.includes(unit) || value < 1) {
    return null;
  }
  const a = getZonedParts(new Date(anchorEpoch * 1000), tz);
  // Jump near the target, then step exactly (handles month-length variance).
  let k = 0;
  if (afterEpoch > anchorEpoch) {
    k = Math.max(0, Math.floor((afterEpoch - anchorEpoch) / (APPROX_STEP[unit] * value)) - 2);
  }
  for (let i = 0; i < 100_000; i++) {
    const occ = intervalOccurrence(anchorEpoch, a, unit, value, tz, k);
    if (occ > afterEpoch) return occ;
    k++;
  }
  return null;
}

export function validateInterval(unit: string, value: number): string | null {
  if (!INTERVAL_UNITS.includes(unit as IntervalUnit)) return "Invalid interval unit";
  if (!Number.isInteger(value) || value < 1) {
    return "Interval value must be a positive integer";
  }
  if (value > 100_000) return "Interval value is too large";
  return null;
}
