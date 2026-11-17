import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from "wxt/utils/content-script-ui/shadow-root";

type Slot = { anchor: Element; ui: ShadowRootContentScriptUi<Root> };

export type AppendMode = "after" | "last";

// Keeps one shadow-root UI per logical slot (for example "chapter-total" or
// "subject-2472:31713") and re-renders it in place when the same anchor is seen again.
export function createSlotManager(ctx: ContentScriptContext) {
  const slots = new Map<string, Slot>();

  return {
    async render(
      key: string,
      anchor: Element,
      element: ReactElement,
      append: AppendMode,
    ): Promise<"mounted" | "updated"> {
      const existing = slots.get(key);
      if (existing && existing.anchor === anchor && anchor.isConnected) {
        existing.ui.mounted?.render(element);
        return "updated";
      }
      if (existing) {
        existing.ui.remove();
        slots.delete(key);
      }

      const name = `bzs-${key.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
      const ui = await createShadowRootUi(ctx, {
        name,
        position: "inline",
        anchor,
        append,
        onMount: (container) => {
          const root = createRoot(container);
          root.render(element);
          return root;
        },
        onRemove: (root) => {
          root?.unmount();
        },
      });
      ui.mount();
      slots.set(key, { anchor, ui });
      return "mounted";
    },

    // Removes slots whose anchor element was re-rendered away by the page.
    prune(): number {
      let removed = 0;
      for (const [key, slot] of slots) {
        if (!slot.anchor.isConnected) {
          slot.ui.remove();
          slots.delete(key);
          removed += 1;
        }
      }
      return removed;
    },

    removeAll(): void {
      for (const slot of slots.values()) slot.ui.remove();
      slots.clear();
    },
  };
}
