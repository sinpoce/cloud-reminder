import { useState, type FormEvent } from "react";
import { BellRing, Lock, ArrowRight } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/Toast";
import { Button } from "../components/ui";
import { SinpoceCredit } from "../components/Sinpoce";
import { ApiError } from "../lib/api";

export function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    try {
      await login(password);
      toast("success", "欢迎回来 👋");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "登录失败，请重试";
      toast("error", msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4">
      <div className="aurora" />
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-60" />

      <div className="relative w-full max-w-md">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-glow">
            <BellRing className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Cloud Reminder</h1>
          <p className="mt-1.5 text-sm text-muted">
            登录管理你的定时提醒与通知渠道
          </p>
        </div>

        <form onSubmit={onSubmit} className="card glass p-6 sm:p-7">
          <label className="label" htmlFor="pw">
            管理密码
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="pw"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入管理密码"
              className="field pl-10"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            loading={loading}
            className="mt-5 w-full"
            icon={!loading ? <ArrowRight className="h-4 w-4" /> : undefined}
          >
            登录
          </Button>
        </form>

        <SinpoceCredit className="mt-7" />
      </div>
    </div>
  );
}
