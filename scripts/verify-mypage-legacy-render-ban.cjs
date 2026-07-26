/**
 * `/my/**` pages must be server redirect-only (no real MyPage/Owner View render).
 * Explicit allowlist: none currently — business subtree covered by verify:legacy-owner-render-ban.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const myDir = path.join(root, "app/(main)/my");

const FORBIDDEN = [
  /from\s+["']@\/components\/mypage\//,
  /from\s+["']@\/components\/offers\//,
  /from\s+["']@\/components\/points\//,
  /from\s+["']@\/components\/member-benefits\//,
  /from\s+["']@\/components\/recent-viewed\//,
  /from\s+["']@\/components\/trust\//,
  /from\s+["']@\/components\/business\//,
  /from\s+["']\.\/MyAdsPageClient/,
  /from\s+["']\.\/MyAdsApplyPageClient/,
  /MyOffersView/,
  /MemberBenefitList/,
  /RecentViewedList/,
  /BlockedUserList/,
  /MyStoreInquiriesView/,
  /MannerBatteryIcon/,
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
for (const file of walk(myDir)) {
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file);
  if (file.endsWith("layout.tsx")) {
    if (/from\s+["'][^"']*(StoreBusinessGuard|BusinessAdminShell)/.test(text) ||
        /<\s*(StoreBusinessGuard|BusinessAdminShell)\b/.test(text)) {
      failures.push(`${rel}: /my layout must not mount Owner shell`);
    }
    continue;
  }
  if (!/redirect\s*\(|redirectLegacyOwnerPage|notFound\s*\(/.test(text)) {
    failures.push(`${rel}: must server-redirect (or notFound)`);
  }
  if (/router\.(replace|push)\(/.test(text) && /"use client"/.test(text)) {
    failures.push(`${rel}: client router redirect forbidden — use server redirect`);
  }
  for (const re of FORBIDDEN) {
    if (re.test(text)) failures.push(`${rel}: forbidden View import ${re}`);
  }
}

if (failures.length) {
  console.error("[verify:mypage-legacy-render-ban] FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("[verify:mypage-legacy-render-ban] OK — /my/** pages are redirect-only");
