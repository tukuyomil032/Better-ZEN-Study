import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { Button } from "@/components/arc/button/button";
import { Slider } from "@/components/arc/slider/slider";
import { Switch } from "@/components/arc/switch/switch";
import { applyAppearance, snapSpeed } from "@/components/settings/appearance";
import { SettingRow } from "@/components/settings/controls";
import { createUiLogger } from "@/components/settings/log";
import { useSettings } from "@/hooks/use-settings";
import type { LogRecord } from "@/lib/logger";
import { SPEED_MAX, SPEED_MIN } from "@/lib/settings";
import styles from "./App.module.css";

const log = createUiLogger("popup");

type DebugResponse = { ok: true; enabled: boolean; records: LogRecord[] } | { ok: false };

const RECENT_LINES = 5;

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString("ja-JP", { hour12: false });
}

export function App() {
  const { settings, loaded, update } = useSettings();
  const [records, setRecords] = useState<LogRecord[]>([]);

  useEffect(
    () => applyAppearance(settings.appearance),
    [settings.appearance.theme, settings.appearance.accent],
  );

  useEffect(() => {
    log.info("popup opened");
    void (async () => {
      try {
        const response = (await browser.runtime.sendMessage({
          type: "get-debug-logs",
        })) as DebugResponse | undefined;
        if (response?.ok) setRecords(response.records);
      } catch (error) {
        log.warn("could not read debug logs", { error: String(error) });
      }
    })();
  }, []);

  function openSettings(hash = "") {
    void browser.tabs.create({ url: browser.runtime.getURL(`/options.html${hash}`) });
  }

  const recent = records.slice(-RECENT_LINES).reverse();

  return (
    <main className={styles.popup}>
      <header className={styles.header}>
        <h1 className={styles.title}>Better ZEN Study</h1>
      </header>

      <div className={styles.group}>
        <SettingRow label="自動再生">
          <Switch
            checked={settings.autoplay.enabled}
            disabled={!loaded}
            onCheckedChange={(enabled) =>
              void update((current) => ({ ...current, autoplay: { ...current.autoplay, enabled } }))
            }
          />
        </SettingRow>
        <SettingRow label="テストとレポートで通知">
          <Switch
            checked={settings.notify.enabled}
            disabled={!loaded}
            onCheckedChange={(enabled) =>
              void update((current) => ({ ...current, notify: { ...current.notify, enabled } }))
            }
          />
        </SettingRow>
        <SettingRow label="診断ログを記録">
          <Switch
            checked={settings.debug.enabled}
            disabled={!loaded}
            onCheckedChange={(enabled) =>
              void update((current) => ({ ...current, debug: { ...current.debug, enabled } }))
            }
          />
        </SettingRow>
      </div>

      <div className={styles.group}>
        <Slider
          label="初期速度"
          value={settings.speed.initial}
          min={SPEED_MIN}
          max={SPEED_MAX}
          step={settings.speed.step}
          format={(value) => `${value.toFixed(2)}x`}
          disabled={!loaded}
          onValueChange={(value) => {
            const initial = snapSpeed(value, settings.speed.step);
            void update((current) => ({ ...current, speed: { ...current.speed, initial } }));
          }}
        />
      </div>

      <div className={styles.actions}>
        <Button variant="primary" size="md" onClick={() => openSettings()}>
          詳細設定
        </Button>
        <Button variant="secondary" size="md" onClick={() => openSettings("#diagnostics")}>
          診断
        </Button>
        <Button variant="secondary" size="md" onClick={() => openSettings("#report")}>
          不具合を報告
        </Button>
      </div>

      <div className={styles.logs} aria-label="最近のログ">
        {recent.length === 0 && <p className={styles.muted}>まだログはありません</p>}
        {recent.map((record, index) => (
          <div key={`${record.time}-${index}`} className={styles.logLine}>
            <span className={styles.muted}>{formatTime(record.time)} </span>
            <span
              className={
                record.level === "error" || record.level === "warn" ? styles.warn : styles.muted
              }
            >
              [{record.source}/{record.scope}]
            </span>{" "}
            {record.message}
          </div>
        ))}
      </div>
    </main>
  );
}
