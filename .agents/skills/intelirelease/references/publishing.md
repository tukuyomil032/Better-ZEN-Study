# Publication hooks

Use these Bash wrappers on the Ubuntu release runners. The chosen language supplies the release logic behind the executable `scripts/intelirelease`. For example, make the following JavaScript wrapper executable and use the equivalent `exec python3 ...` or `exec bash ...` for the other language templates.

```bash
#!/usr/bin/env bash
set -euo pipefail
exec node "$(dirname "$0")/intelirelease.mjs" "$@"
```

Before generating hooks, confirm artifact basenames, updater endpoints, branch rules, and the settings the workflow can actually use. On build runners, put the existing dependency installation, build, packaging, and signing commands in `scripts/release-build.sh` or call them directly from the YAML. Copy the explicitly required output files into `dist/` under unique release basenames. Do not let the packager independently publish a release. Keep updater keys separate from platform signing keys and use each only on runners that need it. Pass the normalized version and exact tag to provider commands if they need the download URL before publication.

## Delivery bundle

The producer `scripts/generate-update-feed.sh VERSION ASSETS_DIR OUT_DIR` stages validated public files in `OUT_DIR/stable/` and/or `OUT_DIR/beta/`; see [provider templates](feeds.md). A Beta release stages Beta only. A Stable release with Beta support stages Stable and a potential promotion to Beta; the distributor decides at publication time whether to apply the promotion. Use disjoint channel paths for branch-based feeds. Adapt the hooks for a shared appcast when its publisher must merge channel entries using the current feed under the same publication lock.

The published `intelirelease-delivery.json` is an immutable-by-convention recovery artifact. It carries the intended version, each source asset's SHA-256, and each staged feed file's channel, path and base64 content. It carries no keys or credentials. Obtain it with the release's own assets on a retry. Verify the release identity and target tag in the workflow, the asset URLs before distribution, and the actual byte digests before applying branch updates.

For release attachments, use only a layout verified to work with the installed updater. A GitHub native provider normally selects the correct release, and a Stable manifest in a prerelease must never be visible via a Stable selector. The template stages flat names. A path collision is allowed only for identical contents.

### scripts/release-manifests.sh

For Release attachments the hook discovers the published version history, including effective Beta promotion after its first publication. Re-run the version check immediately before manually publishing a long-lived Draft, or use native provider selection so that a stale Draft cannot supersede a newer channel release. GitHub's native Stable/latest selector must never mark an older Stable as latest.

```bash
#!/usr/bin/env bash
set -euo pipefail
version=$1 assets=$2
release_script=./scripts/intelirelease
version=$("$release_script" version "$version")
case "$FEED_KIND:$CHANNEL_MODE" in
  pages:stable|pages:stable-beta|branch:stable|branch:stable-beta|release:stable|release:stable-beta) ;;
  *) echo "Unsupported feed or channel configuration" >&2; exit 1 ;;
esac
[[ $CHANNEL_MODE != stable || $version != *-beta.* ]] || exit 1
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/feed" manifests
export RELEASE_TAG="${RELEASE_TAG:-v$version}"
bash scripts/generate-update-feed.sh "$version" "$assets" "$work/feed"
: > "$work/records"
: > "$work/assets"
for file in "$assets"/*; do
  name=${file##*/}
  [[ -f $file && ! -L $file && -s $file && $name =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*$ && $name != intelirelease-delivery.json ]] || exit 1
  digest=$(sha256sum "$file")
  jq -nc --arg name "$name" --arg sha256 "${digest%% *}" '{$name,$sha256}' >> "$work/assets"
done
attachment_routes='[]'
if [[ $FEED_KIND == release ]]; then
  # Paginate; do not confuse draft or unrelated tags with active updates.
  gh api --paginate --slurp "repos/${GITHUB_REPOSITORY:?}/releases?per_page=100" > "$work/releases"
  stable= beta=
  while IFS=$'\t' read -r tag prerelease; do
    candidate=$("$release_script" version "$tag" 2>/dev/null) || continue
    if [[ $prerelease == true && $candidate == *-beta.* ]]; then
      if [[ -z $beta || $("$release_script" compare "$candidate" "$beta") == 1 ]]; then beta=$candidate; fi
    elif [[ $prerelease == false && $candidate != *-* ]]; then
      if [[ -z $stable || $("$release_script" compare "$candidate" "$stable") == 1 ]]; then stable=$candidate; fi
    fi
  done < <(jq -r '.[][] | select(.draft == false) | [.tag_name, .prerelease] | @tsv' "$work/releases")
  if [[ -n $beta && -n $stable && $("$release_script" compare "$stable" "$beta") == 1 ]]; then beta=$stable; fi
  attachment_routes=$("$release_script" route "$CHANNEL_MODE" "$version" "$stable" "$beta")
fi
if [[ $version == *-beta.* ]]; then expected=beta; else expected=stable; fi
if [[ $expected == stable && $CHANNEL_MODE == stable-beta ]]; then
  [[ -d $work/feed/beta ]] || { echo "Missing potential Beta promotion files" >&2; exit 1; }
fi
while IFS= read -r -d '' file; do
  relative=${file#"$work/feed/"}
  channel=${relative%%/*}
  path=${relative#*/}
  [[ -f $file && ! -L $file && -s $file && $path =~ ^[A-Za-z0-9_][A-Za-z0-9_./-]*$ ]] || exit 1
  [[ /$path/ != */../* && /$path/ != */./* && /$path/ != */.git/* && /$path/ != *//* && $path != .intelirelease-state.json ]] || exit 1
  [[ $channel == "$expected" || ($channel == beta && $expected == stable && $CHANNEL_MODE == stable-beta) ]] || exit 1
  if [[ $FEED_KIND == release ]]; then
    jq -e --arg c "$channel" 'index($c) != null' <<<"$attachment_routes" >/dev/null || continue
    [[ $path != */* && $path != intelirelease-delivery.json ]] || exit 1
    if [[ -e $assets/$path ]]; then cmp "$file" "$assets/$path"
    elif [[ -e manifests/$path ]]; then cmp "$file" "manifests/$path"
    else cp "$file" "manifests/$path"
    fi
  fi
  base64 < "$file" | tr -d '\n' > "$work/base64"
  jq -nc --arg channel "$channel" --arg path "$path" --rawfile data "$work/base64" '{$channel,$path,$data}' >> "$work/records"
done < <(find "$work/feed" -mindepth 2 ! -type d -print0)
jq -s -e --arg expected "$expected" 'any(.[]; .channel == $expected)' "$work/records" >/dev/null
if [[ $expected == stable && $CHANNEL_MODE == stable-beta && $FEED_KIND != release ]]; then
  jq -s -e 'any(.[]; .channel == "beta") and (group_by(.path) | all(.[]; length == 1))' "$work/records" >/dev/null
fi
jq -n --arg version "$version" --arg tag "$RELEASE_TAG" --slurpfile files "$work/records" \
  --slurpfile assets "$work/assets" '{schema:1,$version,$tag,$files,$assets}' > "$assets/intelirelease-delivery.json"
```

Electron and Sparkle builders may emit their metadata alongside packages. For Release attachments, the copy loop in the workflow may have no files under `manifests/` if the checked, byte-identical metadata is already in `assets/`. In that case keep the original asset. For branch feeds, stage metadata sources under private-to-the-client names distinct from their public feed names.

### scripts/release-distribute.sh

For a new feed, channel state starts empty. For migration, set `feed.baseline` to the verified currently served versions (for example `{"stable":"1.1.0","beta":"1.2.0-beta.1"}`), and adopt only after reconciling actual endpoints and disabling other writers. This template keeps a ledger beside the feed files. Use `FEED_ROOT=.` for a dedicated feed-only branch or an explicitly reviewed subdirectory (for example `docs`) on a source branch. `pages-site/` must contain the entire Pages site that should remain public. When changing an existing Pages source, inspect and preserve its deployed files; do not point the artifact at a source checkout with unrelated content. The workflow invokes Pages deployment after the hook. If Pages fails, rerunning the same tag rebuilds the snapshot from the already-updated feed branch.

```bash
#!/usr/bin/env bash
set -euo pipefail
version=$1 assets=$2
workspace=$PWD
release_script="$workspace/scripts/intelirelease"
config="$workspace/.github/release-setup.json"
tag=${RELEASE_TAG:-v$version}
bundle="$assets/intelirelease-delivery.json"
feed_root=${FEED_ROOT:-.}
case "$FEED_KIND:$CHANNEL_MODE" in
  pages:stable|pages:stable-beta|branch:stable|branch:stable-beta|release:stable|release:stable-beta) ;;
  *) exit 1 ;;
esac
jq -e --arg v "$version" --arg tag "$tag" '
  .schema == 1 and .version == $v and .tag == $tag and
  (.assets | type == "array" and length > 0) and
  (.files | type == "array" and length > 0) and
  (.files | group_by([.channel,.path]) | all(.[]; length == 1))
' "$bundle" >/dev/null
server=${GITHUB_SERVER_URL:-https://github.com}
while IFS=$'\t' read -r name expected; do
  [[ $name =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*$ && $expected =~ ^[a-f0-9]{64}$ ]] || exit 1
  [[ -s $assets/$name && ! -L $assets/$name ]] || exit 1
  sum=$(sha256sum "$assets/$name")
  [[ ${sum%% *} == "$expected" ]] || { echo "Asset digest changed: $name" >&2; exit 1; }
  curl --head --fail --silent --show-error --location --retry 4 --max-time 20 \
    "$server/${GITHUB_REPOSITORY:?}/releases/download/$tag/$name" >/dev/null
done < <(jq -r '.assets[] | [.name,.sha256] | @tsv' "$bundle")

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
if [[ $FEED_KIND == release ]]; then
  while IFS=$'\t' read -r path data; do
    [[ $path =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*$ && -f $assets/$path ]] || exit 1
    printf %s "$data" | base64 -d > "$work/attachment"
    cmp "$assets/$path" "$work/attachment"
    curl --head --fail --silent --show-error --location --retry 4 --max-time 20 \
      "$server/$GITHUB_REPOSITORY/releases/download/$tag/$path" >/dev/null
  done < <(jq -r '.files[] | [.path,.data] | @tsv' "$bundle")
  exit 0
fi

git check-ref-format --branch "$FEED_BRANCH" >/dev/null
[[ $feed_root == . || $feed_root =~ ^[A-Za-z0-9_-][A-Za-z0-9_./-]*$ ]] || exit 1
if [[ $feed_root != . ]]; then
  [[ /$feed_root/ != */../* && /$feed_root/ != */./* && /$feed_root/ != */.git/* && /$feed_root/ != *//* ]] || exit 1
fi
repo="$work/repo"
git init -q "$repo"
cd "$repo"
git remote add origin "$server/$GITHUB_REPOSITORY.git"
git_net() { git -c credential.helper= -c 'credential.helper=!gh auth git-credential' "$@"; }
ref="refs/heads/$FEED_BRANCH"
if git_net ls-remote --exit-code origin "$ref" >/dev/null; then
  git_net fetch -q --depth=1 origin "$ref"
  git switch -q --detach FETCH_HEAD
else
  status=$?
  [[ $status == 2 ]] || exit "$status"
fi
# Do not write through tracked symlinks in any component of a publication path.
safe_path() {
  local path=$1 part cursor='' parts
  local IFS=/
  read -r -a parts <<< "$path"
  for part in "${parts[@]}"; do
    cursor="${cursor:+$cursor/}$part"
    [[ ! -L $cursor ]] || return 1
  done
}
safe_path "$feed_root"
mkdir -p "$feed_root"
ledger="$feed_root/.intelirelease-state.json"
safe_path "$ledger"
if [[ -f $ledger ]]; then
  jq -e 'select(type == "object" and (keys - ["beta","stable"] | length == 0))' "$ledger" > "$work/baseline"
else
  jq -e '.feed.baseline // {} | type as $t | if $t == "object" then . else error("invalid baseline") end' "$config" > "$work/baseline"
fi
stable=$(jq -r '.stable // ""' "$work/baseline")
beta=$(jq -r '.beta // ""' "$work/baseline")
routes=$("$release_script" route "$CHANNEL_MODE" "$version" "$stable" "$beta")
applied='[]'
while IFS= read -r channel; do
  [[ $channel == stable || $channel == beta ]] || exit 1
  [[ $version != *-beta.* || $channel != stable ]] || exit 1
  previous=$(jq -r --arg c "$channel" '.[$c] // ""' "$work/baseline")
  jq -e --arg c "$channel" 'any(.files[]; .channel == $c)' "$bundle" >/dev/null
  while IFS=$'\t' read -r path data; do
    [[ $path =~ ^[A-Za-z0-9_][A-Za-z0-9_./-]*$ ]] || exit 1
    [[ /$path/ != */../* && /$path/ != */./* && /$path/ != */.git/* && /$path/ != *//* && $path != .intelirelease-state.json ]] || exit 1
    destination="$feed_root/$path"
    safe_path "$destination"
    printf %s "$data" | base64 -d > "$work/feed"
    [[ -s $work/feed ]] || exit 1
    if [[ $previous == "$version" && -f $destination ]]; then
      cmp "$destination" "$work/feed" || { echo "Conflicting feed for the same version: $path" >&2; exit 1; }
    else
      mkdir -p "$(dirname "$destination")"
      cp "$work/feed" "$destination"
    fi
    git add -- "$destination"
  done < <(jq -r --arg c "$channel" '.files[] | select(.channel == $c) | [.path,.data] | @tsv' "$bundle")
  applied=$(jq --arg channel "$channel" '. + [$channel]' <<<"$applied")
done < <(jq -r '.[]' <<<"$routes")
jq --argjson channels "$applied" --arg v "$version" 'reduce $channels[] as $c (. ; .[$c] = $v)' "$work/baseline" > "$ledger"
git add -- "$ledger"
if ! git diff --cached --quiet; then
  git -c user.name=github-actions -c user.email=github-actions@users.noreply.github.com commit -qm "chore: publish updater feeds for $tag"
  # Ordinary non-force push. A conflicting writer fails the operation; retry from a fresh head.
  git_net push origin "HEAD:$ref"
fi
if [[ $FEED_KIND == pages ]]; then
  mkdir -p "$workspace/pages-site"
  if [[ $feed_root == . ]]; then
    git archive HEAD | tar -x -C "$workspace/pages-site"
  else
    git archive "HEAD:$feed_root" | tar -x -C "$workspace/pages-site"
  fi
  rm -f "$workspace/pages-site/.intelirelease-state.json"
fi
```

Keep feed branch and Pages updates serialized through the full delivery workflow. When the Pages source is GitHub Actions, use `pages: write` and `id-token: write` in the separate deployment job. A branch push made with `GITHUB_TOKEN` is insufficient to trigger a branch-based Pages build. Do not treat an unauthorized or unavailable feed branch as missing. Source branches that reject bot pushes need an existing GitHub App with the required access, an explicitly agreed PR workflow, or a dedicated writable branch. Preserve existing site publishing behavior if it owns the Pages deployment.

## Cask

Generate a Cask using the selected language's `cask` command. Configure `homebrew` with `repository` (owner/name), `branch`, `method` (`push` or `pr`), `slug`, `name`, `description`, `homepage`, and `artifacts` mapping `arm64` and/or `x64` to an uploaded DMG basename. The name must match the installed `.app` basename without its extension; adapt the template to an explicitly different app name. Confirm the selected tap's conventions and supported CPU builds. A bespoke Cask requires an adapted updater that changes only the targeted version, URL and digest fields; the wrapper below checks that an existing Cask is byte-for-byte owned by its previous generated snapshot before replacing it.

### scripts/release-cask.sh

This template stores the previous generated snapshot's digest and version beside the Cask so updates can detect manual changes and reject stale retries. For an existing Cask, adopt the snapshot only after showing and approving the exact replacement or adapting the updater. Supply `CASK_TOKEN` for a different repository or a PR actor when required. The source repository token must not be printed or embedded in a remote URL.

```bash
#!/usr/bin/env bash
set -euo pipefail
version=$1 assets=$2
[[ $version != *-* ]] || exit 1
workspace=$PWD
release_script="$workspace/scripts/intelirelease"
config="$workspace/.github/release-setup.json"
tag=${RELEASE_TAG:-v$version}
server=${GITHUB_SERVER_URL:-https://github.com}
tap=$(jq -er '.homebrew.repository' "$config")
branch=$(jq -er '.homebrew.branch' "$config")
method=$(jq -er '.homebrew.method' "$config")
slug=$(jq -er '.homebrew.slug' "$config")
[[ $tap =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ && $slug =~ ^[a-z0-9][a-z0-9-]*$ ]] || exit 1
[[ $method == push || $method == pr ]] || exit 1
git check-ref-format --branch "$branch" >/dev/null
if [[ $tap != "${GITHUB_REPOSITORY:?}" && -z ${CASK_TOKEN:-} ]]; then
  echo "A tap-scoped credential is required" >&2
  exit 1
fi
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
base="$server/$GITHUB_REPOSITORY/releases/download/$tag"
while IFS= read -r name; do
  [[ $name =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*[.]dmg$ && -s $assets/$name && ! -L $assets/$name ]] || exit 1
  curl --head --fail --silent --show-error --location --retry 4 --max-time 20 "$base/$name" >/dev/null
done < <(jq -r '.homebrew.artifacts[]' "$config")
jq -e --arg v "$version" --arg base "$base" --arg files "$assets" '
  .homebrew | {slug,name,description,homepage,version:$v,artifacts:
    (.artifacts | with_entries(.value as $file | .value = {
      url:($base + "/" + $file), file:($files + "/" + $file)
    }))
  }' "$config" > "$work/input.json"
"$release_script" cask "$work/input.json" > "$work/cask.rb"
ruby -c "$work/cask.rb"
export GH_TOKEN="${CASK_TOKEN:-${GH_TOKEN:?}}"
git_net() { git -c credential.helper= -c 'credential.helper=!gh auth git-credential' "$@"; }
git_net clone -q --depth 1 --branch "$branch" "$server/$tap.git" "$work/tap"
cd "$work/tap"
[[ ! -L Casks ]] || exit 1
mkdir -p Casks
path="Casks/$slug.rb"
state="Casks/.$slug.intelirelease.json"
[[ ! -L $path && ! -L $state ]] || exit 1
if [[ -f $path ]]; then
  [[ -f $state ]] || { echo "Existing Cask needs explicit adoption or a project-specific updater" >&2; exit 1; }
  sum=$(sha256sum "$path")
  [[ ${sum%% *} == "$(jq -er '.sha256' "$state")" ]] || { echo "Cask was edited; reconcile it before publishing" >&2; exit 1; }
  existing=$(jq -er '.version' "$state")
  case $("$release_script" compare "$version" "$existing") in
    -1) echo "Refusing to replace a newer Cask" >&2; exit 1 ;;
    0) cmp "$path" "$work/cask.rb"; exit 0 ;;
  esac
fi
cp "$work/cask.rb" "$path"
sum=$(sha256sum "$path")
jq -n --arg version "$version" --arg sha256 "${sum%% *}" '{$version,$sha256}' > "$state"
git add -- "$path" "$state"
git -c user.name=github-actions -c user.email=github-actions@users.noreply.github.com commit -qm "chore: update $slug to $version"
if [[ $method == push ]]; then
  git_net push origin "HEAD:refs/heads/$branch"
else
  head="release-cask/$slug-$version"
  if git_net ls-remote --exit-code origin "refs/heads/$head" >/dev/null; then
    git_net fetch -q --depth=1 origin "refs/heads/$head"
    git diff --quiet FETCH_HEAD HEAD -- "$path" "$state" || { echo "Existing Cask PR branch differs" >&2; exit 1; }
  else
    status=$?
    [[ $status == 2 ]] || exit "$status"
    git_net push origin "HEAD:refs/heads/$head"
  fi
  pr=$(gh pr list --repo "$tap" --base "$branch" --head "$head" --json number --jq '.[0].number // empty')
  if [[ -z $pr ]]; then
    gh pr create --repo "$tap" --base "$branch" --head "$head" \
      --title "chore: update $slug to $version" --body "Update to the published Stable release $tag."
  fi
fi
```

Review pending Cask PRs before merging so an old open PR cannot replace a newer tap version. Match the existing Cask's app stanza, names and architecture policy, and run `brew style --cask` and `brew audit --cask` when available. For custom private release servers, make the actual clients' authentication and the workflow's artifact verification explicit before enabling publication.
