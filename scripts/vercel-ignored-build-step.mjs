#!/usr/bin/env node
/**
 * Vercel Ignored Build Step
 *
 * Exit 0 → skip build (no Deploy / no Build CPU)
 * Exit 1 → proceed with build
 *
 * Skips Production/Preview builds when the commit only touches docs, markdown,
 * Cursor rules, QA logs, native app sources (android/ · ios/), test files, or other
 * non-runtime paths. App/runtime changes always build.
 *
 * Force a build: put `[vercel build]` in the commit message.
 *
 * 화면 버튼 빌드만 (Owner 2026-11-10 「git으로는 아예 빌드하지 않고 Vercel 화면 버튼으로만 빌드」):
 * `vercel.json` `git.deploymentEnabled` 가 main 포함 모든 브랜치를 꺼 둬서 git 푸시는 배포 자체를 만들지 않는다.
 * 그래서 Production(`VERCEL_ENV=production`) 으로 여기까지 오는 빌드는 Vercel 화면에서 누른 배포뿐 → 항상 빌드한다.
 * (이전 11-10 오전: main 푸시 + 마지막 커밋 `[vercel build]` 로 빌드 요청 — 폐지)
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
  // 네이티브 앱 소스(APK·iOS 빌드 전용) — Next.js 번들에 들어가지 않는다. 빌드 번호 증가 커밋 등.
  "android/",
  "ios/",
  // Windows 데스크톱 셸(WebView2 + MSIX) 소스 — 설계 W0. 웹 번들에 들어가지 않는다.
  "windows/",
];

/** 웹 번들과 무관한 개별 스크립트(개발용 앱 설치 등) — 로컬·Preview 판정용 */
const SKIP_SCRIPT_EXACT = ["scripts/ios-staging-dev-build.sh"];

/** 테스트 전용 파일 — 번들에 들어가지 않는다(CI 는 그대로 돈다). */
const TEST_FILE_PATTERNS = [/(^|\/)__tests__\//, /\.(test|spec)\.[cm]?[jt]sx?$/];

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
  if (SKIP_SCRIPT_EXACT.includes(normalized)) return true;
  if (SKIP_DIR_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;
  if (SKIP_EXTENSIONS.some((ext) => normalized.toLowerCase().endsWith(ext))) return true;
  if (TEST_FILE_PATTERNS.some((re) => re.test(normalized))) return true;

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

  if ((process.env.VERCEL_ENV ?? "").trim() === "production") {
    log("production = Vercel 화면 버튼 배포만 (git 배포 꺼짐) → build");
    process.exit(1);
  }

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
