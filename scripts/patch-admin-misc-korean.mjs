import fs from "fs";
import path from "path";

const map = JSON.parse(fs.readFileSync(".tmp-admin-misc-string-map.json", "utf8"));
const dirs = [
  "qa-board", "launch-week", "launch-readiness", "reviews", "security",
  "member-benefits", "production-migration", "ops-benchmarks",
  "recommendation-deployments", "feed-emergency", "recommendation",
  "performance", "personalized-feed", "exposure", "my", "home-feed", "dr",
];

function validKo(s) {
  if (!/[\uAC00-\uD7A3]/.test(s)) return false;
  if (/[\n\r{}\\"]/.test(s)) return false;
  if (/label:|headers|export |as const|className/.test(s)) return false;
  if (s.length > 80) return false;
  return true;
}

const pairs = Object.entries(map).filter(([s]) => validKo(s)).sort((a, b) => b[0].length - a[0].length);

function ensureI18n(c) {
  if (!c.includes('{t("')) return c;
  if (!/["']use client["']/.test(c)) return c;
  let next = c;
  if (!next.includes("useI18n")) {
    next = next.replace(
      /(["']use client["'];?\s*\n)/,
      `$1\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n`
    );
  }
  if (!next.includes("const { t }")) {
    next = next.replace(/export function (\w+)\([^)]*\)\s*\{/, (m) => `${m}\n  const { t } = useI18n();`);
  }
  return next;
}

let n = 0;
for (const dir of dirs) {
  const root = path.join("components/admin", dir);
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx$/.test(e.name)) {
        let c = fs.readFileSync(p, "utf8");
        const before = c;
        for (const [s, key] of pairs) {
          if (s.includes("{")) continue;
          const esc = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          c = c.replace(new RegExp(`>${esc}<`, "g"), `>{t("${key}")}<`);
          c = c.replace(new RegExp(`label: "${esc}"`, "g"), `labelKey: "${key}" as const`);
        }
        c = ensureI18n(c);
        if (c !== before) {
          fs.writeFileSync(p, c);
          n++;
        }
      }
    }
  };
  walk(root);
}
console.log("patched", n);
