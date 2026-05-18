import fs from "node:fs";

const data = JSON.parse(fs.readFileSync(".tmp-phase7-findings.json", "utf8"));
const files = [...new Set(data.findings.map((f) => f.file))];
const noUseClient = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes('"use client"') && !text.includes("'use client'")) {
    noUseClient.push(file);
  }
}
console.log(`files=${files.length}`);
console.log(`noUseClient=${noUseClient.length}`);
for (const file of noUseClient) {
  console.log(file);
}
