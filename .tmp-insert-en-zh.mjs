import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const adminTs = path.join(root, "lib/i18n/catalog/admin.ts");
const supplementPath = path.join(root, ".tmp-admin-stores-en-zh.json");

const supplement = JSON.parse(fs.readFileSync(supplementPath, "utf8"));

function formatBlock(locale) {
  const map = supplement[locale];
  const lines = [];
  for (const [key, value] of Object.entries(map)) {
    const escaped = String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    if (escaped.includes("\n")) {
      lines.push(`    ${key}:`);
      lines.push(`      "${escaped}",`);
    } else {
      lines.push(`    ${key}: "${escaped}",`);
    }
  }
  return "\n" + lines.join("\n") + "\n";
}

let src = fs.readFileSync(adminTs, "utf8");

for (const locale of ["en", "zh-CN"]) {
  const marker = `    admin_stores_reports_err_table_missing:`;
  const localeStart = src.indexOf(`  ${locale === "zh-CN" ? '"zh-CN"' : locale}: {`);
  if (localeStart < 0) throw new Error(`locale ${locale} not found`);
  const markerIdx = src.indexOf(marker, localeStart);
  if (markerIdx < 0) throw new Error(`marker not found for ${locale}`);
  const checkKey = "admin_page_store_orders:";
  if (src.indexOf(checkKey, localeStart) >= 0 && src.indexOf(checkKey, localeStart) < markerIdx) {
    console.log(`${locale} keys already present, skip`);
    continue;
  }
  const block = formatBlock(locale);
  src = src.slice(0, markerIdx) + block + src.slice(markerIdx);
  console.log(`Inserted ${locale} (${Object.keys(supplement[locale]).length} keys)`);
}

fs.writeFileSync(adminTs, src);
