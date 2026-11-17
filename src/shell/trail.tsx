import { useEffect, useSyncExternalStore } from "react";
import type { Crumb } from "@/lib/trail";

// The breadcrumb trail a screen reports for the top bar. A screen reports its own trail once its
// data has loaded; until then the top bar shows the fallback for the route, and a screen that
// unmounts clears its trail so the next screen starts from the fallback.

let current: Crumb[] | undefined;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): Crumb[] | undefined {
  return current;
}

export function setTrail(crumbs: Crumb[] | undefined): void {
  current = crumbs;
  emit();
}

// The trail the top bar shows, or undefined when no screen has reported one.
export function useCrumbs(): Crumb[] | undefined {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

// Reports a screen's trail while the screen is mounted. The key is the trail's text, so a new
// array with the same crumbs does not restart the effect.
export function useTrail(crumbs: Crumb[] | undefined): void {
  const key = crumbs ? JSON.stringify(crumbs) : "";
  useEffect(() => {
    setTrail(key ? (JSON.parse(key) as Crumb[]) : undefined);
    return () => setTrail(undefined);
    // The key stands for the crumbs; the crumbs themselves are read from it above.
  }, [key]);
}
