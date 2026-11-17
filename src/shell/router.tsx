import { useSyncExternalStore } from "react";
import { classifyPath, type Route } from "@/lib/routes";
import { parseMonthOrigin, type MonthOrigin } from "@/lib/trail";

// A small router for the shell. Moves inside the shell use history.pushState and tell
// subscribers directly, so the screen changes without a page load. ZEN Study's own router
// is not involved, which is intended: its markup is hidden while the shell is on screen.

const listeners = new Set<() => void>();
let installed = false;

function emit(): void {
  for (const listener of listeners) listener();
}

function snapshot(): string {
  return window.location.pathname + window.location.search;
}

function install(): void {
  if (installed) return;
  installed = true;
  window.addEventListener("popstate", emit);
  // The content script and the screens can ask for a move without importing this module.
  window.addEventListener("bzs:navigate", (event) => {
    const path = (event as CustomEvent<{ path?: unknown }>).detail?.path;
    if (typeof path === "string" && path.startsWith("/")) navigate(path);
  });
}

function subscribe(listener: () => void): () => void {
  install();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Moves inside the shell. Paths must start with "/" and stay on the site. The location event
// the content scripts listen to is sent here as well, so arrival notifications and the
// autoplay state see shell moves the same way they see the site's own moves.
//
// The optional origin records the month a chapter was opened from. It travels in the history
// entry, so going back to the chapter keeps its trail, and pressing Back returns to the month.
export function navigate(path: string, options: { origin?: MonthOrigin } = {}): void {
  if (!path.startsWith("/") || path.startsWith("//")) return;
  if (path === snapshot()) return;
  const oldUrl = new URL(window.location.href);
  const state = options.origin ? { origin: options.origin } : null;
  window.history.pushState(state, "", path);
  const newUrl = new URL(window.location.href);
  const event = new Event("wxt:locationchange") as Event & { newUrl?: URL; oldUrl?: URL };
  event.newUrl = newUrl;
  event.oldUrl = oldUrl;
  window.dispatchEvent(event);
  emit();
}

// Changes the address of the current screen without adding a history entry, for example when a
// dashboard tab is chosen. Only paths on the site are accepted.
export function replacePath(path: string): void {
  if (!path.startsWith("/") || path.startsWith("//")) return;
  if (path === snapshot()) return;
  window.history.replaceState(window.history.state, "", path);
  emit();
}

// The month this screen was opened from, if any. Read from the history entry, so it survives a
// reload of the same entry, and is ignored when the entry does not carry a valid month.
export function readOrigin(): MonthOrigin | undefined {
  return parseMonthOrigin(window.history.state);
}

// Current location as the shell sees it, and the route it maps to.
export function useRoute(): { path: string; pathname: string; route: Route } {
  const path = useSyncExternalStore(subscribe, snapshot, snapshot);
  const pathname = path.split("?")[0] ?? path;
  return { path, pathname, route: classifyPath(pathname) };
}

// The query value of the current address, for example the dashboard's tab.
export function queryParam(path: string, name: string): string | null {
  const query = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
  return new URLSearchParams(query).get(name);
}
