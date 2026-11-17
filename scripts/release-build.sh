#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || -z ${1:-} ]]; then
  echo "Usage: $0 VERSION" >&2
  exit 2
fi
VERSION=$1

bun run zip

shopt -s nullglob
files=()
for candidate in .output/*-chrome.zip; do
  [[ -f "$candidate" ]] && files+=("$candidate")
done
if [[ ${#files[@]} -ne 1 ]]; then
  echo "Expected exactly one .output/*-chrome.zip file, found ${#files[@]}." >&2
  exit 1
fi

artifact=${files[0]}
basename=${artifact##*/}
if [[ "$basename" != *"$VERSION"* ]]; then
  echo "Chrome zip name '$basename' does not contain version '$VERSION'." >&2
  exit 1
fi

rm -rf -- dist
mkdir -p dist
cp -- "$artifact" "dist/$basename"
