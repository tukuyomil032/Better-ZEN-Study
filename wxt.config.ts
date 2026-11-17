import { defineConfig } from "wxt";

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Better ZEN Study",
    description: "ZEN Studyの利便性を底上げするChrome拡張機能です。自動再生の制御、学習時間の表示、学習進捗の通知などを提供します。",
    // "scripting" fills in the issue form. The GitHub access is optional: it is asked for when a
    // report is opened, and not granted at install. The permissions API needs no entry here.
    permissions: ["storage", "notifications", "scripting"],
    host_permissions: ["https://www.nnn.ed.nico/*", "https://api.nnn.ed.nico/*"],
    optional_host_permissions: ["https://github.com/*"],
  },
});
