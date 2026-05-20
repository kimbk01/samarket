import fs from "node:fs";

const t = fs.readFileSync(".tmp-tsc-errors.txt", "utf8");
const missingKey = new Set();
const other = [];
for (const line of t.split(/\n/)) {
  const m = line.match(/Argument of type '([^']+)' is not assignable/);
  if (m) missingKey.add(m[1]);
  else if (line.includes("error TS")) other.push(line.trim());
}
console.log("missing keys", missingKey.size);
[...missingKey].sort().forEach((k) => console.log(k));
console.log("\nother errors", other.length);
other.forEach((l) => console.log(l));
