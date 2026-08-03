#!/usr/bin/env npx tsx
/**
 * Gate 4 — Production Legacy → Canonical A backfill APPLY.
 *
 * CONTRACT (incident closeout):
 * - dry-run / apply / verify use planBackfillFirstRun + planBackfillSecondRun
 * - contentIdentitySeed ALWAYS passed (first: empty Set; second: from first plan)
 * - duplicate content-identity candidates excluded BEFORE insert
 * - repair DELETE is NOT in this script (see gate3-production-backfill-repair-verify.ts)
 *
 *   npx tsx --env-file=.env.local scripts/gate3-production-backfill-apply.ts
 *   CONFIRM_PRODUCTION_BACKFILL=1 npx tsx --env-file=.env.local scripts/gate3-production-backfill-apply.ts --apply
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertBackfillIdempotent,
  dryRunLegacyNotificationsBackfill,
  planBackfillFirstRun,
  planBackfillSecondRun,
  type LegacyBackfillPlanItem,
  type LegacyNotificationsBackfillRow,
} from "@/lib/notifications/badge-authority-rebuild/legacy-cutover-backfill";

const OUT_DIR = join(process.cwd(), ".qa-logs/badge-gate3-live-dry-run");
/** Pre-apply cold Production approved counts (Gate 3 freeze dry-run). */
const APPROVED_COLD = {
  legacyTotalRows: 6580,
  eligibleForA: 789,
  eligibleForB: 2660,
  eligibleForC: 3059,
  alreadyCanonicalDuplicate: 7,
  quarantinedExcluded: 65,
  unknownClassification: 0,
  identityContamination: 0,
  proposedInserts: 789,
} as const;
const PAGE = 1000;
const BATCH = 50;

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

/** Map proposed canonical labels → DB CHECK-allowed types/categories. */
function mapToDbEvent(proposed: NonNullable<LegacyBackfillPlanItem["proposed"]>): {
  type: string;
  category: string;
  canonicalLabel: string;
} {
  const label = trim(proposed.type);
  const cat = trim(proposed.category);

  if (
    label.startsWith("community_") ||
    label.startsWith("review_") ||
    cat === "community_activity"
  ) {
    return { type: "community_activity", category: "community_activity", canonicalLabel: label };
  }
  if (
    label.startsWith("trade_") ||
    label === "trade_status_changed" ||
    cat === "trade_status" ||
    label === "trade"
  ) {
    return { type: "trade_status", category: "trade_status", canonicalLabel: label };
  }
  if (label === "order_status" || cat === "order_status" || label === "commerce") {
    return { type: "order_status", category: "order_status", canonicalLabel: label };
  }
  if (label === "delivery_status" || cat === "delivery_status") {
    return { type: "delivery_status", category: "delivery_status", canonicalLabel: label };
  }
  if (label === "missed_call" || cat === "missed_call") {
    return { type: "missed_call", category: "missed_call", canonicalLabel: label };
  }
  if (
    label === "admin_notice" ||
    label === "admin_announcement" ||
    label === "system" ||
    label === "security_alert" ||
    label === "service_notice" ||
    cat === "admin_notice"
  ) {
    return { type: "admin_notice", category: "admin_notice", canonicalLabel: label };
  }
  return { type: "admin_notice", category: "admin_notice", canonicalLabel: label || "admin_notice" };
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

async function countLegacyPrefixedEvents(sb: any): Promise<number> {
  const { count, error } = await sb
    .from("notification_events")
    .select("id", { count: "exact", head: true })
    .like("dedupe_key", "legacy:notifications:%");
  if (error) throw error;
  return Math.max(0, Math.floor(Number(count) || 0));
}

function abort(msg: string): never {
  console.error("[backfill-apply] BLOCKED:", msg);
  throw new Error(`PRODUCTION_BACKFILL_BLOCKED:${msg}`);
}

async function applyBatch(
  sb: any,
  items: LegacyBackfillPlanItem[]
): Promise<{ inserted: number; duplicates: number; errors: Array<{ legacyId: string; error: string }> }> {
  let inserted = 0;
  let duplicates = 0;
  const errors: Array<{ legacyId: string; error: string }> = [];

  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    const rows = chunk.map((item) => {
      const p = item.proposed!;
      if (p.recipientScope !== "member" || p.recipientMemberId !== item.userId) {
        throw new Error(`recipient_mismatch:${item.legacyId}`);
      }
      if (item.userId.startsWith("store:")) {
        throw new Error(`store_recipient:${item.legacyId}`);
      }
      const mapped = mapToDbEvent(p);
      const unread = p.unread === true;
      return {
        user_id: item.userId,
        type: mapped.type,
        category: mapped.category,
        title: p.title || "Notification",
        body: p.body ?? "",
        unread,
        read_at: unread ? null : p.read_at || p.created_at,
        delivered_at: p.created_at,
        created_at: p.created_at,
        dedupe_key: item.dedupeKey,
        muted_snapshot: false,
        push_suppressed_reason: "user_settings",
        display_payload: {
          targetRoute: p.targetRoute,
          legacyBackfill: true,
          canonicalLabel: mapped.canonicalLabel,
          ...(p.meta ?? {}),
        },
      };
    });

    const { data, error } = await sb.from("notification_events").insert(rows).select("id, dedupe_key");
    if (!error) {
      inserted += (data ?? []).length;
      continue;
    }
    if ((error as { code?: string }).code === "23505" || /duplicate|unique/i.test(error.message)) {
      for (const row of rows) {
        const one = await sb.from("notification_events").insert(row).select("id").single();
        if (!one.error) {
          inserted += 1;
          continue;
        }
        if ((one.error as { code?: string }).code === "23505") {
          duplicates += 1;
          continue;
        }
        errors.push({
          legacyId: String(row.dedupe_key).replace(/^legacy:notifications:/, ""),
          error: String(one.error.message ?? "insert_failed"),
        });
      }
      continue;
    }
    abort(`batch_insert_failed:${error.message}`);
  }

  return { inserted, duplicates, errors };
}

async function main() {
  loadEnvLocal();
  const apply = process.argv.includes("--apply");
  if (apply && process.env.CONFIRM_PRODUCTION_BACKFILL !== "1") {
    abort("set CONFIRM_PRODUCTION_BACKFILL=1 with --apply");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) abort("missing SUPABASE credentials");

  const { execSync } = await import("node:child_process");
  const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const origin = execSync("git rev-parse origin/main", { encoding: "utf8" }).trim();
  if (head !== origin) abort(`head_ne_origin head=${head} origin=${origin}`);

  const sb = createClient(url, key, { auth: { persistSession: false } });
  mkdirSync(OUT_DIR, { recursive: true });

  console.log("[backfill-apply] preflight…");
  const legacyRows = await fetchAllNotifications(sb);
  const canonicalKeys = await fetchCanonicalLegacyDedupeKeys(sb);

  // Cold first-run plan: seed always present (empty on cold).
  const first = planBackfillFirstRun(legacyRows, {
    canonicalDedupeKeys: canonicalKeys,
    contentIdentitySeed: new Set(),
  });
  const report = dryRunLegacyNotificationsBackfill(legacyRows, {
    canonicalDedupeKeys: canonicalKeys,
    contentIdentitySeed: new Set(),
  });
  const idempotent = assertBackfillIdempotent(legacyRows);

  // Cold apply only when Production still matches approved dry-run.
  if (canonicalKeys.size === 0) {
    for (const [k, v] of Object.entries(APPROVED_COLD)) {
      const got = (report as Record<string, unknown>)[k];
      if (got !== v) abort(`preflight_${k}_expected_${v}_got_${got}`);
    }
  }
  if (!idempotent.ok) {
    abort(`preflight_second_run_not_zero:${idempotent.secondInserts}`);
  }
  if (first.contentIdentityDuplicateDedupeKeys.length !== 7 && canonicalKeys.size === 0) {
    abort(`content_dupes_expected_7_got_${first.contentIdentityDuplicateDedupeKeys.length}`);
  }
  if (first.toInsert.length !== 789 && canonicalKeys.size === 0) {
    abort(`toInsert_len_${first.toInsert.length}`);
  }

  // Duplicate candidates must not be in toInsert
  const dupSet = new Set(first.contentIdentityDuplicateDedupeKeys);
  if (first.toInsert.some((p) => dupSet.has(p.dedupeKey))) {
    abort("duplicate_content_identity_leaked_into_toInsert");
  }

  const beforeLegacyEvents = await countLegacyPrefixedEvents(sb);
  const stamp = Date.now();
  const preflightPath = join(OUT_DIR, `apply-preflight-${stamp}.json`);
  writeFileSync(
    preflightPath,
    JSON.stringify(
      {
        head,
        origin,
        report,
        beforeLegacyEvents,
        toInsert: first.toInsert.length,
        contentIdentityDuplicatesExcluded: first.contentIdentityDuplicateDedupeKeys.length,
        quarantineReasons: report.quarantineReasons,
        apply,
      },
      null,
      2
    )
  );
  console.log("[backfill-apply] preflight", preflightPath);

  if (!apply) {
    console.log("[backfill-apply] dry mode — pass --apply CONFIRM_PRODUCTION_BACKFILL=1 to execute");
    return;
  }

  if (canonicalKeys.size !== 0) {
    abort(`refuse_apply_when_legacy_canonical_already_present:${canonicalKeys.size}`);
  }

  console.log("[backfill-apply] FIRST RUN inserting", first.toInsert.length);
  const firstResult = await applyBatch(sb, first.toInsert);
  if (firstResult.errors.length) {
    writeFileSync(join(OUT_DIR, `apply-errors-${stamp}.json`), JSON.stringify(firstResult, null, 2));
    abort(`first_run_errors_${firstResult.errors.length}`);
  }

  const afterFirst = await countLegacyPrefixedEvents(sb);
  const firstRunNet = afterFirst - beforeLegacyEvents;
  console.log(
    "[backfill-apply] first inserted=",
    firstResult.inserted,
    "dup=",
    firstResult.duplicates,
    "net=",
    firstRunNet
  );

  if (firstResult.inserted !== 789) {
    abort(`first_run_inserts_ne_789:${firstResult.inserted}`);
  }

  console.log("[backfill-apply] SECOND RUN (must propose 0; no insert path)…");
  const keys2 = await fetchCanonicalLegacyDedupeKeys(sb);
  const second = planBackfillSecondRun(legacyRows, {
    canonicalDedupeKeys: keys2,
    contentIdentitySeed: first.contentIdentitySeed,
  });
  if (second.proposedInserts !== 0) {
    abort(`second_run_proposed_${second.proposedInserts}_before_apply`);
  }

  const afterSecond = await countLegacyPrefixedEvents(sb);
  const reportAfter = dryRunLegacyNotificationsBackfill(legacyRows, {
    canonicalDedupeKeys: keys2,
    contentIdentitySeed: first.contentIdentitySeed,
  });

  if (reportAfter.quarantinedExcluded !== 65) {
    abort(`quarantine_drift_${reportAfter.quarantinedExcluded}`);
  }
  if (reportAfter.unknownClassification !== 0 || reportAfter.identityContamination !== 0) {
    abort("post_unknown_or_contamination");
  }
  if (reportAfter.proposedInserts !== 0) {
    abort(`post_proposed_inserts_${reportAfter.proposedInserts}`);
  }

  const evidence = {
    verdict: "PRODUCTION BACKFILL PASS",
    head,
    origin,
    firstRunInserts: firstResult.inserted,
    firstRunDuplicates: firstResult.duplicates,
    firstRunNetLegacyPrefixed: firstRunNet,
    secondRunInserts: 0,
    secondRunProposed: second.proposedInserts,
    beforeLegacyEvents,
    afterFirst,
    afterSecond,
    contentIdentityDuplicatesExcluded: first.contentIdentityDuplicateDedupeKeys.length,
    quarantineExcluded: reportAfter.quarantinedExcluded,
    quarantineReasons: reportAfter.quarantineReasons,
    unknown: reportAfter.unknownClassification,
    contamination: reportAfter.identityContamination,
    proposedInsertsAfter: reportAfter.proposedInserts,
    deployAllowed: false,
  };
  const evidencePath = join(OUT_DIR, `apply-result-${stamp}.json`);
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  writeFileSync(join(OUT_DIR, "apply-result-latest.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  console.log("[backfill-apply] evidence", evidencePath);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
