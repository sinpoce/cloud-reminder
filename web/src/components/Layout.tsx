import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  BellRing,
  Radio,
  Zap,
  Activity,
  Settings,
  Moon,
  Sun,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { IconButton } from "./ui";
import { SinpoceCredit } from "./Sinpoce";

const NAV = [
  { to: "/", label: "概览 Dashboard", icon: LayoutDashboard, end: true },
  { to: "/reminders", label: "提醒 Reminders", icon: BellRing },
  { to: "/channels", label: "通知渠道 Channels", icon: Radio },
  { to: "/automations", label: "自动化 Automations", icon: Zap },
  { to: "/activity", label: "发送记录 Activity", icon: Activity },
  { to: "/settings", label: "设置 Settings", icon: Settings },
];

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/reminders": "Reminders",
  "/channels": "Channels",
  "/automations": "Automations",
  "/activity": "Activity",
  "/settings": "Settings",
};

function Brand() {
  return (
    <div className="flex items-center gap-3 px-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-glow">
        <BellRing className="h-5 w-5 text-white" />
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight text-fg">Cloud Reminder</div>
        <div className="text-[11px] text-muted">自托管提醒服务</div>
      </div>
    </div>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
              isActive
                ? "bg-brand/12 text-brand"
                : "text-muted hover:bg-elevated/70 hover:text-fg",
            )
          }
        >
          {({ isActive }) => (
            <>
              <item.icon
                className={cn(
                  "h-[18px] w-[18px] transition",
                  isActive ? "text-brand" : "text-muted group-hover:text-fg",
                )}
              />
              <span>{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export function Layout() {
  const { logout } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = TITLES[location.pathname] ?? "Cloud Reminder";

  return (
    <div className="min-h-screen bg-bg">
      {/* Sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r border-border bg-surface/60 px-4 py-5 lg:flex">
        <Brand />
        <div className="mt-8 flex-1">
          <NavItems />
        </div>
        <SidebarFooter />
      </aside>

      {/* Sidebar — mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[270px] flex-col border-r border-border bg-surface px-4 py-5 animate-slide-in">
            <div className="flex items-center justify-between">
              <Brand />
              <IconButton onClick={() => setMobileOpen(false)}>
                <X className="h-5 w-5" />
              </IconButton>
            </div>
            <div className="mt-8 flex-1">
              <NavItems onNavigate={() => setMobileOpen(false)} />
            </div>
            <SidebarFooter />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <IconButton className="lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </IconButton>
            <h1 className="text-lg font-semibold tracking-tight text-fg">{title}</h1>
          </div>
          <div className="flex items-center gap-1.5">
            <IconButton onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </IconButton>
            <IconButton onClick={logout} aria-label="Log out" className="hover:text-rose-400">
              <LogOut className="h-5 w-5" />
            </IconButton>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarFooter() {
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-xl border border-border bg-elevated/40 p-3">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Cloud Reminder 正在运行
        </div>
      </div>
      <SinpoceCredit />
    </div>
  );
}
