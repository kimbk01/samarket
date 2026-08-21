/**
 * Copy store_orders serviceability snapshot migration SQL to clipboard (macOS).
 * Production apply still requires Dashboard SQL Editor or SUPABASE_DB_PASSWORD + apply script.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const file = resolve(
  process.cwd(),
  "supabase/migrations/20261120140000_store_orders_serviceability_snapshot.sql"
);
const sql = readFileSync(file, "utf8");
const r = spawnSync("pbcopy", [], { input: sql, encoding: "utf8" });
if (r.status !== 0) {
  console.error("pbcopy failed — print SQL below:\n");
  console.log(sql);
  process.exit(1);
}
console.log("Copied to clipboard:", file);
console.log("Paste into Supabase Dashboard → SQL Editor → Run");
console.log("Then set STORE_ORDER_SERVICEABILITY_SNAPSHOT_READY=true after 42703=0 proof.");
