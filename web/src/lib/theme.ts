import { useSyncExternalStore } from "react";

type Theme = "dark" | "light";
const KEY = "cr_theme";

function read(): Theme {
  const saved = localStorage.getItem(KEY);
  return saved === "dark" || saved === "light" ? saved : "light"; // default light
}

function apply(t: Theme) {
  document.documentElement.classList.toggle("dark", t === "dark");
}

// Single shared theme state so every useTheme() (Layout, Settings, …) stays in
// sync, and the choice is applied on app load (incl. the login page) + persisted.
let current: Theme = read();
if (typeof document !== "undefined") apply(current);

const listeners = new Set<() => void>();

export function getInitialTheme(): Theme {
  return current;
}

export function setTheme(t: Theme) {
  current = t;
  localStorage.setItem(KEY, t);
  apply(t);
  listeners.forEach((l) => l());
}

export function useTheme() {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => current,
    () => current,
  );
  return {
    theme,
    toggle: () => setTheme(current === "dark" ? "light" : "dark"),
    setTheme,
  };
}
