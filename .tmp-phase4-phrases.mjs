import fs from "node:fs";

const raw = fs.readFileSync(".tmp-phase4-findings.txt");
const utf8 = raw.toString("utf8");
const utf16 = raw.toString("utf16le");
const textBlob = utf8.includes("\u0000") ? utf16 : utf8;
const lines = textBlob
  .replace(/\u0000/g, "")
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);
const set = new Set();

for (const line of lines) {
  const i = line.indexOf(": ");
  if (i < 0) continue;
  const code = line.slice(i + 2);
  let m;
  const attr = /(?:placeholder|title|aria-label|alt)\s*=\s*"([^"]*[가-힣][^"]*)"/g;
  while ((m = attr.exec(code))) set.add(m[1]);
  const fn = /(?:alert|confirm)\("([^"]*[가-힣][^"]*)"\)/g;
  while ((m = fn.exec(code))) set.add(m[1]);
  const text = />\s*([^<{]*[가-힣][^<]*)\s*</g;
  while ((m = text.exec(code))) {
    const s = m[1].trim();
    if (s) set.add(s);
  }
}

console.log([...set].sort((a, b) => a.localeCompare(b, "ko")).join("\n"));
console.log(`\nCOUNT=${set.size}`);
