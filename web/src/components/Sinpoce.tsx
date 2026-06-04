import { cn } from "../lib/utils";

// "SINPOCE" wordmark.
export function SinpoceCredit({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <span className="text-xs font-semibold tracking-wider text-fg/70">SINPOCE</span>
    </div>
  );
}
