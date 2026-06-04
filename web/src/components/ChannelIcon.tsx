import { Send, MessageCircle, Feather, Webhook, Mail, Smartphone } from "lucide-react";
import type { ChannelType } from "../lib/types";
import { cn } from "../lib/utils";

export const CHANNEL_META: Record<
  ChannelType,
  { label: string; icon: typeof Send; color: string; bg: string }
> = {
  telegram: { label: "Telegram", icon: Send, color: "text-sky-400", bg: "bg-sky-500/12" },
  wechat: { label: "企业微信", icon: MessageCircle, color: "text-emerald-400", bg: "bg-emerald-500/12" },
  feishu: { label: "飞书 Feishu", icon: Feather, color: "text-blue-400", bg: "bg-blue-500/12" },
  email: { label: "邮箱 Email", icon: Mail, color: "text-rose-400", bg: "bg-rose-500/12" },
  bark: { label: "Bark", icon: Smartphone, color: "text-cyan-400", bg: "bg-cyan-500/12" },
  webhook: { label: "Webhook", icon: Webhook, color: "text-violet-400", bg: "bg-violet-500/12" },
};

export function ChannelIcon({
  type,
  size = "md",
}: {
  type: ChannelType;
  size?: "sm" | "md" | "lg";
}) {
  const meta = CHANNEL_META[type];
  const Icon = meta.icon;
  const dims = size === "lg" ? "h-11 w-11" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const iconDims = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <div className={cn("flex items-center justify-center rounded-xl", dims, meta.bg)}>
      <Icon className={cn(iconDims, meta.color)} style={size === "lg" ? { height: 22, width: 22 } : undefined} />
    </div>
  );
}
