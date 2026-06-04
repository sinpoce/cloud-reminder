import { useEffect, useState, type ReactNode } from "react";
import { Plus, Radio, Send, Trash2, Pencil, Zap } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { Channel, ChannelType, ChannelFieldSpec } from "../lib/types";
import { useConfig } from "../lib/config";
import { useToast } from "../components/Toast";
import { Badge, Button, IconButton, PageLoader, EmptyState, Switch } from "../components/ui";
import { Modal, ConfirmDialog } from "../components/Modal";
import { CHANNEL_META, ChannelIcon } from "../components/ChannelIcon";
import { cn } from "../lib/utils";

const TYPE_ORDER: ChannelType[] = ["telegram", "wechat", "feishu", "email", "bark", "webhook"];

// A field with `showIf` only renders when another field's value matches.
function fieldVisible(
  f: ChannelFieldSpec,
  fields: ChannelFieldSpec[],
  config: Record<string, string>,
): boolean {
  if (!f.showIf) return true;
  const dep = fields.find((x) => x.key === f.showIf!.key);
  const val = config[f.showIf.key] ?? dep?.default ?? "";
  return f.showIf.in.includes(val);
}

export function Channels() {
  const config = useConfig();
  const toast = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Channel | "new" | null>(null);
  const [deleting, setDeleting] = useState<Channel | null>(null);
  const [busy, setBusy] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const load = () =>
    api
      .listChannels()
      .then(setChannels)
      .catch((e) => toast("error", e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onToggle(ch: Channel) {
    setChannels((cs) => cs.map((c) => (c.id === ch.id ? { ...c, enabled: !c.enabled } : c)));
    try {
      await api.updateChannel(ch.id, { enabled: !ch.enabled });
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "更新失败");
      load();
    }
  }

  async function onTest(ch: Channel) {
    setTestingId(ch.id);
    try {
      const res = await api.testChannel(ch.id);
      if (res.ok) toast("success", `已向「${ch.name}」发送测试消息`);
      else toast("error", res.detail || "测试发送失败");
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "测试发送失败");
    } finally {
      setTestingId(null);
    }
  }

  async function onDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.deleteChannel(deleting.id);
      toast("success", "渠道已删除");
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
        <p className="max-w-xl text-sm text-muted">
          配置接收提醒的机器人。每个渠道可独立测试与启停，密钥仅保存在你的 Worker 中。
        </p>
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>
          添加渠道
        </Button>
      </div>

      {channels.length === 0 ? (
        <EmptyState
          icon={<Radio className="h-6 w-6" />}
          title="还没有通知渠道"
          description="添加 Telegram、飞书或企业微信机器人，提醒才能送达。"
          action={
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>
              添加第一个渠道
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {channels.map((ch) => (
            <div key={ch.id} className="card group p-5">
              <div className="flex items-start gap-3.5">
                <ChannelIcon type={ch.type} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold text-fg">{ch.name}</h3>
                    {!ch.enabled && <Badge tone="neutral">已停用</Badge>}
                  </div>
                  <p className="text-sm text-muted">{CHANNEL_META[ch.type].label}</p>
                </div>
                <Switch checked={ch.enabled} onChange={() => onToggle(ch)} />
              </div>

              <div className="mt-4 flex items-center gap-1.5 border-t border-border pt-3">
                <Button
                  size="sm"
                  variant="ghost"
                  loading={testingId === ch.id}
                  icon={<Zap className="h-3.5 w-3.5" />}
                  onClick={() => onTest(ch)}
                >
                  测试
                </Button>
                <div className="flex-1" />
                <IconButton onClick={() => setEditing(ch)} aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </IconButton>
                <IconButton
                  onClick={() => setDeleting(ch)}
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
        <ChannelModal
          channel={editing === "new" ? null : editing}
          schema={config.channelSchema}
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
        title="删除渠道"
        message={`确定删除「${deleting?.name}」吗？引用此渠道的提醒将无法送达。`}
      />
    </div>
  );
}

// ── Editor modal ─────────────────────────────────────────────────────────────
function ChannelModal({
  channel,
  schema,
  onClose,
  onSaved,
}: {
  channel: Channel | null;
  schema: ReturnType<typeof useConfig>["channelSchema"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [type, setType] = useState<ChannelType>(channel?.type ?? "telegram");
  const [name, setName] = useState(channel?.name ?? "");
  const [config, setConfig] = useState<Record<string, string>>(() => {
    const c: Record<string, string> = {};
    if (channel) for (const [k, v] of Object.entries(channel.config)) c[k] = String(v ?? "");
    return c;
  });
  const [enabled, setEnabled] = useState(channel?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  const fields = schema[type].fields;

  // For a NEW channel, pre-fill field defaults (e.g. the built-in message
  // template) for the selected type; re-seeds when the type is switched.
  useEffect(() => {
    if (channel) return;
    const seeded: Record<string, string> = {};
    for (const f of fields) if (f.default != null) seeded[f.key] = f.default;
    setConfig(seeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  async function save() {
    if (!name.trim()) {
      toast("error", "请填写渠道名称");
      return;
    }
    for (const f of fields) {
      if (!fieldVisible(f, fields, config)) continue;
      if (f.required && !config[f.key]?.trim()) {
        toast("error", `请填写「${f.label}」`);
        return;
      }
    }
    setSaving(true);
    try {
      if (channel) {
        await api.updateChannel(channel.id, { type, name: name.trim(), config, enabled });
        toast("success", "渠道已更新");
      } else {
        await api.createChannel({ type, name: name.trim(), config, enabled });
        toast("success", "渠道已创建");
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
      title={channel ? "编辑渠道" : "添加通知渠道"}
      description="支持 Telegram、企业微信、飞书、邮箱与通用 Webhook；可自定义消息模板"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant="primary" onClick={save} loading={saving} icon={<Send className="h-4 w-4" />}>
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <label className="label">渠道类型</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TYPE_ORDER.map((t) => {
              const meta = CHANNEL_META[t];
              const active = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition",
                    active
                      ? "border-brand/60 bg-brand/8 ring-4 ring-brand/10"
                      : "border-border hover:border-border hover:bg-elevated/60",
                  )}
                >
                  <ChannelIcon type={t} size="sm" />
                  <span className={cn("text-xs font-medium", active ? "text-brand" : "text-muted")}>
                    {meta.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="label">名称</label>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：我的 Telegram、研发群机器人"
          />
        </div>

        {fields
          .filter((f) => fieldVisible(f, fields, config))
          .map((f) => (
          <div key={f.key}>
            <label className="label">
              {f.label}
              {f.required && <span className="ml-1 text-rose-400">*</span>}
            </label>
            {f.type === "select" ? (
              <select
                className="field"
                value={config[f.key] ?? f.default ?? f.options?.[0]?.value ?? ""}
                onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
              >
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                className="field min-h-[88px] resize-y font-mono text-[13px]"
                value={config[f.key] ?? ""}
                onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                spellCheck={false}
              />
            ) : (
              <input
                className="field font-mono text-[13px]"
                value={config[f.key] ?? ""}
                onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                autoComplete="off"
                spellCheck={false}
              />
            )}
            {f.hint && <p className="hint">{f.hint}</p>}
          </div>
        ))}

        <div className="flex items-center justify-between rounded-xl border border-border bg-elevated/40 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-fg">启用渠道</p>
            <p className="text-xs text-muted">停用后不会向此渠道发送提醒</p>
          </div>
          <Switch checked={enabled} onChange={setEnabled} />
        </div>

        <ChannelHint type={type} />
      </div>
    </Modal>
  );
}

function ChannelHint({ type }: { type: ChannelType }) {
  const hints: Record<ChannelType, ReactNode> = {
    telegram: (
      <>
        向 <b>@BotFather</b> 发送 <code>/newbot</code> 获取 Token；给机器人发一条消息后，
        访问 <code>https://api.telegram.org/bot&lt;token&gt;/getUpdates</code> 可查到 chat_id。
      </>
    ),
    wechat: (
      <>
        在企业微信群中「添加群机器人」，复制其 <b>Webhook 地址</b> 粘贴到上方即可。
      </>
    ),
    feishu: (
      <>
        飞书群「设置 → 群机器人 → 添加自定义机器人」，复制 Webhook；若开启了签名校验，请填写
        <b> Signing Secret</b>。
      </>
    ),
    email: (
      <>
        两种方式：<b>Resend</b>（在 <code>resend.com</code> 建 API Key，发件人需已验证域名）或
        <b> SMTP</b>（填邮箱服务器，如 QQ <code>smtp.qq.com</code> 端口 <code>465</code>，密码用「<b>授权码</b>」而非登录密码）。
        邮件用内置带 <b>SINPOCE</b> 的 HTML 模板，可在上方「邮件模板」里修改。
      </>
    ),
    bark: (
      <>
        安装 iOS <b>Bark</b> App，把它「您的推送地址」整条
        （如 <code>https://api.day.app/xxxxxx</code>）<b>直接粘贴</b>到上方即可，会自动识别服务器与
        Device Key；自建服务器同样支持。
      </>
    ),
    webhook: (
      <>
        将向该 URL <code>POST</code> 一段 JSON：<code>{`{ title, body, timestamp }`}</code>。
        可对接 Bark、Discord、Slack、n8n 等。
      </>
    ),
  };
  return (
    <div className="rounded-xl border border-brand/20 bg-brand/[0.06] px-4 py-3 text-xs leading-relaxed text-muted">
      {hints[type]}
    </div>
  );
}
