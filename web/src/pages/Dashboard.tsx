import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BellRing,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  CalendarClock,
  RefreshCw,
  CalendarRange,
} from "lucide-react";
import { api } from "../lib/api";
import type { Overview } from "../lib/types";
import { describeSchedule, relativeTime } from "../lib/format";
import { Badge, EmptyState, PageLoader } from "../components/ui";
import { cn } from "../lib/utils";

const UPCOMING_ICON = {
  once: { icon: Clock, color: "text-sky-400" },
  interval: { icon: RefreshCw, color: "text-violet-400" },
  cron: { icon: CalendarRange, color: "text-amber-400" },
} as const;

const STAT_CARDS = [
  { key: "total", label: "总提醒数", icon: BellRing, tone: "text-brand", bg: "bg-brand/10" },
  { key: "active", label: "进行中", icon: Clock, tone: "text-sky-400", bg: "bg-sky-500/10" },
  { key: "channels", label: "通知渠道", icon: Radio, tone: "text-violet-400", bg: "bg-violet-500/10" },
  { key: "sentToday", label: "今日已发送", icon: CheckCircle2, tone: "text-emerald-400", bg: "bg-emerald-500/10" },
] as const;

export function Dashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .overview()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) return <PageLoader />;

  const { stats, upcoming, server_time } = data;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STAT_CARDS.map((card) => (
          <div key={card.key} className="card p-5">
            <div className="flex items-center justify-between">
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", card.bg)}>
                <card.icon className={cn("h-5 w-5", card.tone)} />
              </div>
              {card.key === "sentToday" && stats.failedToday > 0 && (
                <Badge tone="danger">
                  <AlertTriangle className="h-3 w-3" /> {stats.failedToday} 失败
                </Badge>
              )}
            </div>
            <div className="mt-4 text-3xl font-semibold tracking-tight text-fg">
              {stats[card.key]}
            </div>
            <div className="mt-1 text-sm text-muted">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Upcoming */}
        <div className="card p-5 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
              <CalendarClock className="h-[18px] w-[18px] text-brand" />
              即将触发
            </h2>
            <Link
              to="/reminders"
              className="flex items-center gap-1 text-sm text-muted transition hover:text-brand"
            >
              全部 <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {upcoming.length === 0 ? (
            <EmptyState
              icon={<BellRing className="h-6 w-6" />}
              title="暂无即将触发的提醒"
              description="创建一个提醒，它会出现在这里。"
              action={
                <Link to="/reminders" className="text-sm font-medium text-brand hover:underline">
                  去创建 →
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.map((r) => {
                const s = UPCOMING_ICON[r.schedule_type] ?? UPCOMING_ICON.once;
                const Icon = s.icon;
                return (
                  <li key={r.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-elevated">
                      <Icon className={cn("h-4 w-4", s.color)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{r.title}</p>
                      <p className="truncate text-xs text-muted">
                        {describeSchedule(r)} · {r.timezone}
                      </p>
                    </div>
                    <Badge tone="brand">{relativeTime(r.next_run, server_time)}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Side panel */}
        <div className="space-y-6 lg:col-span-2">
          <div className="card overflow-hidden">
            <div className="bg-gradient-to-br from-violet-500/15 to-indigo-500/5 p-5">
              <h3 className="text-base font-semibold text-fg">快速开始</h3>
              <p className="mt-1 text-sm text-muted">三步即可收到第一条提醒。</p>
            </div>
            <ol className="space-y-3 p-5 pt-4">
              {[
                { t: "连接渠道", d: "在 Channels 添加 Telegram / 飞书 / 企业微信", to: "/channels" },
                { t: "创建提醒", d: "一次性 / 周期重复 / Cron 三种方式", to: "/reminders" },
                { t: "坐等通知", d: "Worker 每分钟检查并推送", to: "/activity" },
              ].map((s, i) => (
                <li key={i}>
                  <Link
                    to={s.to}
                    className="group flex items-start gap-3 rounded-xl p-2 transition hover:bg-elevated/60"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-fg group-hover:text-brand">
                        {s.t}
                      </span>
                      <span className="block text-xs text-muted">{s.d}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
