import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, clearToken, getToken, setToken } from "./api";

interface AuthCtx {
  authed: boolean;
  ready: boolean;
  login: (password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>({
  authed: false,
  ready: false,
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean>(!!getToken());
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    clearToken();
    setAuthed(false);
  }, []);

  const login = useCallback(async (password: string) => {
    const token = await api.login(password);
    setToken(token);
    setAuthed(true);
  }, []);

  // Validate any existing token on first load.
  useEffect(() => {
    let alive = true;
    if (!getToken()) {
      setReady(true);
      return;
    }
    api
      .me()
      .then(() => alive && setAuthed(true))
      .catch(() => alive && logout())
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [logout]);

  // React to 401s surfaced by the API client.
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener("cr:unauthorized", handler);
    return () => window.removeEventListener("cr:unauthorized", handler);
  }, [logout]);

  return <Ctx.Provider value={{ authed, ready, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
