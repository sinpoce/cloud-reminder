import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  BellRing,
  Clock,
  RefreshCw,
  CalendarRange,
  Pencil,
  Trash2,
  Zap,
  Send,
  CalendarClock,
  Info,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import type {
  Channel,
  ChannelTestResult,
  IntervalUnit,
  Reminder,
  ScheduleType,
} from "../lib/types";
import { useConfig } from "../lib/config";
import { useToast } from "../components/Toast";
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  PageLoader,
  Switch,
} from "../components/ui";
import { Modal, ConfirmDialog } from "../components/Modal";
import { ChannelIcon } from "../components/ChannelIcon";
import {
  browserTimezone,
  buildCronExpr,
  describeCron,
  describeInterval,
  describeSchedule,
  epochToLocalInput,
  parseCronToBuilder,
  relativeTime,
  tzOffsetLabel,
  type CronFreq,
} from "../lib/format";
import { cn } from "../lib/utils";

// Icon + accent per schedule type (shared look across the app).
const SCHEDULE_ICON = {
  once: { icon: Clock, color: "text-sky-400", bg: "bg-sky-500/10" },
  interval: { icon: RefreshCw, color: "text-violet-400", bg: "bg-violet-500/10" },
  cron: { icon: CalendarRange, color: "text-amber-400", bg: "bg-amber-500/10" },
} as const;

const WEEKDAY_CHIPS = [
  { v: 1, l: "一" },
  { v: 2, l: "二" },
  { v: 3, l: "三" },
  { v: 4, l: "四" },
  { v: 5, l: "五" },
  { v: 6, l: "六" },
  { v: 0, l: "日" },
];

// Build a toast message + tone from per-channel test results.
function summarizeResults(results: ChannelTestResult[]): {
  tone: "success" | "error" | "info";
  message: string;
} {
  if (!results.length) return { tone: "error", message: "没有可用渠道（请检查渠道是否启用）" };
  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);
  if (!fail.length) return { tone: "success", message: `已发送真实内容到 ${ok.length} 个渠道 ✓` };
  const failText = fail.map((r) => `${r.name}（${r.detail || "失败"}）`).join("；");
  if (!ok.length) return { tone: "error", message: `发送失败：${failText}` };
  return { tone: "info", message: `${ok.length}/${results.length} 成功 · 失败：${failText}` };
}

const STATUS_TONE = {
  sent: "success",
  failed: "danger",
  partial: "warning",
} as const;
const STATUS_LABEL = { sent: "已发送", failed: "失败", partial: "部分成功" };

export function Reminders() {
  const toast = useToast();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Reminder | "new" | null>(null);
  const [deleting, setDeleting] = useState<Reminder | null>(null);
  const [busy, setBusy] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const load = () =>
    Promise.all([api.listReminders(), api.listChannels()])
      .then(([r, c]) => {
        setReminders(r);
        setChannels(c);
      })
      .catch((e) => toast("error", e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const channelMap = useMemo(
    () => Object.fromEntries(channels.map((c) => [c.id, c])),
    [channels],
  );

  async function onToggle(r: Reminder) {
    setReminders((rs) => rs.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)));
    try {
      const updated = await api.toggleReminder(r.id);
      setReminders((rs) => rs.map((x) => (x.id === r.id ? updated : x)));
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "更新失败");
      load();
    }
  }

  async function onTest(r: Reminder) {
    setTestingId(r.id);
    try {
      const { results } = await api.testReminder(r.id);
      const { tone, message } = summarizeResults(results);
      toast(tone, message);
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "发送失败");
    } finally {
      setTestingId(null);
      load();
    }
  }

  async function onDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.deleteReminder(deleting.id);
      toast("success", "提醒已删除");
      setDeleting(null);
      load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageLoader />;

  const noChannels = channels.length === 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="max-w-xl text-sm text-muted">
          创建一次性、周期重复（如每 180 天 / 每年）或 Cron 提醒，到点自动推送到所选渠道。
        </p>
        <Button
          variant="primary"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setEditing("new")}
          disabled={noChannels}
        >
          新建提醒
        </Button>
      </div>

      {noChannels ? (
        <EmptyState
          icon={<BellRing className="h-6 w-6" />}
          title="先添加一个通知渠道"
          description="提醒需要至少一个渠道才能送达。"
          action={
            <Link to="/channels">
              <Button variant="primary">前往 Channels →</Button>
            </Link>
          }
        />
      ) : reminders.length === 0 ? (
        <EmptyState
          icon={<BellRing className="h-6 w-6" />}
          title="还没有提醒"
          description="创建你的第一个提醒，到点自动通知你。"
          action={
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>
              新建提醒
            </Button>
          }
        />
      ) : (
        <div className="card divide-y divide-border overflow-hidden">
          {reminders.map((r) => (
            <div key={r.id} className="flex items-center gap-4 p-4 transition hover:bg-elevated/30">
              {(() => {
                const s = SCHEDULE_ICON[r.schedule_type];
                const Icon = s.icon;
                return (
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                      s.bg,
                    )}
                  >
                    <Icon className={cn("h-5 w-5", s.color)} />
                  </div>
                );
              })()}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate font-medium text-fg">{r.title}</h3>
                  {r.last_status && (
                    <Badge tone={STATUS_TONE[r.last_status]}>{STATUS_LABEL[r.last_status]}</Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {describeSchedule(r)}
                  {r.enabled && r.next_run ? (
                    <span className="text-brand"> · {relativeTime(r.next_run)}</span>
                  ) : !r.enabled ? (
                    <span> · 已暂停</span>
                  ) : (
                    <span> · 已完成</span>
                  )}
                </p>
              </div>

              {/* channel avatars */}
              <div className="hidden -space-x-2 sm:flex">
                {r.channel_ids.slice(0, 4).map((id) =>
                  channelMap[id] ? (
                    <div key={id} className="rounded-xl ring-2 ring-surface">
                      <ChannelIcon type={channelMap[id].type} size="sm" />
                    </div>
                  ) : null,
                )}
              </div>

              <Switch checked={r.enabled} onChange={() => onToggle(r)} />

              <div className="flex items-center gap-0.5">
                <IconButton
                  onClick={() => onTest(r)}
                  aria-label="Test"
                  className={cn(testingId === r.id && "animate-pulse")}
                >
                  <Zap className="h-4 w-4" />
                </IconButton>
                <IconButton onClick={() => setEditing(r)} aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </IconButton>
                <IconButton
                  onClick={() => setDeleting(r)}
                  aria-label="Delete"
                  className="hover:text-rose-400"
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ReminderModal
          reminder={editing === "new" ? null : editing}
          channels={channels}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={onDelete}
        loading={busy}
        title="删除提醒"
        message={`确定删除「${deleting?.title}」吗？此操作不可撤销。`}
      />
    </div>
  );
}

// ── Editor modal ─────────────────────────────────────────────────────────────
const INTERVAL_PRESETS: { label: string; unit: IntervalUnit; value: number }[] = [
  { label: "每天", unit: "day", value: 1 },
  { label: "每周", unit: "week", value: 1 },
  { label: "每两周", unit: "week", value: 2 },
  { label: "每月", unit: "month", value: 1 },
  { label: "每季度", unit: "month", value: 3 },
  { label: "每 180 天", unit: "day", value: 180 },
  { label: "每半年", unit: "month", value: 6 },
  { label: "每年", unit: "year", value: 1 },
];

const INTERVAL_UNIT_OPTIONS: { value: IntervalUnit; label: string }[] = [
  { value: "minute", label: "分钟" },
  { value: "hour", label: "小时" },
  { value: "day", label: "天" },
  { value: "week", label: "周" },
  { value: "month", label: "个月" },
  { value: "year", label: "年" },
];

function ReminderModal({
  reminder,
  channels,
  onClose,
  onSaved,
}: {
  reminder: Reminder | null;
  channels: Channel[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const config = useConfig();
  const toast = useToast();

  const tzList = useMemo(() => {
    const set = new Set(config.timezones);
    set.add(browserTimezone());
    return Array.from(set);
  }, [config.timezones]);

  const [title, setTitle] = useState(reminder?.title ?? "");
  const [body, setBody] = useState(reminder?.body ?? "");
  const [scheduleType, setScheduleType] = useState<ScheduleType>(
    reminder?.schedule_type ?? "once",
  );
  const [timezone, setTimezone] = useState(
    reminder?.timezone ?? config.defaultTimezone ?? browserTimezone(),
  );
  const [localDatetime, setLocalDatetime] = useState(() =>
    reminder?.run_at
      ? epochToLocalInput(reminder.run_at, reminder.timezone)
      : epochToLocalInput(Math.floor(Date.now() / 1000) + 3600, timezone),
  );
  // Cron: visual builder by default; raw expression as an advanced fallback.
  const initialCron =
    reminder?.schedule_type === "cron" && reminder.cron_expr
      ? parseCronToBuilder(reminder.cron_expr)
      : null;
  const [cronMode, setCronMode] = useState<"builder" | "raw">(
    reminder?.schedule_type === "cron" && !initialCron ? "raw" : "builder",
  );
  const [cronExpr, setCronExpr] = useState(reminder?.cron_expr ?? "0 9 * * 1-5");
  const [cronFreq, setCronFreq] = useState<CronFreq>(initialCron?.freq ?? "weekly");
  const [cronTime, setCronTime] = useState(initialCron?.time ?? "09:00");
  const [cronWeekdays, setCronWeekdays] = useState<number[]>(
    initialCron?.weekdays ?? [1, 2, 3, 4, 5],
  );
  const [cronMonthDay, setCronMonthDay] = useState<number>(initialCron?.monthDay ?? 1);

  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(
    reminder?.interval_unit ?? "day",
  );
  const [intervalValue, setIntervalValue] = useState<number>(
    reminder?.interval_value ?? 180,
  );
  const [selected, setSelected] = useState<string[]>(reminder?.channel_ids ?? []);
  const [enabled, setEnabled] = useState(reminder?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // The cron expression that will actually be saved.
  const effectiveCron =
    cronMode === "raw"
      ? cronExpr.trim()
      : buildCronExpr({ freq: cronFreq, time: cronTime, weekdays: cronWeekdays, monthDay: cronMonthDay });

  const enabledChannels = channels.filter((c) => c.enabled || selected.includes(c.id));

  function toggleChannel(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  // Send the current (real) content to the selected channels right now.
  async function testNow() {
    if (!title.trim()) return toast("error", "请先填写标题");
    if (selected.length === 0) return toast("error", "请至少选择一个渠道");
    setTesting(true);
    try {
      const { results } = await api.testSend({
        title: title.trim(),
        body: body.trim(),
        channel_ids: selected,
      });
      const { tone, message } = summarizeResults(results);
      toast(tone, message);
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "测试发送失败");
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    if (!title.trim()) return toast("error", "请填写标题");
    if (selected.length === 0) return toast("error", "请至少选择一个渠道");
    if (scheduleType === "once" && !localDatetime) return toast("error", "请选择日期与时间");
    if (scheduleType === "interval") {
      if (!localDatetime) return toast("error", "请选择开始时间");
      if (!Number.isInteger(intervalValue) || intervalValue < 1)
        return toast("error", "重复间隔需为正整数");
    }
    if (scheduleType === "cron" && !effectiveCron) return toast("error", "请设置定时规则");

    const scheduleFields =
      scheduleType === "once"
        ? { local_datetime: localDatetime }
        : scheduleType === "interval"
          ? { local_datetime: localDatetime, interval_unit: intervalUnit, interval_value: intervalValue }
          : { cron_expr: effectiveCron };

    const payload = {
      title: title.trim(),
      body: body.trim(),
      schedule_type: scheduleType,
      timezone,
      channel_ids: selected,
      enabled,
      ...scheduleFields,
    };

    setSaving(true);
    try {
      if (reminder) {
        await api.updateReminder(reminder.id, payload);
        toast("success", "提醒已更新");
      } else {
        await api.createReminder(payload);
        toast("success", "提醒已创建");
      }
      onSaved();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={reminder ? "编辑提醒" : "新建提醒"}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={testNow}
            loading={testing}
            icon={<Send className="h-4 w-4" />}
          >
            测试发送
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant="primary" onClick={save} loading={saving} icon={<BellRing className="h-4 w-4" />}>
            保存提醒
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <label className="label">标题</label>
          <input
            className="field"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：喝水 💧 / 站会提醒 / 续费域名"
          />
        </div>

        <div>
          <label className="label">内容（可选）</label>
          <textarea
            className="field min-h-[80px] resize-y"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="提醒的详细内容…"
          />
        </div>

        {/* schedule type segmented */}
        <div>
          <label className="label">触发方式</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <SegButton
              active={scheduleType === "once"}
              icon={<Clock className="h-4 w-4" />}
              title="一次性"
              desc="指定时间触发一次"
              onClick={() => setScheduleType("once")}
            />
            <SegButton
              active={scheduleType === "interval"}
              icon={<RefreshCw className="h-4 w-4" />}
              title="间隔重复"
              desc="每隔 N 天/周/月"
              onClick={() => setScheduleType("interval")}
            />
            <SegButton
              active={scheduleType === "cron"}
              icon={<CalendarRange className="h-4 w-4" />}
              title="定时重复"
              desc="每天/周几/月几号"
              onClick={() => setScheduleType("cron")}
            />
          </div>
        </div>

        {scheduleType === "once" && (
          <div>
            <label className="label">日期与时间</label>
            <input
              type="datetime-local"
              className="field"
              value={localDatetime}
              onChange={(e) => setLocalDatetime(e.target.value)}
            />
          </div>
        )}

        {scheduleType === "interval" && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">开始日期</label>
                <input
                  type="date"
                  className="field"
                  value={localDatetime.slice(0, 10)}
                  onChange={(e) =>
                    setLocalDatetime(`${e.target.value}T${localDatetime.slice(11, 16) || "09:00"}`)
                  }
                />
              </div>
              <div>
                <label className="label">触发时间（几点）</label>
                <input
                  type="time"
                  className="field"
                  value={localDatetime.slice(11, 16) || "09:00"}
                  onChange={(e) =>
                    setLocalDatetime(`${localDatetime.slice(0, 10)}T${e.target.value}`)
                  }
                />
              </div>
            </div>
            <p className="hint">首次在「开始日期 + 触发时间」触发，之后每隔下方周期在<b className="text-fg/80">同一时刻</b>重复。</p>

            <div>
              <label className="label">重复周期</label>
              <div className="flex flex-wrap gap-2">
                {INTERVAL_PRESETS.map((p) => {
                  const active = intervalUnit === p.unit && intervalValue === p.value;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setIntervalUnit(p.unit);
                        setIntervalValue(p.value);
                      }}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                        active
                          ? "border-brand/60 bg-brand/10 text-brand"
                          : "border-border text-muted hover:bg-elevated/60 hover:text-fg",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="label">自定义间隔</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">每</span>
                <input
                  type="number"
                  min={1}
                  className="field w-24 text-center"
                  value={intervalValue}
                  onChange={(e) =>
                    setIntervalValue(Math.max(1, Math.floor(Number(e.target.value) || 1)))
                  }
                />
                <select
                  className="field w-32"
                  value={intervalUnit}
                  onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}
                >
                  {INTERVAL_UNIT_OPTIONS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="hint flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5 text-brand" />
                {describeInterval(intervalUnit, intervalValue)} · 时区 {timezone}
              </p>
            </div>

            <InfoBox title="周期规则说明">
              <ul className="list-disc space-y-1 pl-4">
                <li>
                  从「开始时间」起，<b className="text-fg/80">每隔设定的时长</b>触发一次，按所选时区计算下一次。
                </li>
                <li>单位支持：分钟 / 小时 / 天 / 周 / 月 / 年，间隔为正整数（如「每 180 天」「每 1 年」）。</li>
                <li>按「月 / 年」重复且开始日为 29–31 号时，遇到天数不足的月份自动取该月最后一天。</li>
              </ul>
            </InfoBox>
          </div>
        )}

        {scheduleType === "cron" && cronMode === "builder" && (
          <div className="space-y-3.5">
            <div>
              <label className="label">频率</label>
              <div className="grid grid-cols-3 gap-2">
                {([["daily", "每天"], ["weekly", "每周"], ["monthly", "每月"]] as [CronFreq, string][]).map(
                  ([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setCronFreq(v)}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-sm font-medium transition",
                        cronFreq === v
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

            {cronFreq === "weekly" && (
              <div>
                <label className="label">重复日（可多选）</label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_CHIPS.map((d) => {
                    const on = cronWeekdays.includes(d.v);
                    return (
                      <button
                        key={d.v}
                        type="button"
                        onClick={() =>
                          setCronWeekdays((s) =>
                            on ? s.filter((x) => x !== d.v) : [...s, d.v],
                          )
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

            {cronFreq === "monthly" && (
              <div>
                <label className="label">日期</label>
                <div className="flex items-center gap-2 text-sm text-muted">
                  每月
                  <select
                    className="field w-20 text-center"
                    value={cronMonthDay}
                    onChange={(e) => setCronMonthDay(Number(e.target.value))}
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
                value={cronTime}
                onChange={(e) => setCronTime(e.target.value)}
              />
            </div>

            <p className="hint flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5 text-brand" />
              {describeCron(effectiveCron)} · 时区 {timezone}
            </p>

            <button
              type="button"
              onClick={() => {
                setCronExpr(effectiveCron);
                setCronMode("raw");
              }}
              className="text-xs font-medium text-brand hover:underline"
            >
              切换到 Cron 表达式（高级）→
            </button>
          </div>
        )}

        {scheduleType === "cron" && cronMode === "raw" && (
          <div className="space-y-3">
            <div>
              <label className="label">Cron 表达式</label>
              <input
                className="field font-mono"
                value={cronExpr}
                onChange={(e) => setCronExpr(e.target.value)}
                placeholder="分 时 日 月 周  ·  例：0 9 * * 1-5"
                spellCheck={false}
              />
              <p className="hint flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5 text-brand" />
                {describeCron(effectiveCron)}
              </p>
            </div>

            <InfoBox title="Cron 规则说明">
              <ul className="list-disc space-y-1 pl-4">
                <li>
                  5 段格式 <code className="rounded bg-elevated px-1 py-0.5">分 时 日 月 周</code>，符号
                  <code className="mx-0.5 rounded bg-elevated px-1">*</code>任意、
                  <code className="mx-0.5 rounded bg-elevated px-1">,</code>列举、
                  <code className="mx-0.5 rounded bg-elevated px-1">-</code>范围、
                  <code className="mx-0.5 rounded bg-elevated px-1">/</code>步进。
                </li>
                <li>
                  例：<code className="rounded bg-elevated px-1">0 9 * * 1-5</code> 工作日 9:00；
                  <code className="rounded bg-elevated px-1">*/30 * * * *</code> 每 30 分钟。
                </li>
                <li>星期 0 与 7 都表示周日。</li>
              </ul>
            </InfoBox>

            <button
              type="button"
              onClick={() => {
                const p = parseCronToBuilder(cronExpr);
                if (p) {
                  setCronFreq(p.freq);
                  setCronTime(p.time);
                  setCronWeekdays(p.weekdays);
                  setCronMonthDay(p.monthDay);
                }
                setCronMode("builder");
              }}
              className="text-xs font-medium text-brand hover:underline"
            >
              ← 返回可视化设置
            </button>
          </div>
        )}

        <div>
          <label className="label">时区</label>
          <select
            className="field"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {tzList.map((tz) => (
              <option key={tz} value={tz}>
                {tz} ({tzOffsetLabel(tz)})
              </option>
            ))}
          </select>
        </div>

        {/* channels */}
        <div>
          <label className="label">发送到</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {enabledChannels.map((c) => {
              const active = selected.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleChannel(c.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3 text-left transition",
                    active
                      ? "border-brand/60 bg-brand/8 ring-4 ring-brand/10"
                      : "border-border hover:bg-elevated/60",
                  )}
                >
                  <ChannelIcon type={c.type} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{c.name}</span>
                  </span>
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-md border transition",
                      active ? "border-brand bg-brand text-white" : "border-border",
                    )}
                  >
                    {active && <CheckMark />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border bg-elevated/40 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-fg">立即启用</p>
            <p className="text-xs text-muted">关闭则保存为草稿，不会触发</p>
          </div>
          <Switch checked={enabled} onChange={setEnabled} />
        </div>
      </div>
    </Modal>
  );
}

function SegButton({
  active,
  icon,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3.5 text-left transition",
        active ? "border-brand/60 bg-brand/8 ring-4 ring-brand/10" : "border-border hover:bg-elevated/60",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg",
          active ? "bg-brand/15 text-brand" : "bg-elevated text-muted",
        )}
      >
        {icon}
      </span>
      <span>
        <span className={cn("block text-sm font-medium", active ? "text-brand" : "text-fg")}>
          {title}
        </span>
        <span className="block text-xs text-muted">{desc}</span>
      </span>
    </button>
  );
}

function InfoBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-brand/20 bg-brand/[0.06] p-3.5 text-xs leading-relaxed text-muted">
      <p className="mb-1.5 flex items-center gap-1.5 font-medium text-fg/80">
        <Info className="h-3.5 w-3.5 text-brand" />
        {title}
      </p>
      {children}
    </div>
  );
}

function CheckMark() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
      <path d="M2.5 6.5L5 9L9.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
