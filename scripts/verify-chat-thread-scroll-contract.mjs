#!/usr/bin/env node
/**
 * Chat thread scroll contract — scrollTop/scrollToIndex/scrollToOffset 는
 * lib/chat-thread-scroll/** 만 허용. 표면별 inline scroll 금지.
 *
 * 정본: docs/chat-thread-scroll-contract.md
 * 사용: npm run verify:chat-thread-scroll-contract
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const WHITELIST_PREFIX = "lib/chat-thread-scroll/";

const FORBIDDEN_PREFIXES = [
  "components/chats/",
  "components/group-chat/",
  "lib/community-messenger/room/messenger-room-scroll",
  "lib/community-messenger/room/messenger-room-prepend",
  "lib/chats/chat-thread-entry-scroll.ts",
];

const SKIP_SUFFIXES = [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx", ".snap"];
const SKIP_DIRS = ["__tests__", "node_modules", ".next", "docs/perf", ".playwright-supabase-profile", ".git"];

const SCROLL_PATTERNS = [
  /\.scrollTop\s*=/,
  /\.scrollTop\s*\+=/,
  /\.scrollToIndex\s*\(/,
  /\.scrollToOffset\s*\(/,
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    try {
      const rel = relative(root, abs);
      const st = statSync(abs);
      if (st.isDirectory()) {
        if (SKIP_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`))) continue;
        walk(abs, out);
      } else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(name)) {
        out.push(rel);
      }
    } catch {
      continue;
    }
  }
  return out;
}

function isWhitelisted(rel) {
  return rel.startsWith(WHITELIST_PREFIX);
}

function isForbiddenTarget(rel) {
  if (isWhitelisted(rel)) return false;
  if (SKIP_SUFFIXES.some((s) => rel.endsWith(s))) return false;
  if (rel.startsWith("scripts/verify-chat-thread-scroll-contract.mjs")) return false;
  return FORBIDDEN_PREFIXES.some((p) => rel.startsWith(p) || rel === p);
}

const violations = [];
const files = walk(root);

for (const rel of files) {
  if (!isForbiddenTarget(rel)) continue;
  const src = readFileSync(join(root, rel), "utf8");
  for (const pat of SCROLL_PATTERNS) {
    if (pat.test(src)) {
      violations.push(`${rel}: matches ${pat}`);
    }
  }
}

if (!readFileSync(join(root, "docs/chat-thread-scroll-contract.md"), "utf8").includes("CHAT_THREAD_STICK_THRESHOLD_PX")) {
  violations.push("docs/chat-thread-scroll-contract.md: missing stick threshold doc");
}

if (violations.length > 0) {
  console.error("verify:chat-thread-scroll-contract FAIL\n");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("verify:chat-thread-scroll-contract PASS");
console.log(`  scanned forbidden prefixes: ${FORBIDDEN_PREFIXES.length}`);
console.log(`  whitelist: ${WHITELIST_PREFIX}`);
