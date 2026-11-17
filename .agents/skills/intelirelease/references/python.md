# Python release helper

Save the following block as `scripts/intelirelease.py` and run it with Python 3.9 or later. Paths in the input are relative to the working directory. This generates a new Cask; for a bespoke existing Cask, adapt the update to its existing structure rather than replacing unrelated content. Review every prepared diff before publishing.

```python
#!/usr/bin/env python3
import base64
import datetime
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

VERSION = re.compile(r"v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-beta\.([1-9][0-9]*))?\Z")

def version(value):
    if not isinstance(value, str) or not (m := VERSION.fullmatch(value)):
        raise ValueError("invalid version")
    return value.removeprefix("v")

def compare(a, b):
    def key(v):
        m = VERSION.fullmatch(version(v))
        x, y, z, beta = m.groups()
        return (int(x), int(y), int(z), 1 if beta is None else 0, int(beta or 0))
    x, y = key(a), key(b)
    return (x > y) - (x < y)

def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))

def url(value):
    if not isinstance(value, str) or urlparse(value).scheme != "https" or not urlparse(value).hostname or any(c.isspace() for c in value):
        raise ValueError("expected HTTPS URL")
    return value

def nonempty(path):
    p = Path(path)
    if not p.is_file() or p.stat().st_size == 0:
        raise ValueError("missing or empty file: " + str(path))
    return p

def signature(path):
    data = nonempty(path).read_text(encoding="utf-8").strip()
    try:
        decoded = base64.b64decode(data, validate=True).decode("utf-8")
        lines = decoded.strip().splitlines()
        if len(lines) != 4 or not lines[0].startswith("untrusted comment:") or not lines[2].startswith("trusted comment:"):
            raise ValueError()
        if len(base64.b64decode(lines[1], validate=True)) != 74 or len(base64.b64decode(lines[3], validate=True)) != 64:
            raise ValueError()
    except Exception as exc:
        raise ValueError("invalid Tauri signature file") from exc
    return data

def tauri(data):
    v = version(data["version"])
    date = data["pub_date"]
    if not isinstance(date, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z", date):
        raise ValueError("pub_date must be RFC3339 UTC")
    datetime.datetime.fromisoformat(date[:-1] + "+00:00")
    if not isinstance(data["notes"], str) or not isinstance(data["platforms"], dict) or not data["platforms"]:
        raise ValueError("invalid feed")
    platforms = {}
    for target, item in data["platforms"].items():
        if not isinstance(target, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", target):
            raise ValueError("invalid target")
        nonempty(item["asset_file"])
        platforms[target] = {"signature": signature(item["signature_file"]), "url": url(item["url"])}
    out = {"version": v, "notes": data["notes"], "pub_date": date}
    if "target" in data:
        if data["target"] not in platforms:
            raise ValueError("target not found")
        out.update(platforms[data["target"]])
    else:
        out["platforms"] = platforms
    return out

def ruby(s):
    if not isinstance(s, str) or any(ord(c) < 32 for c in s):
        raise ValueError("invalid Cask text")
    return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("#", "\\#") + "\""

def cask(data):
    v = version(data["version"])
    slug = data["slug"]
    if not isinstance(slug, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise ValueError("invalid slug")
    arts = data["artifacts"]
    if not isinstance(arts, dict) or not arts or set(arts) - {"arm64", "x64"}:
        raise ValueError("invalid architectures")
    fields = {}
    for arch, item in arts.items():
        file = nonempty(item["file"])
        h = hashlib.sha256()
        with file.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                h.update(chunk)
        fields[arch] = (url(item["url"]), h.hexdigest())
    lines = ["cask " + ruby(slug) + " do", "  version " + ruby(v)]
    if len(fields) == 1:
        u, sha = next(iter(fields.values()))
        lines += ["  sha256 " + ruby(sha), "", "  url " + ruby(u)]
    else:
        lines += ["  on_arm do", "    sha256 " + ruby(fields["arm64"][1]), "    url " + ruby(fields["arm64"][0]), "  end", "", "  on_intel do", "    sha256 " + ruby(fields["x64"][1]), "    url " + ruby(fields["x64"][0]), "  end"]
    lines += ["  name " + ruby(data["name"]), "  desc " + ruby(data["description"]), "  homepage " + ruby(url(data["homepage"])), "", "  app " + ruby(data["name"] + ".app"), "end"]
    return "\n".join(lines)

def files(data):
    entries = data["versionFiles"]
    if not isinstance(entries, list) or not entries:
        raise ValueError("versionFiles must be nonempty")
    result = []
    paths = set()
    for item in entries:
        p = Path(item["path"])
        resolved = p.resolve()
        if not resolved.is_relative_to(Path.cwd().resolve()):
            raise ValueError("path outside workspace")
        if resolved in paths:
            raise ValueError("duplicate file")
        paths.add(resolved)
        raw = p.read_text(encoding="utf-8")
        kind = item["kind"]
        if kind == "json":
            obj = json.loads(raw)
            keys = item["key"].split(".")
            if any(not k for k in keys):
                raise ValueError("invalid JSON key")
            ref = obj
            for key in keys[:-1]:
                ref = ref[key]
            current = version(ref[keys[-1]])
            result.append((p, kind, obj, ref, keys[-1], current))
        elif kind == "text":
            prefix, suffix = item["prefix"], item["suffix"]
            if not isinstance(prefix, str) or not isinstance(suffix, str) or not suffix or re.match(r"[A-Za-z0-9_.+-]", suffix):
                raise ValueError("text suffix must be nonempty")
            pattern = re.compile(re.escape(prefix) + r"(v?(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-beta\.(?:[1-9][0-9]*))?)" + re.escape(suffix))
            matches = list(pattern.finditer(raw))
            if len(matches) != 1:
                raise ValueError("text pattern must match exactly once")
            m = matches[0]
            result.append((p, kind, raw, m.start(1), m.end(1), version(m.group(1))))
        else:
            raise ValueError("unsupported kind")
    if any(compare(result[0][-1], entry[-1]) != 0 for entry in result[1:]):
        raise ValueError("version mirrors disagree")
    return result

def prepare(v, data):
    v = version(v)
    entries = files(data)
    if compare(v, entries[0][-1]) <= 0:
        raise ValueError("new version must be greater than current")
    changes = []
    for p, kind, content, ref, key, current in entries:
        if kind == "json":
            ref[key] = v
            content = json.dumps(content, ensure_ascii=False, indent=2) + "\n"
        else:
            content = content[:ref] + v + content[key:]
        changes.append((p, content))
    if "changelog" in data:
        entry = data["changelog"]
        p = Path(entry["path"])
        if not p.resolve().is_relative_to(Path.cwd().resolve()):
            raise ValueError("path outside workspace")
        if p.resolve() in {x[0].resolve() for x in changes} or not isinstance(entry["notes"], str):
            raise ValueError("invalid changelog")
        old = p.read_text(encoding="utf-8")
        changes.append((p, "## " + v + "\n\n" + entry["notes"].strip() + "\n\n" + old))
    for p, content in changes:
        p.write_text(content, encoding="utf-8")

def main(args):
    cmd, *a = args
    if cmd == "version" and len(a) in (1, 2):
        v = version(a[0])
        if len(a) == 2 and compare(v, a[1]) <= 0:
            raise ValueError("version must be greater than current")
        print(v)
    elif cmd == "compare" and len(a) == 2:
        print(compare(*a))
    elif cmd == "route" and 2 <= len(a) <= 4:
        channel, v = a[:2]
        if channel not in ("stable", "stable-beta"):
            raise ValueError("invalid channel configuration")
        v = version(v)
        stable, beta = (a[2:] + ["", ""])[:2]
        for old in (stable, beta):
            if old:
                version(old)
        is_beta = "-beta." in v
        if is_beta and channel != "stable-beta":
            raise ValueError("beta channel disabled")
        if is_beta:
            if stable and compare(v, stable) <= 0 or beta and compare(v, beta) < 0:
                raise ValueError("stale beta")
            out = ["beta"]
        else:
            if stable and compare(v, stable) < 0:
                raise ValueError("stale stable")
            out = ["stable"]
            if channel == "stable-beta" and beta and compare(v, beta) > 0:
                out.append("beta")
        print(json.dumps(out))
    elif cmd == "tauri" and len(a) == 1:
        print(json.dumps(tauri(read_json(a[0])), ensure_ascii=False))
    elif cmd == "cask" and len(a) == 1:
        print(cask(read_json(a[0])))
    elif cmd == "read-version" and len(a) == 1:
        print(files(read_json(a[0]))[0][-1])
    elif cmd == "prepare" and len(a) == 2:
        prepare(a[0], read_json(a[1]))
    else:
        raise ValueError("invalid command or arguments")

if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except Exception as exc:
        print("error: " + str(exc), file=sys.stderr)
        sys.exit(1)
```
