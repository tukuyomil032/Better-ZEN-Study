# Update feed adapters

Identify the provider, deployed URL, path conventions, version ordering, and signature requirements from the installed app and previously released artifacts. Confirm that each requested channel can fetch its own feed or that the existing provider selects releases by channel. A branch stores files; it does not define the public URL. Use an HTTPS endpoint the installed app already accepts. Retain every active legacy endpoint and its shape. Establish the current channel versions and file digests before adopting a feed that another workflow already writes.

All providers follow the [delivery contract](publishing.md). Keep an existing producer when it meets that contract. The producer receives the normalized version, absolute release asset directory, and an empty directory to populate with `stable/` and/or `beta/` subdirectories. Use paths relative to the selected public feed root inside each subdirectory. An attachment-mode producer also uses these subdirectories for routing, but GitHub attachment names must be flat.

## Tauri static JSON

The per-target endpoint carries top-level `url` and `signature`. The aggregate endpoint instead carries `platforms`, mapping OS/architecture keys to objects with those two fields. Both include a semantic version (no tag prefix), release notes as a string, and an RFC 3339 UTC timestamp. Sign the final updater artifact with the existing Tauri updater key, then read the text of its matching `.sig` file directly into `signature`. Keep code signing or notarization in the existing build.

| Layout | Typical path | Body |
|---|---|---|
| Target-specific, channel-specific | `updates/stable-darwin-aarch64.json`, `updates/beta-windows-x86_64.json` | `version`, `notes`, `pub_date`, `url`, `signature` |
| Aggregate | `latest.json` or existing channel-specific aggregate paths | `version`, `notes`, `pub_date`, `platforms` |

The following JSON Schema describes both layouts produced by the templates. Supply the exact target set the app requests. The examples use abbreviated signature text; generate real signature strings from signed files.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["version", "notes", "pub_date"],
  "properties": {
    "version": {
      "type": "string",
      "pattern": "^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)(-beta[.][1-9][0-9]*)?$"
    },
    "notes": { "type": "string" },
    "pub_date": { "type": "string", "format": "date-time" }
  },
  "oneOf": [
    {
      "required": ["url", "signature"],
      "properties": {
        "url": { "$ref": "#/$defs/url" },
        "signature": { "$ref": "#/$defs/signature" }
      }
    },
    {
      "required": ["platforms"],
      "properties": {
        "platforms": {
          "type": "object",
          "minProperties": 1,
          "additionalProperties": {
            "type": "object",
            "required": ["url", "signature"],
            "properties": {
              "url": { "$ref": "#/$defs/url" },
              "signature": { "$ref": "#/$defs/signature" }
            },
            "additionalProperties": false
          }
        }
      }
    }
  ],
  "unevaluatedProperties": false,
  "$defs": {
    "url": { "type": "string", "format": "uri", "pattern": "^https://" },
    "signature": { "type": "string", "minLength": 1 }
  }
}
```

```json
{
  "version": "1.2.0-beta.3",
  "notes": "Preview release",
  "pub_date": "2026-11-09T00:00:00Z",
  "url": "https://github.com/example/app/releases/download/v1.2.0-beta.3/app-arm64.tar.gz",
  "signature": "<contents of app-arm64.tar.gz.sig>"
}
```

```json
{
  "version": "1.2.0",
  "notes": "Stable release",
  "pub_date": "2026-11-09T00:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "url": "https://github.com/example/app/releases/download/v1.2.0/app-arm64.tar.gz",
      "signature": "<contents of app-arm64.tar.gz.sig>"
    },
    "windows-x86_64": {
      "url": "https://github.com/example/app/releases/download/v1.2.0/app-x64.exe",
      "signature": "<contents of app-x64.exe.sig>"
    }
  }
}
```

### Tauri producer template

Save as `scripts/generate-update-feed.sh` for Tauri. Set `RELEASE_SCRIPT` to the executable wrapper around the selected language implementation. Use a `feed.tauri.artifacts` mapping of platform ID to release asset basename, and a `feed.tauri.paths` mapping of channel to public path mapped to platform ID (or `"aggregate"`). Replace the tag prefix if the existing project uses another convention. Set `RELEASE_NOTES_FILE` to the same notes used for the release if available. The publisher picks the compatible paths for the active channel.

```bash
#!/usr/bin/env bash
set -euo pipefail
version=$1 assets=$2 output=$3
config=.github/release-setup.json
release_script=${RELEASE_SCRIPT:-./scripts/intelirelease}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
base="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:?}/releases/download/${RELEASE_TAG:-v$version}"
notes=/dev/null
if [[ -n ${RELEASE_NOTES_FILE:-} ]]; then notes=$RELEASE_NOTES_FILE; fi
jq -e --arg version "$version" --arg date "$(date -u +%FT%TZ)" --rawfile notes "$notes" \
  --arg base "$base" --arg assets "$assets" '
  {version:$version, pub_date:$date, notes:$notes, platforms:
    (.feed.tauri.artifacts | with_entries(
      .value as $name | .value = {
        url: ($base + "/" + ($name | @uri)),
        asset_file: ($assets + "/" + $name),
        signature_file: ($assets + "/" + $name + ".sig")
      }
    ))
  }' "$config" > "$work/base.json"

if [[ $version == *-beta.* ]]; then channels=(beta)
elif [[ $CHANNEL_MODE == stable-beta ]]; then channels=(stable beta)
else channels=(stable)
fi
for channel in "${channels[@]}"; do
  jq -e --arg c "$channel" '.feed.tauri.paths[$c] | type == "object" and length > 0' "$config" >/dev/null
  while IFS=$'\t' read -r destination target; do
    [[ $destination =~ ^[a-zA-Z0-9_./-]+$ && $destination != /* ]] || exit 1
    [[ /$destination/ != */../* && /$destination/ != */.git/* && /$destination/ != */./* ]] || exit 1
    file="$output/$channel/$destination"
    mkdir -p "$(dirname "$file")"
    if [[ $target == aggregate ]]; then
      "$release_script" tauri "$work/base.json" > "$file"
    else
      jq --arg target "$target" '. + {target:$target}' "$work/base.json" > "$work/input.json"
      "$release_script" tauri "$work/input.json" > "$file"
    fi
  done < <(jq -r --arg c "$channel" '.feed.tauri.paths[$c] | to_entries[] | [.key,.value] | @tsv' "$config")
done
```

If the project already serves an aggregate Stable endpoint and plans to add target-specific files, retain the aggregate file. If Stable target files have to be initialized before a Beta release, seed only from a verified published Stable release, using its original URL and signature for each exact target. Perform this migration during setup; a Beta run must never derive Stable data from Beta assets.

## Electron with electron-updater

Use electron-builder's configured targets and provider to produce the metadata; keep its publish configuration in force. Its packaging invocation needs to generate update metadata without independently uploading the GitHub Release (for example the existing build with `electron-builder --publish never`, after checking it emits the provider's metadata and signed sidecars). Preserve the artifacts produced for each target, including required archives, installers, `.blockmap` files, and any signature sidecars. Check the packaged `app-update.yml` or explicit provider configuration to establish which filenames the client requests. Typical names are `latest.yml`, `latest-mac.yml`, `latest-linux.yml`, and equivalent names with the configured Beta channel.

Treat the generated metadata as authoritative. A typical payload has the following shape; extra fields and exact filenames depend on the builder/provider.

```yaml
version: 1.2.0
files:
  - url: example-1.2.0-x64.exe
    sha512: <base64-encoded SHA-512>
    size: 1048576
path: example-1.2.0-x64.exe
sha512: <base64-encoded SHA-512>
releaseDate: '2026-11-09T00:00:00.000Z'
```

Compare `version` to the release, resolve each URL according to the provider, and verify that its referenced bytes, size and SHA-512 match. For GitHub Release attachments keep the exact names and relative paths expected by the native GitHub provider. For a generic Pages or raw endpoint, relative metadata paths resolve against that endpoint. Use the existing provider's supported absolute asset URLs when assets live on GitHub Releases; confirm with a packaged client. Preserve the existing signed-manifest production pipeline when the client requires it. Editing generated YAML may invalidate its signature; regenerate and sign using the project's configured build tool if needed.

### Electron and Sparkle producer template

Configure the existing build to place the exact final metadata and sidecars in the release assets directory. For Electron, define `feed.electron.metadata` like `{"stable":{"latest.yml":"latest.yml"},"beta":{"beta.yml":"beta.yml"}}` (public path → staged filename). For a Stable release whose metadata can also be fetched by a Beta client, stage that channel's correct output from the builder. Reusing a byte-identical metadata file under a Beta filename is appropriate only after confirming the installed provider and manifest signing behavior. Projects that already implement native GitHub prerelease selection can reuse the same builder filenames in both maps. Verify Stable/Beta discovery and promotion with the actual provider. For Sparkle set `feed.provider` to `sparkle` and use `feed.sparkle.metadata` for the staged appcasts. Validate metadata before copying, using Ruby/Psych for Electron or Python 3 for Sparkle on the distribution runner.

```bash
#!/usr/bin/env bash
set -euo pipefail
version=$1 assets=$2 output=$3
config=.github/release-setup.json
provider=$(jq -er '.feed.provider // "electron"' "$config")
base="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:?}/releases/download/${RELEASE_TAG:-v$version}/"

validate_electron() {
  ruby -rpsych -rdigest -rbase64 -ruri -rdate - "$version" "$assets" "$base" "$1" <<'RUBY'
version, assets, base, path = ARGV
data = Psych.safe_load_file(path, permitted_classes: [Date, Time], aliases: false)
abort "Wrong Electron metadata version" unless data.fetch("version") == version
files = data["files"] || [data.merge("url" => data.fetch("path"))]
abort "No Electron update files" unless files.is_a?(Array) && !files.empty?
files.each do |item|
  location = item.fetch("url")
  if location.start_with?("https://")
    abort "Unexpected download origin" unless location.start_with?(base)
    location = location.delete_prefix(base)
  elsif ENV["FEED_KIND"] != "release"
    abort "A branch feed needs absolute URLs to these Release assets"
  end
  name = URI::DEFAULT_PARSER.unescape(location)
  abort "Unsafe asset name" unless name.match?(/\A[A-Za-z0-9_][A-Za-z0-9_.-]*\z/)
  artifact = File.join(assets, name)
  digest = Base64.strict_encode64(Digest::SHA512.file(artifact).digest)
  abort "Electron SHA-512 mismatch" unless digest == item.fetch("sha512")
  abort "Electron size mismatch" if item["size"] && File.size(artifact) != item["size"]
end
RUBY
}

validate_sparkle() {
  python3 - "$version" "$assets" "$base" "$1" <<'PYCODE'
import base64
from pathlib import Path
import re
import sys
from urllib.parse import unquote
import xml.etree.ElementTree as ET

version, assets, base, path = sys.argv[1:]
namespace = "{http://www.andymatuschak.org/xml-namespaces/sparkle}"
items = ET.parse(path).findall("./channel/item")
current = [item for item in items if
           (item.findtext(namespace + "shortVersionString")
            or item.findtext(namespace + "version")) == version]
if not current:
    raise SystemExit("No Sparkle item matches the release version")
for item in current:
    if not item.findtext(namespace + "version"):
        raise SystemExit("Sparkle item has no build version")
    enclosure = item.find("enclosure")
    if enclosure is None:
        raise SystemExit("Sparkle item has no enclosure")
    url = enclosure.get("url", "")
    if not url.startswith(base):
        raise SystemExit("Unexpected Sparkle download origin")
    name = unquote(url[len(base):])
    if not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.-]*", name):
        raise SystemExit("Unsafe Sparkle asset name")
    archive = Path(assets, name)
    if not archive.is_file() or archive.stat().st_size != int(enclosure.get("length", "-1")):
        raise SystemExit("Sparkle archive size mismatch")
    signature = base64.b64decode(enclosure.get(namespace + "edSignature", ""), validate=True)
    if len(signature) != 64:
        raise SystemExit("Invalid Sparkle EdDSA signature encoding")
PYCODE
}

if [[ $version == *-beta.* ]]; then channels=(beta)
elif [[ $CHANNEL_MODE == stable-beta ]]; then channels=(stable beta)
else channels=(stable)
fi
for channel in "${channels[@]}"; do
  jq -e --arg c "$channel" --arg p "$provider" '.feed[$p].metadata[$c] | type == "object" and length > 0' "$config" >/dev/null
  while IFS=$'\t' read -r destination source; do
    [[ $source =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$ && -s $assets/$source ]] || exit 1
    [[ $destination =~ ^[a-zA-Z0-9_][a-zA-Z0-9_./-]*$ ]] || exit 1
    [[ /$destination/ != */../* && /$destination/ != */.git/* && /$destination/ != */./* ]] || exit 1
    case "$provider:$destination" in
      electron:*.yml|electron:*.yaml) validate_electron "$assets/$source" ;;
      sparkle:*.xml) validate_sparkle "$assets/$source" ;;
      electron:*.sig|sparkle:*.sig) ;; # Preserve signature bytes from the official generator.
      *) echo "Adapt the validator for this provider sidecar: $destination" >&2; exit 1 ;;
    esac
    mkdir -p "$(dirname "$output/$channel/$destination")"
    cp "$assets/$source" "$output/$channel/$destination"
  done < <(jq -r --arg c "$channel" --arg p "$provider" '.feed[$p].metadata[$c] | to_entries[] | [.key,.value] | @tsv' "$config")
done
```

When using a branch feed, stage Electron metadata under names that cannot collide with publicly served feed files. When using Release attachments, upload byte-identical files with matching basenames only once.

## Sparkle 2

Use the release version for the public tag and the app's existing `CFBundleVersion` for update ordering. Preserve the configured appcast URL and format, and validate against the archived app's `CFBundleShortVersionString` and `CFBundleVersion`. A Sparkle feed can use separate appcasts per channel or a shared appcast with Sparkle channel identifiers. The release version comparator is only suitable when the app's existing build-number ordering agrees; require the build pipeline to prove increasing build numbers independently.

```xml
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Example App Updates</title>
    <item>
      <title>Version 1.2.0</title>
      <sparkle:version>120</sparkle:version>
      <sparkle:shortVersionString>1.2.0</sparkle:shortVersionString>
      <pubDate>Mon, 09 Nov 2026 00:00:00 +0000</pubDate>
      <enclosure url="https://github.com/example/app/releases/download/v1.2.0/example.zip"
                 sparkle:edSignature="BASE64_SIGNATURE"
                 length="1048576"
                 type="application/octet-stream" />
    </item>
  </channel>
</rss>
```

Use Sparkle's official `generate_appcast` in the project's macOS build, with the project's signing setup and exact public download prefix. Stage existing archives and feed history when retaining entries or generating deltas. For a single versioned GitHub asset directory, a basic invocation is shown below. For shared appcasts, preserve unaffected channel entries and use `sparkle:channel` according to the app's configuration; for separate appcasts, a Stable update can be staged under the Beta path for promotion. A feed generated from prior history must use the exact baseline that will be replaced; make the publisher compare the prior digest or regenerate from current verified state before applying, and re-sign where configured. Include any required delta archives or signed release notes before publishing.

```bash
# Run within the existing trusted macOS build before uploading its artifacts.
download_prefix="${GITHUB_SERVER_URL:-https://github.com}/$GITHUB_REPOSITORY/releases/download/$RELEASE_TAG/"
"$SPARKLE_BIN/generate_appcast" --download-url-prefix "$download_prefix" "$archive_directory"
```

On the distribution runner, stage the appcasts under their configured paths with the shared producer above and `feed.provider: "sparkle"`. The template checks the enclosure URL, archive length, release version and signature encoding. Retain the build pipeline's verification of the build number and its signing steps. Keep the original bytes of signed appcasts. Shared or signed history which requires a different publishing lock must supply an adapted producer and baseline check before enabling automatic updates.

## Compatibility checks

- For a first Stable release with no prior feed, start from an empty channel. When a prior feed exists, inspect its version and preserve its paths; an unknown or malformed baseline blocks setup until reconciled.
- For a shared appcast or GitHub Release selection handled by the installed updater, verify Stable cannot see a Beta as Stable. An attachment URL with a fixed historical tag cannot receive future releases without an existing redirect or native provider selection.
- Resolve each emitted asset URL (and any signature or delta URL) to a known uploaded basename. Do not publish the feed until every required download exists. A successful HTTP request for the feed itself is not proof its linked assets or signatures are correct.

Sources: [Tauri updater](https://v2.tauri.app/plugin/updater/), [electron-builder auto-update](https://www.electron.build/docs/features/auto-update/), [electron-builder release channels](https://www.electron.build/docs/tutorials/release-using-channels/), [Sparkle publishing](https://sparkle-project.org/documentation/publishing/).
