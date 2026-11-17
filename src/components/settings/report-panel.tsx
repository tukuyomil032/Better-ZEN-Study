import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { Switch } from "@/components/arc/switch/switch";
import { shouldOpenIssueTab } from "@/lib/github-issue";
import { summarize, groupRecords, areaLabel, SEVERITY_LABELS } from "@/lib/diagnostics";
import type { LogRecord } from "@/lib/logger";
import {
  buildFormattedReport,
  buildIssueUrl,
  buildRawReport,
  mergeRecords,
  reportFileNames,
} from "@/lib/report";
import type { Settings } from "@/lib/settings";
import { SettingRow, SettingsSection } from "./controls";
import { createUiLogger } from "./log";
import { saveTextFile } from "./save-file";
import styles from "./report.module.css";

const GITHUB_ORIGIN = "https://github.com/*";

// The body the person starts from. It keeps the three things a useful report always has.
const TEMPLATE = `## 何が起きましたか


## 期待した動き


## 再現の手順
1.
2.
3.
`;

type DebugResponse =
  | { ok: true; enabled: boolean; records: LogRecord[]; problems: LogRecord[] }
  | { ok: false };
type OpenIssueResponse =
  | { ok: true; mode: "filled" | "standard"; reason?: string; opened: boolean }
  | { ok: false; error: string };

// Created once at module load, so the logger is not rebuilt on every render.
const log = createUiLogger("options");

// The diagnostic summary that goes into the body, so a report says the state even without the files.
function summaryBlock(records: LogRecord[], problems: LogRecord[], createdAt: Date): string {
  const entries = groupRecords(mergeRecords(records, problems));
  const summary = summarize(entries, createdAt);
  const lines = [
    "## 診断の要約（自動で入りました）",
    "",
    `- 状態: ${SEVERITY_LABELS[summary.status === "ok" ? "ok" : summary.status === "warn" ? "warn" : "problem"]}（直近 1 時間の問題 ${summary.problemsLastHour} 件）`,
  ];
  if (summary.problemAreas.length > 0) {
    lines.push(
      `- 問題のあった領域: ${summary.problemAreas.map((item) => `${areaLabel(item.area)} ${item.count}`).join("、")}`,
    );
  }
  if (summary.lastScreen) lines.push(`- 最後に開いた画面: ${summary.lastScreen}`);
  if (summary.lastAutoplay) lines.push(`- 最後の自動再生: ${summary.lastAutoplay}`);
  lines.push("", "詳しい記録は、添付の診断ログ（整形 .md、生 .json）を見てください。");
  return lines.join("\n");
}

function messageFor(
  mode: "filled" | "standard",
  reason: string | undefined,
  truncated: boolean,
): string {
  if (mode === "filled") {
    return "GitHub の画面に入力しました。内容を確認して、Submit new issue を押してください。添付が入っているかも確かめてください。";
  }
  if (reason === "permission") {
    return "GitHub への自動入力が許可されていないため、本文だけを入れて Issue の画面を開きました。保存したファイルを、画面にドラッグして添付してください。";
  }
  if (reason === "login") {
    return "GitHub にログインしていないため、ログイン画面が開きました。ログインすると、開いていた Issue の画面に本文が入ります。保存したファイルは、画面にドラッグして添付してください。";
  }
  if (truncated) {
    return "入力欄が見つからなかったため、本文の一部だけを入れて Issue の画面を開きました。保存したファイルを添付し、本文は必要なら補ってください。";
  }
  return "入力欄が見つからなかったため、本文を入れて Issue の画面を開きました。保存したファイルを添付してください。";
}

export function ReportPanel({ settings }: { settings: Settings }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(TEMPLATE);
  const [preview, setPreview] = useState(false);
  const [attachFormatted, setAttachFormatted] = useState(true);
  const [attachRaw, setAttachRaw] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [canAutofill, setCanAutofill] = useState<boolean | undefined>(undefined);

  // Read once when the panel opens, and again after the person grants access.
  async function checkGrant() {
    try {
      setCanAutofill(await browser.permissions.contains({ origins: [GITHUB_ORIGIN] }));
    } catch {
      setCanAutofill(false);
    }
  }
  useEffect(() => {
    void checkGrant();
  }, []);

  // Asked from a button press, so the browser can show its prompt.
  async function grantAutofill() {
    try {
      const granted = await browser.permissions.request({ origins: [GITHUB_ORIGIN] });
      setCanAutofill(granted);
      setStatus(
        granted
          ? "GitHub への自動入力を許可しました"
          : "許可されませんでした。自動入力は使えません",
      );
    } catch (error) {
      log.warn("permission request failed", { error: String(error) });
      setStatus("許可の確認に失敗しました");
    }
  }

  async function openIssue() {
    if (title.trim().length === 0) {
      setStatus("タイトルを入れてください");
      return;
    }
    setBusy(true);
    setStatus("診断ログを集めています…");
    try {
      const response = (await browser.runtime.sendMessage({ type: "get-debug-logs" })) as
        | DebugResponse
        | undefined;
      const records = response?.ok ? response.records : [];
      const problems = response?.ok ? response.problems : [];
      const createdAt = new Date();
      const input = {
        createdAt,
        extensionVersion: browser.runtime.getManifest().version,
        userAgent: navigator.userAgent,
        settings,
        records: mergeRecords(records, problems),
        includeTitles: false,
      };
      const names = reportFileNames(createdAt);
      const attachments: { name: string; content: string; type: string }[] = [];
      if (attachFormatted) {
        attachments.push({
          name: names.formatted,
          content: buildFormattedReport(input),
          type: "text/markdown",
        });
      }
      if (attachRaw) {
        attachments.push({
          name: names.raw,
          content: buildRawReport(input),
          type: "application/json",
        });
      }

      const fullBody = `${body.trimEnd()}\n\n${summaryBlock(records, problems, createdAt)}\n\n---\n拡張機能の版: ${input.extensionVersion}`;
      const { url, truncated } = buildIssueUrl(title.trim(), fullBody);

      // Automatic filling needs the GitHub access. Without it, or when the page cannot be filled, the
      // issue page still opens with the text, and the files are saved to be dropped in by hand.
      let result: OpenIssueResponse | undefined;
      if (canAutofill) {
        result = (await browser.runtime.sendMessage({
          type: "open-issue",
          draft: { title: title.trim(), body: fullBody, attachments },
        })) as OpenIssueResponse | undefined;
      }
      if (result?.ok && result.mode === "filled") {
        setStatus(messageFor("filled", undefined, false));
        return;
      }

      // The background may already have opened the issue tab (and found the person signed out). A
      // second tab would only duplicate it, so one is opened only when nothing was opened yet.
      if (shouldOpenIssueTab(result)) await browser.tabs.create({ url });
      for (const file of attachments) {
        saveTextFile(file.name, file.content, `${file.type};charset=utf-8`);
      }
      setStatus(messageFor("standard", result?.ok ? result.reason : undefined, truncated));
    } catch (error) {
      log.error("opening the issue failed", { error: String(error) });
      setStatus(`Issue の画面を開けませんでした（${String(error)}）`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsSection title="不具合を報告">
      <p className={styles.lead}>
        タイトルと本文を書いて押すと、GitHub の Issue 作成画面が開きます。診断ログを添付できます。
      </p>

      <Input
        label="タイトル"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="例: 課外授業の動画で自動再生が止まる"
      />

      <div className={styles.bodyHead}>
        <span className={styles.bodyLabel}>本文</span>
        <div className={styles.tabs} role="tablist" aria-label="本文の表示">
          <button
            type="button"
            role="tab"
            aria-selected={!preview}
            className={!preview ? styles.tabActive : styles.tab}
            onClick={() => setPreview(false)}
          >
            書く
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={preview}
            className={preview ? styles.tabActive : styles.tab}
            onClick={() => setPreview(true)}
          >
            プレビュー
          </button>
        </div>
      </div>
      {preview ? (
        <pre className={styles.preview} aria-label="プレビュー">
          {body || "（本文がありません）"}
        </pre>
      ) : (
        <textarea
          className={styles.textarea}
          aria-label="本文"
          value={body}
          rows={12}
          onChange={(event) => setBody(event.target.value)}
        />
      )}

      <SettingRow label="整形ログ（.md）を添付" description="読みやすい形の診断ログです">
        <Switch checked={attachFormatted} onCheckedChange={setAttachFormatted} />
      </SettingRow>
      <SettingRow label="生ログ（.json）を添付" description="記録をそのままの形で持つ診断ログです">
        <Switch checked={attachRaw} onCheckedChange={setAttachRaw} />
      </SettingRow>
      <p className={styles.note}>
        教材名やコース名は、既定では伏せます（診断の画面で変えられます）。添付するファイルは、送信の前に、Issue
        の画面で確かめてください。
      </p>

      <div className={styles.actions}>
        <Button variant="primary" size="md" loading={busy} onClick={() => void openIssue()}>
          GitHub の Issue 画面を開く
        </Button>
        {canAutofill === false && (
          <Button variant="secondary" size="md" onClick={() => void grantAutofill()}>
            GitHub への自動入力を許可
          </Button>
        )}
      </div>
      {status && (
        <p className={styles.note} role="status">
          {status}
        </p>
      )}
    </SettingsSection>
  );
}
