import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import type { AppConfig } from "./types";
import { PageLoader } from "../components/ui";

const Ctx = createContext<AppConfig | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(null));
  }, []);

  if (!config) return <PageLoader />;
  return <Ctx.Provider value={config}>{children}</Ctx.Provider>;
}

export function useConfig(): AppConfig {
  const c = useContext(Ctx);
  if (!c) throw new Error("useConfig must be used within ConfigProvider");
  return c;
}
