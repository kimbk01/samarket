import fs from "fs";
import path from "path";

const map = JSON.parse(fs.readFileSync(".tmp-admin-misc-string-map.json", "utf8"));

const dirs = [
  "qa-board",
  "dev-sprints",
  "launch-week",
  "launch-readiness",
  "reviews",
  "security",
  "member-benefits",
  "production-migration",
  "ops-benchmarks",
  "recommendation-deployments",
  "feed-emergency",
  "recommendation",
  "performance",
  "personalized-feed",
  "exposure",
  "my",
  "home-feed",
  "operations",
  "dr",
];

function key(s) {
  return map[s];
}

function patch(content, filePath) {
  if (!/[\uAC00-\uD7A3]/.test(content)) return content;

  let next = content;

  // AdminPageHeader title="..." -> titleKey
  next = next.replace(
    /<AdminPageHeader\s+title="([^"]*[\uAC00-\uD7A3][^"]*)"/g,
    (_, t) => `<AdminPageHeader titleKey="${key(t.trim())}"`
  );
  next = next.replace(
    /<AdminCard\s+title="([^"]*[\uAC00-\uD7A3][^"]*)"/g,
    (_, t) => `<AdminCard titleKey="${key(t.trim())}"`
  );

  // JSX text >한글<
  for (const [s, k] of Object.entries(map).sort((a, b) => b[0].length - a[0].length)) {
    if (!s.match(/[\uAC00-\uD7A3]/)) continue;
    if (s.includes("{") || s.includes("<")) continue;
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(`>${escaped}<`, "g"), `>{t("${k}")}<`);
    next = next.replace(new RegExp(`title="${escaped}"`, "g"), `titleKey="${k}"`);
    next = next.replace(new RegExp(`description="${escaped}"`, "g"), `descriptionKey="${k}"`);
    next = next.replace(new RegExp(`placeholder="${escaped}"`, "g"), `placeholder={t("${k}")}`);
    next = next.replace(new RegExp(`aria-label="${escaped}"`, "g"), `aria-label={t("${k}")}`);
  }

  // label: "한글" in const arrays -> labelKey if MessageKey pattern exists
  for (const [s, k] of Object.entries(map)) {
    if (!s.match(/[\uAC00-\uD7A3]/)) continue;
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(`label: "${escaped}"`, "g"), `labelKey: "${k}" as const`);
    next = next.replace(
      new RegExp(`<option value="([^"]*)">${escaped}</option>`, "g"),
      `<option value="$1">{t("${k}")}</option>`
    );
  }

  // headers={[ "a", "b" ]} — skip auto (needs useMemo)

  const needsI18n = /[\uAC00-\uD7A3]/.test(next) || next.includes('{t("');
  const isClient = next.includes('"use client"') || next.includes("'use client'");
  if (next.includes('{t("') && isClient && !next.includes("useI18n")) {
    next = next.replace(
      /("use client";\s*\n)/,
      `$1\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n`
    );
    next = next.replace(
      /export function (\w+)\([^)]*\)\s*\{/,
      (m, name) => `${m}\n  const { t } = useI18n();`
    );
  }

  return next;
}

let changed = 0;
for (const dir of dirs) {
  const root = path.join("components/admin", dir);
  function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx$/.test(e.name)) {
        const rel = p.replace(/\\/g, "/");
        const before = fs.readFileSync(p, "utf8");
        const after = patch(before, rel);
        if (after !== before) {
          fs.writeFileSync(p, after);
          changed++;
        }
      }
    }
  }
  walk(root);
}
console.log("patched files:", changed);
