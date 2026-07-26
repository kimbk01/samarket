/**
 * Legacy Owner render ban — `/my/business/**` · `/mypage/business/**` must be redirect-only.
 *
 * CONTRACT: lib/business/owner-routes.ts
 * DO NOT: import Owner View / BusinessAdminShell / StoreBusinessGuard under these trees.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const targets = [
  path.join(root, "app/(main)/my/business"),
  path.join(root, "app/(main)/mypage/business"),
];

const FORBIDDEN = [
  /from\s+["']@\/components\/business\/owner\//,
  /from\s+["']@\/components\/business\/admin\//,
  /from\s+["']@\/components\/business\/StoreBusinessGuard/,
  /from\s+["']@\/components\/business\/MyBusinessPage/,
  /from\s+["']@\/components\/business\/OwnerStore/,
  /OwnerStore\w+View/,
  /BusinessAdminShell/,
  /StoreBusinessGuard/,
  /MyBusinessPage/,
];

const ALLOWED_IMPORT_HINTS = [
  "redirect",
  "redirectLegacyOwnerPage",
  "buildLegacyOwnerRedirectHref",
  "mapLegacyOwnerPath",
  "OwnerRoutes",
  "next/navigation",
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name === "page.tsx" || name === "layout.tsx") out.push(p);
  }
  return out;
}

const failures = [];
for (const base of targets) {
  for (const file of walk(base)) {
    const text = fs.readFileSync(file, "utf8");
    const rel = path.relative(root, file);
    if (file.endsWith("layout.tsx")) {
      // Comments may mention forbidden symbols; only fail on import/JSX usage.
      if (
        /from\s+["'][^"']*(StoreBusinessGuard|BusinessAdminShell)/.test(text) ||
        /<\s*(StoreBusinessGuard|BusinessAdminShell)\b/.test(text)
      ) {
        failures.push(`${rel}: legacy layout must not mount Owner shell`);
      }
      continue;
    }
    if (!/redirect\s*\(|redirectLegacyOwnerPage|notFound\s*\(/.test(text)) {
      failures.push(`${rel}: page must server-redirect (or notFound); found no redirect`);
    }
    for (const re of FORBIDDEN) {
      if (re.test(text)) {
        failures.push(`${rel}: forbidden Owner render import/marker ${re}`);
      }
    }
  }
}

if (failures.length) {
  console.error("[verify:legacy-owner-render-ban] FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("[verify:legacy-owner-render-ban] OK — my/mypage business trees are redirect-only");
