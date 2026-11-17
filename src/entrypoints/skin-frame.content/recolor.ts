// Recolours a site page's light panels for the dark theme. Some site pages style their panels with
// generated class names a stylesheet cannot name, so the colours are found by value instead.
//
// Two passes. First, opaque light backgrounds become dark ones (the colour rules live in
// src/lib/contrast.ts). Second, text is checked against the background it actually sits on, and
// only text that cannot be read there is changed. Every value written is remembered, so stopping
// puts the page back exactly as the site built it.

import { darkVariant, parseColor, readableText, toCss, type Color } from "@/lib/contrast";

type SavedValue = { value: string; priority: string };

// The inline value each touched element had before we changed it, per property.
const saved = new Map<HTMLElement, Map<string, SavedValue>>();

function paint(element: HTMLElement, property: string, color: Color): void {
  let props = saved.get(element);
  if (!props) {
    props = new Map();
    saved.set(element, props);
  }
  if (!props.has(property)) {
    props.set(property, {
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
    });
  }
  element.style.setProperty(property, toCss(color), "important");
}

function restoreAll(): void {
  for (const [element, props] of saved) {
    for (const [property, original] of props) {
      if (original.value === "") {
        element.style.removeProperty(property);
      } else {
        element.style.setProperty(property, original.value, original.priority);
      }
    }
  }
  saved.clear();
}

// Whether the element has text of its own (not only inside child elements).
function hasOwnText(element: HTMLElement): boolean {
  return [...element.childNodes].some(
    (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "",
  );
}

// The background an element's text really sits on: the first opaque background going up the tree.
// Semi-transparent layers (overlays) are skipped, because the colour underneath shows through.
function backgroundBehind(element: HTMLElement): Color | undefined {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const background = parseColor(getComputedStyle(node).backgroundColor);
    if (background && background.alpha >= 1) return background;
  }
  return undefined;
}

export function recolor(root: Element): void {
  const elements = [root, ...root.querySelectorAll("*")].filter(
    (element): element is HTMLElement => element instanceof HTMLElement,
  );

  // Pass 1: light opaque backgrounds become dark, the way the dark theme draws panels.
  for (const element of elements) {
    const background = parseColor(getComputedStyle(element).backgroundColor);
    if (!background) continue;
    const dark = darkVariant(background);
    if (dark) paint(element, "background-color", dark);
  }

  // Pass 2: text that cannot be read on the background it sits on is changed to a readable colour.
  // Text with enough contrast, including coloured emphasis, keeps the site's colour.
  for (const element of elements) {
    if (!hasOwnText(element)) continue;
    const text = parseColor(getComputedStyle(element).color);
    const background = backgroundBehind(element);
    if (!text || !background) continue;
    const readable = readableText(text, background);
    if (readable) paint(element, "color", readable);
  }
}

// Recolours now and as the page renders more of itself. The returned function stops the watch
// and puts back every value it changed.
export function watchRecolor(): () => void {
  let frame = 0;
  const schedule = () => {
    if (frame !== 0) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      if (document.body) recolor(document.body);
    });
  };
  const observer = new MutationObserver(schedule);
  const start = () => {
    schedule();
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
  return () => {
    observer.disconnect();
    if (frame !== 0) window.cancelAnimationFrame(frame);
    restoreAll();
  };
}
