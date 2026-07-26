#!/usr/bin/env node
/** Main exploration header must not be ssr:false-only. */
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
let regionBar = fs.readFileSync(path.join(ROOT, "components/layout/RegionBar.tsx"), "utf8");
regionBar = regionBar.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
if (/ssr:\s*false/.test(regionBar)) {
  console.error("verify:no-client-only-main-header: RegionBar still has ssr:false dynamic");
  process.exit(1);
}
if (!regionBar.includes("RegionBarExplorationTier1")) {
  console.error("verify:no-client-only-main-header: RegionBarExplorationTier1 missing");
  process.exit(1);
}
console.log("verify:no-client-only-main-header: ok");
