import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Plus,
  Zap,
  Globe,
  Activity,
  Puzzle,
  BellRing,
  Code2,
  Play,
  PlugZap,
  History,
  Pencil,
  Trash2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  MinusCircle,
  RefreshCw,
  RotateCw,
  LogIn,
  ChevronRight,
  X,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import type {
  Automation,
  AutomationResult,
  AutomationRun,
  Channel,
  ManagedItem,
  ModuleSpec,
} from "../lib/types";
import { useConfig } from "../lib/config";
import { useToast } from "../components/Toast";
import { Badge, Button, EmptyState, IconButton, PageLoader, Switch } from "../components/ui";
import { Modal, ConfirmDialog } from "../components/Modal";
import { CronBuilder } from "../components/CronBuilder";
import { ChannelIcon } from "../components/ChannelIcon";
import { browserTimezone, describeCron, formatDateTime, relativeTime, tzOffsetLabel } from "../lib/format";
import { cn } from "../lib/utils";

const STATUS_TONE = { success: "success", partial: "warning", failed: "danger" } as const;
const STATUS_LABEL = { success: "成功", partial: "部分成功", failed: "失败" };
const ACTION_META = {
  ok: { icon: CheckCircle2, color: "text-emerald-400" },
  skipped: { icon: MinusCircle, color: "text-muted" },
  failed: { icon: XCircle, color: "text-rose-400" },
} as const;

const MODULE_ICONS: Record<string, typeof Globe> = {
  globe: Globe,
  activity: Activity,
  puzzle: Puzzle,
  bell: BellRing,
};
const moduleIcon = (icon?: string) => MODULE_ICONS[icon ?? "puzzle"] ?? Puzzle;

const CUSTOM_TEMPLATE = `// 可用：config（下方配置）、console.log()、await fetchJson(url, opts)、
// await fetchText(url, opts)、await httpRequest(url, opts)、await sleep(ms)。
// 返回 { status, summary, items } 或一个字符串。
const data = await fetchJson("https://api.github.com/repos/cloudflare/workers-sdk");
console.log("stars = " + data.stargazers_count);
return {
  status: "success",
  summary: "workers-sdk ★ " + data.stargazers_count,
  items: [{ item: data.full_name, action: "ok", detail: "stars " + data.stargazers_count }],
};
`;

type EditTarget =
  | { mode: "builtin"; automation: Automation | null; module: ModuleSpec }
  | { mode: "custom"; automation: Automation | null };

export function Automations() {
  const config = useConfig();
  const toast = useToast();
  const moduleFor = (type: string) => config.modules.find((m) => m.key === type);

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [deleting, setDeleting] = useState<Automation | null>(null);
  const [busy, setBusy] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; result: AutomationResult } | null>(null);
  const [runsFor, setRunsFor] = useState<Automation | null>(null);

  const load = () =>
    Promise.all([api.listAutomations(), api.listChannels()])
      .then(([a, c]) => {
        setAutomations(a);
        setChannels(c);
      })
      .catch((e) => toast("error", e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onToggle(a: Automation) {
    setAutomations((xs) => xs.map((x) => (x.id === a.id ? { ...x, enabled: !x.enabled } : x)));
    try {
      const updated = await api.toggleAutomation(a.id);
      setAutomations((xs) => xs.map((x) => (x.id === a.id ? updated : x)));
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "更新失败");
      load();
    }
  }

  async function onRun(a: Automation) {
    setRunningId(a.id);
    try {
      const r = await api.runAutomation(a.id);
      setResult({ name: a.name, result: r });
      toast(r.status === "success" ? "success" : r.status === "partial" ? "info" : "error", `${a.name}：${r.summary}`);
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "运行失败");
    } finally {
      setRunningId(null);
      load();
    }
  }

  async function onTest(a: Automation) {
    setTestingId(a.id);
    try {
      const res = await api.testAutomation(a.id);
      toast(res.ok ? "success" : "error", res.detail);
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "连接测试失败");
    } finally {
      setTestingId(null);
    }
  }

  async function onDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.deleteAutomation(deleting.id);
      toast("success", "自动化已删除");
      setDeleting(null);
      load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="max-w-2xl text-sm text-muted">
          自动化由<strong className="text-fg/80">模块</strong>驱动，按计划在边缘运行。可用内置模块，也可在浏览器里
          <strong className="text-fg/80">编写自己的代码模块</strong>（沙箱执行）。
        </p>
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setPicking(true)}>
          新建自动化
        </Button>
      </div>

      {automations.length === 0 ? (
        <EmptyState
          icon={<Zap className="h-6 w-6" />}
          title="还没有自动化任务"
          description="从内置模块新建，或写一个自定义代码模块。"
          action={
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setPicking(true)}>
              新建自动化
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {automations.map((a) => {
            const isCustom = a.kind === "custom";
            const mod = moduleFor(a.type);
            const Icon = isCustom ? Code2 : moduleIcon(mod?.icon);
            const label = isCustom ? "自定义代码" : mod?.label ?? a.type;
            const hasTest = isCustom || !!mod?.hasTest;
            return (
              <div key={a.id} className="card p-5">
                <div className="flex items-start gap-3.5">
                  <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", isCustom ? "bg-violet-500/12" : "bg-amber-500/12")}>
                    <Icon className={cn("h-5 w-5", isCustom ? "text-violet-400" : "text-amber-400")} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-fg">{a.name}</h3>
                      <Badge tone={isCustom ? "brand" : "warning"}>{label}</Badge>
                      {a.last_status && <Badge tone={STATUS_TONE[a.last_status]}>{STATUS_LABEL[a.last_status]}</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {describeCron(a.cron_expr)} · {a.timezone}
                      {a.enabled && a.next_run ? (
                        <span className="text-brand"> · 下次 {relativeTime(a.next_run)}</span>
                      ) : (
                        <span> · 已暂停</span>
                      )}
                    </p>
                    {a.last_detail && (
                      <p className="mt-1 truncate text-xs text-muted">
                        上次：{a.last_detail}
                        {a.last_run ? ` · ${relativeTime(a.last_run)}` : ""}
                      </p>
                    )}
                  </div>
                  <Switch checked={a.enabled} onChange={() => onToggle(a)} />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                  <Button size="sm" variant="secondary" loading={runningId === a.id} icon={<Play className="h-3.5 w-3.5" />} onClick={() => onRun(a)}>
                    立即运行
                  </Button>
                  {hasTest && (
                    <Button size="sm" variant="ghost" loading={testingId === a.id} icon={<PlugZap className="h-3.5 w-3.5" />} onClick={() => onTest(a)}>
                      {isCustom ? "试运行" : "测试连接"}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon={<History className="h-3.5 w-3.5" />} onClick={() => setRunsFor(a)}>
                    运行记录
                  </Button>
                  <div className="flex-1" />
                  <IconButton
                    onClick={() =>
                      isCustom
                        ? setEditing({ mode: "custom", automation: a })
                        : mod && setEditing({ mode: "builtin", automation: a, module: mod })
                    }
                    aria-label="Edit"
                    disabled={!isCustom && !mod}
                  >
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                  <IconButton onClick={() => setDeleting(a)} aria-label="Delete" className="hover:text-rose-400">
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>

                {!isCustom && mod?.hasInspect && <DomainList automation={a} />}
                {!isCustom && a.type === "e5_renew" && <E5Stats automation={a} />}
              </div>
            );
          })}
        </div>
      )}

      {picking && (
        <ModulePicker
          modules={config.modules}
          onClose={() => setPicking(false)}
          onPick={(m) => {
            setPicking(false);
            setEditing({ mode: "builtin", automation: null, module: m });
          }}
          onPickCustom={() => {
            setPicking(false);
            setEditing({ mode: "custom", automation: null });
          }}
        />
      )}

      {editing?.mode === "builtin" && (
        <AutomationModal
          automation={editing.automation}
          module={editing.module}
          channels={channels}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {editing?.mode === "custom" && (
        <CustomModal
          automation={editing.automation}
          channels={channels}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {result && <ResultModal name={result.name} result={result.result} onClose={() => setResult(null)} />}
      {runsFor && <RunsModal automation={runsFor} onClose={() => setRunsFor(null)} />}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={onDelete}
        loading={busy}
        title="删除自动化"
        message={`确定删除「${deleting?.name}」吗？此操作不可撤销。`}
      />
    </div>
  );
}

// ── Module picker ────────────────────────────────────────────────────────────
function ModulePicker({
  modules,
  onClose,
  onPick,
  onPickCustom,
}: {
  modules: ModuleSpec[];
  onClose: () => void;
  onPick: (m: ModuleSpec) => void;
  onPickCustom: () => void;
}) {
  return (
    <Modal open onClose={onClose} title="选择模块" description="用内置模块，或写一个自定义代码模块">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {modules.map((m) => {
          const Icon = moduleIcon(m.icon);
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onPick(m)}
              className="group flex items-start gap-3 rounded-xl border border-border p-4 text-left transition hover:border-brand/50 hover:bg-elevated/60"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/12">
                <Icon className="h-5 w-5 text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-sm font-semibold text-fg">
                  {m.label}
                  <ChevronRight className="h-3.5 w-3.5 text-muted transition group-hover:translate-x-0.5 group-hover:text-brand" />
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{m.description}</p>
              </div>
            </button>
          );
        })}

        {/* Custom code module */}
        <button
          type="button"
          onClick={onPickCustom}
          className="group flex items-start gap-3 rounded-xl border border-brand/30 bg-brand/[0.05] p-4 text-left transition hover:border-brand/60 hover:bg-brand/10"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15">
            <Code2 className="h-5 w-5 text-violet-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-sm font-semibold text-fg">
              自定义代码
              <ChevronRight className="h-3.5 w-3.5 text-muted transition group-hover:translate-x-0.5 group-hover:text-brand" />
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              在浏览器里写 JS，在 QuickJS 沙箱中运行；支持 fetch、配置与日志。
            </p>
          </div>
        </button>
      </div>
    </Modal>
  );
}

// ── shared editor sections ─────────────────────────────────────────────────—
function ScheduleAndNotify({
  cronExpr,
  setCronExpr,
  timezone,
  setTimezone,
  tzList,
  notify,
  setNotify,
  channels,
  enabled,
  setEnabled,
}: {
  cronExpr: string;
  setCronExpr: (v: string) => void;
  timezone: string;
  setTimezone: (v: string) => void;
  tzList: string[];
  notify: string[];
  setNotify: (fn: (s: string[]) => string[]) => void;
  channels: Channel[];
  enabled: boolean;
  setEnabled: (v: boolean) => void;
}) {
  const pickable = channels.filter((c) => c.enabled || notify.includes(c.id));
  return (
    <>
      <div>
        <label className="label">运行计划</label>
        <CronBuilder value={cronExpr} onChange={setCronExpr} timezone={timezone} />
      </div>
      <div>
        <label className="label">时区</label>
        <select className="field" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {tzList.map((tz) => (
            <option key={tz} value={tz}>
              {tz} ({tzOffsetLabel(tz)})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">结果通知（可选）</label>
        {pickable.length === 0 ? (
          <p className="hint">尚无可用渠道，可在「通知渠道」中添加；运行有结果/失败时通过所选渠道提醒你。</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {pickable.map((c) => {
              const on = notify.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setNotify((s) => (on ? s.filter((x) => x !== c.id) : [...s, c.id]))}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3 text-left transition",
                    on ? "border-brand/60 bg-brand/8 ring-4 ring-brand/10" : "border-border hover:bg-elevated/60",
                  )}
                >
                  <ChannelIcon type={c.type} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{c.name}</span>
                  {on && <CheckCircle2 className="h-4 w-4 text-brand" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between rounded-xl border border-border bg-elevated/40 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-fg">启用</p>
          <p className="text-xs text-muted">关闭后将不再按计划运行</p>
        </div>
        <Switch checked={enabled} onChange={setEnabled} />
      </div>
    </>
  );
}

// ── Builtin module editor ──────────────────────────────────────────────────—
function AutomationModal({
  automation,
  module,
  channels,
  onClose,
  onSaved,
}: {
  automation: Automation | null;
  module: ModuleSpec;
  channels: Channel[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const config = useConfig();
  const toast = useToast();
  const Icon = moduleIcon(module.icon);
  const tzList = uniqueTz(config.timezones);

  const [name, setName] = useState(automation?.name ?? module.label);
  const [form, setForm] = useState<Record<string, string>>(() => {
    const f: Record<string, string> = {};
    if (automation) for (const [k, v] of Object.entries(automation.config)) f[k] = Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v);
    return f;
  });
  const [cronExpr, setCronExpr] = useState(automation?.cron_expr ?? "0 3 * * *");
  const [timezone, setTimezone] = useState(automation?.timezone ?? config.defaultTimezone ?? browserTimezone());
  const [notify, setNotify] = useState<string[]>(automation?.notify_channel_ids ?? []);
  const [enabled, setEnabled] = useState(automation?.enabled ?? true);
  const [autoOff, setAutoOff] = useState<string[]>(() => toStrList(automation?.config?.auto_off));
  const [account, setAccount] = useState("");
  const [e5LoggingIn, setE5LoggingIn] = useState(false);
  const [saving, setSaving] = useState(false);

  // E5: open the Microsoft login popup, then auto-fill the refresh_token.
  async function e5Login() {
    if (!form.client_id?.trim()) return toast("error", "请先填写 Client ID");
    setE5LoggingIn(true);
    try {
      const redirect_uri = `${window.location.origin}/api/e5/callback`;
      const { authUrl, state } = await api.e5AuthStart({
        client_id: form.client_id.trim(),
        client_secret: form.client_secret,
        tenant: form.tenant,
        redirect_uri,
        login_hint: account.trim() || undefined,
      });
      const popup = window.open(authUrl, "e5-login", "width=600,height=760");
      let timer: ReturnType<typeof setInterval>;
      const handler = async (ev: MessageEvent) => {
        if (!ev.data || ev.data.type !== "e5-oauth" || ev.data.state !== state) return;
        window.removeEventListener("message", handler);
        clearInterval(timer);
        if (!ev.data.ok) {
          toast("error", "授权失败：" + (ev.data.msg || ""));
          setE5LoggingIn(false);
          return;
        }
        try {
          const r = await api.e5AuthResult(state);
          if (r.refresh_token) {
            setForm((f) => ({ ...f, refresh_token: r.refresh_token as string, ...(r.tenant ? { tenant: r.tenant } : {}) }));
            toast("success", "登录成功，已自动填入 Refresh Token");
          } else {
            toast("error", r.error || "获取令牌失败");
          }
        } catch (err) {
          toast("error", err instanceof ApiError ? err.message : "获取令牌失败");
        } finally {
          setE5LoggingIn(false);
        }
      };
      window.addEventListener("message", handler);
      timer = setInterval(() => {
        if (popup?.closed) {
          clearInterval(timer);
          window.removeEventListener("message", handler);
          setE5LoggingIn(false);
        }
      }, 1000);
    } catch (err) {
      toast("error", err instanceof ApiError ? err.message : "发起登录失败");
      setE5LoggingIn(false);
    }
  }

  async function save() {
    if (!name.trim()) return toast("error", "请填写名称");
    for (const fld of module.fields) if (fld.required && !form[fld.key]?.trim()) return toast("error", `请填写「${fld.label}」`);
    setSaving(true);
    try {
      const body = { type: module.key, kind: "builtin" as const, name: name.trim(), config: { ...form, auto_off: autoOff }, cron_expr: cronExpr, timezone, notify_channel_ids: notify, enabled };
      if (automation) {
        await api.updateAutomation(automation.id, body);
        toast("success", "自动化已更新");
      } else {
        await api.createAutomation(body);
        toast("success", "已创建，可在卡片上「测试连接 / 立即运行」");
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
      title={automation ? "编辑自动化" : "新建自动化"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant="primary" onClick={save} loading={saving} icon={<Zap className="h-4 w-4" />}>
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
            <Icon className="h-5 w-5 text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg">{module.label}</p>
            <p className="mt-0.5 text-xs text-muted">{module.description}</p>
            {module.docsUrl && (
              <a href={module.docsUrl} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                获取凭据 / 文档 <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        <div>
          <label className="label">名称</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        {module.key === "e5_renew" && (
          <div className="space-y-3 rounded-xl border border-sky-500/25 bg-sky-500/[0.06] p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-fg">
              <LogIn className="h-4 w-4 text-sky-400" /> 微软账号登录授权（推荐）
            </p>
            <p className="text-xs leading-relaxed text-muted">
              填好下方 <b>Client ID</b> 后，在此输入微软账号并点登录：会弹出微软授权页，登录后<b>自动获取并填入 Refresh Token</b>，无需手动用 rclone。
            </p>
            <input
              className="field"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="微软账号，如 you@xxx.onmicrosoft.com"
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              variant="secondary"
              size="sm"
              loading={e5LoggingIn}
              icon={<LogIn className="h-4 w-4" />}
              onClick={e5Login}
            >
              用微软账号登录
            </Button>
            <p className="hint">
              需先在 Azure 应用的「重定向 URI」中加入：
              <code className="rounded bg-elevated px-1">{`${window.location.origin}/api/e5/callback`}</code>
            </p>
          </div>
        )}

        {module.fields.map((fld) => (
          <div key={fld.key}>
            <label className="label">
              {fld.label}
              {fld.required && <span className="ml-1 text-rose-400">*</span>}
            </label>
            {fld.type === "textarea" ? (
              <textarea
                className="field min-h-[88px] resize-y font-mono text-[13px]"
                value={form[fld.key] ?? ""}
                onChange={(e) => setForm((s) => ({ ...s, [fld.key]: e.target.value }))}
                placeholder={fld.placeholder}
                spellCheck={false}
              />
            ) : (
              <input
                className={cn("field", fld.secret && "font-mono text-[13px]")}
                type={fld.type === "number" ? "number" : "text"}
                value={form[fld.key] ?? ""}
                onChange={(e) => setForm((s) => ({ ...s, [fld.key]: e.target.value }))}
                placeholder={fld.placeholder}
                autoComplete="off"
                spellCheck={false}
              />
            )}
            {fld.hint && <p className="hint">{fld.hint}</p>}
          </div>
        ))}

        {module.hasInspect && (
          <DomainPanel
            module={module}
            automationId={automation?.id}
            apiToken={form.api_token ?? ""}
            autoOff={autoOff}
            setAutoOff={setAutoOff}
          />
        )}

        <ScheduleAndNotify
          {...{ cronExpr, setCronExpr, timezone, setTimezone, tzList, notify, setNotify, channels, enabled, setEnabled }}
        />
      </div>
    </Modal>
  );
}

// ── Custom code editor ─────────────────────────────────────────────────────—
interface KV {
  key: string;
  value: string;
}

function CustomModal({
  automation,
  channels,
  onClose,
  onSaved,
}: {
  automation: Automation | null;
  channels: Channel[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const config = useConfig();
  const toast = useToast();
  const tzList = uniqueTz(config.timezones);

  const [name, setName] = useState(automation?.name ?? "自定义模块");
  const [code, setCode] = useState(automation?.code ?? CUSTOM_TEMPLATE);
  const [kv, setKv] = useState<KV[]>(() =>
    automation ? Object.entries(automation.config).map(([key, v]) => ({ key, value: String(v ?? "") })) : [],
  );
  const [cronExpr, setCronExpr] = useState(automation?.cron_expr ?? "0 9 * * *");
  const [timezone, setTimezone] = useState(automation?.timezone ?? config.defaultTimezone ?? browserTimezone());
  const [notify, setNotify] = useState<string[]>(automation?.notify_channel_ids ?? []);
  const [enabled, setEnabled] = useState(automation?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return toast("error", "请填写名称");
    if (!code.trim()) return toast("error", "请填写模块代码");
    const cfg: Record<string, string> = {};
    for (const { key, value } of kv) if (key.trim()) cfg[key.trim()] = value;
    setSaving(true);
    try {
      const body = { kind: "custom" as const, code, name: name.trim(), config: cfg, cron_expr: cronExpr, timezone, notify_channel_ids: notify, enabled };
      if (automation) {
        await api.updateAutomation(automation.id, body);
        toast("success", "自定义模块已更新");
      } else {
        await api.createAutomation(body);
        toast("success", "已创建，可在卡片上「试运行 / 立即运行」");
      }
      onSaved();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const isSecret = (k: string) => /token|secret|key|password/i.test(k);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={automation ? "编辑自定义模块" : "新建自定义模块"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant="primary" onClick={save} loading={saving} icon={<Code2 className="h-4 w-4" />}>
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <label className="label">名称</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：GitHub Star 监控" />
        </div>

        <div>
          <label className="label">代码</label>
          <CodeEditor value={code} onChange={setCode} />
          <ApiReference />
        </div>

        <div>
          <label className="label">配置（config.*，可选）</label>
          <p className="hint mb-2">在代码里用 <code className="rounded bg-elevated px-1">config.键名</code> 读取；键名含 token/secret/key/password 的值会被脱敏保存。</p>
          <div className="space-y-2">
            {kv.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="field font-mono text-[13px]"
                  style={{ flex: "0 0 34%" }}
                  value={row.key}
                  onChange={(e) => setKv((s) => s.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))}
                  placeholder="键名，如 token"
                  spellCheck={false}
                />
                <input
                  className="field flex-1 font-mono text-[13px]"
                  type={isSecret(row.key) ? "password" : "text"}
                  value={row.value}
                  onChange={(e) => setKv((s) => s.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
                  placeholder="值"
                  autoComplete="off"
                  spellCheck={false}
                />
                <IconButton onClick={() => setKv((s) => s.filter((_, j) => j !== i))} aria-label="Remove" className="hover:text-rose-400">
                  <X className="h-4 w-4" />
                </IconButton>
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setKv((s) => [...s, { key: "", value: "" }])}>
              添加配置项
            </Button>
          </div>
        </div>

        <ScheduleAndNotify
          {...{ cronExpr, setCronExpr, timezone, setTimezone, tzList, notify, setNotify, channels, enabled, setEnabled }}
        />
      </div>
    </Modal>
  );
}

function CodeEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const s = el.selectionStart;
      const next = value.slice(0, s) + "  " + value.slice(el.selectionEnd);
      onChange(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = s + 2;
      });
    }
  }
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      spellCheck={false}
      className="field min-h-[260px] resize-y font-mono text-[12.5px] leading-relaxed"
      style={{ tabSize: 2, whiteSpace: "pre", overflowWrap: "normal", overflowX: "auto" }}
    />
  );
}

function ApiReference() {
  return (
    <details className="mt-2 rounded-xl border border-border bg-elevated/40 p-3 text-xs leading-relaxed text-muted">
      <summary className="cursor-pointer font-medium text-fg/80">沙箱 API 参考</summary>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        <li><code className="rounded bg-elevated px-1">config</code> — 你的配置对象（上方填写）</li>
        <li><code className="rounded bg-elevated px-1">console.log(...)</code> — 输出到运行日志</li>
        <li><code className="rounded bg-elevated px-1">await fetchJson(url, opts)</code> / <code className="rounded bg-elevated px-1">fetchText</code> / <code className="rounded bg-elevated px-1">httpRequest</code> — 发 HTTP 请求</li>
        <li><code className="rounded bg-elevated px-1">await sleep(ms)</code> — 暂停（≤5s）</li>
        <li>返回 <code className="rounded bg-elevated px-1">{`{ status, summary, items:[{item,action,detail}] }`}</code> 或字符串</li>
        <li>沙箱隔离，单次运行上限 15 秒；仅能通过以上 API 访问外部。</li>
      </ul>
    </details>
  );
}

function uniqueTz(list: string[]): string[] {
  const set = new Set(list);
  set.add(browserTimezone());
  return Array.from(set);
}

function toStrList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

// Interactive panel for modules exposing inspect()/act() (e.g. DigitalPlat):
// lists items (domains) with expiry, a per-item action button (renew now), and
// a per-item "auto" switch that controls whether the scheduled run renews it.
function DomainPanel({
  module,
  automationId,
  apiToken,
  autoOff,
  setAutoOff,
}: {
  module: ModuleSpec;
  automationId?: string;
  apiToken: string;
  autoOff: string[];
  setAutoOff: (updater: (prev: string[]) => string[]) => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<ManagedItem[] | null>(null);
  const [detail, setDetail] = useState("");
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  // New automation: apiToken holds the real token. Editing: it's redacted (••••)
  // but the server recovers the real token from the saved automation (by id).
  const canLoad = apiToken.trim().length > 0 && (apiToken !== "••••••••" || !!automationId);

  async function load() {
    setLoading(true);
    try {
      const r = await api.inspectAutomation({ id: automationId, type: module.key, config: { api_token: apiToken } });
      setItems(r.items);
      setDetail(r.detail);
      if (!r.ok) toast("error", r.detail);
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function renew(id: string) {
    setActingId(id);
    try {
      const r = await api.actAutomation({ id: automationId, type: module.key, config: { api_token: apiToken }, action: "renew", item: id });
      toast(r.ok ? "success" : "error", `${id}：${r.detail}`);
      if (r.ok) load();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "续期失败");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="label mb-0">域名与续期</label>
        <Button size="sm" variant="ghost" loading={loading} disabled={!canLoad} icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={load}>
          {items === null ? "加载域名" : "刷新"}
        </Button>
      </div>
      {!canLoad ? (
        <p className="hint">先填写上方的 API Token，即可加载你账户下的域名列表。</p>
      ) : items === null ? (
        <p className="hint">点击「加载域名」拉取域名与到期时间。</p>
      ) : items.length === 0 ? (
        <p className="hint">{detail || "账户内没有域名。"}</p>
      ) : (
        <div className="space-y-2">
          {detail && <p className="hint">{detail}</p>}
          {items.map((d) => {
            const on = !autoOff.includes(d.id);
            const tone = d.status === "danger" ? "text-rose-400" : d.status === "warn" ? "text-amber-400" : "text-muted";
            return (
              <div key={d.id} className="flex items-center gap-3 rounded-xl border border-border bg-elevated/40 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{d.title}</p>
                  {d.subtitle && <p className={cn("truncate text-xs", tone)}>{d.subtitle}</p>}
                </div>
                <Button size="sm" variant="secondary" loading={actingId === d.id} disabled={!d.canAction} icon={<RotateCw className="h-3.5 w-3.5" />} onClick={() => renew(d.id)}>
                  续期
                </Button>
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <Switch checked={on} onChange={(next) => setAutoOff((s) => (next ? s.filter((x) => x !== d.id) : s.includes(d.id) ? s : [...s, d.id]))} />
                  <span className="text-[10px] leading-none text-muted">自动</span>
                </div>
              </div>
            );
          })}
          <p className="hint">「自动」关闭的域名，定时任务不会自动续期（仍可手动续期）；改动保存后生效。</p>
        </div>
      )}
    </div>
  );
}

// ── DigitalPlat domain list — collapsible, shown on the automation card ────────
function DomainList({ automation }: { automation: Automation }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ManagedItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && items === null) {
      setLoading(true);
      try {
        const r = await api.inspectAutomation({ id: automation.id, type: automation.type, config: {} });
        setItems(r.items);
        if (!r.ok) toast("error", r.detail);
      } catch (e) {
        setItems([]);
        toast("error", e instanceof ApiError ? e.message : "加载域名失败");
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-1.5 text-xs font-medium text-muted transition hover:text-fg"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 transition", open && "rotate-90")} />
        域名与到期{items ? ` · 共 ${items.length} 个` : ""}
      </button>
      {open && (
        <div className="mt-2.5">
          {loading ? (
            <div className="flex justify-center py-3">
              <RefreshCw className="h-4 w-4 animate-spin text-muted" />
            </div>
          ) : !items || items.length === 0 ? (
            <p className="hint">没有域名或加载失败。</p>
          ) : (
            <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {items.map((d) => {
                const tone =
                  d.status === "danger" ? "text-rose-400" : d.status === "warn" ? "text-amber-400" : "text-muted";
                return (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-elevated/40 px-3 py-2"
                  >
                    <span className="truncate text-sm text-fg">{d.title}</span>
                    <span className={cn("shrink-0 text-xs", tone)}>{d.subtitle}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Microsoft 365 E5 stats — shown on the E5 automation card ───────────────────
function E5Stats({ automation }: { automation: Automation }) {
  const c = automation.config as Record<string, unknown>;
  if (c._last_run == null) {
    return (
      <div className="mt-3 border-t border-border pt-3">
        <p className="text-xs text-muted">尚未运行；运行后这里会显示登录状态与调用成功 / 失败统计。</p>
      </div>
    );
  }
  const loginOk = !!c._login_ok;
  const lastOk = Number(c._last_success) || 0;
  const lastFail = Number(c._last_fail) || 0;
  const totalOk = Number(c._total_success) || 0;
  const totalFail = Number(c._total_fail) || 0;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border pt-3 text-xs">
      <span className="flex items-center gap-1.5 text-muted">
        登录
        {loginOk ? (
          <span className="inline-flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />成功
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-rose-400">
            <XCircle className="h-3.5 w-3.5" />失败
          </span>
        )}
      </span>
      <span className="text-muted">
        本次调用：<span className="text-emerald-400">{lastOk} 成功</span> · <span className="text-rose-400">{lastFail} 失败</span>
      </span>
      <span className="text-muted">
        累计：<span className="text-emerald-400">{totalOk}</span> 成功 · <span className="text-rose-400">{totalFail}</span> 失败
      </span>
    </div>
  );
}

// ── Run result ───────────────────────────────────────────────────────────────
function ResultModal({ name, result, onClose }: { name: string; result: AutomationResult; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={`运行结果 · ${name}`} description={result.summary}>
      {result.items.length === 0 ? (
        <p className="text-sm text-muted">没有处理任何项目。</p>
      ) : (
        <ul className="divide-y divide-border">
          {result.items.map((it, i) => {
            const m = ACTION_META[it.action];
            const ItemIcon = m.icon;
            return (
              <li key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <ItemIcon className={cn("mt-0.5 shrink-0", m.color)} style={{ height: 18, width: 18 }} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{it.item}</p>
                  <p className="text-xs text-muted">{it.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {result.log && (
        <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-elevated/60 p-3 text-[11px] leading-relaxed text-muted">
          {result.log}
        </pre>
      )}
    </Modal>
  );
}

// ── Run history ──────────────────────────────────────────────────────────────
function RunsModal({ automation, onClose }: { automation: Automation; onClose: () => void }) {
  const [runs, setRuns] = useState<AutomationRun[] | null>(null);
  const tz = browserTimezone();

  useEffect(() => {
    api.automationRuns(automation.id).then(setRuns).catch(() => setRuns([]));
  }, [automation.id]);

  return (
    <Modal open onClose={onClose} title={`运行记录 · ${automation.name}`}>
      {!runs ? (
        <div className="flex justify-center py-8">
          <RefreshCw className="h-5 w-5 animate-spin text-muted" />
        </div>
      ) : runs.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">还没有运行记录。</p>
      ) : (
        <ul className="divide-y divide-border">
          {runs.map((r) => (
            <li key={r.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-fg">{r.detail || "—"}</p>
                <p className="text-xs text-muted">{formatDateTime(r.created_at, tz)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
