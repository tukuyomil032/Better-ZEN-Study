#!/usr/bin/env node
// Asks GitHub to prepare a release pull request for the given version. Run it from the project's
// main branch, after the changes are committed and pushed:
//
//   bun run release 0.1.0            # checks, then starts the Prepare release workflow
//   bun run release 0.1.0 --dry-run  # checks only; prints the command, runs nothing on GitHub
//
// The workflow (.github/workflows/prepare-release.yml) edits the version and opens the pull
// request. Merging that pull request starts the build and publishes the release.

import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import process from "node:process";

const WORKFLOW_FILE = "prepare-release.yml";
const VERSION_SETUP = ".github/release-setup.json";
const LAUNCHER = "./scripts/intelirelease";

function fail(message) {
  throw new Error(message);
}

// Runs a command and returns its trimmed output; a failure stops the script with the command's own message.
function run(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error?.code === "ENOENT") fail(`${command} was not found. Install it and try again.`);
  if (result.error) fail(`Unable to run ${command}: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) {
    const detail = (result.stderr || result.stdout || "").trim();
    fail(
      `${command} ${args.join(" ")} failed${detail ? `: ${detail}` : ` (exit code ${result.status})`}`,
    );
  }
  return { ok: result.status === 0, output: (result.stdout ?? "").trim() };
}

function assertMainBranch() {
  const branch = run("git", ["branch", "--show-current"]).output;
  if (!branch) fail("HEAD is detached. Check out main and try again.");
  if (branch !== "main")
    fail(`Release preparation must run from branch "main"; current branch is "${branch}".`);
}

// The local main must be exactly what GitHub's main has, or the workflow would not build what is here.
function assertPushed() {
  const dirty = run("git", ["status", "--porcelain"]).output;
  if (dirty)
    fail("There are changes that are not committed. Commit them, push main, and try again.");
  const local = run("git", ["rev-parse", "HEAD"]).output;
  const remote =
    run("git", ["ls-remote", "--heads", "origin", "main"]).output.split(/\s+/)[0] ?? "";
  if (!remote) fail("origin has no main branch yet. Push the project to GitHub first.");
  if (local !== remote) {
    fail(
      "Local main is not the same as origin/main. Push your commits (or pull, if GitHub is ahead) and try again.",
    );
  }
}

// The version as the launcher reads it, and the version the release asks for, checked against it.
function readCurrentVersion() {
  return run(LAUNCHER, ["read-version", VERSION_SETUP]).output;
}

function normalizeVersion(input, current) {
  const requested = input.trim().replace(/^v/, "");
  const checked = run(LAUNCHER, ["version", requested, current], { allowFailure: true });
  if (!checked.ok) {
    fail(
      `"${input}" is not a version after ${current}. Use X.Y.Z, and make it larger than the current version.`,
    );
  }
  if (checked.output.includes("-beta.")) {
    fail(
      `"${checked.output}" is a beta version. The stable channel does not accept beta versions here.`,
    );
  }
  return checked.output;
}

function assertTagFree(version) {
  const tag = run("git", ["ls-remote", "--tags", "origin", `refs/tags/v${version}`]).output;
  if (tag) fail(`The tag v${version} already exists on origin. Choose a larger version.`);
}

function assertGh() {
  const installed = run("gh", ["--version"], { allowFailure: true });
  if (!installed.ok)
    fail("GitHub CLI (gh) is not available. Install it from https://cli.github.com/.");
  const authenticated = run("gh", ["auth", "status", "--hostname", "github.com"], {
    allowFailure: true,
  });
  if (!authenticated.ok) fail("GitHub CLI is not logged in. Run `gh auth login`, then try again.");
}

async function askVersion() {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await readline.question("Release version (X.Y.Z): ");
  } finally {
    readline.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const positional = args.filter((arg) => arg !== "--dry-run");
  if (positional.length > 1) fail("Usage: bun run release [X.Y.Z] [--dry-run]");

  assertMainBranch();
  const current = readCurrentVersion();
  const version = normalizeVersion(positional[0] ?? (await askVersion()), current);
  assertPushed();
  assertTagFree(version);
  assertGh();

  const command = `gh workflow run ${WORKFLOW_FILE} --ref main --field version=${version}`;
  if (dryRun) {
    console.log(`Checks passed for v${version} (current version ${current}).`);
    console.log(`Would run: ${command}`);
    console.log("Nothing was started on GitHub (--dry-run).");
    return;
  }

  run("gh", ["workflow", "run", WORKFLOW_FILE, "--ref", "main", "--field", `version=${version}`]);
  const latest = run(
    "gh",
    [
      "run",
      "list",
      "--workflow",
      WORKFLOW_FILE,
      "--limit",
      "1",
      "--json",
      "url",
      "--jq",
      ".[0].url",
    ],
    {
      allowFailure: true,
    },
  ).output;
  console.log(`Release preparation started for v${version}.`);
  if (latest) console.log(`Watch the workflow: ${latest}`);
  console.log(
    "Review and merge the pull request it opens. The release is published after that merge.",
  );
}

main().catch((error) => {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
