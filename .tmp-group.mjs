import fs from "node:fs";
function groupFile(path) {
  const lines = fs.readFileSync(path, "utf8").split(/\n/).filter(Boolean);
  const by = new Map();
  for (const row of lines) {
    const m = row.match(/^(.+?):(\d+): (.*)$/);
    if (!m) continue;
    const [, file, ln, rest] = m;
    if (!by.has(file)) by.set(file, []);
    by.get(file).push(`L${ln}: ${rest}`);
  }
  const files = [...by.keys()].sort();
  for (const f of files) {
    console.log("## " + f);
    for (const item of by.get(f)) console.log("- " + item);
    console.log("");
  }
}
console.log("=== SCANNER (127) ===\n");
groupFile("c:/samarket/.tmp-community-scan-full.txt");
console.log("=== MISSED HANGUL IN .tsx (212 lines) ===\n");
groupFile("c:/samarket/.tmp-community-hangul-missed.txt");
