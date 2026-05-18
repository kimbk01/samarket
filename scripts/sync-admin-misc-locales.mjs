import fs from "fs";

const path = "lib/i18n/catalog/admin-misc.ts";
let src = fs.readFileSync(path, "utf8");

function parseBlock(loc) {
  const re = new RegExp(`  ${loc === "zh-CN" ? '"zh-CN"' : loc}: \\{([\\s\\S]*?)\\n  \\},`, "m");
  const m = src.match(re);
  if (!m) throw new Error("block " + loc);
  const obj = {};
  for (const line of m[1].matchAll(/^\s+(admin_[^:]+):\s*"((?:[^"\\]|\\.)*)",/gm)) {
    obj[line[1]] = line[2].replace(/\\"/g, '"');
  }
  return obj;
}

const ko = parseBlock("ko");
let en = parseBlock("en");
let zh = parseBlock("zh-CN");

for (const [k, v] of Object.entries(ko)) {
  if (!en[k]) en[k] = v;
  if (!zh[k]) zh[k] = v;
}

function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
const lines = (o) =>
  Object.entries(o)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `    ${k}: "${esc(v)}",`)
    .join("\n");

fs.writeFileSync(
  path,
  `/** Phase 11: admin misc domains */\nexport const adminMiscMessages = {\n  ko: {\n${lines(ko)}\n  },\n  en: {\n${lines(en)}\n  },\n  "zh-CN": {\n${lines(zh)}\n  },\n};\n`
);
console.log("ko", Object.keys(ko).length, "en", Object.keys(en).length);
