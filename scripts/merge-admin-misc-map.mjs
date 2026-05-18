import fs from "fs";

const map = JSON.parse(fs.readFileSync(".tmp-admin-misc-string-map.json", "utf8"));
const ko = {};
const en = {};
const zh = {};

function validKo(s) {
  if (!s || !/[\uAC00-\uD7A3]/.test(s)) return false;
  if (/[\n\r{}\\"]/.test(s)) return false;
  if (/label:|headers|export |as const|className/.test(s)) return false;
  if (s.length > 90) return false;
  return true;
}

for (const [raw, key] of Object.entries(map)) {
  if (!key.startsWith("admin_")) continue;
  const s = raw.trim();
  if (!validKo(s)) continue;
  if (!ko[key] || s.length < ko[key].length) ko[key] = s;
}

// Merge rebuild output
const existing = fs.readFileSync("lib/i18n/catalog/admin-misc.ts", "utf8");
for (const m of existing.matchAll(/^\s+(admin_[^:]+):\s*"((?:[^"\\]|\\.)*)",/gm)) {
  const [, key, val] = m;
  if (!ko[key]) ko[key] = val.replace(/\\n/g, "\n").replace(/\\"/g, '"');
}

for (const [key, v] of Object.entries(ko)) {
  en[key] = v;
  zh[key] = v;
}

function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
}
const lines = (o) =>
  Object.entries(o)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `    ${k}: "${esc(v)}",`)
    .join("\n");

fs.writeFileSync(
  "lib/i18n/catalog/admin-misc.ts",
  `/** Phase 11: admin misc domains */\nexport const adminMiscMessages = {\n  ko: {\n${lines(ko)}\n  },\n  en: {\n${lines(en)}\n  },\n  "zh-CN": {\n${lines(zh)}\n  },\n};\n`
);
console.log("merged keys:", Object.keys(ko).length);
