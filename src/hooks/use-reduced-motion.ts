import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "zapscout:reduced-motion";
type Mode = "auto" | "on" | "off";

function applyClass(reduced: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("reduce-motion", reduced);
}

function systemPrefers(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function resolve(mode: Mode): boolean {
  if (mode === "on") return true;
  if (mode === "off") return false;
  return systemPrefers();
}

export function useReducedMotion() {
  const [mode, setMode] = useState<Mode>("auto");
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Mode | null) ?? "auto";
    setMode(stored);
    const r = resolve(stored);
    setReduced(r);
    applyClass(r);

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => {
      const current = (localStorage.getItem(STORAGE_KEY) as Mode | null) ?? "auto";
      if (current === "auto") {
        const r2 = mql.matches;
        setReduced(r2);
        applyClass(r2);
      }
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const update = useCallback((next: Mode) => {
    localStorage.setItem(STORAGE_KEY, next);
    setMode(next);
    const r = resolve(next);
    setReduced(r);
    applyClass(r);
  }, []);

  return { mode, reduced, setMode: update };
}

// Apply ASAP before React mounts to avoid animation flash on load.
export function bootstrapReducedMotion() {
  if (typeof window === "undefined") return;
  const stored = (localStorage.getItem(STORAGE_KEY) as Mode | null) ?? "auto";
  applyClass(resolve(stored));
}
