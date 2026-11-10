#!/usr/bin/env node
/**
 * Vercel Ignored Build Step — 정본: AGENTS.md 「개발 프로세스」 2번 (Owner 2026-11-11 5단계)
 *
 * Exit 0 → SKIP (빌드 안 함)
 * Exit 1 → BUILD
 *
 * 원칙: 근거가 부족하면 BUILD.
 * - 기준 = VERCEL_GIT_PREVIOUS_SHA 하나뿐 (Vercel 이 브랜치별 마지막 성공 배포 SHA 를 줌 → dev·main 판정이 서로 독립).
 * - 기준이 비었음 / clone 에 없음(추가 fetch 후에도) / 현재와 같은 SHA / 현재의 조상이 아님 → BUILD.
 * - 기준..현재 누적 diff 의 모든 경로가 허용 목록일 때만 SKIP. 빌드 설정·DB 계약·i18n·public 은 항상 BUILD.
 * - 강제 토큰 없음. 판정 근거를 로그 1줄로 남긴다.
 *
 * Local check:
 *   VERCEL_GIT_PREVIOUS_SHA=<sha> node scripts/vercel-ignored-build-step.mjs; echo $?
 */
import { execFileSync } from "node:child_process";

/** 웹 번들에 들어가지 않는 경로 접두어 — 이 목록만 SKIP 근거가 된다. */
const SKIP_PREFIXES = [
  "docs/",
  ".cursor/",
  "android/",
  "ios/",
  "windows/",
  "capacitor-www/",
  "scripts/qa/",
];

/** 루트의 *.md (AGENTS.md·CLAUDE.md·README.md 등). 하위 폴더의 .md 는 SKIP 근거가 아니다. */
const ROOT_MARKDOWN = /^[^/]+\.md$/;

/** 허용 목록과 상관없이 항상 BUILD. */
const ALWAYS_BUILD_PREFIXES = ["lib/i18n/", "supabase/", "public/"];
const ALWAYS_BUILD_ROOT_FILES = [
  /^vercel\.json$/,
  /^\.vercelignore$/,
  /^next\.config\.[^/]+$/,
  /^package[^/]*\.json$/,
  /^tsconfig[^/]*$/,
];

const SHA_RE = /^[0-9a-f]{40}$/;

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function tryGit(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

function hasCommit(sha) {
  return tryGit(["cat-file", "-e", `${sha}^{commit}`]) !== null;
}

function isShallow() {
  return tryGit(["rev-parse", "--is-shallow-repository"]) === "true";
}

/** 0 = 조상, 1 = 조상 아님, null = 판정 불가 */
function isAncestor(base, head) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", base, head], { stdio: "ignore" });
    return 0;
  } catch (e) {
    return e && typeof e === "object" && "status" in e && e.status === 1 ? 1 : null;
  }
}

function unshallow() {
  if (isShallow()) tryGit(["fetch", "--no-tags", "--quiet", "--unshallow", "origin"]);
}

function classifyPath(file) {
  const p = file.replace(/\\/g, "/").replace(/^\.\//, "");
  if (ALWAYS_BUILD_PREFIXES.some((x) => p.startsWith(x))) return "always-build";
  if (ALWAYS_BUILD_ROOT_FILES.some((re) => re.test(p))) return "always-build";
  if (SKIP_PREFIXES.some((x) => p.startsWith(x))) return "skip";
  if (ROOT_MARKDOWN.test(p)) return "skip";
  return "build";
}

function decide() {
  const base = (process.env.VERCEL_GIT_PREVIOUS_SHA ?? "").trim().toLowerCase();
  const head = tryGit(["rev-parse", "HEAD"]);
  const ctx = { base, head };

  if (!head) return { build: true, reason: "head-unresolved", ...ctx };
  const envHead = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").trim().toLowerCase();
  if (envHead && envHead !== head) return { build: true, reason: "head-mismatch", ...ctx };
  if (!base) return { build: true, reason: "base-empty", ...ctx };
  if (!SHA_RE.test(base)) return { build: true, reason: "base-invalid", ...ctx };
  if (base === head) return { build: true, reason: "same-sha", ...ctx };

  if (!hasCommit(base)) {
    tryGit(["fetch", "--no-tags", "--quiet", "--depth=50", "origin", base]);
    if (!hasCommit(base)) unshallow();
    if (!hasCommit(base)) return { build: true, reason: "base-missing", ...ctx };
  }

  let anc = isAncestor(base, head);
  if (anc !== 0 && isShallow()) {
    unshallow();
    anc = isAncestor(base, head);
  }
  if (anc !== 0) return { build: true, reason: anc === 1 ? "not-ancestor" : "ancestry-unknown", ...ctx };

  const out = tryGit(["diff", "--name-only", "--no-renames", "-z", base, head]);
  if (out === null) return { build: true, reason: "diff-failed", ...ctx };
  const files = out.split("\0").filter(Boolean);
  if (files.length === 0) return { build: false, reason: "tree-identical", files, ...ctx };

  const always = files.find((f) => classifyPath(f) === "always-build");
  if (always) return { build: true, reason: "always-build-path", files, first: always, ...ctx };
  const runtime = files.find((f) => classifyPath(f) === "build");
  if (runtime) return { build: true, reason: "runtime-path", files, first: runtime, ...ctx };
  return { build: false, reason: "allowlist-only", files, first: files[0], ...ctx };
}

function main() {
  let r;
  try {
    r = decide();
  } catch (e) {
    r = { build: true, reason: `error:${e instanceof Error ? e.message.split("\n")[0] : "unknown"}` };
  }
  const short = (s) => (s ? String(s).slice(0, 9) : "-");
  console.log(
    `[vercel-ignore-build] decision=${r.build ? "BUILD" : "SKIP"} reason=${r.reason}` +
      ` base=${short(r.base)} head=${short(r.head)} files=${r.files ? r.files.length : "-"}` +
      (r.first ? ` first=${r.first}` : ""),
  );
  process.exit(r.build ? 1 : 0);
}

main();
