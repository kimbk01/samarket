#!/usr/bin/env npx tsx
/**
 * Production Backfill — READ-ONLY final verify (no INSERT/UPDATE/DELETE).
 *
 *   npx tsx --env-file=.env.local scripts/gate3-production-backfill-readonly-verify.ts
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  dryRunLegacyNotificationsBackfill,
  listRepairCandidatesFromCanonicalKeys,
  planBackfillFirstRun,
  planBackfillSecondRun,
  type LegacyNotificationsBackfillRow,
} from "@/lib/notifications/badge-authority-rebuild/legacy-cutover-backfill";

const OUT_DIR = join(process.cwd(), ".qa-logs/badge-gate3-live-dry-run");
const PAGE = 1000;
const EXPECT = {
  legacyTotalRows: 6580,
  aDisposition: 789,
  canonicalLegacyBackfillRows: 789,
  contentIdentityDuplicatesExcluded: 7,
  quarantine: 65,
  unknown: 0,
  contamination: 0,
  proposedAdditionalInserts: 0,
  repairCandidates: 0,
} as const;

function loadEnvLocal(): void {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

async function fetchAllNotifications(sb: any): Promise<LegacyNotificationsBackfillRow[]> {
  const rows: LegacyNotificationsBackfillRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("notifications")
      .select(
        "id, user_id, notification_type, is_read, created_at, title, body, link_url, ref_id, meta, push_kind, deleted_at, dismissed_at"
      )
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      if (/deleted_at|dismissed_at|column/i.test(error.message)) {
        const retry = await sb
          .from("notifications")
          .select(
            "id, user_id, notification_type, is_read, created_at, title, body, link_url, ref_id, meta, push_kind"
          )
          .order("created_at", { ascending: true })
          .range(from, from + PAGE - 1);
        if (retry.error) throw retry.error;
        const batch = (retry.data ?? []) as LegacyNotificationsBackfillRow[];
        rows.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
        continue;
      }
      throw error;
    }
    const batch = (data ?? []) as LegacyNotificationsBackfillRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function fetchCanonicalLegacyDedupeKeys(sb: any): Promise<Set<string>> {
  const keys = new Set<string>();
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("notification_events")
      .select("dedupe_key")
      .like("dedupe_key", "legacy:notifications:%")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data ?? [];
    for (const row of batch) {
      const k = trim((row as { dedupe_key?: unknown }).dedupe_key);
      if (k) keys.add(k);
    }
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return keys;
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing SUPABASE credentials");

  const { execSync } = await import("node:child_process");
  const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const origin = execSync("git rev-parse origin/main", { encoding: "utf8" }).trim();

  const sb = createClient(url, key, { auth: { persistSession: false } });
  mkdirSync(OUT_DIR, { recursive: true });

  const legacyRows = await fetchAllNotifications(sb);
  const canonicalKeys = await fetchCanonicalLegacyDedupeKeys(sb);

  const cold = planBackfillFirstRun(legacyRows, { contentIdentitySeed: new Set() });
  const second = planBackfillSecondRun(legacyRows, {
    canonicalDedupeKeys: canonicalKeys,
    contentIdentitySeed: cold.contentIdentitySeed,
  });
  const reportLive = dryRunLegacyNotificationsBackfill(legacyRows, {
    canonicalDedupeKeys: canonicalKeys,
    contentIdentitySeed: cold.contentIdentitySeed,
  });
  const repairCandidates = listRepairCandidatesFromCanonicalKeys(cold.plan, canonicalKeys);

  const metrics = {
    legacyTotalRows: legacyRows.length,
    aDisposition: cold.toInsert.length,
    canonicalLegacyBackfillRows: canonicalKeys.size,
    contentIdentityDuplicatesExcluded: cold.contentIdentityDuplicateDedupeKeys.length,
    quarantine: reportLive.quarantinedExcluded,
    unknown: reportLive.unknownClassification,
    contamination: reportLive.identityContamination,
    proposedAdditionalInserts: second.proposedInserts,
    repairCandidates: repairCandidates.length,
    eligibleForB: reportLive.eligibleForB,
    eligibleForC: reportLive.eligibleForC,
  };

  const failures: string[] = [];
  if (metrics.legacyTotalRows !== EXPECT.legacyTotalRows) {
    failures.push(`legacyTotalRows ${metrics.legacyTotalRows}`);
  }
  if (metrics.aDisposition !== EXPECT.aDisposition) {
    failures.push(`aDisposition ${metrics.aDisposition}`);
  }
  if (metrics.canonicalLegacyBackfillRows !== EXPECT.canonicalLegacyBackfillRows) {
    failures.push(`canonicalLegacyBackfillRows ${metrics.canonicalLegacyBackfillRows}`);
  }
  if (metrics.contentIdentityDuplicatesExcluded !== EXPECT.contentIdentityDuplicatesExcluded) {
    failures.push(`duplicate ${metrics.contentIdentityDuplicatesExcluded}`);
  }
  if (metrics.quarantine !== EXPECT.quarantine) failures.push(`quarantine ${metrics.quarantine}`);
  if (metrics.unknown !== EXPECT.unknown) failures.push(`unknown ${metrics.unknown}`);
  if (metrics.contamination !== EXPECT.contamination) {
    failures.push(`contamination ${metrics.contamination}`);
  }
  if (metrics.proposedAdditionalInserts !== EXPECT.proposedAdditionalInserts) {
    failures.push(`proposedAdditionalInserts ${metrics.proposedAdditionalInserts}`);
  }
  if (metrics.repairCandidates !== EXPECT.repairCandidates) {
    failures.push(`repairCandidates ${metrics.repairCandidates}`);
  }

  const pass = failures.length === 0;
  const evidence = {
    verdict: pass
      ? "PRODUCTION READONLY VERIFY PASS"
      : "PRODUCTION READONLY VERIFY FAIL",
    head,
    origin,
    headEqualsOrigin: head === origin,
    metrics,
    expect: EXPECT,
    failures,
    quarantineReasons: reportLive.quarantineReasons,
    mutate: false,
  };
  const stamp = Date.now();
  const path = join(OUT_DIR, `readonly-verify-${stamp}.json`);
  writeFileSync(path, JSON.stringify(evidence, null, 2));
  writeFileSync(join(OUT_DIR, "readonly-verify-latest.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  console.log("[readonly-verify]", path);
  if (!pass) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
