# JavaScript release helper

Save this block as `scripts/intelirelease.mjs` and run it with Node.js 18 or later. Input paths are relative to the working directory. This creates a new Cask; adapt updates to existing bespoke Casks without overwriting unrelated content. Review prepared diffs before publishing.

```javascript
#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const re = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.([1-9]\d*))?$(?![\s\S])/;
function version(v) {
  if (typeof v !== 'string' || !re.test(v)) throw Error('invalid version');
  return v.replace(/^v/, '');
}
function compare(a, b) {
  const key = v => { const m = re.exec(version(v)); return [BigInt(m[1]), BigInt(m[2]), BigInt(m[3]), BigInt(m[4] === undefined ? 1 : 0), BigInt(m[4] || 0)]; };
  const x = key(a), y = key(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
function file(p) { if (!fs.statSync(p).isFile() || !fs.statSync(p).size) throw Error('missing or empty file: ' + p); return fs.readFileSync(p); }
function url(s) { let u; try { u = new URL(s); } catch { throw Error('invalid URL'); } if (u.protocol !== 'https:' || !u.hostname || /\s/.test(s)) throw Error('expected HTTPS URL'); return s; }
function strict64(s) { if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s)) throw Error('invalid base64'); return Buffer.from(s, 'base64'); }
function signature(p) {
  const s = file(p).toString('utf8').trim(), lines = strict64(s).toString('utf8').trim().split(/\r?\n/);
  if (lines.length !== 4 || !lines[0].startsWith('untrusted comment:') || !lines[2].startsWith('trusted comment:') || strict64(lines[1]).length !== 74 || strict64(lines[3]).length !== 64) throw Error('invalid signature');
  return s;
}
function feed(d) {
  const v = version(d.version), dt = d.pub_date;
  if (typeof dt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(dt) || dt.startsWith('0000-') || Number.isNaN(Date.parse(dt)) || new Date(dt).toISOString().slice(0, 19) !== dt.slice(0, 19)) throw Error('invalid UTC date');
  if (typeof d.notes !== 'string' || !d.platforms || typeof d.platforms !== 'object' || Array.isArray(d.platforms) || !Object.keys(d.platforms).length) throw Error('invalid platforms');
  const platforms = Object.create(null);
  for (const [target, entry] of Object.entries(d.platforms)) {
    if (!/^[A-Za-z0-9_-]+$/.test(target)) throw Error('invalid target');
    file(entry.asset_file); platforms[target] = {signature: signature(entry.signature_file), url: url(entry.url)};
  }
  const result = {version: v, notes: d.notes, pub_date: dt};
  if (Object.hasOwn(d, 'target')) { if (!Object.hasOwn(platforms, d.target)) throw Error('target not found'); Object.assign(result, platforms[d.target]); }
  else result.platforms = platforms;
  return result;
}
function ruby(s) { if (typeof s !== 'string' || /[\x00-\x1f]/.test(s)) throw Error('invalid Cask text'); return '"' + s.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('#', '\\#') + '"'; }
function cask(d) {
  const v = version(d.version);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug)) throw Error('invalid slug');
  const keys = Object.keys(d.artifacts || {}); if (!keys.length || keys.some(k => !['arm64', 'x64'].includes(k))) throw Error('invalid architectures');
  const entries = Object.fromEntries(keys.map(k => [k, {url: url(d.artifacts[k].url), hash: crypto.createHash('sha256').update(file(d.artifacts[k].file)).digest('hex')}]));
  const lines = ['cask ' + ruby(d.slug) + ' do', '  version ' + ruby(v)];
  if (keys.length === 1) { const e = entries[keys[0]]; lines.push('  sha256 ' + ruby(e.hash), '', '  url ' + ruby(e.url)); }
  else for (const [arch, label] of [['arm64', 'arm'], ['x64', 'intel']]) { const e = entries[arch]; lines.push('  on_' + label + ' do', '    sha256 ' + ruby(e.hash), '    url ' + ruby(e.url), '  end'); if (arch === 'arm64') lines.push(''); }
  lines.push('  name ' + ruby(d.name), '  desc ' + ruby(d.description), '  homepage ' + ruby(url(d.homepage)), '', '  app ' + ruby(d.name + '.app'), 'end'); return lines.join('\n');
}
function files(d) {
  if (!Array.isArray(d.versionFiles) || !d.versionFiles.length) throw Error('versionFiles must be nonempty');
  const seen = new Set(), entries = [];
  for (const item of d.versionFiles) {
    const real = fs.realpathSync(item.path); const relative = path.relative(fs.realpathSync('.'), real); if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw Error('path outside workspace'); if (seen.has(real)) throw Error('duplicate file'); seen.add(real);
    const raw = fs.readFileSync(item.path, 'utf8');
    if (item.kind === 'json') {
      const obj = JSON.parse(raw), keys = item.key.split('.'); if (keys.some(k => !k)) throw Error('invalid key'); let ref = obj;
      for (const key of keys.slice(0, -1)) { if (ref === null || typeof ref !== 'object' || !Object.hasOwn(ref, key)) throw Error('missing key'); ref = ref[key]; } const key = keys.at(-1);
      if (!Object.hasOwn(ref, key)) throw Error('missing key'); entries.push({item, obj, ref, key, current: version(ref[key])});
    } else if (item.kind === 'text') {
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (typeof item.prefix !== 'string' || typeof item.suffix !== 'string' || !item.suffix || /^[A-Za-z0-9_.+-]/.test(item.suffix)) throw Error('invalid text delimiters');
      const rx = new RegExp(esc(item.prefix) + '(v?(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-beta\\.(?:0|[1-9]\\d*))?)' + esc(item.suffix), 'g');
      const matches = [...raw.matchAll(rx)]; if (matches.length !== 1) throw Error('text pattern must match once');
      const m = matches[0], start = m.index + item.prefix.length; entries.push({item, raw, start, end: start + m[1].length, current: version(m[1])});
    } else throw Error('unsupported kind');
  }
  if (entries.some(e => compare(entries[0].current, e.current) !== 0)) throw Error('version mirrors disagree');
  return entries;
}
function prepare(v, d) {
  v = version(v); const entries = files(d); if (compare(v, entries[0].current) <= 0) throw Error('new version must be greater than current');
  const changes = entries.map(e => { if (e.obj) { e.ref[e.key] = v; return [e.item.path, JSON.stringify(e.obj, null, 2) + '\n']; } return [e.item.path, e.raw.slice(0, e.start) + v + e.raw.slice(e.end)]; });
  if (d.changelog) { const c = d.changelog, real = fs.realpathSync(c.path), relative = path.relative(fs.realpathSync('.'), real); if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw Error('path outside workspace'); if (typeof c.notes !== 'string' || changes.some(([p]) => fs.realpathSync(p) === real)) throw Error('invalid changelog'); changes.push([c.path, '## ' + v + '\n\n' + c.notes.trim() + '\n\n' + fs.readFileSync(c.path, 'utf8')]); }
  for (const [p, content] of changes) fs.writeFileSync(p, content);
}
function main(args) {
  const [cmd, ...a] = args;
  if (cmd === 'version' && (a.length === 1 || a.length === 2)) { const v = version(a[0]); if (a.length === 2 && compare(v, a[1]) <= 0) throw Error('version must increase'); console.log(v); }
  else if (cmd === 'compare' && a.length === 2) console.log(compare(...a));
  else if (cmd === 'route' && a.length >= 2 && a.length <= 4) {
    const [channel, input, stable = '', beta = ''] = a, v = version(input); if (!['stable', 'stable-beta'].includes(channel)) throw Error('invalid channel'); if (stable) version(stable); if (beta) version(beta);
    let out; if (v.includes('-beta.')) { if (channel !== 'stable-beta' || (stable && compare(v, stable) <= 0) || (beta && compare(v, beta) < 0)) throw Error('stale or disabled beta'); out = ['beta']; }
    else { if (stable && compare(v, stable) < 0) throw Error('stale stable'); out = ['stable']; if (channel === 'stable-beta' && beta && compare(v, beta) > 0) out.push('beta'); } console.log(JSON.stringify(out));
  } else if (cmd === 'tauri' && a.length === 1) console.log(JSON.stringify(feed(read(a[0]))));
  else if (cmd === 'cask' && a.length === 1) console.log(cask(read(a[0])));
  else if (cmd === 'read-version' && a.length === 1) console.log(files(read(a[0]))[0].current);
  else if (cmd === 'prepare' && a.length === 2) prepare(a[0], read(a[1]));
  else throw Error('invalid command or arguments');
}
try { main(process.argv.slice(2)); } catch (error) { console.error('error: ' + error.message); process.exitCode = 1; }
```
