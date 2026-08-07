/**
 * posts 클라이언트 DB 경계 — 회귀 검증 (정적).
 * npm run verify:posts-client-db-boundary
 *
 * 범위: 거래 글쓰기·조회수·어드민 카테고리 삭제 관련 `lib/posts` · `lib/categories/admin` 클라이언트만.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

/** @deprecated 레거시 — 신규 import 금지 (파일 삭제됨 · 이름 잔존 시 skip) */
const DEPRECATED_CLIENT_POSTS_FILES = new Set([
  "lib/posts/searchPosts.ts",
]);

const GUARDED_SCAN_DIRS = ["lib/posts", "lib/categories/admin"];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(msg) {
  console.error(`[verify:posts-client-db-boundary] ${msg}`);
  process.exit(1);
}

function walkTsFiles(dir, acc = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return acc;
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, ent.name).replace(/\\/g, "/");
    if (ent.isDirectory()) {
      walkTsFiles(rel, acc);
    } else if (/\.(ts|tsx)$/.test(ent.name)) {
      acc.push(rel);
    }
  }
  return acc;
}

const createPost = read("lib/posts/createPost.ts");
if (!createPost.includes('fetch("/api/posts/create"')) {
  fail("createPost.ts must POST /api/posts/create (no client posts INSERT)");
}

const incrementView = read("lib/posts/incrementViewCount.ts");
if (!incrementView.includes("/increment-view")) {
  fail("incrementViewCount.ts must POST /api/posts/[postId]/increment-view");
}
if (incrementView.includes("getSupabaseClient")) {
  fail("incrementViewCount.ts must not use getSupabaseClient");
}

const postCount = read("lib/posts/getPostCountByCategory.ts");
if (!postCount.includes("/api/admin/categories/")) {
  fail("getPostCountByCategory.ts must use admin post-count API");
}
if (postCount.includes("getSupabaseClient")) {
  fail("getPostCountByCategory.ts must not use getSupabaseClient");
}

const postsDbTables = read("lib/posts/posts-db-tables.ts");
if (!postsDbTables.includes("CONTRACT")) {
  fail("posts-db-tables.ts must document CONTRACT for client boundary");
}

const guardedClientFiles = [];
for (const dir of GUARDED_SCAN_DIRS) {
  for (const rel of walkTsFiles(dir)) {
    const src = read(rel);
    if (/^["']use client["'];?/m.test(src)) {
      guardedClientFiles.push(rel);
    }
  }
}

for (const rel of guardedClientFiles) {
  if (DEPRECATED_CLIENT_POSTS_FILES.has(rel)) continue;
  const src = read(rel);
  if (/\.from\s*\(\s*POSTS_TABLE_WRITE/.test(src)) {
    fail(`${rel} must not .from(POSTS_TABLE_WRITE) in client code (use API routes)`);
  }
  if (
    src.includes("getSupabaseClient") &&
    /\.from\s*\(\s*["']posts["']/.test(src) &&
    /\.(insert|update|delete)\s*\(/.test(src)
  ) {
    fail(`${rel} must not getSupabaseClient().from("posts") for insert/update/delete`);
  }
}

console.log("[verify:posts-client-db-boundary] OK");
