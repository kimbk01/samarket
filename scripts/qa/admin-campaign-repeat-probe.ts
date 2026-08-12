#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scheduleNextRecurringOccurrence } from "../../lib/admin/notification-campaigns/claim-scheduled-campaign";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const campaignId = process.argv[2];
const action = process.argv[3] || "next";

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

async function main() {
  loadEnv();
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  if (!campaignId) {
    console.log(JSON.stringify({ id: null, error: "missing_campaign_id" }));
    process.exit(1);
  }

  if (action === "pause-check") {
    const row = await scheduleNextRecurringOccurrence(sb, campaignId);
    console.log(JSON.stringify({ id: row?.id ?? null }));
    return;
  }

  const row = await scheduleNextRecurringOccurrence(sb, campaignId);
  console.log(JSON.stringify({ id: row?.id ?? null }));
}

main().catch((e) => {
  console.log(JSON.stringify({ id: null, error: String(e?.message || e) }));
  process.exit(1);
});
