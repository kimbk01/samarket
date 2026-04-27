import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CHECK_DIRS = ["app", "components", "public", "tests/e2e"];
const TEXT_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".css",
  ".html",
  ".txt",
  ".sql",
]);

const ALLOW_PATH_SNIPPETS = [
  "tests/e2e/dibay-rename-smoke.spec.ts",
  "app/api/me/store-owner-hub-badge/route.ts",
  "app/favicon.ico",
  "supabase/migrations/",
  "supabase/scripts/",
  "docs/samarket-",
  ".cursor/rules/samarket-",
  "lib/app/samarket-route-map.ts",
  "lib/profile/default-avatar.ts",
  "public/samarket-default-avatar.svg",
  "lib/http/request-id.ts",
];

const FORBIDDEN_PATTERNS = [
  /\bSAMarket\b/g,
  /\bSAMARKET\b/g,
  /\bSaMarket\b/g,
  /samarket\.vercel\.app/gi,
];

const errors = [];

function walk(dirPath, out) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dirPath, entry.name);
    const rel = path.relative(ROOT, abs).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      if (rel.startsWith(".git/") || rel.startsWith(".next/") || rel.startsWith("node_modules/")) continue;
      walk(abs, out);
      continue;
    }
    out.push({ abs, rel });
  }
}

function isAllowed(rel) {
  return ALLOW_PATH_SNIPPETS.some((snippet) => rel.includes(snippet));
}

function shouldScanFile(rel) {
  const ext = path.extname(rel).toLowerCase();
  return TEXT_EXTS.has(ext);
}

const files = [];
for (const dir of CHECK_DIRS) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  walk(abs, files);
}

const secureAuthDoc = path.join(ROOT, "docs", "secure-auth-oauth-setup.md");
if (fs.existsSync(secureAuthDoc)) {
  files.push({ abs: secureAuthDoc, rel: "docs/secure-auth-oauth-setup.md" });
}

for (const file of files) {
  if (!shouldScanFile(file.rel) || isAllowed(file.rel)) continue;
  const text = fs.readFileSync(file.abs, "utf8");
  for (const pattern of FORBIDDEN_PATTERNS) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length > 0) {
      errors.push(`${file.rel}: forbidden pattern "${pattern}" (${matches.length})`);
    }
  }
}

const envLocalPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envLocalPath)) {
  const envText = fs.readFileSync(envLocalPath, "utf8");
  if (!/^NEXT_PUBLIC_SITE_NAME=dibaY$/m.test(envText)) {
    errors.push(".env.local: NEXT_PUBLIC_SITE_NAME=dibaY is missing");
  }
  if (!/^NEXT_PUBLIC_APP_NAME=dibaY$/m.test(envText)) {
    errors.push(".env.local: NEXT_PUBLIC_APP_NAME=dibaY is missing");
  }
}

if (!fs.existsSync(path.join(ROOT, "public", "favicon.ico"))) {
  errors.push("public/favicon.ico is missing");
}
if (!fs.existsSync(path.join(ROOT, "public", "icon.png"))) {
  errors.push("public/icon.png is missing");
}

if (errors.length > 0) {
  console.error("[verify:dibaY] FAILED");
  for (const item of errors) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log("[verify:dibaY] PASS");
