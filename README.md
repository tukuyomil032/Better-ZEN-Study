<div align="center">
  <img src="public/icon/128.png" alt="Better ZEN Study icon" width="128" />
  <h1>Better ZEN Study</h1>
  <p>A Chrome extension that adds a study dashboard and playback controls to ZEN Study.</p>
  <p><a href="README.md">🇺🇸 English</a> · <a href="README.ja.md">🇯🇵 日本語</a></p>
  <p><a href="docs/DEVELOPMENT.md">Development</a> · <a href="CONTRIBUTING.md">Contributing</a></p>
</div>

## What it does

- Track your study plan: Review course and monthly progress, upcoming deadlines, recent study time, progress against a study plan, and study streaks.
- Move through course materials: Browse courses, chapters, videos, tests, and reports through a replacement ZEN Study shell.
- Control video playback: Set playback speed and keyboard shortcuts, move to the next video automatically when one ends, and choose whether autoplay skips videos already marked as watched.
- Choose what you see and hear: Configure the shell's appearance, displayed study summaries, and notifications for tests, reports, and practice problems.
- Review and report problems: Inspect extension diagnostics and prepare a report for a GitHub issue.

## Installation

1. Open [GitHub Releases](https://github.com/tukuyomil032/Better-ZEN-Study/releases).
2. Download the latest Chrome ZIP: `better-zen-study-<version>-chrome.zip`.
3. Extract the ZIP.
4. Open `chrome://extensions`.
5. Enable **Developer mode**.
6. Click **Load unpacked** and select the extracted directory that contains `manifest.json`.
7. Open ZEN Study.

## Permissions

The extension requests browser storage, notifications, and scripting permissions. It runs on ZEN Study pages and its API; optional access to GitHub is requested when opening the issue-report flow.
