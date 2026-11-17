import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs";
import { applyAppearance } from "@/components/settings/appearance";
import {
  AppearancePanel,
  AutoplayPanel,
  DisplayPanel,
  NotifyPanel,
  PlanPanel,
  SkinPanel,
  SpeedPanel,
} from "@/components/settings/panels";
import { DiagnosticsPanel } from "@/components/settings/diagnostics-panel";
import { ReportPanel } from "@/components/settings/report-panel";
import { useSettings } from "@/hooks/use-settings";
import styles from "./App.module.css";

const TABS = [
  { value: "autoplay", label: "自動再生" },
  { value: "speed", label: "倍速" },
  { value: "notify", label: "通知" },
  { value: "display", label: "表示" },
  { value: "plan", label: "学習計画" },
  { value: "appearance", label: "外観" },
  { value: "diagnostics", label: "診断" },
  { value: "report", label: "不具合を報告" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

// The popup links to #diagnostics, so the page opens on the tab the link names.
function initialTab(): TabValue {
  const hash = window.location.hash.replace("#", "");
  const match = TABS.find((tab) => tab.value === hash);
  return match?.value ?? "autoplay";
}

export function App() {
  const { settings, loaded, update } = useSettings();
  const [tab, setTab] = useState<TabValue>(initialTab);

  useEffect(
    () => applyAppearance(settings.appearance),
    [settings.appearance.theme, settings.appearance.accent],
  );

  function selectTab(next: string) {
    const value = TABS.find((item) => item.value === next)?.value ?? "autoplay";
    setTab(value);
    window.history.replaceState(null, "", `#${value}`);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Better ZEN Study 設定</h1>
        <p className={styles.subtitle}>変更は、すぐに反映されます</p>
      </header>

      {loaded && (
        <Tabs value={tab} onValueChange={selectTab}>
          <TabsList aria-label="設定の項目">
            {TABS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="autoplay">
            <AutoplayPanel settings={settings} update={update} />
          </TabsContent>
          <TabsContent value="speed">
            <SpeedPanel settings={settings} update={update} />
          </TabsContent>
          <TabsContent value="notify">
            <NotifyPanel settings={settings} update={update} />
          </TabsContent>
          <TabsContent value="display">
            <DisplayPanel settings={settings} update={update} />
          </TabsContent>
          <TabsContent value="plan">
            <PlanPanel settings={settings} update={update} />
          </TabsContent>
          <TabsContent value="appearance">
            <AppearancePanel settings={settings} update={update} />
            <SkinPanel settings={settings} update={update} />
          </TabsContent>
          <TabsContent value="diagnostics">
            <DiagnosticsPanel
              settings={settings}
              update={update}
              onOpenReport={() => selectTab("report")}
            />
          </TabsContent>
          <TabsContent value="report">
            <ReportPanel settings={settings} />
          </TabsContent>
        </Tabs>
      )}
    </main>
  );
}
