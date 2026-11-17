import { browser } from "wxt/browser";
import { storage } from "wxt/utils/storage";
import { quietly } from "./context-safety";
import { DEFAULT_SETTINGS, parseSettings, SETTINGS_VERSION, type Settings } from "./settings";

export type NotificationTabTarget = { tabId: number; windowId?: number };

const notificationTabKey = (notificationId: string) => `notification-tab:${notificationId}`;

export const settingsItem = storage.defineItem<Settings>("local:settings", {
  fallback: DEFAULT_SETTINGS,
  version: SETTINGS_VERSION,
});

export async function getSettings(): Promise<Settings> {
  return parseSettings(await settingsItem.getValue());
}

// Follows changes to the settings. In a page that outlived a reload of the extension, the watch cannot
// start and its cleanup cannot run, so both are made quiet rather than thrown into the page.
export function watchSettings(callback: (settings: Settings) => void): () => void {
  try {
    return quietly(settingsItem.watch((value) => callback(parseSettings(value))));
  } catch {
    return () => undefined;
  }
}

export async function rememberNotificationTab(
  notificationId: string,
  target: NotificationTabTarget,
): Promise<void> {
  await browser.storage.session.set({ [notificationTabKey(notificationId)]: target });
}

export async function takeNotificationTab(
  notificationId: string,
): Promise<NotificationTabTarget | undefined> {
  const key = notificationTabKey(notificationId);
  const result = await browser.storage.session.get(key);
  await browser.storage.session.remove(key);
  const target = result[key];
  if (typeof target !== "object" || target === null) return undefined;

  const record = target as Record<string, unknown>;
  const tabId = record.tabId;
  const windowId = record.windowId;
  if (typeof tabId !== "number" || !Number.isInteger(tabId)) return undefined;
  if (windowId !== undefined && (typeof windowId !== "number" || !Number.isInteger(windowId))) {
    return undefined;
  }
  return windowId === undefined ? { tabId } : { tabId, windowId };
}
