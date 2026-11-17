#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHANGELOG_PATH = path.join(REPOSITORY_ROOT, "CHANGELOG.md");
const VERSION_PATTERN = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SECTION_ORDER = [
  "Breaking Changes",
  "Features",
  "Bug Fixes",
  "Performance",
  "Maintenance",
  "Other Changes",
];
const MAINTENANCE_TYPES = new Set([
  "build",
  "chore",
  "ci",
  "docs",
  "ref",
  "refactor",
  "style",
  "test",
]);
const CONVENTIONAL_COMMIT =
  /^(?<type>[a-z][a-z0-9-]*)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s*(?<subject>.+)$/i;
const MARKDOWN_SPECIAL_CHARACTERS = new Set(["\\", "\x60", "*", "_", "<", ">", "|", "[", "]"]);

function fail(message) {
  throw new Error(message);
}

function normalizeVersion(input) {
  if (typeof input !== "string" || !VERSION_PATTERN.test(input)) {
    fail("Expected a stable version in X.Y.Z format.");
  }
  return input.replace(/^v/, "");
}

function compareVersions(left, right) {
  const a = normalizeVersion(left).split(".").map(BigInt);
  const b = normalizeVersion(right).split(".").map(BigInt);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) fail("Unable to run git " + args[0] + ": " + result.error.message);
  if (result.status !== 0) {
    const detail = (result.stderr || "").trim();
    fail("git " + args.join(" ") + " failed" + (detail ? ": " + detail : "."));
  }
  return result.stdout;
}

function selectBaseRelease() {
  const payload = JSON.parse(fs.readFileSync(0, "utf8") || "[]");
  const releases = payload.flat(Infinity);
  let latest = null;
  for (const release of releases) {
    if (!release || release.draft || release.prerelease || typeof release.tag_name !== "string") {
      continue;
    }
    try {
      normalizeVersion(release.tag_name);
    } catch {
      continue;
    }
    if (!latest || compareVersions(release.tag_name, latest.tag_name) > 0) {
      latest = release;
    }
  }
  process.stdout.write(latest ? latest.tag_name : "");
}

function parseCommits(previousTag) {
  const args = ["log", "--no-merges", "--format=%H%x1f%s%x1f%b%x1e"];
  if (previousTag) {
    normalizeVersion(previousTag);
    args.push(previousTag + "..HEAD");
  } else {
    args.push("HEAD");
  }
  return runGit(args)
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const fields = record.split("\x1f");
      return {
        subject: (fields[1] || "").trim(),
        body: fields.slice(2).join("\x1f").trim(),
      };
    });
}

function classifyCommit(commit) {
  const conventional = CONVENTIONAL_COMMIT.exec(commit.subject);
  if (
    /^(?:chore(?:\(release\))?:\s*)?(?:prepare release|release(?:\s|:)|bump(?:ing)?\s+version)\b/i.test(
      commit.subject,
    ) ||
    (conventional?.groups?.type?.toLowerCase() === "chore" &&
      conventional.groups.scope === "release")
  ) {
    return null;
  }
  const breakingFooter = /^BREAKING CHANGE:\s*(.+)$/im.exec(commit.body);
  const isBreaking = Boolean(conventional?.groups?.breaking || breakingFooter);
  const type = conventional?.groups?.type?.toLowerCase();
  let section = "Other Changes";
  if (isBreaking) section = "Breaking Changes";
  else if (type === "feat") section = "Features";
  else if (type === "fix") section = "Bug Fixes";
  else if (type === "perf") section = "Performance";
  else if (type && MAINTENANCE_TYPES.has(type)) section = "Maintenance";
  const summary = breakingFooter?.[1]?.trim() || conventional?.groups?.subject || commit.subject;
  return { section, summary };
}

function escapeMarkdown(value) {
  return [...value]
    .map((character) => (MARKDOWN_SPECIAL_CHARACTERS.has(character) ? "\\" + character : character))
    .join("")
    .trim();
}

function generateNotes(version, previousTag) {
  normalizeVersion(version);
  if (previousTag && compareVersions(version, previousTag) <= 0) {
    fail("The target version must be newer than the previous published release.");
  }
  const buckets = new Map(SECTION_ORDER.map((section) => [section, []]));
  const seen = new Map(SECTION_ORDER.map((section) => [section, new Set()]));
  for (const commit of parseCommits(previousTag)) {
    const entry = classifyCommit(commit);
    if (!entry) continue;
    const summary = escapeMarkdown(entry.summary);
    if (!summary || seen.get(entry.section).has(summary)) continue;
    seen.get(entry.section).add(summary);
    buckets.get(entry.section).push(summary);
  }
  const sections = [];
  for (const section of SECTION_ORDER) {
    const entries = buckets.get(section);
    if (entries.length === 0) continue;
    sections.push("### " + section + "\n" + entries.map((entry) => "- " + entry).join("\n"));
  }
  if (sections.length === 0) fail("No commits were found for this release.");
  return sections.join("\n\n") + "\n";
}

function readReleaseSection(version) {
  const normalized = normalizeVersion(version);
  const changelog = fs.readFileSync(CHANGELOG_PATH, "utf8");
  const lines = changelog.split(/\r?\n/);
  const heading = "## v" + normalized;
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) fail("CHANGELOG.md does not contain " + heading + ".");
  let end = start + 1;
  while (end < lines.length && !/^##\s+/.test(lines[end])) end += 1;
  return lines.slice(start, end).join("\n").trimEnd() + "\n";
}

function main(args) {
  const [command, ...values] = args;
  if (command === "base" && values.length === 0) {
    selectBaseRelease();
  } else if (command === "generate" && (values.length === 1 || values.length === 2)) {
    process.stdout.write(generateNotes(values[0], values[1] || ""));
  } else if (command === "section" && values.length === 1) {
    process.stdout.write(readReleaseSection(values[0]));
  } else {
    fail("Usage: node scripts/changelog.mjs <base|generate|section> [version] [previous-tag]");
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error("ERROR: " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
