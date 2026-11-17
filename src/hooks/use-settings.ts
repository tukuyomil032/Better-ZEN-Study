import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SETTINGS, parseSettings, type Settings } from "@/lib/settings";
import { getSettings, settingsItem, watchSettings } from "@/lib/settings-storage";
import { createUiLogger } from "@/components/settings/log";

// The popup and the settings page both write settings; each records under its own name.
const log = createUiLogger(window.location.pathname.endsWith("options.html") ? "options" : "popup");

// The top-level sections whose values differ between two settings objects.
function changedSections(before: Settings, after: Settings): string[] {
  const a = before as unknown as Record<string, unknown>;
  const b = after as unknown as Record<string, unknown>;
  return Object.keys(b).filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
}

// Writes are chained so two quick changes never build on the same stale value.
let writeChain: Promise<unknown> = Promise.resolve();

export type UpdateSettings = (change: (current: Settings) => Settings) => Promise<void>;

// Shares one settings object between the popup and the options page. Both read the
// stored value, apply their change to the latest copy, and write it back.
export function useSettings(): {
  settings: Settings;
  loaded: boolean;
  update: UpdateSettings;
} {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void getSettings().then((value) => {
      if (!active) return;
      setSettings(value);
      setLoaded(true);
    });
    const unwatch = watchSettings((value) => {
      if (active) setSettings(value);
    });
    return () => {
      active = false;
      unwatch();
    };
  }, []);

  const update = useCallback<UpdateSettings>((change) => {
    const run = writeChain.then(async () => {
      const latest = await getSettings();
      const next = parseSettings(change(latest));
      await settingsItem.setValue(next);
      setSettings(next);
      const sections = changedSections(latest, next);
      if (sections.length > 0) log.info("設定を変えました", { sections });
    });
    writeChain = run.catch(() => undefined);
    return run;
  }, []);

  return { settings, loaded, update };
}
