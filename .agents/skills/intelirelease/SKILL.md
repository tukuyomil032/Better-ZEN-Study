---
name: intelirelease
description: Set up or prepare a repository's GitHub release workflow after checking its real build, updater, artifact, and branch requirements. Use when a user asks to add or revise release automation; this skill does not publish a release during setup.
metadata:
  short-description: Configure repository release workflows
---

# Intelirelease

Help the user configure or prepare a repository's release workflow from the repository's existing build and updater behavior. Treat repository files as evidence, and keep assumptions separate from verified facts.

## Workflow

1. Read [the question-tool guide](references/question-tools.md) before asking. Before inspecting project files, ask about build prerequisites and then updater prerequisites. Ask one question at a time and skip anything the user has already answered.
2. Inspect the actual repository before proposing workflow changes. Verify the authoritative version source and any mirrors, build commands and platform matrix, release targets and signed artifact names, updater provider/configuration/feed URL, current release workflow, and any existing `CHANGELOG`.
3. Summarize what is verified, what remains unknown, and any conflicts. Pause only the blocked portion and continue with independent decisions. Do not guess missing signing, build, or updater details.
4. Ask for the remaining choices one at a time. Offer only options compatible with the repository's current build and updater behavior. Record decisions in `.github/release-setup.json`; never put tokens, private keys, certificates, passwords, or other secret values there.
5. Make only the selected local setup or pull request changes. If GitHub settings are in scope, show a preview of the proposed branch settings and keep the scope explicit. Setup must not trigger a release, publish an artifact, push a tag, change application code, or edit signing keys or updater credentials.
6. Report the files prepared, the decisions represented, and anything still blocked. Do not claim a workflow, setting, or release is active unless it was actually applied and verified.

## Route to the relevant reference

- For the setup interview, repository inspection, and configuration contract, read [references/setup.md](references/setup.md).
- For structured questions, use [references/question-tools.md](references/question-tools.md).
- For workflow trigger and permission design, read [references/workflows.md](references/workflows.md).
- For updater feed destinations and compatibility, read [references/feeds.md](references/feeds.md).
- For release publication modes and artifact handling, read [references/publishing.md](references/publishing.md).
- When the user selects an implementation language, read only its guide: [JavaScript](references/javascript.md), [Python](references/python.md), or [Bash](references/bash.md).

## Scope and safety

The user chooses whether the work stays local, is prepared as a pull request, or includes GitHub settings. Keep all changes inside that scope. A setup request is not authorization to create a release or change repository settings. Ask for explicit authorization before any irreversible or external action that is not already requested.
