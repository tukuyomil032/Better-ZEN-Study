// Turns the raw diagnostic records into something a person can read: a severity, the area of the
// extension it came from, one sentence saying what happened, the concrete values, and what to do
// about it when there is something to do. Pure functions only, so the wording can be tested.

import type { LogRecord } from "./logger";

export type Severity = "ok" | "info" | "warn" | "problem";
export type Area =
  | "autoplay"
  | "speed"
  | "notify"
  | "screen"
  | "network"
  | "summary"
  | "settings"
  | "extension"
  | "other";

export type Described = {
  time: string;
  severity: Severity;
  area: Area;
  // One sentence in Japanese, stating what happened.
  headline: string;
  // The concrete values behind the sentence, one per line.
  detail: string[];
  // What the person can do about it, when there is something to do.
  hint?: string;
  // The original record, shown under "詳しく見る" and in the raw view.
  record: LogRecord;
  // How many identical records in a row this entry stands for.
  repeat: number;
  // Developer-level detail. Hidden unless the person asks for the fine-grained records.
  detailed: boolean;
};

type Data = Record<string, unknown>;

const AREA_LABELS: Readonly<Record<Area, string>> = {
  autoplay: "自動再生",
  speed: "倍速",
  notify: "通知",
  screen: "画面",
  network: "通信",
  summary: "集計",
  settings: "設定",
  extension: "拡張機能",
  other: "その他",
};

export function areaLabel(area: Area): string {
  return AREA_LABELS[area];
}

export const SEVERITY_LABELS: Readonly<Record<Severity, string>> = {
  ok: "正常",
  info: "情報",
  warn: "注意",
  problem: "問題",
};

function text(value: unknown, fallback = "不明"): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function count(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "?";
}

// What to do for an HTTP status the site returned.
export function httpHint(status: unknown): string {
  const code = typeof status === "number" ? status : Number.parseInt(String(status), 10);
  if (code === 401) {
    return "ZEN Study にログインしていないようです。サイトを開いて、ログインし直してください。";
  }
  if (code === 403) {
    return "この内容は、このアカウントでは見られない設定になっています（N高グループ限定など）。";
  }
  if (code === 404) {
    return "サイト側で、この内容が見つかりませんでした。サイトの仕様が変わった可能性があります。";
  }
  if (code >= 500) {
    return "サイト側の一時的な不調かもしれません。少し待ってから、もう一度試してください。";
  }
  return "通信の状態を確かめてください。";
}

// One rule per message the extension writes. Keyed by the message text.
type Rule = {
  area: Area;
  severity?: Severity;
  detailed?: boolean;
  headline: (data: Data) => string;
  hint?: (data: Data) => string | undefined;
};

const RULES: Readonly<Record<string, Rule>> = {
  // Extension and start-up
  "background started": {
    area: "extension",
    severity: "ok",
    headline: (d) => `拡張機能を起動しました（版 ${text(d.version)}）`,
  },
  "content script loaded": {
    area: "extension",
    severity: "ok",
    headline: (d) => `ZEN Study の画面に拡張機能を読み込みました（${text(d.path, "ページ")}）`,
  },
  "popup opened": {
    area: "extension",
    headline: () => "拡張機能のポップアップを開きました",
  },
  "could not read debug logs": {
    area: "extension",
    severity: "warn",
    headline: (d) => `診断ログを読めませんでした（${text(d.error)}）`,
    hint: () => "拡張機能を開き直してから、もう一度試してください。",
  },
  "clipboard write failed": {
    area: "extension",
    severity: "problem",
    headline: (d) => `クリップボードへ書けませんでした（${text(d.error)}）`,
    hint: () =>
      "ブラウザがクリップボードへの書き込みを許していません。保存のボタンを使ってください。",
  },
  "message received": {
    area: "extension",
    detailed: true,
    headline: (d) => `メッセージを受け取りました（${text(d.type)}）`,
  },

  // Network: the background's requests to the site
  "api get": {
    area: "network",
    detailed: true,
    headline: (d) => `通信: ${text(d.path)} を取得しました（${count(d.ms)} ms）`,
  },
  "api get failed": {
    area: "network",
    severity: "warn",
    headline: (d) => `通信が失敗しました: ${text(d.path)}（HTTP ${text(d.status)}）`,
    hint: (d) => httpHint(d.status),
  },
  "api get threw": {
    area: "network",
    severity: "problem",
    headline: (d) => `通信できませんでした: ${text(d.path)}`,
    hint: () => "インターネット接続と、拡張機能の通信の許可を確かめてください。",
  },

  // Summaries and the month and chapter data
  "chapter fetched": {
    area: "summary",
    severity: "ok",
    headline: (d) => `章 ${text(d.chapterId)} の教材を読みました`,
  },
  "chapter cache hit": {
    area: "summary",
    detailed: true,
    headline: (d) => `章 ${text(d.chapterId)} は、読み込み済みのものを使いました`,
  },
  "chapter fetch failed": {
    area: "summary",
    severity: "problem",
    headline: (d) => `章 ${text(d.chapterId)} の教材を読めませんでした（${text(d.error)}）`,
    hint: (d) => httpHint(d.status),
  },
  "monthly fetched": {
    area: "summary",
    severity: "ok",
    headline: (d) =>
      `${text(d.year)}年${text(d.month)}月のレポート情報を読みました（章 ${count(d.chapters)} 件）`,
  },
  "monthly cache hit": {
    area: "summary",
    detailed: true,
    headline: (d) =>
      `${text(d.year)}年${text(d.month)}月のレポート情報は、読み込み済みのものを使いました`,
  },
  "monthly fetch failed": {
    area: "summary",
    severity: "problem",
    headline: (d) => `${text(d.year)}年${text(d.month)}月のレポート情報を読めませんでした`,
    hint: (d) => httpHint(d.status),
  },
  "chapter summary built": {
    area: "summary",
    detailed: true,
    headline: (d) => `章 ${text(d.chapterId)} の集計を作りました`,
  },
  "chapter summary failed": {
    area: "summary",
    severity: "problem",
    headline: (d) => `章 ${text(d.chapterId)} の集計に失敗しました（${text(d.error)}）`,
  },
  "chapter summary unavailable": {
    area: "summary",
    severity: "warn",
    headline: (d) => `章 ${text(d.chapterId)} の集計を出せませんでした（${text(d.error)}）`,
  },
  "month summary built": {
    area: "summary",
    detailed: true,
    headline: (d) => `${text(d.year)}年${text(d.month)}月の集計を作りました`,
  },
  "month summary cache hit": {
    area: "summary",
    detailed: true,
    headline: (d) => `${text(d.year)}年${text(d.month)}月の集計は、読み込み済みのものを使いました`,
  },
  "month summary failed": {
    area: "summary",
    severity: "problem",
    headline: (d) => `${text(d.year)}年${text(d.month)}月の集計に失敗しました（${text(d.error)}）`,
  },
  "month summary unavailable": {
    area: "summary",
    severity: "warn",
    headline: (d) =>
      `${text(d.year)}年${text(d.month)}月の集計を出せませんでした（${text(d.error)}）`,
  },
  "month chapter summary failed": {
    area: "summary",
    severity: "problem",
    headline: (d) =>
      `${text(d.year)}年${text(d.month)}月の章の集計に失敗しました（${text(d.error)}）`,
  },
  "month card anchor not found yet": {
    area: "summary",
    detailed: true,
    headline: () => "月のレポートの見出しが、まだ描かれていません（描画を待ちます）",
  },
  "chapter header anchor not found yet": {
    area: "summary",
    detailed: true,
    headline: () => "章の見出しが、まだ描かれていません（描画を待ちます）",
  },
  "no subject rows matched yet": {
    area: "summary",
    detailed: true,
    headline: () => "教科の行が、まだ見つかりません（描画を待ちます）",
  },
  "chapter total shown": {
    area: "summary",
    severity: "ok",
    headline: (d) => `章の合計（動画 ${count(d.movies)} 本）を表示しました`,
  },
  "month total shown": {
    area: "summary",
    severity: "ok",
    headline: (d) =>
      `${text(d.year)}年${text(d.month)}月の合計を表示しました（章 ${count(d.chapters)} 件）`,
  },
  "summary refresh failed": {
    area: "summary",
    severity: "problem",
    headline: (d) => `集計の更新に失敗しました（${text(d.error)}）`,
  },

  // Screens in the shell
  画面を開きました: {
    area: "screen",
    severity: "info",
    headline: (d) => `${text(d.screen)} を開きました`,
  },
  "shell shown": {
    area: "screen",
    severity: "ok",
    headline: (d) => `ダッシュボードの表示に切り替えました（${text(d.pathname)}）`,
  },
  "shell failed; keeping the site's screen": {
    area: "screen",
    severity: "problem",
    headline: (d) =>
      `画面の描画に失敗したため、ZEN Study の元の画面を表示しています（${text(d.error)}）`,
    hint: () =>
      "拡張機能を再読み込みしてください。直らない場合は、この記録を添えて報告してください。",
  },
  "shell sync failed": {
    area: "screen",
    severity: "problem",
    headline: (d) => `画面の同期に失敗しました（${text(d.error)}）`,
  },
  "leaving the shell; reloading the site's own screen": {
    area: "screen",
    severity: "info",
    headline: (d) => `ZEN Study の元の画面へ移るため、ページを読み直します（${text(d.pathname)}）`,
  },
  route: {
    area: "screen",
    detailed: true,
    headline: (d) => `画面の判定: ${text(d.kind)}（${text(d.source)}）`,
  },
  章に教材が見つかりませんでした: {
    area: "screen",
    severity: "warn",
    headline: (d) => `章 ${text(d.chapterId)} に、教材が一つも見つかりませんでした`,
    hint: () =>
      "サイトの章の形が、拡張機能の想定と違うかもしれません。この記録を添えて報告してください。",
  },
  教材の表示先が見つかりませんでした: {
    area: "screen",
    severity: "problem",
    headline: (d) => `教材 ${text(d.resourceType)} ${text(d.id)} の表示先が見つかりませんでした`,
    hint: () => "この教材は、拡張機能の中では開けません。サイトの画面で開いてください。",
  },
  "月の教材の数を読めませんでした。章とテストの数で代用します": {
    area: "summary",
    severity: "warn",
    headline: (d) =>
      `${text(d.year)}年${text(d.month)}月の教材の数を読めませんでした。章とテストの数で代えました`,
    hint: (d) => httpHint(d.error),
  },

  // Settings
  設定を変えました: {
    area: "settings",
    severity: "info",
    headline: (d) => {
      const sections = Array.isArray(d.sections) ? d.sections.join("、") : "不明";
      return `設定を変えました（${sections}）`;
    },
  },

  // Autoplay: the chain from one movie's end to the next
  "ended accepted": {
    area: "autoplay",
    severity: "ok",
    headline: (d) => `動画 ${text(d.movieId)} が終わりました。次の教材を探します`,
  },
  "ended ignored: current page is not a movie": {
    area: "autoplay",
    detailed: true,
    headline: () => "動画の終わりを受けましたが、今のページは動画ではないため無視しました",
  },
  "ended ignored: message did not come from the player frame": {
    area: "autoplay",
    detailed: true,
    headline: () => "動画の終わりの通知が、プレーヤーの枠から来ていないため無視しました",
  },
  "ended ignored: movie id mismatch": {
    area: "autoplay",
    detailed: true,
    headline: (d) =>
      `動画の終わりの通知の ID（${text(d.fromFrame)}）が、今の動画（${text(d.onPage)}）と違うため無視しました`,
  },
  "ended ignored: autoplay already in progress": {
    area: "autoplay",
    detailed: true,
    headline: () => "次の教材へ移っている途中だったため、重ねて移りませんでした",
  },
  "ended: autoplay is paused after a test or report": {
    area: "autoplay",
    severity: "info",
    headline: () => "次が確認テストかレポートのため、自動再生はここで止めます",
  },
  "ended handler threw": {
    area: "autoplay",
    severity: "problem",
    headline: (d) => `動画が終わった後の処理で、エラーが起きました（${text(d.error)}）`,
    hint: () => "自動再生は止まります。ページを読み直して、もう一度試してください。",
  },
  "autoplay is disabled in settings": {
    area: "autoplay",
    severity: "info",
    headline: () => "設定で自動再生がオフのため、次の教材へは移りませんでした",
  },
  "next target chosen": {
    area: "autoplay",
    severity: "ok",
    headline: (d) =>
      `次の教材を選びました（${text(d.resourceType)} ${text(d.id)}、${text(d.kind)}）`,
  },
  "no next target in this chapter": {
    area: "autoplay",
    severity: "info",
    headline: () => "この章には、次に進む教材がありません",
  },
  "next target is a test, report or practice problem: autoplay will pause there": {
    area: "autoplay",
    severity: "info",
    headline: () => "次は確認テスト・レポート・演習のため、自動再生はそこで止めます",
  },
  "習熟度テストが、コースの中に見つかりませんでした": {
    area: "screen",
    severity: "problem",
    headline: (d) =>
      `習熟度テスト ${text(d.testId)} が、コース ${text(d.courseId)} の中に見つかりませんでした（一覧は ${text(d.rows)} 件）`,
    hint: () =>
      "テストが一覧から消えたか、サイトの形が変わったかもしれません。この記録を添えて報告してください。",
  },
  習熟度テストの表示先が見つかりませんでした: {
    area: "screen",
    severity: "problem",
    headline: (d) => `習熟度テスト ${text(d.testId)} の表示先の住所がありませんでした`,
    hint: () =>
      "サイトがテストの住所を返さなかった可能性があります。この記録を添えて報告してください。",
  },
  "next target index is out of range": {
    area: "autoplay",
    severity: "problem",
    headline: (d) => `次の教材の位置（${text(d.index)}）が、章の範囲の外でした`,
    hint: () => "章の教材の並びが、想定と違うかもしれません。この記録を添えて報告してください。",
  },
  "autoplay stopped: no chapter data came back": {
    area: "autoplay",
    severity: "problem",
    headline: () => "章のデータが届かなかったため、自動再生を止めました",
    hint: () =>
      "章のデータを読めなかった可能性があります。この記録の「章の形」を添えて報告してください。",
  },
  "autoplay failed": {
    area: "autoplay",
    severity: "problem",
    headline: (d) => `自動再生に失敗しました（${text(d.error)}）`,
    hint: () => "次の教材は、手で開いてください。",
  },
  "moved to the next item inside the shell": {
    area: "autoplay",
    severity: "ok",
    headline: (d) => `次の教材へ移りました: ${text(d.title)}`,
  },
  "clicked the list item": {
    area: "autoplay",
    severity: "ok",
    headline: (d) => `一覧の教材を押して移りました: ${text(d.title)}`,
  },
  "list item not found; navigating by URL": {
    area: "autoplay",
    severity: "warn",
    headline: (d) => `一覧に教材（${text(d.title)}）が見つからないため、アドレスで移りました`,
  },
  "chapter response was not ok; treating movie as unwatched": {
    area: "autoplay",
    severity: "warn",
    headline: (d) =>
      `章の情報が読めなかったため、動画を未視聴として扱いました（HTTP ${text(d.status)}）`,
    hint: (d) => httpHint(d.status),
  },
  "watched state request failed; treating movie as unwatched": {
    area: "autoplay",
    severity: "warn",
    headline: (d) =>
      `視聴状況の取得に失敗したため、動画を未視聴として扱いました（${text(d.error)}）`,
  },
  "watched state read": {
    area: "autoplay",
    detailed: true,
    headline: (d) =>
      `動画 ${text(d.movieId)} の視聴状況: ${d.watched === true ? "視聴済み" : "未視聴"}`,
  },
  "video ended, notifying the chapter page": {
    area: "autoplay",
    severity: "info",
    headline: (d) => `動画 ${text(d.movieId)} が終わったことを、章の画面へ知らせます`,
  },
  "understanding answer read": {
    area: "autoplay",
    severity: "info",
    headline: (d) => {
      const answer = text(d.answer);
      if (answer === "good")
        return `動画 ${text(d.movieId)}:「自信あり」が選ばれました。次へ進みます`;
      if (answer === "bad")
        return `動画 ${text(d.movieId)}:「自信なし」が選ばれました。次へは進みません`;
      if (answer === "skipped")
        return `動画 ${text(d.movieId)}:理解度の質問に答えないまま閉じられました`;
      return `動画 ${text(d.movieId)}:理解度の質問はありませんでした`;
    },
  },
  "understanding answer wait failed": {
    area: "autoplay",
    severity: "problem",
    headline: (d) => `動画 ${text(d.movieId)} の理解度の答えを待つ処理が失敗しました`,
    hint: () => "次の動画へは進みません。この記録を添えて報告してください。",
  },
  "ended: the learner did not understand, so autoplay stays on this movie": {
    area: "autoplay",
    severity: "info",
    headline: (d) => `「自信なし」だったため、自動再生は動画 ${text(d.movieId)} に留まります`,
  },
  "ended: no understanding answer, so autoplay stays on this movie": {
    area: "autoplay",
    severity: "info",
    headline: (d) =>
      `理解度の質問に答えなかったため、自動再生は動画 ${text(d.movieId)} に留まります`,
  },
  "site's own player window stopped while the shell is shown": {
    area: "screen",
    severity: "info",
    headline: () => "サイトが重ねて開いた動画の窓を止めました（二重の表示と再生を防ぐため）",
  },
  "site's own window opened: the shell's text size gives way to the site's": {
    area: "screen",
    severity: "info",
    headline: () =>
      "サイトの窓（同意画面など）が開いたので、画面の文字の大きさをサイトの値に戻しました",
  },
  "site's own window closed: the shell's text size is back": {
    area: "screen",
    severity: "info",
    headline: () => "サイトの窓が閉じたので、画面の文字の大きさを元に戻しました",
  },
  サイトの窓の見張りを始めました: {
    area: "screen",
    severity: "info",
    headline: (d) =>
      `サイトの窓の見張りを始めました（窓 ${text(d.windows, "0")} 個、そのうち枠を止めた窓 ${text(d.stopped, "0")} 個、枠 ${text(d.frames, "0")} 個）`,
  },
  "frame is not a movie player": {
    area: "speed",
    severity: "info",
    detailed: true,
    headline: () => "動画ではない枠（参照の枠など）を、プレーヤーとして探しませんでした",
  },

  // Player and playback speed
  "player ready": {
    area: "speed",
    severity: "ok",
    headline: (d) => `プレーヤーの準備ができました（動画 ${text(d.movieId)}）`,
  },
  "player path does not match a movie": {
    area: "speed",
    severity: "warn",
    headline: (d) =>
      `このページは動画のアドレスと一致しないため、プレーヤーを探しませんでした（${text(d.pathname)}）`,
  },
  "video#video-player not found within 20s": {
    area: "speed",
    severity: "problem",
    headline: (d) =>
      `20 秒待っても、動画のプレーヤーが見つかりませんでした（動画 ${text(d.movieId)}）`,
    hint: () => "ページを読み直してください。直らない場合は、この記録を添えて報告してください。",
  },
  "video element found": {
    area: "speed",
    detailed: true,
    headline: (d) => `動画の要素を見つけました（準備状態 ${text(d.readyState)}）`,
  },
  play: {
    area: "speed",
    detailed: true,
    headline: (d) => `再生しました（速度 ${text(d.rate)}、意図した速度 ${text(d.intent)}）`,
  },
  loadedmetadata: {
    area: "speed",
    detailed: true,
    headline: (d) => `動画の情報を読み込みました（サイトの速度 ${text(d.siteRate)}）`,
  },
  "restoring intended rate": {
    area: "speed",
    detailed: true,
    headline: (d) => `意図した速度（${text(d.intent)}）へ戻しています`,
  },
  "restoring intended rate (delayed)": {
    area: "speed",
    detailed: true,
    headline: (d) => `意図した速度（${text(d.intent)}）へ、少し遅れて戻しています`,
  },
  "initialize speed": {
    area: "speed",
    detailed: true,
    headline: (d) => `速度の初期化を始めました（動画 ${text(d.movieId)}）`,
  },
  "initialize speed failed": {
    area: "speed",
    severity: "warn",
    headline: (d) => `速度の初期化に失敗しました（${text(d.error)}）`,
  },
  "initialize superseded by a newer load": {
    area: "speed",
    detailed: true,
    headline: () => "新しい読み込みが来たため、古い速度の初期化をやめました",
  },
  "initialize skipped: a hotkey was pressed first": {
    area: "speed",
    detailed: true,
    headline: () => "速度のキーを先に押されたため、初期化を飛ばしました",
  },
  "start speed applied": {
    area: "speed",
    severity: "ok",
    headline: (d) => `開始時の速度（${text(d.speed)}）を適用しました`,
  },
  "speed left at the site default": {
    area: "speed",
    severity: "info",
    headline: (d) => `速度はサイトの既定（${text(d.siteRate)}）のままにしました`,
  },
  "speed state save failed": {
    area: "speed",
    severity: "warn",
    headline: (d) => `速度の設定を保存できませんでした（${text(d.error)}）`,
  },
  "hotkey applied": {
    area: "speed",
    severity: "ok",
    headline: (d) => `速度のキー（${text(d.key)}）で操作しました（${text(d.action)}）`,
  },
  "hotkey forwarded to the player": {
    area: "speed",
    detailed: true,
    headline: (d) => `キー（${text(d.key)}）をプレーヤーへ渡しました`,
  },
  "hotkey not forwarded: no player frame on this page": {
    area: "speed",
    detailed: true,
    headline: (d) => `キー（${text(d.key)}）を渡す先のプレーヤーがないため、何もしませんでした`,
  },

  // Notifications and the test/report arrival
  "test notification created": {
    area: "notify",
    severity: "ok",
    headline: () => "テスト通知を出しました",
  },
  "test notification failed": {
    area: "notify",
    severity: "problem",
    headline: (d) => `テスト通知を出せませんでした（${text(d.error)}）`,
    hint: () => "OS の通知設定と、ブラウザの通知の許可を確かめてください。",
  },
  "notification created": {
    area: "notify",
    severity: "ok",
    headline: (d) => `通知を出しました（${text(d.kind)}、${text(d.resourceType)}）`,
  },
  "notification clicked": {
    area: "notify",
    severity: "info",
    headline: () => "通知が押されました",
  },
  "notification click handling failed": {
    area: "notify",
    severity: "problem",
    headline: (d) => `通知を押した後の処理に失敗しました（${text(d.error)}）`,
  },
  "notification failed": {
    area: "notify",
    severity: "problem",
    headline: (d) => `通知を出せませんでした（${text(d.error)}）`,
    hint: () => "OS の通知設定と、ブラウザの通知の許可を確かめてください。",
  },
  "material arrival": {
    area: "notify",
    severity: "info",
    headline: (d) => `教材（${text(d.resourceType)}）の画面に着きました`,
  },
  "arrival dropped: the page changed while waiting": {
    area: "notify",
    severity: "info",
    headline: () => "待っている間に画面が変わったため、到着の通知を送りませんでした",
  },
  "arrival already sent for this resource": {
    area: "notify",
    detailed: true,
    headline: () => "この教材の到着は、もう通知済みです",
  },
  "test arrival received": {
    area: "notify",
    severity: "info",
    headline: (d) => `確認テスト・レポートの到着を受け取りました（${text(d.resourceType)}）`,
  },
  "test arrival skipped": {
    area: "notify",
    detailed: true,
    headline: (d) => `到着の通知を飛ばしました（${text(d.reason)}）`,
  },
  "test arrival settings skipped": {
    area: "notify",
    detailed: true,
    headline: () => "設定で到着の通知がオフのため、飛ばしました",
  },
  "test arrival lookup found": {
    area: "notify",
    detailed: true,
    headline: (d) => `到着した教材の情報を見つけました（${text(d.title)}）`,
  },
  "test arrival lookup not found": {
    area: "notify",
    severity: "warn",
    headline: () => "到着した教材の情報が見つからず、通知の文面を作れませんでした",
  },
  "test arrival lookup failed": {
    area: "notify",
    severity: "warn",
    headline: (d) => `到着した教材の情報を読めませんでした（${text(d.error)}）`,
    hint: (d) => httpHint(d.status),
  },
  "test-arrival answered": {
    area: "notify",
    severity: "ok",
    headline: (d) => `到着の通知に応答しました（${text(d.kind)}）`,
  },
  "test-arrival message failed": {
    area: "notify",
    severity: "problem",
    headline: (d) => `到着の通知を送れませんでした（${text(d.error)}）`,
    hint: () => "拡張機能を再読み込みしてから、もう一度試してください。",
  },
};

// The rule for a message, or undefined when the extension has none.
export function ruleFor(message: string): Rule | undefined {
  return RULES[message];
}

// Describes one record. A message without a rule is still shown: its text, and its values.
export function describeRecord(record: LogRecord): Described {
  const data: Data =
    typeof record.data === "object" && record.data !== null ? (record.data as Data) : {};
  const rule = ruleFor(record.message);
  const fallbackSeverity: Severity =
    record.level === "error" ? "problem" : record.level === "warn" ? "warn" : "info";
  const detail = Object.entries(data).map(([key, value]) => `${key}: ${formatValue(value)}`);
  if (record.path) detail.unshift(`画面: ${record.path}`);

  if (!rule) {
    return {
      time: record.time,
      severity: fallbackSeverity,
      area: areaFromScope(record.scope),
      headline: record.message,
      detail,
      record,
      repeat: 1,
      detailed: record.level === "debug",
    };
  }

  const hint = rule.hint?.(data);
  return {
    time: record.time,
    severity: rule.severity ?? fallbackSeverity,
    area: rule.area,
    headline: rule.headline(data),
    detail,
    hint,
    record,
    repeat: 1,
    detailed: rule.detailed ?? record.level === "debug",
  };
}

function areaFromScope(scope: string): Area {
  if (scope === "player" || scope === "speed") return "speed";
  if (scope === "bg") return "network";
  if (scope === "shell") return "screen";
  return "other";
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "（なし）";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// Joins runs of the same record into one entry with a count. A player that logs every play and
// pause would otherwise fill the list with one line per event.
export function groupRecords(records: readonly LogRecord[]): Described[] {
  const groups: Described[] = [];
  for (const record of records) {
    const described = describeRecord(record);
    const last = groups[groups.length - 1];
    if (last && last.headline === described.headline && last.severity === described.severity) {
      last.repeat += 1;
      last.time = described.time;
      continue;
    }
    groups.push(described);
  }
  return groups;
}

export type Filter = {
  // The lowest severity to show.
  minSeverity: Severity;
  // Only this area, or every area.
  area: Area | "all";
  // Only records newer than this many milliseconds before now; undefined means all.
  withinMs?: number;
  // Whether the developer-level detail is shown.
  showDetailed: boolean;
};

const SEVERITY_RANK: Readonly<Record<Severity, number>> = { ok: 0, info: 1, warn: 2, problem: 3 };

export function filterEntries(
  entries: readonly Described[],
  filter: Filter,
  now: Date,
): Described[] {
  const cutoff = filter.withinMs === undefined ? undefined : now.getTime() - filter.withinMs;
  return entries.filter((entry) => {
    if (!filter.showDetailed && entry.detailed) return false;
    if (SEVERITY_RANK[entry.severity] < SEVERITY_RANK[filter.minSeverity]) return false;
    if (filter.area !== "all" && entry.area !== filter.area) return false;
    if (cutoff !== undefined && Date.parse(entry.time) < cutoff) return false;
    return true;
  });
}

// The state of the extension at a glance: whether anything went wrong recently, and where.
export type Summary = {
  status: "ok" | "warn" | "problem";
  problemsLastHour: number;
  problemAreas: { area: Area; count: number }[];
  lastScreen?: string;
  lastAutoplay?: string;
};

export function summarize(entries: readonly Described[], now: Date): Summary {
  const hourAgo = now.getTime() - 60 * 60 * 1000;
  const recent = entries.filter((entry) => Date.parse(entry.time) >= hourAgo);
  const problems = recent.filter((entry) => entry.severity === "problem");
  const warnings = recent.filter((entry) => entry.severity === "warn");
  const byArea = new Map<Area, number>();
  for (const entry of problems)
    byArea.set(entry.area, (byArea.get(entry.area) ?? 0) + entry.repeat);

  const lastScreen = [...entries]
    .reverse()
    .find((entry) => entry.area === "screen" && entry.headline.endsWith("を開きました"));
  const lastAutoplay = [...entries].reverse().find((entry) => entry.area === "autoplay");

  return {
    status: problems.length > 0 ? "problem" : warnings.length > 0 ? "warn" : "ok",
    problemsLastHour: problems.reduce((sum, entry) => sum + entry.repeat, 0),
    problemAreas: [...byArea.entries()].map(([area, count]) => ({ area, count })),
    lastScreen: lastScreen?.headline,
    lastAutoplay: lastAutoplay?.headline,
  };
}
