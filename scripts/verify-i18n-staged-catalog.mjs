#!/usr/bin/env node
/**
 * Git 트리(스테이징)에서 새로 참조한 i18n key 가 같은 트리의 카탈로그에 있는지 검증.
 * 부분 커밋(컴포넌트만 add, catalog 미포함) 재발 방지 — 로컬 tsc는 워킹트리를 보므로 이 검사가 필요.
 *
 * Usage:
 *   node scripts/verify-i18n-staged-catalog.mjs --staged   # 커밋 직전 (pre-commit)
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MESSAGE_KEY_PATTERN } from "./lib/i18n-catalog-merge.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagedMode = process.argv.includes("--staged");
const ref = process.env.I18N_CATALOG_REF?.trim() || "HEAD";

/** t/safeT/labelKey 등 코드에서 snake_case MessageKey 후보 추출 */
const KEY_USAGE_RES = [
  /\b(?:t|safeT|translate|safeTranslate|storeOrderOpsSafeT|resolveSafeMessageKey|notifySafeT)\(\s*["']([a-z][a-z0-9]*(?:_[a-z0-9]+)+)["']/g,
  /labelKey:\s*["']([a-z][a-z0-9]*(?:_[a-z0-9]+)+)["']/g,
  /["']([a-z][a-z0-9]*(?:_[a-z0-9]+)+)["']\s*as\s*MessageKey/g,
];

const CODE_FILE_RE = /\.(ts|tsx)$/;
const CATALOG_DIR = "lib/i18n/catalog/";
const JSON_PREFIX = "messages/";

function git(args) {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 50e6 });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || "").trim();
    throw new Error(`git ${args.join(" ")} failed: ${err}`);
  }
  return r.stdout;
}

function gitShow(refPath) {
  const r = spawnSync("git", ["show", refPath], { cwd: ROOT, encoding: "utf8", maxBuffer: 20e6 });
  if (r.status !== 0) return null;
  return r.stdout;
}

function buildStagedTree() {
  const tracked = git(["ls-files", "-z"]).split("\0").filter(Boolean);
  const stagedDeleted = new Set(
    git(["diff", "--cached", "--name-only", "-z", "--diff-filter=D"]).split("\0").filter(Boolean),
  );
  const stagedChanged = new Set(
    git(["diff", "--cached", "--name-only", "-z"]).split("\0").filter(Boolean),
  );

  const tree = new Set();
  for (const f of tracked) {
    if (!stagedDeleted.has(f)) tree.add(f);
  }
  for (const f of stagedChanged) {
    if (!stagedDeleted.has(f)) tree.add(f);
  }
  return { tree, stagedChanged };
}

function readStagedContent(filePath, stagedChanged) {
  if (stagedChanged.has(filePath)) {
    return gitShow(`:${filePath}`);
  }
  return gitShow(`${ref}:${filePath}`);
}

function extractCatalogKeysFromTs(content, lang) {
  const re = new RegExp(`\\n  ${lang}: \\{([\\s\\S]*?)\\n  \\},`, "m");
  const match = content.match(re);
  if (!match) return [];
  const block = match[1];
  const keys = [];
  const keyValueRe = /^\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm;
  let m;
  while ((m = keyValueRe.exec(block)) !== null) {
    keys.push(m[1]);
  }
  return keys;
}

function extractCatalogKeysFromJson(content) {
  try {
    return Object.keys(JSON.parse(content));
  } catch {
    return [];
  }
}

function buildCatalogKeySet(ctx) {
  const keys = new Set();
  for (const filePath of ctx.tree) {
    const isCatalogTs = filePath.startsWith(CATALOG_DIR) && filePath.endsWith(".ts");
    const isMessagesJson = filePath.startsWith(JSON_PREFIX) && filePath.endsWith(".json");
    if (!isCatalogTs && !isMessagesJson) continue;

    const content = readStagedContent(filePath, ctx.stagedChanged);
    if (!content) continue;

    if (isCatalogTs) {
      for (const lang of ["ko", "en"]) {
        for (const key of extractCatalogKeysFromTs(content, lang)) {
          keys.add(key);
        }
      }
    } else {
      for (const key of extractCatalogKeysFromJson(content)) {
        keys.add(key);
      }
    }
  }
  return keys;
}

function extractUsedKeys(content) {
  const keys = new Set();
  for (const re of KEY_USAGE_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      const key = m[1];
      if (MESSAGE_KEY_PATTERN.test(key)) keys.add(key);
    }
  }
  return keys;
}

function collectMissing(ctx) {
  const catalogKeys = buildCatalogKeySet(ctx);
  const missing = new Map();

  for (const filePath of ctx.stagedChanged) {
    if (!CODE_FILE_RE.test(filePath)) continue;
    if (filePath.startsWith(CATALOG_DIR)) continue;
    if (filePath.includes("/__tests__/")) continue;

    const content = readStagedContent(filePath, ctx.stagedChanged);
    if (!content) continue;

    for (const key of extractUsedKeys(content)) {
      if (catalogKeys.has(key)) continue;
      if (!missing.has(key)) missing.set(key, []);
      missing.get(key).push(filePath);
    }
  }

  return missing;
}

function main() {
  if (!stagedMode) {
    console.error("verify:i18n-staged-catalog: --staged 만 지원합니다 (pre-commit 용).");
    console.error("전체 트리 검증은 npx tsc --noEmit / npm run ci 를 사용하세요.");
    process.exit(1);
  }

  const ctx = buildStagedTree();
  if (ctx.stagedChanged.size === 0) {
    console.log("verify:i18n-staged-catalog OK (staged) — 변경 없음");
    process.exit(0);
  }

  const missing = collectMissing(ctx);

  if (missing.size === 0) {
    console.log("verify:i18n-staged-catalog OK (staged)");
    process.exit(0);
  }

  console.error("verify:i18n-staged-catalog FAIL (staged) — catalog 에 없는 key:\n");
  console.error(
    "로컬 워킹트리에 catalog 가 있어도 git staged 에 없으면 CI tsc 가 실패합니다.",
  );
  console.error("lib/i18n/catalog/*.ts (ko/en) 를 컴포넌트와 함께 add/commit 하세요.\n");
  for (const [key, files] of [...missing.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.error(key);
    for (const f of files) console.error(`  used in ${f}`);
  }
  process.exit(1);
}

try {
  main();
} catch (err) {
  console.error(
    "verify:i18n-staged-catalog ERROR:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
}
