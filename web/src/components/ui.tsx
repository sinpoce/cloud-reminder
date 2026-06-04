import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../lib/utils";

// ── Button ───────────────────────────────────────────────────────────────────
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-white shadow-[0_8px_24px_-10px_rgb(var(--brand)/0.9)] hover:brightness-110 active:brightness-95",
  secondary:
    "border border-border bg-elevated/70 text-fg hover:bg-elevated hover:border-border",
  ghost: "text-muted hover:text-fg hover:bg-elevated/60",
  danger:
    "border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center font-medium transition-all duration-150",
        "focus-visible:ring-4 focus-visible:ring-brand/20 disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

// ── IconButton ───────────────────────────────────────────────────────────────
export function IconButton({
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition",
        "hover:bg-elevated/70 hover:text-fg focus-visible:ring-4 focus-visible:ring-brand/20",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ── Badge ────────────────────────────────────────────────────────────────────
type Tone = "neutral" | "brand" | "success" | "warning" | "danger";
const TONES: Record<Tone, string> = {
  neutral: "bg-elevated text-muted",
  brand: "bg-brand/12 text-brand",
  success: "bg-emerald-500/12 text-emerald-400",
  warning: "bg-amber-500/12 text-amber-400",
  danger: "bg-rose-500/12 text-rose-400",
};
export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn("chip", TONES[tone], className)}>{children}</span>;
}

// ── Switch ───────────────────────────────────────────────────────────────────
export function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200",
        "focus-visible:ring-4 focus-visible:ring-brand/20 disabled:opacity-40",
        checked ? "bg-brand" : "bg-border",
      )}
    >
      <span
        className={cn(
          "inline-block transform rounded-full bg-white shadow transition-transform duration-200",
          checked ? "translate-x-[22px]" : "translate-x-[3px]",
        )}
        style={{ height: 18, width: 18 }}
      />
    </button>
  );
}

// ── Spinner / Loading ────────────────────────────────────────────────────────
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-muted", className)} />;
}

export function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

// ── EmptyState ───────────────────────────────────────────────────────────────
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
