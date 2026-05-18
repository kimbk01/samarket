import fs from "fs";
const HANGUL = /[\uAC00-\uD7A3]/;
const lines = fs.readFileSync("lib/community-messenger/service.ts", "utf8").split(/\r?\n/);
let n = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const t = line.trim();
  if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/**")) continue;
  if (!HANGUL.test(line)) continue;
  n++;
  console.log(`${i + 1}: ${line.trim().slice(0, 120)}`);
}
console.log("total:", n);
