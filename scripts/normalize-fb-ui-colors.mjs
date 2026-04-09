/**
 * 하드코딩된 IG 톤 hex → Tailwind 토큰 클래스 일괄 치환 (1회성 유지보수용).
 * 실행: node scripts/normalize-fb-ui-colors.mjs
 */
import fs from "node:fs";
import path from "node:path";

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".") || ent.name === "node_modules") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const roots = ["app", "components", "lib"].map((d) => path.join(process.cwd(), d));
const files = roots.flatMap((d) => walk(d));

/** 순서: 더 긴 패턴을 먼저 */
const pairs = [
  [/border-\[#0095F6\]\/35/g, "border-signature/35"],
  [/focus-visible:ring-\[#0095F6\]\/35/g, "focus-visible:ring-signature/35"],
  [/bg-\[#0095F6\]\/8/g, "bg-signature/8"],
  [/hover:bg-\[#0095F6\]\/14/g, "hover:bg-signature/14"],
  [/active:bg-\[#0095F6\]\/20/g, "active:bg-signature/20"],
  [/text-\[#0095F6\]/g, "text-signature"],
  [/text-\[#0095f6\]/g, "text-signature"],
  [/bg-\[#0095F6\]/g, "bg-signature"],
  [/bg-\[#0095f6\]/g, "bg-signature"],
  [/border-\[#0095F6\]/g, "border-signature"],
  [/divide-\[#DBDBDB\]/g, "divide-ig-border"],
  [/border-\[#DBDBDB\]/g, "border-ig-border"],
  [/text-\[#262626\]/g, "text-foreground"],
  [/active:bg-\[#FAFAFA\]/g, "active:bg-ig-highlight"],
  [/hover:bg-\[#FAFAFA\]/g, "hover:bg-ig-highlight"],
  [/hover:bg-\[#fafafa\]/gi, "hover:bg-ig-highlight"],
  [/active:bg-\[#fafafa\]/gi, "active:bg-ig-highlight"],
  [/active:bg-\[#F0F0F0\]/g, "active:bg-ig-highlight"],
  [/hover:bg-\[#F0F0F0\]/g, "hover:bg-ig-highlight"],
  [/border-\[#EFEFEF\]/g, "border-ig-border"],
  [/bg-\[#EFEFEF\]/g, "bg-ig-highlight"],
  [/active:bg-\[#EFEFEF\]/g, "active:bg-ig-highlight"],
  [/placeholder:text-\[#A8A8A8\]/g, "placeholder:text-muted"],
  [/text-\[#A8A8A8\]/g, "text-muted"],
  [/text-\[#8E8E8E\]/g, "text-muted"],
  [/text-\[#8e8e8e\]/g, "text-muted"],
  [/border-\[#E8E8E8\]/g, "border-ig-border"],
  [/border-\[#E5E7EB\]/g, "border-ig-border"],
];

let changed = 0;
for (const file of files) {
  let c = fs.readFileSync(file, "utf8");
  const orig = c;
  for (const [re, rep] of pairs) {
    c = c.replace(re, rep);
  }
  if (c !== orig) {
    fs.writeFileSync(file, c);
    changed++;
  }
}
console.log(`[normalize-fb-ui-colors] updated ${changed} files`);
