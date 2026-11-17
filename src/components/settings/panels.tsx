import { Input } from "@/components/arc/input/input";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Slider } from "@/components/arc/slider/slider";
import { Switch } from "@/components/arc/switch/switch";
import type { UpdateSettings } from "@/hooks/use-settings";
import { SPEED_MAX, SPEED_MIN, type Settings } from "@/lib/settings";
import { snapSpeed } from "./appearance";
import { HotkeyField, SettingRow, SettingsSection } from "./controls";
import styles from "./settings.module.css";

type PanelProps = { settings: Settings; update: UpdateSettings };

// Writes one section's fields, leaving the other sections as they are.
function patchSection<K extends keyof Settings>(
  update: UpdateSettings,
  section: K,
  patch: Partial<Settings[K]>,
): Promise<void> {
  return update((current) => ({
    ...current,
    [section]: { ...current[section], ...patch },
  }));
}

export function AutoplayPanel({ settings, update }: PanelProps) {
  const autoplay = settings.autoplay;
  return (
    <SettingsSection title="動画の再生">
      <SettingRow label="自動再生" description="動画が終わったら、次の動画へ進みます">
        <Switch
          checked={autoplay.enabled}
          onCheckedChange={(enabled) => void patchSection(update, "autoplay", { enabled })}
        />
      </SettingRow>
      <SettingRow label="次の動画までの待ち時間" description="0秒から30秒までの間で選びます" wide>
        <Slider
          label="待ち時間"
          value={autoplay.delaySeconds}
          min={0}
          max={30}
          step={1}
          format={(value) => `${value}秒`}
          onValueChange={(delaySeconds) => void patchSection(update, "autoplay", { delaySeconds })}
        />
      </SettingRow>
      <SettingRow
        label="視聴済みの動画を飛ばす"
        description="見終えた動画は通らず、次の未視聴へ進みます"
      >
        <Switch
          checked={autoplay.skipWatched}
          onCheckedChange={(skipWatched) => void patchSection(update, "autoplay", { skipWatched })}
        />
      </SettingRow>
      <SettingRow
        label="Nプラスの教材も含める"
        description="自動再生の対象に、補助の動画を入れます"
      >
        <Switch
          checked={autoplay.includeSupplement}
          onCheckedChange={(includeSupplement) =>
            void patchSection(update, "autoplay", { includeSupplement })
          }
        />
      </SettingRow>
    </SettingsSection>
  );
}

export function SpeedPanel({ settings, update }: PanelProps) {
  const speed = settings.speed;
  const setStep = (value: string) => {
    const step = value === "0.1" ? 0.1 : 0.25;
    void update((current) => ({
      ...current,
      speed: {
        ...current.speed,
        step,
        initial: snapSpeed(current.speed.initial, step),
      },
    }));
  };
  const setHotkey = (name: "faster" | "slower" | "reset", key: string) =>
    void update((current) => ({
      ...current,
      speed: {
        ...current.speed,
        hotkeys: { ...current.speed.hotkeys, [name]: key },
      },
    }));

  return (
    <>
      <SettingsSection title="倍速">
        <SettingRow label="初期速度" description="動画を開いたときの速度です" wide>
          <Slider
            label="初期速度"
            value={speed.initial}
            min={SPEED_MIN}
            max={SPEED_MAX}
            step={speed.step}
            format={(value) => `${value.toFixed(2)}x`}
            onValueChange={(value) =>
              void patchSection(update, "speed", { initial: snapSpeed(value, speed.step) })
            }
          />
        </SettingRow>
        <SettingRow label="刻み幅" description="ホットキーで一度に変わる速度です">
          <SegmentedControl
            label="刻み幅"
            value={String(speed.step)}
            onValueChange={setStep}
            options={[
              { value: "0.25", label: "0.25" },
              { value: "0.1", label: "0.1" },
            ]}
          />
        </SettingRow>
        <SettingRow
          label="速度の持ち方"
          description="共通は、変えた速度を次の動画にも引き継ぎます。動画ごとは、動画ごとに覚えます"
        >
          <SegmentedControl
            label="速度の持ち方"
            value={speed.scope}
            onValueChange={(scope) =>
              void patchSection(update, "speed", {
                scope: scope === "per-video" ? "per-video" : "global",
              })
            }
            options={[
              { value: "global", label: "共通" },
              { value: "per-video", label: "動画ごと" },
            ]}
          />
        </SettingRow>
        <SettingRow
          label="未視聴の動画にも適用"
          description="オフにすると、まだ見ていない動画ではサイトの既定の速度を使います"
        >
          <Switch
            checked={speed.applyToUnwatched}
            onCheckedChange={(applyToUnwatched) =>
              void patchSection(update, "speed", { applyToUnwatched })
            }
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="ホットキー">
        <SettingRow label="速くする">
          <HotkeyField
            label="速くする"
            value={speed.hotkeys.faster}
            onChange={(key) => setHotkey("faster", key)}
          />
        </SettingRow>
        <SettingRow label="遅くする">
          <HotkeyField
            label="遅くする"
            value={speed.hotkeys.slower}
            onChange={(key) => setHotkey("slower", key)}
          />
        </SettingRow>
        <SettingRow label="初期速度に戻す">
          <HotkeyField
            label="初期速度に戻す"
            value={speed.hotkeys.reset}
            onChange={(key) => setHotkey("reset", key)}
          />
        </SettingRow>
        <p className={styles.note}>キーを押すと登録されます。Escキーと Tabキーは登録されません。</p>
      </SettingsSection>
    </>
  );
}

export function NotifyPanel({ settings, update }: PanelProps) {
  const notify = settings.notify;
  return (
    <SettingsSection title="通知">
      <SettingRow
        label="テストとレポートの画面で通知する"
        description="確認テストとレポートの画面に着いたとき、OSの通知を出します"
      >
        <Switch
          checked={notify.enabled}
          onCheckedChange={(enabled) => void patchSection(update, "notify", { enabled })}
        />
      </SettingRow>
      <SettingRow label="確認テストの画面">
        <Switch
          checked={notify.tests}
          disabled={!notify.enabled}
          onCheckedChange={(tests) => void patchSection(update, "notify", { tests })}
        />
      </SettingRow>
      <SettingRow label="レポートの画面">
        <Switch
          checked={notify.reports}
          disabled={!notify.enabled}
          onCheckedChange={(reports) => void patchSection(update, "notify", { reports })}
        />
      </SettingRow>
      <SettingRow label="演習の画面" description="課外授業で、自動再生が演習の前で止まったとき">
        <Switch
          checked={notify.exercises}
          disabled={!notify.enabled}
          onCheckedChange={(exercises) => void patchSection(update, "notify", { exercises })}
        />
      </SettingRow>
      <SettingRow label="音を消す">
        <Switch
          checked={notify.silent}
          disabled={!notify.enabled}
          onCheckedChange={(silent) => void patchSection(update, "notify", { silent })}
        />
      </SettingRow>
      <SettingRow label="通知をクリックしたら、そのタブへ戻る">
        <Switch
          checked={notify.clickToTab}
          disabled={!notify.enabled}
          onCheckedChange={(clickToTab) => void patchSection(update, "notify", { clickToTab })}
        />
      </SettingRow>
      <p className={styles.note}>
        通知が出ないときは、システム設定の通知で、使っているブラウザが許可されているか確かめてください。
        診断タブの「テスト通知を送る」で、原因を確かめられます。
      </p>
    </SettingsSection>
  );
}

export function DisplayPanel({ settings, update }: PanelProps) {
  const display = settings.display;
  return (
    <SettingsSection title="表示">
      <SettingRow
        label="章の総再生時間"
        description="章のヘッダに、動画の本数と総再生時間を出します"
      >
        <Switch
          checked={display.chapterTotal}
          onCheckedChange={(chapterTotal) => void patchSection(update, "display", { chapterTotal })}
        />
      </SettingRow>
      <SettingRow label="月の合計" description="月別の画面に、月の合計を出します">
        <Switch
          checked={display.monthSummary}
          onCheckedChange={(monthSummary) => void patchSection(update, "display", { monthSummary })}
        />
      </SettingRow>
      <SettingRow
        label="教科ごとの内訳"
        description="教科の行に、動画、テスト、レポートの数を出します"
      >
        <Switch
          checked={display.subjectSummary}
          onCheckedChange={(subjectSummary) =>
            void patchSection(update, "display", { subjectSummary })
          }
        />
      </SettingRow>
      <SettingRow label="時間の書き方">
        <SegmentedControl
          label="時間の書き方"
          value={display.timeStyle}
          onValueChange={(timeStyle) =>
            void patchSection(update, "display", { timeStyle: timeStyle === "ja" ? "ja" : "hms" })
          }
          options={[
            { value: "hms", label: "1:23:45" },
            { value: "ja", label: "1時間23分" },
          ]}
        />
      </SettingRow>
      <SettingRow label="集計にNプラスの教材を含める">
        <Switch
          checked={display.includeSupplement}
          onCheckedChange={(includeSupplement) =>
            void patchSection(update, "display", { includeSupplement })
          }
        />
      </SettingRow>
    </SettingsSection>
  );
}

export function PlanPanel({ settings, update }: PanelProps) {
  const plan = settings.plan;
  const setPlan = (patch: Partial<Settings["plan"]>) => void patchSection(update, "plan", patch);
  return (
    <>
      <SettingsSection title="目標">
        <SettingRow label="単位" description="目標の時間を、1日あたりか1週間あたりで決めます">
          <SegmentedControl
            label="目標の単位"
            value={plan.unit}
            onValueChange={(unit) => setPlan({ unit: unit === "week" ? "week" : "day" })}
            options={[
              { value: "day", label: "1日あたり" },
              { value: "week", label: "1週間あたり" },
            ]}
          />
        </SettingRow>
        <SettingRow
          label="目標の時間"
          description={plan.unit === "week" ? "1週間に見る時間" : "1日に見る時間"}
          wide
        >
          <Slider
            label="目標の時間"
            value={plan.hours}
            min={0}
            max={plan.unit === "week" ? 40 : 8}
            step={0.5}
            format={(value) => `${value}時間`}
            onValueChange={(hours) => setPlan({ hours: Math.round(hours * 2) / 2 })}
          />
        </SettingRow>
        <SettingRow
          label="連続記録に数える時間"
          description="この時間以上見た日を、連続記録の1日とします"
          wide
        >
          <Slider
            label="連続記録に数える時間"
            value={plan.streakMinMinutes}
            min={1}
            max={120}
            step={1}
            format={(value) => `${value}分`}
            onValueChange={(streakMinMinutes) =>
              setPlan({ streakMinMinutes: Math.round(streakMinMinutes) })
            }
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="期間">
        <SettingRow label="開始日" description="ここから数えて、目標の進み具合を見ます">
          <Input
            label="開始日"
            type="date"
            value={plan.startDate ?? ""}
            onChange={(event) => setPlan({ startDate: event.target.value || null })}
          />
        </SettingRow>
        <SettingRow
          label="終了予定日"
          description="この日までに終わる計画として、余裕や遅れを出します"
        >
          <Input
            label="終了予定日"
            type="date"
            value={plan.endDate ?? ""}
            onChange={(event) => setPlan({ endDate: event.target.value || null })}
          />
        </SettingRow>
        <SettingRow label="週の始まり">
          <SegmentedControl
            label="週の始まり"
            value={String(plan.weekStartsOn)}
            onValueChange={(value) => setPlan({ weekStartsOn: value === "0" ? 0 : 1 })}
            options={[
              { value: "1", label: "月曜" },
              { value: "0", label: "日曜" },
            ]}
          />
        </SettingRow>
      </SettingsSection>
    </>
  );
}

export function AppearancePanel({ settings, update }: PanelProps) {
  const appearance = settings.appearance;
  return (
    <SettingsSection title="外観">
      <SettingRow label="テーマ" description="システムにすると、OSの設定に合わせます">
        <SegmentedControl
          label="テーマ"
          value={appearance.theme}
          onValueChange={(theme) =>
            void patchSection(update, "appearance", {
              theme: theme === "light" || theme === "dark" ? theme : "system",
            })
          }
          options={[
            { value: "system", label: "システム" },
            { value: "light", label: "ライト" },
            { value: "dark", label: "ダーク" },
          ]}
        />
      </SettingRow>
      <SettingRow label="アクセント色" wide>
        <SegmentedControl
          label="アクセント色"
          fullWidth
          value={appearance.accent}
          onValueChange={(accent) =>
            void patchSection(update, "appearance", {
              accent: accent as Settings["appearance"]["accent"],
            })
          }
          options={[
            { value: "green", label: "緑" },
            { value: "blue", label: "青" },
            { value: "violet", label: "紫" },
            { value: "rose", label: "桃" },
            { value: "amber", label: "黄" },
            { value: "orange", label: "橙" },
            { value: "coral", label: "珊瑚" },
            { value: "neutral", label: "無彩" },
          ]}
        />
      </SettingRow>
    </SettingsSection>
  );
}

// ZEN Study's screens drawn by the shell. Each one can be turned off; turning a screen off puts
// the site's own screen back.
export function SkinPanel({ settings, update }: PanelProps) {
  const skin = settings.skin;
  return (
    <SettingsSection title="ZEN Studyの見た目">
      <SettingRow
        label="見た目を作り直す"
        description="オフにすると、すべての画面が元のZEN Studyに戻ります"
      >
        <Switch
          checked={skin.enabled}
          onCheckedChange={(enabled) => void patchSection(update, "skin", { enabled })}
        />
      </SettingRow>
      <SettingRow label="マイコース" description="必修レポート、必修授業、課外授業の画面">
        <Switch
          checked={skin.dashboard}
          disabled={!skin.enabled}
          onCheckedChange={(dashboard) => void patchSection(update, "skin", { dashboard })}
        />
      </SettingRow>
      <SettingRow label="月ごとのレポート" description="月の画面">
        <Switch
          checked={skin.month}
          disabled={!skin.enabled}
          onCheckedChange={(month) => void patchSection(update, "skin", { month })}
        />
      </SettingRow>
      <SettingRow label="コースと章" description="コースの画面と、章の教材の一覧">
        <Switch
          checked={skin.chapter}
          disabled={!skin.enabled}
          onCheckedChange={(chapter) => void patchSection(update, "skin", { chapter })}
        />
      </SettingRow>
      <SettingRow
        label="動画と確認テスト、レポート"
        description="動画の画面と、テストやレポートの画面の枠"
      >
        <Switch
          checked={skin.media}
          disabled={!skin.enabled}
          onCheckedChange={(media) => void patchSection(update, "skin", { media })}
        />
      </SettingRow>
    </SettingsSection>
  );
}
