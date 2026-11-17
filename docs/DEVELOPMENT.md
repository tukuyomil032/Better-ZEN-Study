# Development

This guide covers local setup, the available project commands, and the main source directories.

## Requirements

- [Bun](https://bun.sh/), version 1.4.4 to match the version pinned in CI
- Chrome for loading and checking the Chrome development build

The repository also includes Firefox development, build, and ZIP scripts. The GitHub release workflow currently packages Chrome only.

## Set up the project

```bash
git clone https://github.com/tukuyomil032/Better-ZEN-Study.git
cd Better-ZEN-Study
bun install
```

Start the Chrome development build with:

```bash
bun run dev
```

For Firefox, use:

```bash
bun run dev:firefox
```

To load a built Chrome extension manually, run `bun run build`, open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select the generated Chrome extension directory under `.output/`.

## Project commands

| Command                 | Purpose                                                   |
| ----------------------- | --------------------------------------------------------- |
| `bun run dev`           | Start the Chrome development build.                       |
| `bun run dev:firefox`   | Start the Firefox development build.                      |
| `bun run build`         | Build the Chrome extension.                               |
| `bun run build:firefox` | Build the Firefox extension.                              |
| `bun run zip`           | Package the Chrome extension as a ZIP.                    |
| `bun run zip:firefox`   | Package the Firefox extension as a ZIP.                   |
| `bun run compile`       | Run TypeScript compilation checks without emitting files. |
| `bun run lint`          | Run Oxlint.                                               |
| `bun run fmt`           | Check formatting with Oxfmt.                              |
| `bun run fmt:fix`       | Format files with Oxfmt.                                  |
| `bun run test`          | Run the Bun test suite.                                   |

CI runs lint, formatting checks, tests, TypeScript compilation, and the Chrome build and ZIP packaging steps. Its Chrome ZIP is uploaded as a short-lived workflow artifact. The release workflow separately builds and publishes a Chrome ZIP after a release version is prepared and merged.

## Source layout

- `src/entrypoints/` contains the extension entry points, including the content scripts, dashboard shell, popup, options page, and background worker.
- `src/shell/` contains the replacement ZEN Study screens: dashboard, month, course, chapter, and media views.
- `src/lib/` contains shared settings, storage, API parsing, study-time calculations, playback behavior, diagnostics, and report helpers.
- `src/components/` contains shared interface and settings components.
- `public/` contains static assets such as the extension icons.

Keep behavioral changes focused and update relevant tests or documentation when a change alters how the extension works.
