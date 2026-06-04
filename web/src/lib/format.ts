// ── Timezone-aware formatting helpers ────────────────────────────────────────

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function partsIn(epochSec: number, tz: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(epochSec * 1000));
  const m: Record<string, string> = {};
  for (const part of p) if (part.type !== "literal") m[part.type] = part.value;
  return m;
}

// "2026-06-10 09:30"
export function formatDateTime(epochSec: number | null, tz: string): string {
  if (!epochSec) return "—";
  const m = partsIn(epochSec, tz);
  return `${m.year}-${m.month}-${m.day} ${m.hour === "24" ? "00" : m.hour}:${m.minute}`;
}

// "Jun 10, 09:30"
export function formatShort(epochSec: number | null, tz: string): string {
  if (!epochSec) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(epochSec * 1000));
}

// For an <input type="datetime-local"> showing wall-clock in `tz`: "YYYY-MM-DDTHH:mm"
export function epochToLocalInput(epochSec: number, tz: string): string {
  const m = partsIn(epochSec, tz);
  const h = m.hour === "24" ? "00" : m.hour;
  return `${m.year}-${m.month}-${m.day}T${h}:${m.minute}`;
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31536000],
  ["month", 2592000],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

export function relativeTime(epochSec: number | null, nowSec?: number): string {
  if (!epochSec) return "—";
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  const diff = epochSec - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, secs] of RELATIVE_UNITS) {
    if (abs >= secs || unit === "second") {
      return rtf.format(Math.round(diff / secs), unit);
    }
  }
  return "now";
}

export function tzOffsetLabel(tz: string): string {
  try {
    const s = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName");
    return s?.value || "";
  } catch {
    return "";
  }
}

const WEEK_CN = ["日", "一", "二", "三", "四", "五", "六"];
const pad2 = (s: string) => s.padStart(2, "0");

function sameSet(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// Parse a cron day-of-week field (lists + ranges of 0-7) → sorted unique 0-6
// (0 = Sunday). Returns null if it uses steps or is malformed.
export function parseDow(field: string): number[] | null {
  if (field === "*") return null;
  const out = new Set<number>();
  for (const part of field.split(",")) {
    if (part.includes("/")) return null;
    const m = part.match(/^(\d)(?:-(\d))?$/);
    if (!m) return null;
    let a = +m[1];
    let b = m[2] !== undefined ? +m[2] : a;
    if (a > 7 || b > 7) return null;
    if (a === 7) a = 0;
    if (b === 7) b = 0;
    if (a <= b) for (let v = a; v <= b; v++) out.add(v);
    else {
      for (let v = a; v <= 6; v++) out.add(v);
      for (let v = 0; v <= b; v++) out.add(v);
    }
  }
  return [...out].sort((x, y) => x - y);
}

// Plain-Chinese description of a 5-field cron expression.
export function describeCron(expr: string | null): string {
  if (!expr) return "—";
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return expr;
  const [mi, h, dom, mon, dow] = f;

  if (/^\*\/(\d+)$/.test(mi) && h === "*" && dom === "*" && mon === "*" && dow === "*") {
    return `每 ${mi.slice(2)} 分钟`;
  }
  if (mi === "0" && h === "*" && dom === "*" && dow === "*") return "每小时整点";
  if (/^\d+$/.test(mi) && h === "*" && dom === "*" && dow === "*") return `每小时第 ${+mi} 分`;
  const hStep = h.match(/^\*\/(\d+)$/);
  if (/^\d+$/.test(mi) && hStep && dom === "*" && mon === "*" && dow === "*") {
    return +mi === 0 ? `每 ${hStep[1]} 小时` : `每 ${hStep[1]} 小时（${pad2(mi)} 分）`;
  }

  const timeOk = /^\d+$/.test(h) && /^\d+$/.test(mi);
  const time = timeOk ? `${pad2(h)}:${pad2(mi)}` : "";
  if (timeOk && mon === "*") {
    if (dom === "*" && dow === "*") return `每天 ${time}`;
    if (dom === "*" && dow !== "*") {
      const days = parseDow(dow);
      if (days && days.length) {
        if (days.length === 7) return `每天 ${time}`;
        if (sameSet(days, [1, 2, 3, 4, 5])) return `工作日 ${time}`;
        if (sameSet(days, [0, 6])) return `周末 ${time}`;
        return `每周${days.map((d) => WEEK_CN[d]).join("、")} ${time}`;
      }
    }
    if (/^\d+$/.test(dom) && dow === "*") return `每月 ${+dom} 号 ${time}`;
  }
  return expr;
}

// [1,2,3,4,5] → "1-5" · [1,3,5] → "1,3,5"
function compactList(nums: number[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < nums.length) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    parts.push(j > i ? `${nums[i]}-${nums[j]}` : `${nums[i]}`);
    i = j + 1;
  }
  return parts.join(",");
}

export type CronFreq = "daily" | "weekly" | "monthly";
export interface CronParts {
  freq: CronFreq;
  time: string; // "HH:MM"
  weekdays: number[]; // 0-6
  monthDay: number; // 1-31
}

// Build a cron expression from friendly builder fields.
export function buildCronExpr(p: CronParts): string {
  const [hh, mm] = p.time.split(":");
  const h = String(parseInt(hh || "9", 10) || 0);
  const mi = String(parseInt(mm || "0", 10) || 0);
  if (p.freq === "daily") return `${mi} ${h} * * *`;
  if (p.freq === "weekly") {
    const days = (p.weekdays.length ? [...p.weekdays] : [1]).sort((a, b) => a - b);
    return `${mi} ${h} * * ${compactList(days)}`;
  }
  return `${mi} ${h} ${p.monthDay || 1} * *`;
}

// Best-effort parse of a cron expression back into builder fields (null if it
// is too complex for the visual builder — caller should fall back to raw mode).
export function parseCronToBuilder(expr: string): CronParts | null {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return null;
  const [mi, h, dom, mon, dow] = f;
  if (!/^\d+$/.test(mi) || !/^\d+$/.test(h) || mon !== "*") return null;
  const time = `${pad2(h)}:${pad2(mi)}`;
  const base = { time, weekdays: [1, 2, 3, 4, 5], monthDay: 1 };
  if (dom === "*" && dow === "*") return { ...base, freq: "daily" };
  if (dom === "*" && dow !== "*") {
    const days = parseDow(dow);
    return days && days.length ? { ...base, freq: "weekly", weekdays: days } : null;
  }
  if (/^\d+$/.test(dom) && dow === "*") return { ...base, freq: "monthly", monthDay: +dom };
  return null;
}

const UNIT_LABEL: Record<string, string> = {
  minute: "分钟",
  hour: "小时",
  day: "天",
  week: "周",
  month: "个月",
  year: "年",
};
const UNIT_EVERY: Record<string, string> = {
  minute: "每分钟",
  hour: "每小时",
  day: "每天",
  week: "每周",
  month: "每月",
  year: "每年",
};

// "每 180 天" / "每天" / "每 2 周"
export function describeInterval(unit?: string | null, value?: number | null): string {
  if (!unit || !value) return "—";
  if (value === 1) return UNIT_EVERY[unit] ?? `每 1 ${UNIT_LABEL[unit] ?? unit}`;
  return `每 ${value} ${UNIT_LABEL[unit] ?? unit}`;
}

// Unified human description for any schedule type.
export function describeSchedule(s: {
  schedule_type: string;
  run_at?: number | null;
  cron_expr?: string | null;
  interval_unit?: string | null;
  interval_value?: number | null;
  timezone: string;
}): string {
  if (s.schedule_type === "cron") return describeCron(s.cron_expr ?? null);
  if (s.schedule_type === "interval") return describeInterval(s.interval_unit, s.interval_value);
  return formatDateTime(s.run_at ?? null, s.timezone);
}
