#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outDir = resolve(process.cwd(), ".tmp/intro-v2-phase1");
mkdirSync(outDir, { recursive: true });

function runLinked(file, label) {
  const r = spawnSync("npx", ["supabase", "db", "query", "--linked", "-f", file], {
    encoding: "utf8",
    cwd: process.cwd(),
    maxBuffer: 20 * 1024 * 1024,
    env: process.env,
  });
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  writeFileSync(resolve(outDir, `${label}.log`), out, "utf8");
  if (r.status !== 0) {
    console.error(`[FAIL] ${label}`);
    console.error(out.replace(/postgresql:\/\/[^\s]+/gi, "postgresql://[REDACTED]"));
    process.exit(r.status || 1);
  }
  return out;
}

const sqlDir = resolve(process.cwd(), "scripts/intro-v2-phase1");
const prove = runLinked(resolve(sqlDir, "PROVE.sql"), "PROVE");
const tx = runLinked(resolve(sqlDir, "CONTRACT_TX.sql"), "CONTRACT_TX");
writeFileSync(
  resolve(outDir, "PROVE_SUMMARY.json"),
  JSON.stringify(
    {
      prove_ok: prove.includes("intro_campaigns") && prove.includes("schemaVersion"),
      contract_tx_ok: /error/i.test(tx) === false || tx.includes('"error"') === false,
      zero_intro_present: prove.includes('"campaign": null') || prove.includes('"campaign":null'),
    },
    null,
    2
  ),
  "utf8"
);
console.log("[OK] intro v2 phase 1 prove");
