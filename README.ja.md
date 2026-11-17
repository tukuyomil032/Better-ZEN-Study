<div align="center">
  <img src="public/icon/128.png" alt="Better ZEN Study のアイコン" width="128" />
  <h1>Better ZEN Study</h1>
  <p>ZEN Studyに学習ダッシュボードと動画の再生設定を追加するChrome拡張機能です。</p>
  <p><a href="README.md">🇺🇸 English</a> · <a href="README.ja.md">🇯🇵 日本語</a></p>
  <p><a href="docs/DEVELOPMENT.md">開発ガイド</a> · <a href="CONTRIBUTING.md">コントリビューションガイド</a></p>
</div>

## 主な機能

- 学習計画を確認: コースや月ごとの進捗、締切、最近の学習時間、計画に対するペース、連続学習日数を表示します。
- 教材を探して開く: ZEN Studyの画面を置き換えるシェルから、コース、章、動画、テスト、レポートをたどれます。
- 動画の再生を調整: 再生速度やキーボードショートカットを設定できます。動画の終了後に次の動画へ自動で進む機能や、視聴済み動画を飛ばす設定もあります。
- 表示と通知を設定: 画面のテーマや学習状況の表示、テスト・レポート・演習の通知を調整できます。
- 問題の状況を確認: 診断ログを確認し、GitHubのIssueとして報告する内容を作成できます。

## インストール

1. [GitHub Releases](https://github.com/tukuyomil032/Better-ZEN-Study/releases)を開きます。
2. 最新のChrome用ZIP `better-zen-study-<version>-chrome.zip` をダウンロードします。
3. ZIPを展開します。
4. `chrome://extensions`を開きます。
5. **デベロッパーモード**を有効にします。
6. **パッケージ化されていない拡張機能を読み込む**をクリックし、`manifest.json`が入った展開先のフォルダーを選びます。
7. ZEN Studyを開きます。

## 権限

拡張機能は、ブラウザーのストレージ、通知、スクリプト実行の権限を使います。ZEN StudyのページとAPIにアクセスし、Issue報告を始めるときにGitHubへの追加アクセスを求めます。
