#!/usr/bin/env node
/**
 * Lists Supabase migration files that should be applied to remote DB before prod features work.
 * Does not connect to DB — manifest only.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MIG_DIR = path.join(ROOT, "supabase", "migrations");

/** Feature batch: mock→real API (points, ads, admin memo, ASO1 snapshot). */
const FEATURE_BATCH_PREFIX = "20260912";

function main() {
  if (!fs.existsSync(MIG_DIR)) {
    console.error("verify-pending-supabase-migrations: migrations dir missing");
    process.exit(1);
  }
  const files = fs
    .readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const batch = files.filter((f) => f.startsWith(FEATURE_BATCH_PREFIX) || f.startsWith("202609131"));
  console.log("[verify-pending-supabase-migrations] Apply these on remote Supabase (Dashboard SQL or supabase db push):");
  for (const f of batch) {
    console.log(`  - supabase/migrations/${f}`);
  }
  console.log("");
  console.log(`Total in feature batch: ${batch.length}`);
  console.log("After apply, verify: post_ads tables, user_point_*, admin_settings keys, get_admin_store_orders_list_snapshot RPC.");
  process.exit(0);
}

main();
