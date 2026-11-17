# Contributing to Better ZEN Study

Thanks for your interest in improving Better ZEN Study. This guide explains how to propose focused changes and prepare them for review.

## Ways to contribute

- Report a bug with steps to reproduce it and the affected browser and page.
- Suggest a feature by describing the use case and expected behavior.
- Submit a focused fix, feature, test, documentation update, or maintenance change.

## Before you start

- Check the existing issues and pull requests for related work.
- Ask about the approach before starting a broad behavior change, a new integration, or a dependency change.
- Keep each pull request focused on one coherent problem. Split unrelated changes into separate pull requests.
- Remove secrets, account details, and personal study information from logs or examples before sharing them.

## Development setup

Follow the [Development guide](docs/DEVELOPMENT.md) to install dependencies and run the extension locally. The project uses Bun 1.4.4 in CI.

## Project conventions

- Keep changes consistent with the existing TypeScript and React code.
- Use the project scripts for linting and formatting: `bun run lint`, `bun run fmt`, and `bun run fmt:fix` when formatting files.
- Add or update tests when changing behavior or fixing a regression.
- Update the README or development documentation when a user-facing feature or workflow changes.
- Avoid unrelated renames and formatting churn.

## Release notes

The release workflow generates CHANGELOG.md from commit messages since the previous published release. Use Conventional Commit subjects so the generated notes are easy to review:

- feat: — Features
- fix: — Bug Fixes
- perf: — Performance
- type! or a BREAKING CHANGE footer — Breaking Changes
- chore, docs, ci, test, build, style, ref, and refactor — Maintenance
- Other commit types — Other Changes

Merge commits and release preparation commits are excluded. Review the generated entry in the release preparation pull request before merging it.

## Validation

Before opening a pull request, run the checks that apply to your change:

```bash
bun run lint
bun run fmt
bun run compile
bun run test
bun run build
bun run zip
```

For interface changes, also check the affected flow in the browser. Note any checks you could not run and include the manual steps you performed in the pull request.

## Pull requests

Use the pull request template and complete these sections:

- **Problem** — what is missing or broken, and why it matters.
- **Solution** — what changed and why.
- **Scope** — what is included and what is outside this change.
- **Validation** — commands and manual checks that were run.

Include screenshots or a recording when they help reviewers understand an interface change.
