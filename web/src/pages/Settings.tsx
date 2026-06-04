import { useState, type ReactNode } from "react";
import {
  Globe,
  Palette,
  ShieldCheck,
  LogOut,
  Moon,
  Sun,
  KeyRound,
  Clock,
} from "lucide-react";
import { useConfig } from "../lib/config";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { api, ApiError } from "../lib/api";
import { useToast } from "../components/Toast";
import { Button, Switch } from "../components/ui";
import { SinpoceCredit } from "../components/Sinpoce";
import { browserTimezone, formatDateTime, tzOffsetLabel } from "../lib/format";

function Row({
  icon,
  title,
  desc,
  children,
}: {
  icon: ReactNode;
  title: string;
  desc?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="flex items-start gap-3.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-elevated text-muted">{icon}</div>
        <div>
          <p className="text-sm font-medium text-fg">{title}</p>
          {desc && <p className="mt-0.5 text-xs text-muted">{desc}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-2.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>
      <div className="card divide-y divide-border overflow-hidden">{children}</div>
    </div>
  );
}

export function Settings() {
  const config = useConfig();
  const { logout } = useAuth();
  const { theme, toggle } = useTheme();
  const toast = useToast();

  // Default timezone selector.
  const tzList = (() => {
    const set = new Set(config.timezones);
    set.add(browserTimezone());
    set.add(config.defaultTimezone);
    return Array.from(set);
  })();
  const [tz, setTz] = useState(config.defaultTimezone);
  const [savingTz, setSavingTz] = useState(false);

  async function saveTz(next: string) {
    setTz(next);
    setSavingTz(true);
    try {
      await api.updateSettings({ defaultTimezone: next });
      toast("success", "默认时区已更新（对新建提醒生效）");
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "保存失败");
    } finally {
      setSavingTz(false);
    }
  }

  // Change password.
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  async function changePassword() {
    if (!cur) return toast("error", "请输入当前密码");
    if (next.length < 6) return toast("error", "新密码至少 6 位");
    if (next !== confirm) return toast("error", "两次输入的新密码不一致");
    setSavingPw(true);
    try {
      await api.changePassword({ current_password: cur, new_password: next });
      toast("success", "密码已修改");
      setCur("");
      setNext("");
      setConfirm("");
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "修改失败");
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-7 animate-fade-in">
      <Section title="外观">
        <Row
          icon={theme === "dark" ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
          title="深色模式"
          desc="切换浅色 / 深色主题"
        >
          <Switch checked={theme === "dark"} onChange={toggle} />
        </Row>
      </Section>

      <Section title="偏好">
        <Row icon={<Globe className="h-[18px] w-[18px]" />} title="默认时区" desc="新建提醒/自动化的默认时区">
          <select
            className="field max-w-[230px]"
            value={tz}
            disabled={savingTz}
            onChange={(e) => saveTz(e.target.value)}
          >
            {tzList.map((z) => (
              <option key={z} value={z}>
                {z} ({tzOffsetLabel(z)})
              </option>
            ))}
          </select>
        </Row>
        <Row icon={<Clock className="h-[18px] w-[18px]" />} title="浏览器时区" desc="你当前设备所在时区">
          <code className="rounded-lg bg-elevated px-2.5 py-1 text-xs text-fg">{browserTimezone()}</code>
        </Row>
      </Section>

      <Section title="账户与安全">
        <div className="px-5 py-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-elevated text-muted">
              <KeyRound className="h-[18px] w-[18px]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-fg">修改管理员密码</p>
              <p className="mt-0.5 text-xs text-muted">默认密码为 admin，建议尽快修改；修改后请用新密码登录。</p>
              <div className="mt-3 grid max-w-md grid-cols-1 gap-2.5">
                <input
                  type="password"
                  className="field"
                  placeholder="当前密码"
                  autoComplete="current-password"
                  value={cur}
                  onChange={(e) => setCur(e.target.value)}
                />
                <input
                  type="password"
                  className="field"
                  placeholder="新密码（至少 6 位）"
                  autoComplete="new-password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                />
                <input
                  type="password"
                  className="field"
                  placeholder="确认新密码"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
                <div>
                  <Button variant="primary" size="sm" loading={savingPw} onClick={changePassword}>
                    更新密码
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <Row icon={<LogOut className="h-[18px] w-[18px]" />} title="退出登录" desc="清除本地会话令牌">
          <Button variant="danger" size="sm" onClick={logout}>
            退出
          </Button>
        </Row>
      </Section>

      <Section title="服务">
        <Row icon={<ShieldCheck className="h-[18px] w-[18px]" />} title="服务器时间" desc="用于校验 Cron 调度">
          <span className="text-xs text-muted">{formatDateTime(config.serverTime, browserTimezone())}</span>
        </Row>
      </Section>

      <div className="space-y-1.5 pt-2 text-center">
        <SinpoceCredit />
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
          <Palette className="h-3.5 w-3.5" />
          Cloud Reminder
        </p>
      </div>
    </div>
  );
}
