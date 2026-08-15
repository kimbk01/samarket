#!/usr/bin/env node
/**
 * Vercel Ignored Build Step
 *
 * Exit 0 → skip build (no Deploy / no Build CPU)
 * Exit 1 → proceed with build
 *
 * Skips Production/Preview builds when the commit only touches docs, markdown,
 * Cursor rules, QA logs, or other non-runtime paths. App/runtime changes always build.
 *
 * Force a build: put `[vercel build]` in the commit message.
 *
 * Local check:
 *   node scripts/vercel-ignored-build-step.mjs
 *   echo $?
 */
import { execSync } from "node:child_process";

const FORCE_TOKEN = "[vercel build]";

/** Directory prefixes that never affect the Next.js Production bundle. */
const SKIP_DIR_PREFIXES = [
  "docs/",
  ".cursor/",
  "scripts/qa/",
  "agent-transcripts/",
];

/** Exact paths that are safe to ignore. */
const SKIP_EXACT = new Set([
  "AGENTS.md",
  "AGENTS.md.backup",
  "CLAUDE.md",
  "README.md",
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  "LICENSE",
  "LICENSE.md",
]);

/** File extensions that are documentation / editor-only. */
const SKIP_EXTENSIONS = [".md", ".mdc", ".log", ".txt"];

function log(msg) {
  console.log(`[vercel-ignore-build] ${msg}`);
}

function run(cmd) {
  return execSync(cmd, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function listChangedFiles() {
  const previousSha = process.env.VERCEL_GIT_PREVIOUS_SHA?.trim();
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();

  if (previousSha && commitSha && previousSha !== commitSha) {
    try {
      const out = run(`git diff --name-only ${previousSha} ${commitSha}`);
      return out ? out.split("\n").filter(Boolean) : [];
    } catch {
      // fall through
    }
  }

  try {
    const out = run("git diff --name-only HEAD^ HEAD");
    return out ? out.split("\n").filter(Boolean) : [];
  } catch {
    return null;
  }
}

function isSkippable(file) {
  const normalized = file.replace(/\\/g, "/").replace(/^\.\//, "");

  if (SKIP_EXACT.has(normalized)) return true;
  if (SKIP_DIR_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;
  if (SKIP_EXTENSIONS.some((ext) => normalized.toLowerCase().endsWith(ext))) return true;

  return false;
}

function main() {
  const commitMessage =
    process.env.VERCEL_GIT_COMMIT_MESSAGE ||
    (() => {
      try {
        return run("git log -1 --pretty=%B");
      } catch {
        return "";
      }
    })();

  if (commitMessage.includes(FORCE_TOKEN)) {
    log(`force token ${FORCE_TOKEN} present → build`);
    process.exit(1);
  }

  const files = listChangedFiles();
  if (files === null) {
    log("could not resolve git diff → build (safe default)");
    process.exit(1);
  }

  if (files.length === 0) {
    log("no file changes detected → skip");
    process.exit(0);
  }

  const relevant = files.filter((f) => !isSkippable(f));
  if (relevant.length === 0) {
    log(`docs/non-runtime only (${files.length} file(s)) → skip`);
    for (const f of files.slice(0, 20)) log(`  skip: ${f}`);
    if (files.length > 20) log(`  … +${files.length - 20} more`);
    process.exit(0);
  }

  log(`runtime-relevant change(s) → build`);
  for (const f of relevant.slice(0, 30)) log(`  build: ${f}`);
  if (relevant.length > 30) log(`  … +${relevant.length - 30} more`);
  process.exit(1);
}

main();
