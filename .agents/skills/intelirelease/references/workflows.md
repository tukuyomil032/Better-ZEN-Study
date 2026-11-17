# GitHub Actions workflow templates

These are a Node.js example for a repository whose release branch is `main` and whose canonical version is `package.json` → `version`. Replace the repository-specific build and delivery hooks below, the runner matrix, and the version file configuration after inspecting the repository. Create the executable `scripts/intelirelease` wrapper described in [publication hooks](publishing.md), selecting `exec node .../intelirelease.mjs`, `exec python3 .../intelirelease.py`, or `exec bash .../intelirelease.sh` for the selected language. The YAML uses the wrapper uniformly; do not change command argument order. For Python use a GitHub-hosted runner with Python 3 available; for Bash ensure Bash and jq are available. The build matrix may have its own runtime requirements. Enable Actions to create pull requests, enable Pages with **GitHub Actions** as its source if using Pages, and protect the release branch and release environment. The templates use GitHub CLI, jq, Node and git on GitHub-hosted runners.

The following abbreviated example `.github/release-setup.json` is read relative to the repository root; add the agreed feed and optional Homebrew settings from [publication hooks](publishing.md):

```json
{"versionFiles":[{"path":"package.json","kind":"json","key":"version"},{"path":"src-tauri/tauri.conf.json","kind":"json","key":"version"}]}
```

Adapt the mirrors to files that actually exist. Core commands validate version and mirror consistency; a missing or mismatched mirror is a failure. The PR preparation below preserves the changelog by default. Enable the changelog input only when `changelogPolicy` is `managed`, and provide notes before changing it. For tag or manual mode, use the established changelog preparation step before triggering the release. Do not use a generated changelog as a replacement for existing content.

## `.github/workflows/prepare-release.yml`

```yaml
name: Prepare release
on:
  workflow_dispatch:
    inputs:
      version:
        description: Version without v prefix
        required: true
        type: string
      update_changelog:
        description: Add supplied notes while preserving existing entries
        required: true
        type: boolean
        default: false
      notes:
        description: Release notes, required when updating the changelog
        required: false
        type: string
permissions:
  contents: write
  pull-requests: write
jobs:
  prepare:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Validate and update mirrors
        env:
          VERSION: ${{ inputs.version }}
          UPDATE_CHANGELOG: ${{ inputs.update_changelog }}
          NOTES: ${{ inputs.notes }}
          EVENT_REF: ${{ github.ref }}
        run: |
          set -euo pipefail
          test "$EVENT_REF" = refs/heads/main
          current=$(./scripts/intelirelease read-version .github/release-setup.json)
          VERSION=$(./scripts/intelirelease version "$VERSION" "$current")
          config=$(mktemp)
          if [ "$UPDATE_CHANGELOG" = true ]; then
            jq -e '.changelogPolicy == "managed"' .github/release-setup.json >/dev/null
            test -n "$NOTES"
            jq --arg notes "$NOTES" '. + {changelog: {path: "CHANGELOG.md", notes: $notes}}' .github/release-setup.json > "$config"
          else
            jq 'del(.changelog)' .github/release-setup.json > "$config"
          fi
          ./scripts/intelirelease prepare "$VERSION" "$config"
      - name: Open pull request
        env:
          GH_TOKEN: ${{ github.token }}
          VERSION_INPUT: ${{ inputs.version }}
        run: |
          set -euo pipefail
          VERSION=$(./scripts/intelirelease version "$VERSION_INPUT")
          branch="release/prepare-$VERSION"
          git switch -c "$branch"
          git add -A
          if git diff --cached --quiet; then
            echo 'No release changes to propose.'
            exit 1
          fi
          git config user.name github-actions[bot]
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
          git commit -m "chore: prepare release $VERSION"
          git push origin "$branch"
          gh pr create --base main --head "$branch" --title "chore: prepare release $VERSION" --body "Prepare version $VERSION for release."
```

A duplicate branch is intentionally rejected rather than force-pushed. Review and merge the PR normally. If branch protection requires checks that `GITHUB_TOKEN` cannot trigger, use an appropriately scoped GitHub App token for the PR push and creation.

## `.github/workflows/release.yml`

This example builds only after a version change on `main`, a verified `v` tag, or a manual dispatch whose requested version matches the release branch tip. A tag must point to a commit reachable from `main`, and its name must match the checked-in version. A push of a newly created branch is ignored. Set `publishMode` to `auto` or `draft` in the shared config. The example includes all three trigger branches to show their inputs; keep only the selected trigger in generated YAML. All files, including the delivery bundle and attachment-mode manifests, are uploaded to the Draft before publication. The release must remain a Draft on any upload failure. The automatic publish step compares all published Stable versions before selecting `latest`; an unparseable Stable tag blocks publication until reconciled. Before publishing a long-lived Draft manually, recheck channel ordering, attached manifests and latest selection against current published releases. Protect release publication from concurrent outside writers. The preflight skips a version already published; use the resume workflow to retry its delivery. The `release` environment can enforce an approval before creation or publication.

```yaml
name: Build release
on:
  push:
    branches: [main]
    tags: ['v*']
  workflow_dispatch:
    inputs:
      version:
        description: Version already present on the release branch
        required: true
        type: string
permissions:
  contents: read
concurrency:
  group: release-build
  cancel-in-progress: false
jobs:
  resolve:
    runs-on: ubuntu-latest
    outputs:
      run: ${{ steps.resolve.outputs.run }}
      version: ${{ steps.resolve.outputs.version }}
      tag: ${{ steps.resolve.outputs.tag }}
      sha: ${{ steps.resolve.outputs.sha }}
      mode: ${{ steps.resolve.outputs.mode }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - id: resolve
        env:
          EVENT: ${{ github.event_name }}
          REF_TYPE: ${{ github.ref_type }}
          REF_NAME: ${{ github.ref_name }}
          BEFORE: ${{ github.event.before }}
          REQUESTED_VERSION: ${{ inputs.version }}
          EVENT_REF: ${{ github.ref }}
          GH_TOKEN: ${{ github.token }}
        run: |
          set -euo pipefail
          git fetch origin main --tags
          if [ "$EVENT" = workflow_dispatch ]; then
            test "$EVENT_REF" = refs/heads/main
            git checkout --detach origin/main
            sha=$(git rev-parse HEAD)
            requested=$(./scripts/intelirelease version "$REQUESTED_VERSION")
            tag="v$requested"
          elif [ "$REF_TYPE" = tag ]; then
            tag=$REF_NAME
          else
            if [[ "$BEFORE" =~ ^0+$ ]]; then
              echo 'run=false' >> "$GITHUB_OUTPUT"
              exit 0
            fi
            current=$(./scripts/intelirelease read-version .github/release-setup.json)
            old_dir=$(mktemp -d)
            git archive "$BEFORE" | tar -x -C "$old_dir"
            launcher="$PWD/scripts/intelirelease"
            config="$PWD/.github/release-setup.json"
            previous=$(cd "$old_dir" && "$launcher" read-version "$config")
            rm -rf "$old_dir"
            if [ "$current" = "$previous" ]; then
              echo 'run=false' >> "$GITHUB_OUTPUT"
              exit 0
            fi
            ./scripts/intelirelease version "$current" "$previous"
            tag="v$current"
            sha=$(git rev-parse HEAD)
          fi
          [[ "$tag" =~ ^v[0-9] ]] || { echo 'Invalid tag' >&2; exit 1; }
          if [ -z "${sha:-}" ]; then
            sha=$(git rev-parse --verify "refs/tags/$tag^{commit}")
            git merge-base --is-ancestor "$sha" origin/main
            git checkout --detach "$sha"
          fi
          version=$(./scripts/intelirelease read-version .github/release-setup.json)
          ./scripts/intelirelease version "$version"
          test "$tag" = "v$version"
          mode=$(jq -er '.publishMode // "auto" | select(. == "auto" or . == "draft")' .github/release-setup.json)
          channels=$(jq -er '.channelMode // "stable-beta" | select(. == "stable" or . == "stable-beta")' .github/release-setup.json)
          [[ "$channels" != stable || "$version" != *-beta.* ]] || exit 1
          if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
            test "$(git rev-parse "refs/tags/$tag^{commit}")" = "$sha"
          fi
          if gh release view "$tag" --json isDraft --jq .isDraft >/dev/null 2>&1 &&
             [ "$(gh release view "$tag" --json isDraft --jq .isDraft)" = false ]; then
            echo 'This version is already published; use Resume release distribution.'
            echo 'run=false' >> "$GITHUB_OUTPUT"
            exit 0
          fi
          printf 'run=true\nversion=%s\ntag=%s\nsha=%s\nmode=%s\n' "$version" "$tag" "$sha" "$mode" >> "$GITHUB_OUTPUT"
  build:
    needs: resolve
    if: needs.resolve.outputs.run == 'true'
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: ubuntu-latest
            artifact: linux
          - os: macos-latest
            artifact: macos
          - os: windows-latest
            artifact: windows
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ needs.resolve.outputs.sha }}
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Build approved target
        shell: bash
        env:
          VERSION: ${{ needs.resolve.outputs.version }}
        run: bash scripts/release-build.sh "$VERSION"
      - uses: actions/upload-artifact@v4
        with:
          name: release-${{ matrix.artifact }}
          path: dist/
          if-no-files-found: error
  release:
    needs: [resolve, build]
    if: needs.resolve.outputs.run == 'true'
    runs-on: ubuntu-latest
    environment: release
    permissions:
      contents: write
    outputs:
      published: ${{ steps.publish.outputs.published }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ needs.resolve.outputs.sha }}
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: actions/download-artifact@v4
        with:
          pattern: release-*
          path: artifacts
      - name: Create or resume draft and capture release notes
        env:
          GH_TOKEN: ${{ github.token }}
          TAG: ${{ needs.resolve.outputs.tag }}
          SHA: ${{ needs.resolve.outputs.sha }}
          VERSION: ${{ needs.resolve.outputs.version }}
          RELEASE_NOTES_FILE: ${{ runner.temp }}/release-notes.md
        run: |
          set -euo pipefail
          if gh release view "$TAG" --json isDraft --jq .isDraft >/dev/null 2>&1; then
            test "$(gh release view "$TAG" --json isDraft --jq .isDraft)" = true
            if git ls-remote --exit-code origin "refs/tags/$TAG" >/dev/null; then
              git fetch origin "refs/tags/$TAG:refs/intelirelease/draft-tag"
              test "$(git rev-parse 'refs/intelirelease/draft-tag^{commit}')" = "$SHA"
            else
              status=$?
              test "$status" = 2
              target=$(gh api "repos/$GITHUB_REPOSITORY/releases/tags/$TAG" --jq .target_commitish)
              test "$target" = "$SHA"
            fi
          else
            gh api "repos/$GITHUB_REPOSITORY/releases/generate-notes" -f tag_name="$TAG" -f target_commitish="$SHA" --jq .body > "$RELEASE_NOTES_FILE"
            args=(--draft --title "$TAG" --notes-file "$RELEASE_NOTES_FILE" --target "$SHA")
            [[ "$VERSION" != *-* ]] || args+=(--prerelease)
            gh release create "$TAG" "${args[@]}"
          fi
          gh release view "$TAG" --json body --jq '.body // ""' > "$RELEASE_NOTES_FILE"
      - name: Assemble and generate manifests
        env:
          VERSION: ${{ needs.resolve.outputs.version }}
          RELEASE_TAG: ${{ needs.resolve.outputs.tag }}
          RELEASE_NOTES_FILE: ${{ runner.temp }}/release-notes.md
          GH_TOKEN: ${{ github.token }}
        run: |
          set -euo pipefail
          export FEED_KIND CHANNEL_MODE
          FEED_KIND=$(jq -er '.feed.kind // "pages" | select(. == "pages" or . == "branch" or . == "release")' .github/release-setup.json)
          CHANNEL_MODE=$(jq -er '.channelMode // "stable-beta" | select(. == "stable" or . == "stable-beta")' .github/release-setup.json)
          mkdir assets
          while IFS= read -r -d '' file; do
            name=$(basename "$file")
            test ! -e "assets/$name" || { echo "Duplicate asset: $name" >&2; exit 1; }
            cp "$file" "assets/$name"
          done < <(find artifacts -type f -print0)
          bash scripts/release-manifests.sh "$VERSION" "$PWD/assets"
          test -f assets/intelirelease-delivery.json
          if [ "$FEED_KIND" = release ]; then
            while IFS= read -r -d '' file; do
              name=$(basename "$file")
              if [ -e "assets/$name" ]; then cmp "$file" "assets/$name"; else cp "$file" "assets/$name"; fi
            done < <(find manifests -type f -print0)
          fi
      - name: Upload all assets to draft
        env:
          GH_TOKEN: ${{ github.token }}
          TAG: ${{ needs.resolve.outputs.tag }}
        run: gh release upload "$TAG" assets/* --clobber
      - id: publish
        env:
          GH_TOKEN: ${{ github.token }}
          TAG: ${{ needs.resolve.outputs.tag }}
          MODE: ${{ needs.resolve.outputs.mode }}
          VERSION: ${{ needs.resolve.outputs.version }}
        run: |
          set -euo pipefail
          if [ "$MODE" = auto ]; then
            latest=true
            if [[ "$VERSION" == *-* ]]; then
              latest=false
            else
              releases=$(mktemp)
              gh api --paginate --slurp "repos/$GITHUB_REPOSITORY/releases?per_page=100" > "$releases"
              while IFS= read -r candidate; do
                candidate=$(./scripts/intelirelease version "$candidate")
                if [ "$(./scripts/intelirelease compare "$candidate" "$VERSION")" = 1 ]; then
                  latest=false
                fi
              done < <(jq -r '.[][] | select(.draft == false and .prerelease == false) | .tag_name' "$releases")
            fi
            gh release edit "$TAG" --draft=false --latest="$latest"
            echo 'published=true' >> "$GITHUB_OUTPUT"
          else
            echo 'published=false' >> "$GITHUB_OUTPUT"
          fi
  distribute:
    needs: [resolve, release]
    if: needs.release.outputs.published == 'true'
    uses: ./.github/workflows/distribute-release.yml
    with:
      tag: ${{ needs.resolve.outputs.tag }}
    permissions:
      contents: write
      pull-requests: write
      pages: write
      id-token: write
    secrets: inherit
```

Use the repository's approved build command inside `release-build.sh`; do not substitute a generic build. Each matrix target must produce distinct filenames. The `find` commands in these portable bash examples are part of generated workflows, not instructions to use a local file-search tool. Do not run two independent releases for the same version concurrently. If a tag already exists on another commit, the workflow fails instead of moving it. Retrying an already published release belongs in the distribution workflow, not the build workflow.

## `.github/workflows/distribute-release.yml`

This reusable workflow takes a published tag, checks it against `main` and the checked-in version, then downloads public release assets and the delivery bundle. A trusted release tag must contain these workflow and script versions. Configure repository environment protection and token permissions for branch, Pages and any external Cask repository. For a private repository, downloads require repository access and the resulting feed must be appropriate for its intended audience.

```yaml
name: Distribute release
on:
  workflow_call:
    inputs:
      tag:
        required: true
        type: string
permissions:
  contents: read
concurrency:
  group: intelirelease-delivery
  cancel-in-progress: false
jobs:
  prepare:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    outputs:
      version: ${{ steps.verify.outputs.version }}
      stable: ${{ steps.verify.outputs.stable }}
      feed: ${{ steps.verify.outputs.feed }}
      cask: ${{ steps.verify.outputs.cask }}
      sha: ${{ steps.verify.outputs.sha }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - id: verify
        env:
          GH_TOKEN: ${{ github.token }}
          TAG: ${{ inputs.tag }}
        run: |
          set -euo pipefail
          [[ "$TAG" =~ ^v[0-9] ]] || exit 1
          git fetch origin main --tags
          sha=$(git rev-parse --verify "refs/tags/$TAG^{commit}")
          git merge-base --is-ancestor "$sha" origin/main
          test "$(gh release view "$TAG" --json isDraft --jq .isDraft)" = false
          git checkout --detach "$sha"
          version=$(./scripts/intelirelease read-version .github/release-setup.json)
          ./scripts/intelirelease version "$version"
          test "$TAG" = "v$version"
          stable=true
          [[ "$version" != *-* ]] || stable=false
          cask=$(jq -r 'if .homebrew == null then "false" else "true" end' .github/release-setup.json)
          feed=$(jq -er '.feed.kind // "pages" | select(. == "pages" or . == "branch" or . == "release")' .github/release-setup.json)
          printf 'version=%s\nstable=%s\nfeed=%s\ncask=%s\nsha=%s\n' "$version" "$stable" "$feed" "$cask" "$sha" >> "$GITHUB_OUTPUT"
      - name: Download published release and prepare delivery
        env:
          GH_TOKEN: ${{ github.token }}
          TAG: ${{ inputs.tag }}
          VERSION: ${{ steps.verify.outputs.version }}
          FEED_KIND: ${{ steps.verify.outputs.feed }}
          RELEASE_TAG: ${{ inputs.tag }}
        run: |
          set -euo pipefail
          mkdir assets
          gh release download "$TAG" --dir assets
          test -f assets/intelirelease-delivery.json
          export FEED_ROOT FEED_BRANCH CHANNEL_MODE
          FEED_ROOT=$(jq -r '.feed.root // "."' .github/release-setup.json)
          FEED_BRANCH=$(jq -r '.feed.branch // "gh-pages"' .github/release-setup.json)
          CHANNEL_MODE=$(jq -er '.channelMode // "stable-beta" | select(. == "stable" or . == "stable-beta")' .github/release-setup.json)
          bash scripts/release-distribute.sh "$VERSION" "$PWD/assets"
      - uses: actions/upload-pages-artifact@v3
        if: steps.verify.outputs.feed == 'pages'
        with:
          path: pages-site
  pages:
    needs: prepare
    if: needs.prepare.outputs.feed == 'pages'
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    permissions:
      pages: write
      id-token: write
    steps:
      - id: deploy
        uses: actions/deploy-pages@v4
  cask:
    needs: [prepare, pages]
    if: always() && needs.prepare.result == 'success' && needs.prepare.outputs.stable == 'true' && needs.prepare.outputs.cask == 'true' && (needs.pages.result == 'success' || (needs.prepare.outputs.feed != 'pages' && needs.pages.result == 'skipped'))
    runs-on: ubuntu-latest
    environment: release
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ needs.prepare.outputs.sha }}
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Download release and update Cask
        env:
          GH_TOKEN: ${{ github.token }}
          TAG: ${{ inputs.tag }}
          VERSION: ${{ needs.prepare.outputs.version }}
          RELEASE_TAG: ${{ inputs.tag }}
          CASK_TOKEN: ${{ secrets.CASK_TOKEN }}
        run: |
          set -euo pipefail
          mkdir assets
          gh release download "$TAG" --dir assets
          bash scripts/release-cask.sh "$VERSION" "$PWD/assets"
```

Set `.feed.kind` in the shared config to `pages`, `branch` for a raw branch feed, or `release` for attached manifests. The branch hook updates `FEED_BRANCH` explicitly and idempotently; it must use authenticated Git with contents-write access and preserve unrelated branch files. Release attachment mode has no Pages deployment or branch update. For Pages, the hook prepares `pages-site/` and the Pages job actually deploys it. It must preserve other channel records and route monotonic updates using the core `route` command; a retry of an older release must never roll a channel back. `stable-beta` allows stable and beta records; `stable` publishes only stable. Prereleases never update the Cask. Set `.feed.root` to the reviewed publication subdirectory, or omit it for a feed-only branch root. The Cask job is skipped when `homebrew` is absent or null in `.github/release-setup.json`; include the full agreed configuration to enable it. Supply `CASK_TOKEN` as a least-privilege GitHub App token if the tap is another repository; do not print it.

## `.github/workflows/resume-distribution.yml`

A release published by a human produces `release.published`; publication by the repository `GITHUB_TOKEN` does not start another workflow, so the build workflow calls the reusable workflow directly. Dispatch also retries failed downstream work for an existing published tag without recreating the release.

```yaml
name: Resume release distribution
on:
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      tag:
        description: Existing published v-prefixed tag
        required: true
        type: string
permissions:
  contents: read
jobs:
  guard:
    runs-on: ubuntu-latest
    steps:
      - name: Require trusted dispatch ref
        env:
          EVENT: ${{ github.event_name }}
          REF: ${{ github.ref }}
        run: |
          if [ "$EVENT" = workflow_dispatch ] && [ "$REF" != refs/heads/main ]; then
            echo 'Dispatch only from main' >&2
            exit 1
          fi
  distribute:
    needs: guard
    uses: ./.github/workflows/distribute-release.yml
    with:
      tag: ${{ github.event_name == 'release' && github.event.release.tag_name || inputs.tag }}
    permissions:
      contents: write
      pull-requests: write
      pages: write
      id-token: write
    secrets: inherit
```

Protect tag creation and updates: a tag-push event loads its workflow definition from the tagged commit, so the verification inside that definition cannot defend against an attacker allowed to create a tag pointing at untrusted workflow code. To avoid this trust requirement, remove the tag push trigger and dispatch only from protected `main` with its current verified version. For manual dispatch, select the protected default branch in the Actions UI: the reusable workflow definition comes from that ref, while its checked-out release scripts come from the verified tag. Restrict who can dispatch and create tags. A failure in Pages, branch delivery, or Cask leaves the published release and tag intact; rerun distribution using that same tag after fixing the downstream problem. Hooks must treat identical existing outputs as success and reject conflicting or regressive updates.

## Project hook contracts

These hooks are repository-specific executable shell scripts, not alternative implementations of the language-portable `intelirelease` core:

- `bash scripts/release-build.sh VERSION`: run the repository's existing approved build for the current matrix runner and place release files under `dist/`. Fail if the build or signing fails.
- `bash scripts/release-manifests.sh VERSION ASSETS_DIR`: after every build asset is present, receive `FEED_KIND=pages|branch|release` and `CHANNEL_MODE=stable|stable-beta`, generate `manifests/`, and generate `ASSETS_DIR/intelirelease-delivery.json` for every feed kind. The bundle contains prepared per-channel records even for Drafts, so a later run needs no private Actions artifact. Verify required asset names, URLs, signatures and checksums before writing; use `intelirelease ... tauri INPUT_JSON` where applicable. Release attachment mode puts every manifest into the Draft with a unique basename before publishing.
- `bash scripts/release-distribute.sh VERSION ASSETS_DIR`: read the downloaded public assets and bundle; validate their identity, signatures and checksums. `FEED_KIND` is `pages`, `branch`, or `release`; `FEED_BRANCH` names the raw feed branch and `CHANNEL_MODE` is `stable` or `stable-beta`. For Pages, materialize the complete `pages-site/` snapshot; for branch, update that branch idempotently; for attachment, verify attached manifests. Retain existing channel records and reject rollback or conflicting same-version data. The reusable workflow serializes delivery, including Pages, across callers; other workflows writing the same site must share `intelirelease-delivery` or use a single designated publisher.
- `bash scripts/release-cask.sh VERSION ASSETS_DIR`: verify stable release assets and checksums, then update the configured tap idempotently using `.homebrew.*` configuration and optional `CASK_TOKEN` for the tap or PR; use `intelirelease ... cask INPUT_JSON` for generated content as applicable. This hook runs only after feed delivery succeeds.

These interfaces do not implement signing, server-specific upload, Pages snapshot merging, or external tap authentication by themselves. Provide and review those scripts for the project before enabling the workflows. Pin third-party actions to verified commit SHAs according to repository policy.
