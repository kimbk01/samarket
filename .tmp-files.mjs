import fs from "node:fs";
const missed = fs.readFileSync("c:/samarket/.tmp-community-hangul-missed.txt","utf8").split(/\n/).filter(Boolean);
const files = new Set(missed.map(r => r.match(/^(.+?):/)[1]));
console.log([...files].sort().join("\n"));
console.log("\ncount files", files.size);
