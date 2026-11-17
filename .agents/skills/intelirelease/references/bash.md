# Bash release helper

Save this block as `scripts/intelirelease.sh`; it requires Bash, jq, OpenSSL, shasum and standard Unix tools. Paths are relative to the working directory. This generates a new Cask; adapt a bespoke existing Cask in place so unrelated content is preserved. Review prepared diffs before publishing.

```bash
#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }
tmp=$(mktemp -d "${TMPDIR:-/tmp}/release.XXXXXXXX") || exit 1
trap 'rm -rf "$tmp"' EXIT
tee "$tmp/lib.jq" > /dev/null <<'JQ'
def norm:
  if type != "string" or (test("^v?(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-beta\\.([1-9][0-9]*))?\\z")|not)
  then error("invalid version") else sub("^v"; "") end;
def parts: norm | capture("^(?<a>[0-9]+)\\.(?<b>[0-9]+)\\.(?<c>[0-9]+)(-beta\\.(?<d>[0-9]+))?$");
def nc($a;$b): if ($a|length)>($b|length) then 1 elif ($a|length)<($b|length) then -1 elif $a>$b then 1 elif $a<$b then -1 else 0 end;
def cmp($a;$b): ($a|parts) as $x | ($b|parts) as $y |
  nc($x.a;$y.a) as $a1 | nc($x.b;$y.b) as $b1 | nc($x.c;$y.c) as $c1 |
  if $a1 != 0 then $a1 elif $b1 != 0 then $b1 elif $c1 != 0 then $c1
  elif $x.d == null and $y.d != null then 1 elif $x.d != null and $y.d == null then -1
  elif $x.d == null then 0 else nc($x.d;$y.d) end;
def https: if type == "string" and test("^https://[^/?#[:space:]]+([^[:space:]]*)$") then . else error("expected HTTPS URL") end;
def ruby: if type == "string" and (explode|all(. >= 32)) then @json | gsub("#"; "\\#") else error("invalid Cask text") end;
JQ
j() { jq -L "$tmp" "$@"; }
valid_version() { j -nr --arg v "$1" 'include "lib"; $v|norm'; }
compare() { j -nr --arg a "$1" --arg b "$2" 'include "lib"; cmp($a;$b)'; }
nonempty() { [ -f "$1" ] && [ -s "$1" ] || fail "missing or empty file: $1"; }
decode64() { openssl base64 -d -A; }
input() { [ -f "$1" ] || fail "input file not found"; jq -e . "$1" > /dev/null; }
read_files() {
  local spec=$1 count i item path kind current raw prefix suffix key index start end seen other
  count=$(jq -er '.versionFiles | if type == "array" and length > 0 then length else error("versionFiles must be nonempty") end' "$spec")
  : > "$tmp/paths"
  i=0
  while [ "$i" -lt "$count" ]; do
    item=$(jq -c --argjson i "$i" '.versionFiles[$i]' "$spec")
    path=$(printf '%s' "$item" | jq -er '.path | strings')
    [ -f "$path" ] || fail "missing version file: $path"
    # Canonicalize through the parent directory and reject duplicates.
    path=$(realpath "$path")
    case "$path" in "$(pwd -P)"/*) ;; *) fail "path outside workspace";; esac
    while IFS= read -r other; do [ "$other" != "$path" ] || fail "duplicate version file"; done < "$tmp/paths"
    printf '%s\n' "$path" >> "$tmp/paths"
    printf '%s' "$path" > "$tmp/path.$i"
    kind=$(printf '%s' "$item" | jq -er '.kind | strings')
    printf '%s' "$kind" > "$tmp/kind.$i"
    printf '%s' "$item" > "$tmp/item.$i"
    if [ "$kind" = json ]; then
      key=$(printf '%s' "$item" | jq -er '.key | strings | select(length > 0 and (split(".")|all(length > 0)))')
      current=$(jq -er --arg key "$key" 'getpath($key|split(".")) | strings' "$path")
    elif [ "$kind" = text ]; then
      # jq reads the entire file, including trailing newlines, and identifies exactly one literal prefix/version/suffix match.
      current=$(jq -Rsr --argjson item "$item" '
        def esc: gsub("[][(){}.*+?^$|\\\\]"; "\\\\\\(.)");
        if ($item.prefix|type)!="string" or ($item.suffix|type)!="string" or ($item.suffix|length)==0 or ($item.suffix|test("^[A-Za-z0-9_.+-]")) then error("invalid delimiters") else . end |
        [match(($item.prefix|esc)+"(?<v>v?(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)(?:-beta\\.(?:[1-9][0-9]*))?)"+($item.suffix|esc); "g") | .captures[0].string] |
        if length == 1 then .[0] else error("text pattern must match exactly once") end' "$path")
    else fail "unsupported kind"; fi
    current=$(valid_version "$current")
    if [ "$i" -eq 0 ]; then printf '%s' "$current" > "$tmp/current";
    else [ "$(compare "$(<"$tmp/current")" "$current")" = 0 ] || fail "version mirrors disagree"; fi
    i=$((i+1))
  done
  printf '%s' "$count" > "$tmp/count"
}
validate_date() {
  printf '%s\n' "$1" | awk '
  /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9](\.[0-9]+)?Z$/ {
    y=substr($0,1,4)+0; m=substr($0,6,2)+0; d=substr($0,9,2)+0; h=substr($0,12,2)+0; n=substr($0,15,2)+0; s=substr($0,18,2)+0;
    split("31 28 31 30 31 30 31 31 30 31 30 31", days, " "); if (y%4==0 && (y%100!=0 || y%400==0)) days[2]=29;
    if(y>=1 && m>=1 && m<=12 && d>=1 && d<=days[m] && h<24 && n<60 && s<60) ok=1
  } END {exit !ok}' || fail "invalid UTC date"
}
signature() {
  local path=$1 encoded line1 line2 line3 line4 len
  nonempty "$path"
  encoded=$(<"$path")
  printf '%s' "$encoded" | jq -Rse 'test("^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$")' > /dev/null || fail "invalid signature encoding"
  printf '%s' "$encoded" | decode64 > "$tmp/signature" || fail "invalid signature"
  [ "$(awk 'END {print NR}' "$tmp/signature")" = 4 ] || fail "invalid signature"
  line1=$(sed -n '1p' "$tmp/signature"); line2=$(sed -n '2p' "$tmp/signature"); line3=$(sed -n '3p' "$tmp/signature"); line4=$(sed -n '4p' "$tmp/signature")
  case "$line1" in 'untrusted comment:'*) ;; *) fail "invalid signature";; esac
  case "$line3" in 'trusted comment:'*) ;; *) fail "invalid signature";; esac
  for line in "$line2" "$line4"; do printf '%s' "$line" | jq -Rse 'test("^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$")' >/dev/null || fail "invalid signature"; done
  len=$(printf '%s' "$line2" | decode64 | wc -c | tr -d ' '); [ "$len" = 74 ] || fail "invalid signature"
  len=$(printf '%s' "$line4" | decode64 | wc -c | tr -d ' '); [ "$len" = 64 ] || fail "invalid signature"
  printf '%s' "$encoded"
}
cmd=${1:-}; [ "$#" -gt 0 ] && shift || true
case "$cmd" in
version)
  [ "$#" -eq 1 ] || [ "$#" -eq 2 ] || fail "invalid arguments"
  v=$(valid_version "$1"); if [ "$#" -eq 2 ]; then [ "$(compare "$v" "$2")" = 1 ] || fail "version must increase"; fi; printf '%s\n' "$v" ;;
compare)
  [ "$#" -eq 2 ] || fail "invalid arguments"; compare "$1" "$2" ;;
route)
  [ "$#" -ge 2 ] && [ "$#" -le 4 ] || fail "invalid arguments"
  channel=$1; v=$(valid_version "$2"); stable=${3:-}; beta=${4:-}
  [ "$channel" = stable ] || [ "$channel" = stable-beta ] || fail "invalid channel"
  [ -z "$stable" ] || valid_version "$stable" > /dev/null
  [ -z "$beta" ] || valid_version "$beta" > /dev/null
  case "$v" in *-beta.*)
    [ "$channel" = stable-beta ] || fail "beta channel disabled"
    if [ -n "$stable" ] && [ "$(compare "$v" "$stable")" != 1 ]; then fail "stale beta"; fi
    if [ -n "$beta" ] && [ "$(compare "$v" "$beta")" = -1 ]; then fail "stale beta"; fi
    printf '["beta"]\n' ;;
  *)
    if [ -n "$stable" ] && [ "$(compare "$v" "$stable")" = -1 ]; then fail "stale stable"; fi
    if [ "$channel" = stable-beta ] && [ -n "$beta" ] && [ "$(compare "$v" "$beta")" = 1 ]; then printf '["stable","beta"]\n'; else printf '["stable"]\n'; fi ;;
  esac ;;
read-version)
  [ "$#" -eq 1 ] || fail "invalid arguments"; input "$1"; read_files "$1"; printf '%s\n' "$(<"$tmp/current")" ;;
prepare)
  [ "$#" -eq 2 ] || fail "invalid arguments"; v=$(valid_version "$1"); spec=$2; input "$spec"; read_files "$spec"
  [ "$(compare "$v" "$(<"$tmp/current")")" = 1 ] || fail "version must increase"
  count=$(<"$tmp/count"); i=0
  while [ "$i" -lt "$count" ]; do
    path=$(<"$tmp/path.$i"); kind=$(<"$tmp/kind.$i"); item=$(<"$tmp/item.$i")
    if [ "$kind" = json ]; then
      key=$(printf '%s' "$item" | jq -r '.key'); jq --arg key "$key" --arg v "$v" 'setpath($key|split("."); $v)' "$path" > "$tmp/output.$i"
    else
      jq -Rsrj --argjson item "$item" --arg v "$v" '
        def esc: gsub("[][(){}.*+?^$|\\\\]"; "\\\\\\(.)");
        sub("(?<p>"+($item.prefix|esc)+")v?(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)(?:-beta\\.(?:[1-9][0-9]*))?(?<s>"+($item.suffix|esc)+")"; "\(.p)\($v)\(.s)")' "$path" > "$tmp/output.$i"
    fi
    i=$((i+1))
  done
  if jq -e 'has("changelog")' "$spec" >/dev/null; then
    cp=$(jq -er '.changelog.path | strings' "$spec"); [ -f "$cp" ] || fail "missing changelog"
    cp=$(realpath "$cp"); case "$cp" in "$(pwd -P)"/*) ;; *) fail "path outside workspace";; esac
    while IFS= read -r path; do [ "$path" != "$cp" ] || fail "duplicate changelog"; done < "$tmp/paths"
    jq -er '.changelog.notes | strings' "$spec" >/dev/null
    jq -nrj --arg v "$v" --slurpfile d "$spec" '"## "+$v+"\n\n"+($d[0].changelog.notes|gsub("^\\s+|\\s+$";""))+"\n\n"' > "$tmp/changelog"
    jq -Rsrj '.' "$cp" >> "$tmp/changelog"
  fi
  i=0; while [ "$i" -lt "$count" ]; do path=$(<"$tmp/path.$i"); cp "$tmp/output.$i" "$path"; i=$((i+1)); done
  if [ -f "$tmp/changelog" ]; then cp "$tmp/changelog" "$cp"; fi ;;
tauri)
  [ "$#" -eq 1 ] || fail "invalid arguments"; spec=$1; input "$spec"
  v=$(jq -er '.version|strings' "$spec"); v=$(valid_version "$v")
  date=$(jq -er '.pub_date|strings' "$spec"); validate_date "$date"
  jq -e '.notes|strings' "$spec" >/dev/null
  jq -e '.platforms | type == "object" and length > 0' "$spec" >/dev/null || fail "invalid platforms"
  printf '{}' > "$tmp/platforms"
  jq -r '.platforms|keys[]' "$spec" > "$tmp/targets"
  while IFS= read -r target; do
    printf '%s' "$target" | jq -Rse 'test("^[A-Za-z0-9_-]+$")' >/dev/null || fail "invalid target"
    entry=$(jq -c --arg t "$target" '.platforms[$t]' "$spec")
    asset=$(printf '%s' "$entry" | jq -er '.asset_file|strings'); nonempty "$asset"
    sigfile=$(printf '%s' "$entry" | jq -er '.signature_file|strings'); sig=$(signature "$sigfile")
    u=$(printf '%s' "$entry" | j -er 'include "lib"; .url|https')
    jq --arg t "$target" --arg u "$u" --arg s "$sig" '.[$t]={url:$u,signature:$s}' "$tmp/platforms" > "$tmp/next"; mv "$tmp/next" "$tmp/platforms"
  done < "$tmp/targets"
  jq -n --slurpfile d "$spec" --slurpfile p "$tmp/platforms" --arg v "$v" '
    {version:$v,notes:$d[0].notes,pub_date:$d[0].pub_date} +
    (if ($d[0]|has("target")) then $d[0].target as $t | if ($p[0]|has($t)) then $p[0][$t] else error("target not found") end else {platforms:$p[0]} end)' ;;
cask)
  [ "$#" -eq 1 ] || fail "invalid arguments"; spec=$1; input "$spec"
  v=$(jq -er '.version|strings' "$spec"); v=$(valid_version "$v")
  jq -e '.slug|strings|test("^[a-z0-9]+(-[a-z0-9]+)*$")' "$spec" >/dev/null || fail "invalid slug"
  j -e 'include "lib"; .homepage|https' "$spec" >/dev/null
  jq -e '.artifacts | type == "object" and length > 0 and (keys|all(. == "arm64" or . == "x64"))' "$spec" >/dev/null || fail "invalid architectures"
  jq -r '.artifacts|keys[]' "$spec" > "$tmp/arches"
  printf '{}' > "$tmp/artifacts"
  while IFS= read -r arch; do
    entry=$(jq -c --arg a "$arch" '.artifacts[$a]' "$spec"); asset=$(printf '%s' "$entry" | jq -er '.file|strings'); nonempty "$asset"
    u=$(printf '%s' "$entry" | j -er 'include "lib"; .url|https'); hash=$(shasum -a 256 "$asset" | awk '{print $1}')
    jq --arg a "$arch" --arg u "$u" --arg h "$hash" '.[$a]={url:$u,hash:$h}' "$tmp/artifacts" > "$tmp/next"; mv "$tmp/next" "$tmp/artifacts"
  done < "$tmp/arches"
  j -nr --slurpfile d "$spec" --slurpfile a "$tmp/artifacts" --arg v "$v" 'include "lib";
    $d[0] as $d | $a[0] as $a |
    ["cask "+($d.slug|ruby)+" do", "  version "+($v|ruby)] +
    (if ($a|length)==1 then ($a|to_entries[0].value) as $x | ["  sha256 "+($x.hash|ruby), "", "  url "+($x.url|ruby)]
    else ["  on_arm do", "    sha256 "+($a.arm64.hash|ruby), "    url "+($a.arm64.url|ruby), "  end", "", "  on_intel do", "    sha256 "+($a.x64.hash|ruby), "    url "+($a.x64.url|ruby), "  end"] end) +
    ["  name "+($d.name|ruby), "  desc "+($d.description|ruby), "  homepage "+($d.homepage|ruby), "", "  app "+(($d.name+".app")|ruby), "end"] | join("\n")' ;;
*) fail "invalid command" ;;
esac
```
