import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "../lib/utils";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastCtx {
  push: (kind: ToastKind, message: string) => void;
}
const Ctx = createContext<ToastCtx>({ push: () => {} });

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = ++seq;
      setToasts((t) => [...t, { id, kind, message }]);
      setTimeout(() => remove(id), 4200);
    },
    [remove],
  );

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(92vw,360px)] flex-col gap-2.5">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

const ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};
const ACCENT = {
  success: "text-emerald-400",
  error: "text-rose-400",
  info: "text-brand",
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const Icon = ICONS[toast.kind];
  return (
    <div className="card glass pointer-events-auto flex items-start gap-3 p-3.5 animate-slide-in">
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", ACCENT[toast.kind])} />
      <p className="flex-1 text-sm leading-snug text-fg/90">{toast.message}</p>
      <button onClick={onClose} className="text-muted transition hover:text-fg">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast() {
  return useContext(Ctx).push;
}
