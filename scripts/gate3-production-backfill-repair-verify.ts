#!/usr/bin/env npx tsx
/**
 * SEPARATE FROM NORMAL APPLY — incident repair DELETE path only.
 * Normal apply must never import or call this delete path.
 *
 * Repair second-run accidental inserts of content-identity duplicates,
 * then verify canonical A legacy-prefixed count == 789 and idempotency.
 *
 *   CONFIRM_PRODUCTION_BACKFILL_REPAIR=1 npx tsx --env-file=.env.local \
 *     scripts/gate3-production-backfill-repair-verify.ts --repair
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

async function countLegacyPrefixed(sb: any): Promise<number> {
  const { count, error } = await sb
    .from("notification_events")
    .select("id", { count: "exact", head: true })
    .like("dedupe_key", "legacy:notifications:%");
  if (error) throw error;
  return Math.max(0, Math.floor(Number(count) || 0));
}

async function main() {
  loadEnvLocal();
  const repair = process.argv.includes("--repair");
  if (repair && process.env.CONFIRM_PRODUCTION_BACKFILL_REPAIR !== "1") {
    throw new Error("set CONFIRM_PRODUCTION_BACKFILL_REPAIR=1 with --repair");
  }

  const { execSync } = await import("node:child_process");
  const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const origin = execSync("git rev-parse origin/main", { encoding: "utf8" }).trim();
  if (head !== origin) {
    throw new Error(`sha_mismatch head=${head} origin=${origin}`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing SUPABASE credentials");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  mkdirSync(OUT_DIR, { recursive: true });

  const legacyRows = await fetchAllNotifications(sb);
  const baseline = planBackfillFirstRun(legacyRows, { contentIdentitySeed: new Set() });
  const intendedA = baseline.toInsert;
  const contentDupeKeys = baseline.contentIdentityDuplicateDedupeKeys;
  const intendedKeys = new Set(intendedA.map((p) => p.dedupeKey));

  const before = await countLegacyPrefixed(sb);
  const presentKeys = await fetchCanonicalLegacyDedupeKeys(sb);
  const accidental = listRepairCandidatesFromCanonicalKeys(baseline.plan, presentKeys);
  const missingIntended = [...intendedKeys].filter((k) => !presentKeys.has(k));
  const extraKeys = [...presentKeys].filter((k) => !intendedKeys.has(k));

  console.log(
    JSON.stringify(
      {
        before,
        intendedA: intendedA.length,
        contentDupes: contentDupeKeys.length,
        accidentalPresent: accidental.length,
        missingIntended: missingIntended.length,
        extraKeys: extraKeys.length,
        contentDupeKeys,
        accidental,
      },
      null,
      2
    )
  );

  if (intendedA.length !== 789 || contentDupeKeys.length !== 7) {
    throw new Error(
      `baseline_plan_drift intendedA=${intendedA.length} contentDupes=${contentDupeKeys.length}`
    );
  }

  let deleted = 0;
  if (repair) {
    if (accidental.length === 0 && before === 789) {
      console.log("[repair] nothing to delete; already at 789");
    } else {
      if (accidental.length !== 7 && before !== 796) {
        throw new Error(
          `unexpected_state before=${before} accidental=${accidental.length}`
        );
      }
      for (const key of accidental) {
        const { data, error } = await sb
          .from("notification_events")
          .delete()
          .eq("dedupe_key", key)
          .like("dedupe_key", "legacy:notifications:%")
          .select("id, dedupe_key");
        if (error) throw error;
        deleted += (data ?? []).length;
      }
    }
  }

  const after = await countLegacyPrefixed(sb);
  const keysAfter = await fetchCanonicalLegacyDedupeKeys(sb);
  const contentIdentitySeed = baseline.contentIdentitySeed;
  const reportAfter = dryRunLegacyNotificationsBackfill(legacyRows, {
    canonicalDedupeKeys: keysAfter,
    contentIdentitySeed,
  });
  const secondProposed = planBackfillSecondRun(legacyRows, {
    canonicalDedupeKeys: keysAfter,
    contentIdentitySeed,
  }).proposedInserts;

  // Contamination checks on intended A set
  const { count: storeRecipientCount, error: storeErr } = await sb
    .from("notification_events")
    .select("id", { count: "exact", head: true })
    .like("dedupe_key", "legacy:notifications:%")
    .like("user_id", "store:%");
  if (storeErr && !/invalid|uuid|operator/i.test(storeErr.message)) throw storeErr;

  const evidence = {
    head,
    origin,
    repair,
    deletedAccidentalContentDupes: deleted,
    beforeLegacyPrefixed: before,
    afterLegacyPrefixed: after,
    intendedA: 789,
    contentIdentityDuplicatesExcluded: 7,
    secondRunProposedInserts: secondProposed,
    reportAfter,
    missingIntendedAfter: [...intendedKeys].filter((k) => !keysAfter.has(k)).length,
    extraAfter: [...keysAfter].filter((k) => !intendedKeys.has(k)).length,
    storeRecipientLegacyEvents: storeRecipientCount ?? 0,
    quarantineExcluded: reportAfter.quarantinedExcluded,
    unknown: reportAfter.unknownClassification,
    contamination: reportAfter.identityContamination,
    pass:
      after === 789 &&
      secondProposed === 0 &&
      reportAfter.quarantinedExcluded === 65 &&
      reportAfter.unknownClassification === 0 &&
      reportAfter.identityContamination === 0 &&
      reportAfter.proposedInserts === 0 &&
      ([...intendedKeys].filter((k) => !keysAfter.has(k)).length === 0) &&
      ([...keysAfter].filter((k) => !intendedKeys.has(k)).length === 0),
    deployAllowed: false,
  };

  const stamp = Date.now();
  const path = join(OUT_DIR, `apply-repair-verify-${stamp}.json`);
  writeFileSync(path, JSON.stringify(evidence, null, 2));
  writeFileSync(join(OUT_DIR, "apply-result-latest.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  console.log("[repair-verify]", path);
  if (!evidence.pass) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
