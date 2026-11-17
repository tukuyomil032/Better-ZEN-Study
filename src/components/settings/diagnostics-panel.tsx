import { useCallback, useEffect, useMemo, useState } from "react";
import { browser } from "wxt/browser";
import { Button } from "@/components/arc/button/button";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Switch } from "@/components/arc/switch/switch";
import type { UpdateSettings } from "@/hooks/use-settings";
import {
  areaLabel,
  filterEntries,
  groupRecords,
  SEVERITY_LABELS,
  summarize,
  type Area,
  type Described,
  type Severity,
} from "@/lib/diagnostics";
import type { LogRecord } from "@/lib/logger";
import { buildFormattedReport, buildRawReport, mergeRecords, reportFileNames } from "@/lib/report";
import type { Settings } from "@/lib/settings";
import { SettingRow, SettingsSection } from "./controls";
import { createUiLogger } from "./log";
import { saveTextFile } from "./save-file";
import styles from "./diagnostics.module.css";
import panelStyles from "./settings.module.css";

type PanelProps = { settings: Settings; update: UpdateSettings };

type DebugResponse =
  | { ok: true; enabled: boolean; records: LogRecord[]; problems: LogRecord[] }
  | { ok: false };
type TestNotificationResponse =
  | { ok: true; notificationId: string; permissionLevel: string }
  | { ok: false; error: string; permissionLevel?: string }
  | undefined;

// Created once at module load, so hooks that list it do not re-run on every render.
const log = createUiLogger("options");

// How far back the list reaches. "すべて" keeps every record the browser session holds.
const WINDOWS = [
  { value: "10m", label: "10 分" },
  { value: "1h", label: "1 時間" },
  { value: "all", label: "すべて" },
] as const;
const WINDOW_MS: Readonly<Record<(typeof WINDOWS)[number]["value"], number | undefined>> = {
  "10m": 10 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  all: undefined,
};

const SEVERITY_FILTERS = [
  { value: "ok", label: "すべて" },
  { value: "warn", label: "注意以上" },
  { value: "problem", label: "問題のみ" },
] as const;

const AREAS: readonly Area[] = [
  "autoplay",
  "speed",
  "notify",
  "screen",
  "network",
  "summary",
  "settings",
  "extension",
  "other",
];

const LIST_LIMIT = 300;

function patchDebug(update: UpdateSettings, patch: Partial<Settings["debug"]>): Promise<void> {
  return update((current) => ({ ...current, debug: { ...current.debug, ...patch } }));
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString("ja-JP", { hour12: false });
}

function badgeClass(severity: Severity): string {
  if (severity === "problem") return styles.badgeProblem!;
  if (severity === "warn") return styles.badgeWarn!;
  if (severity === "ok") return styles.badgeOk!;
  return styles.badgeInfo!;
}

function statusClass(status: "ok" | "warn" | "problem"): string {
  if (status === "problem") return styles.statusProblem!;
  if (status === "warn") return styles.statusWarn!;
  return styles.statusOk!;
}

const STATUS_TEXT: Readonly<Record<"ok" | "warn" | "problem", string>> = {
  ok: "問題はありません",
  warn: "注意があります",
  problem: "問題が起きています",
};

// One entry of the formatted list: the badge, the area, one sentence, and the detail on demand.
function EntryView({ entry }: { entry: Described }) {
  return (
    <div className={styles.entry}>
      <div className={styles.entryHead}>
        <span className={styles.time}>{formatTime(entry.time)}</span>
        <span className={`${styles.badge} ${badgeClass(entry.severity)}`}>
          {SEVERITY_LABELS[entry.severity]}
        </span>
        <span className={styles.area}>{areaLabel(entry.area)}</span>
        {entry.repeat > 1 && <span className={styles.repeat}>×{entry.repeat}</span>}
      </div>
      <div className={styles.headline}>{entry.headline}</div>
      {entry.hint && <p className={styles.hint}>対処: {entry.hint}</p>}
      <details className={styles.detail}>
        <summary>詳しく見る</summary>
        <pre className={styles.detailBody}>
          {[...entry.detail, "", JSON.stringify(entry.record, null, 2)].join("\n")}
        </pre>
      </details>
    </div>
  );
}

export function DiagnosticsPanel({
  settings,
  update,
  onOpenReport,
}: PanelProps & { onOpenReport: () => void }) {
  const [records, setRecords] = useState<LogRecord[]>([]);
  const [problems, setProblems] = useState<LogRecord[]>([]);
  const [severity, setSeverity] = useState<Severity>("ok");
  const [area, setArea] = useState<Area | "all">("all");
  const [range, setRange] = useState<(typeof WINDOWS)[number]["value"]>("1h");
  const [showDetailed, setShowDetailed] = useState(false);
  const [includeTitles, setIncludeTitles] = useState(false);
  const [status, setStatus] = useState("");
  const [testing, setTesting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = (await browser.runtime.sendMessage({
        type: "get-debug-logs",
      })) as DebugResponse | undefined;
      if (response?.ok) {
        setRecords(response.records);
        setProblems(response.problems);
      }
    } catch (error) {
      log.warn("could not read debug logs", { error: String(error) });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Everything the person can see is derived from the same merged list, so the list, the summary,
  // and the saved files agree.
  const merged = useMemo(() => mergeRecords(records, problems), [records, problems]);
  const described = useMemo(() => groupRecords(merged), [merged]);
  const now = new Date();
  const summary = useMemo(() => summarize(described, now), [described, now.getMinutes()]);
  const visible = useMemo(
    () =>
      filterEntries(
        described,
        { minSeverity: severity, area, withinMs: WINDOW_MS[range], showDetailed },
        now,
      )
        .slice(-LIST_LIMIT)
        .reverse(),
    [described, severity, area, range, showDetailed, now.getMinutes()],
  );

  // The two files, built from everything that was recorded, not only from the visible list.
  function buildFiles(): {
    formatted: string;
    raw: string;
    names: { formatted: string; raw: string };
  } {
    const createdAt = new Date();
    const input = {
      createdAt,
      extensionVersion: browser.runtime.getManifest().version,
      userAgent: navigator.userAgent,
      settings,
      records: merged,
      includeTitles,
    };
    return {
      formatted: buildFormattedReport(input),
      raw: buildRawReport(input),
      names: reportFileNames(createdAt),
    };
  }

  function saveFormatted() {
    const files = buildFiles();
    saveTextFile(files.names.formatted, files.formatted, "text/markdown;charset=utf-8");
    setStatus(`整形ログを保存しました（${files.names.formatted}）`);
  }

  function saveRaw() {
    const files = buildFiles();
    saveTextFile(files.names.raw, files.raw, "application/json;charset=utf-8");
    setStatus(`生ログを保存しました（${files.names.raw}）`);
  }

  async function copyFormatted() {
    try {
      await navigator.clipboard.writeText(buildFiles().formatted);
      setStatus("整形ログをコピーしました");
    } catch (error) {
      log.error("clipboard write failed", { error: String(error) });
      setStatus("コピーできませんでした。保存を使ってください");
    }
  }

  async function clearLogs() {
    await browser.runtime.sendMessage({ type: "clear-debug-logs" });
    setRecords([]);
    setProblems([]);
    setStatus("ログを消しました");
  }

  async function sendTestNotification() {
    setTesting(true);
    try {
      const response = (await browser.runtime.sendMessage({
        type: "test-notification",
      })) as TestNotificationResponse;
      if (response?.ok) {
        setStatus(`テスト通知を出しました（権限: ${response.permissionLevel}）`);
      } else {
        const permission = response?.permissionLevel ? `（権限: ${response.permissionLevel}）` : "";
        setStatus(`通知に失敗しました: ${response?.error ?? "応答がありません"}${permission}`);
      }
    } catch (error) {
      setStatus(`通知に失敗しました: ${String(error)}`);
    } finally {
      setTesting(false);
      void refresh();
    }
  }

  return (
    <>
      <SettingsSection title="診断ログ">
        <SettingRow label="診断ログを記録" description="オフにすると、新しいログは記録されません">
          <Switch
            checked={settings.debug.enabled}
            onCheckedChange={(enabled) => void patchDebug(update, { enabled })}
          />
        </SettingRow>

        <div className={styles.card} aria-label="状態の要約">
          <div className={styles.cardItem}>
            <span className={styles.cardLabel}>状態</span>
            <span className={`${styles.cardValue} ${styles.status} ${statusClass(summary.status)}`}>
              {STATUS_TEXT[summary.status]}
            </span>
          </div>
          <div className={styles.cardItem}>
            <span className={styles.cardLabel}>直近 1 時間の問題</span>
            <span className={styles.cardValue}>
              {summary.problemsLastHour} 件
              {summary.problemAreas.length > 0 &&
                `（${summary.problemAreas.map((item) => `${areaLabel(item.area)} ${item.count}`).join("、")}）`}
            </span>
          </div>
          <div className={styles.cardItem}>
            <span className={styles.cardLabel}>最後に開いた画面</span>
            <span className={styles.cardValue}>{summary.lastScreen ?? "記録なし"}</span>
          </div>
          <div className={styles.cardItem}>
            <span className={styles.cardLabel}>最後の自動再生</span>
            <span className={styles.cardValue}>{summary.lastAutoplay ?? "記録なし"}</span>
          </div>
        </div>

        <div className={styles.toolbar}>
          <SegmentedControl
            label="表示の形"
            value={settings.debug.viewMode}
            onValueChange={(value) =>
              void patchDebug(update, { viewMode: value === "raw" ? "raw" : "formatted" })
            }
            options={[
              { value: "formatted", label: "整形" },
              { value: "raw", label: "生" },
            ]}
          />
          <Button variant="secondary" size="sm" onClick={() => void refresh()}>
            更新
          </Button>
          <Button variant="secondary" size="sm" onClick={saveFormatted}>
            整形ログを保存（.md）
          </Button>
          <Button variant="secondary" size="sm" onClick={saveRaw}>
            生ログを保存（.json）
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void copyFormatted()}>
            コピー
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void clearLogs()}
            disabled={merged.length === 0}
          >
            クリア
          </Button>
          <Button variant="primary" size="sm" onClick={onOpenReport}>
            不具合を報告
          </Button>
        </div>

        <div className={styles.filters}>
          <SegmentedControl
            label="重要度"
            value={severity}
            onValueChange={(value) => setSeverity(value as Severity)}
            options={SEVERITY_FILTERS.map((item) => ({ value: item.value, label: item.label }))}
          />
          <SegmentedControl
            label="期間"
            value={range}
            onValueChange={(value) => setRange(value as (typeof WINDOWS)[number]["value"])}
            options={WINDOWS.map((item) => ({ value: item.value, label: item.label }))}
          />
          <span className={styles.filterLabel}>領域</span>
          <select
            className={styles.areaSelect}
            aria-label="領域"
            value={area}
            onChange={(event) => setArea(event.target.value as Area | "all")}
          >
            <option value="all">すべて</option>
            {AREAS.map((item) => (
              <option key={item} value={item}>
                {areaLabel(item)}
              </option>
            ))}
          </select>
        </div>

        <SettingRow
          label="細かい記録も表示する"
          description="再生や通信のたびの記録など、開発者向けの細かい記録を出します"
        >
          <Switch checked={showDetailed} onCheckedChange={setShowDetailed} />
        </SettingRow>
        <SettingRow
          label="教材名やコース名を、保存と報告に含める"
          description="オフのときは伏せます。オンにすると、ファイルに名前が入ります"
        >
          <Switch checked={includeTitles} onCheckedChange={setIncludeTitles} />
        </SettingRow>

        {status && <p className={panelStyles.note}>{status}</p>}

        {settings.debug.viewMode === "raw" ? (
          <pre className={styles.raw} aria-label="生の記録">
            {visible.length === 0
              ? "記録はまだありません"
              : visible
                  .map(
                    (entry) =>
                      `${entry.time} [${entry.record.source}/${entry.record.scope}] ${entry.record.level} ${entry.record.message}${
                        entry.record.data === undefined
                          ? ""
                          : ` ${JSON.stringify(entry.record.data)}`
                      }${entry.repeat > 1 ? ` (×${entry.repeat})` : ""}`,
                  )
                  .join("\n")}
          </pre>
        ) : (
          <div className={styles.list} aria-label="整形した記録">
            {visible.length === 0 && <p className={styles.empty}>記録はまだありません</p>}
            {visible.map((entry, index) => (
              <EntryView key={`${entry.time}-${index}`} entry={entry} />
            ))}
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="通知の確認">
        <SettingRow
          label="テスト通知を送る"
          description="本番と同じ見た目で通知を出し、結果を表示します"
        >
          <Button
            variant="primary"
            size="sm"
            loading={testing}
            onClick={() => void sendTestNotification()}
          >
            テスト通知を送る
          </Button>
        </SettingRow>
      </SettingsSection>
    </>
  );
}
