import { CalendarClock } from "lucide-react";
import {
  buildCronExpr,
  describeCron,
  parseCronToBuilder,
  type CronFreq,
  type CronParts,
} from "../lib/format";
import { cn } from "../lib/utils";

const WEEKDAYS = [
  { v: 1, l: "一" },
  { v: 2, l: "二" },
  { v: 3, l: "三" },
  { v: 4, l: "四" },
  { v: 5, l: "五" },
  { v: 6, l: "六" },
  { v: 0, l: "日" },
];

const FALLBACK: CronParts = { freq: "daily", time: "09:00", weekdays: [1, 2, 3, 4, 5], monthDay: 1 };

// A controlled visual schedule builder. `value` is a 5-field cron string;
// `onChange` receives the new cron string. Keeps the cron expression as the
// single source of truth so no extra state is needed in the parent.
export function CronBuilder({
  value,
  onChange,
  timezone,
}: {
  value: string;
  onChange: (expr: string) => void;
  timezone?: string;
}) {
  const parts = parseCronToBuilder(value) ?? FALLBACK;
  const update = (patch: Partial<CronParts>) => onChange(buildCronExpr({ ...parts, ...patch }));

  return (
    <div className="space-y-3.5">
      <div>
        <label className="label">频率</label>
        <div className="grid grid-cols-3 gap-2">
          {([["daily", "每天"], ["weekly", "每周"], ["monthly", "每月"]] as [CronFreq, string][]).map(
            ([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => update({ freq: v })}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm font-medium transition",
                  parts.freq === v
                    ? "border-brand/60 bg-brand/10 text-brand"
                    : "border-border text-muted hover:bg-elevated/60 hover:text-fg",
                )}
              >
                {l}
              </button>
            ),
          )}
        </div>
      </div>

      {parts.freq === "weekly" && (
        <div>
          <label className="label">重复日（可多选）</label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => {
              const on = parts.weekdays.includes(d.v);
              return (
                <button
                  key={d.v}
                  type="button"
                  onClick={() =>
                    update({
                      weekdays: on
                        ? parts.weekdays.filter((x) => x !== d.v)
                        : [...parts.weekdays, d.v],
                    })
                  }
                  className={cn(
                    "h-9 w-9 rounded-lg border text-sm font-medium transition",
                    on
                      ? "border-brand/60 bg-brand/10 text-brand"
                      : "border-border text-muted hover:bg-elevated/60 hover:text-fg",
                  )}
                >
                  {d.l}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {parts.freq === "monthly" && (
        <div>
          <label className="label">日期</label>
          <div className="flex items-center gap-2 text-sm text-muted">
            每月
            <select
              className="field w-20 text-center"
              value={parts.monthDay}
              onChange={(e) => update({ monthDay: Number(e.target.value) })}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            号
          </div>
        </div>
      )}

      <div>
        <label className="label">时间</label>
        <input
          type="time"
          className="field w-40"
          value={parts.time}
          onChange={(e) => update({ time: e.target.value })}
        />
      </div>

      <p className="hint flex items-center gap-1.5">
        <CalendarClock className="h-3.5 w-3.5 text-brand" />
        {describeCron(value)}
        {timezone ? ` · 时区 ${timezone}` : ""}
      </p>
    </div>
  );
}
