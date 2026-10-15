import { useCallback, useEffect, useState } from "react";

const EVENT = "oanastack-layout";

export type DiffViewMode = "scroll" | "full";

const VIEW_KEY = "oanastack.diffView";
export const NAV_WIDTH = { key: "oanastack.navWidth", fallback: 340, min: 220, max: 560 } as const;
export const TREE_WIDTH = { key: "oanastack.treeWidth", fallback: 230, min: 160, max: 520 } as const;
export const DIFF_LEFT = { key: "oanastack.diffLeft", fallback: 50, min: 25, max: 75 } as const;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function readNumber(key: string, fallback: number, min: number, max: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null || raw.trim() === "") return fallback;
  return clamp(Number(raw), min, max);
}

function publish(key: string, value: number | DiffViewMode): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { key, value } }));
}

export function readDiffView(): DiffViewMode {
  if (typeof window === "undefined") return "scroll";
  return window.localStorage.getItem(VIEW_KEY) === "full" ? "full" : "scroll";
}

export function useDiffView(): [DiffViewMode, (mode: DiffViewMode) => void] {
  const [mode, setMode] = useState<DiffViewMode>(readDiffView);
  useEffect(() => {
    const onStore = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; value: DiffViewMode }>).detail;
      if (detail.key === VIEW_KEY && (detail.value === "full" || detail.value === "scroll")) setMode(detail.value);
    };
    window.addEventListener(EVENT, onStore);
    return () => window.removeEventListener(EVENT, onStore);
  }, []);
  const update = useCallback((next: DiffViewMode) => {
    window.localStorage.setItem(VIEW_KEY, next);
    setMode(next);
    publish(VIEW_KEY, next);
  }, []);
  return [mode, update];
}

export function useStoredNumber(spec: { key: string; fallback: number; min: number; max: number }): [number, (next: number) => void] {
  const { key, fallback, min, max } = spec;
  const [value, setValue] = useState(() => readNumber(key, fallback, min, max));
  useEffect(() => {
    const onStore = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; value: number }>).detail;
      if (detail.key !== key || typeof detail.value !== "number") return;
      setValue(clamp(detail.value, min, max));
    };
    window.addEventListener(EVENT, onStore);
    return () => window.removeEventListener(EVENT, onStore);
  }, [key, min, max]);
  const update = useCallback((next: number) => {
    const clamped = clamp(next, min, max);
    window.localStorage.setItem(key, String(clamped));
    setValue(clamped);
    publish(key, clamped);
  }, [key, min, max]);
  return [value, update];
}
