#!/usr/bin/env npx tsx
/**
 * Gate 3 — Live Production Cutover Dry-run (READ ONLY).
 *
 * FORBIDDEN: INSERT/UPDATE/DELETE · backfill apply · deploy
 *
 *   npx tsx --env-file=.env.local scripts/gate3-live-production-cutover-dry-run.ts
 *
 * Verdict READY only when:
 *   unknown=0 · identityContamination=0 · unresolvedDuplicate=0 · unsafeBackfillRow=0
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertBackfillIdempotent,
  dryRunLegacyNotificationsBackfill,
  planLegacyNotificationsBackfill,
  type LegacyBackfillPlanItem,
  type LegacyNotificationsBackfillRow,
} from "@/lib/notifications/badge-authority-rebuild/legacy-cutover-backfill";
import { isRoomUuidFallbackIdentityKey } from "@/lib/notifications/badge-authority-rebuild/canonical-conversation-room-identity";

const OUT_DIR = join(process.cwd(), ".qa-logs/badge-gate3-live-dry-run");
const PAGE = 1000;
const LIST_CAP = 500;

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

async function fetchAllNotifications(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any
): Promise<LegacyNotificationsBackfillRow[]> {
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
      // Some envs lack soft-delete columns — retry minimal select
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

async function fetchCanonicalLegacyDedupeKeys(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any
): Promise<Set<string>> {
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

/** Unread participant rooms with missing / UUID-fallback identity (quarantine risk). */
async function countRoomIdentityQuarantineRisk(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any
): Promise<{
  unreadRoomRows: number;
  missingDomainIdentityKey: number;
  roomUuidFallbackKey: number;
  sample: Array<{ roomId: string; chatDomain: string; domainIdentityKey: string }>;
}> {
  const { data: parts, error: pErr } = await sb
    .from("community_messenger_participants")
    .select("room_id")
    .gt("unread_count", 0)
    .is("left_at", null)
    .limit(5000);
  if (pErr) {
    return {
      unreadRoomRows: 0,
      missingDomainIdentityKey: 0,
      roomUuidFallbackKey: 0,
      sample: [],
    };
  }
  const partRows = (parts ?? []) as Array<{ room_id?: unknown }>;
  const roomIds = [
    ...new Set(partRows.map((p) => trim(p.room_id)).filter(Boolean)),
  ];
  if (roomIds.length === 0) {
    return {
      unreadRoomRows: 0,
      missingDomainIdentityKey: 0,
      roomUuidFallbackKey: 0,
      sample: [],
    };
  }

  let missingDomainIdentityKey = 0;
  let roomUuidFallbackKey = 0;
  const sample: Array<{ roomId: string; chatDomain: string; domainIdentityKey: string }> =
    [];

  for (let i = 0; i < roomIds.length; i += 200) {
    const chunk = roomIds.slice(i, i + 200);
    const { data: rooms, error: rErr } = await sb
      .from("community_messenger_rooms")
      .select("id, chat_domain, domain_identity_key, deleted_at")
      .in("id", chunk);
    if (rErr) continue;
    for (const r of rooms ?? []) {
      if (trim((r as { deleted_at?: unknown }).deleted_at)) continue;
      const roomId = trim((r as { id?: unknown }).id);
      const chatDomain = trim((r as { chat_domain?: unknown }).chat_domain);
      const key = trim((r as { domain_identity_key?: unknown }).domain_identity_key);
      if (!key) {
        missingDomainIdentityKey += 1;
        if (sample.length < LIST_CAP) {
          sample.push({ roomId, chatDomain, domainIdentityKey: "" });
        }
        continue;
      }
      if (isRoomUuidFallbackIdentityKey(key)) {
        roomUuidFallbackKey += 1;
        if (sample.length < LIST_CAP) {
          sample.push({ roomId, chatDomain, domainIdentityKey: key });
        }
      }
    }
  }

  return {
    unreadRoomRows: roomIds.length,
    missingDomainIdentityKey,
    roomUuidFallbackKey,
    sample,
  };
}

function findUnresolvedDuplicates(
  rows: readonly LegacyNotificationsBackfillRow[],
  plan: readonly LegacyBackfillPlanItem[]
): Array<{ kind: string; key: string; legacyIds: string[] }> {
  const out: Array<{ kind: string; key: string; legacyIds: string[] }> = [];
  const byLegacyId = new Map<string, string[]>();
  for (const r of rows) {
    const id = trim(r.id);
    if (!id) continue;
    const arr = byLegacyId.get(id) ?? [];
    arr.push(id);
    byLegacyId.set(id, arr);
  }
  for (const [id, arr] of byLegacyId) {
    if (arr.length > 1) {
      out.push({ kind: "duplicate_legacy_id", key: id, legacyIds: arr });
    }
  }

  const byDedupe = new Map<string, string[]>();
  for (const p of plan) {
    if (p.disposition !== "backfill_a") continue;
    const arr = byDedupe.get(p.dedupeKey) ?? [];
    arr.push(p.legacyId);
    byDedupe.set(p.dedupeKey, arr);
  }
  for (const [key, legacyIds] of byDedupe) {
    if (legacyIds.length > 1) {
      out.push({ kind: "duplicate_proposed_dedupe", key, legacyIds });
    }
  }
  return out;
}

function findUnsafeBackfillRows(
  plan: readonly LegacyBackfillPlanItem[]
): Array<{ legacyId: string; reason: string }> {
  const unsafe: Array<{ legacyId: string; reason: string }> = [];
  for (const p of plan) {
    if (p.disposition !== "backfill_a" || !p.proposed) continue;
    const prop = p.proposed;
    if (prop.recipientScope !== "member") {
      unsafe.push({ legacyId: p.legacyId, reason: "recipient_scope_not_member" });
    }
    if (!trim(prop.recipientMemberId) || prop.recipientMemberId !== p.userId) {
      unsafe.push({ legacyId: p.legacyId, reason: "member_id_mismatch_or_empty" });
    }
    if (p.userId.startsWith("store:")) {
      unsafe.push({ legacyId: p.legacyId, reason: "store_identity_as_member" });
    }
    if (!trim(prop.type) || !trim(prop.category)) {
      unsafe.push({ legacyId: p.legacyId, reason: "empty_type_or_category" });
    }
    if (!trim(prop.created_at)) {
      unsafe.push({ legacyId: p.legacyId, reason: "empty_created_at" });
    }
  }
  return unsafe;
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  mkdirSync(OUT_DIR, { recursive: true });
  const startedAt = new Date().toISOString();

  console.log("[live-dry-run] fetching notifications…");
  const legacyRows = await fetchAllNotifications(sb);
  console.log("[live-dry-run] legacy rows:", legacyRows.length);

  console.log("[live-dry-run] fetching canonical legacy dedupe keys…");
  const canonicalKeys = await fetchCanonicalLegacyDedupeKeys(sb);
  console.log("[live-dry-run] existing legacy:* events:", canonicalKeys.size);

  const plan = planLegacyNotificationsBackfill(legacyRows, {
    canonicalDedupeKeys: canonicalKeys,
  });
  const report = dryRunLegacyNotificationsBackfill(legacyRows, {
    canonicalDedupeKeys: canonicalKeys,
  });
  const idempotent = assertBackfillIdempotent(legacyRows);

  const unknownList = plan
    .filter((p) => p.disposition === "unknown")
    .slice(0, LIST_CAP)
    .map((p) => ({
      legacyId: p.legacyId,
      userId: p.userId,
      reason: p.reason,
      dedupeKey: p.dedupeKey,
    }));

  const contaminationList = plan
    .filter((p) => p.disposition === "identity_contamination")
    .slice(0, LIST_CAP)
    .map((p) => ({
      legacyId: p.legacyId,
      userId: p.userId,
      reason: p.reason,
      dedupeKey: p.dedupeKey,
    }));

  const unresolvedDuplicates = findUnresolvedDuplicates(legacyRows, plan);
  const unsafeBackfillRows = findUnsafeBackfillRows(plan);

  console.log("[live-dry-run] room identity quarantine scan…");
  const roomQuarantine = await countRoomIdentityQuarantineRisk(sb);

  const liveCutoverReady =
    report.unknownClassification === 0 &&
    report.identityContamination === 0 &&
    unresolvedDuplicates.length === 0 &&
    unsafeBackfillRows.length === 0 &&
    idempotent.ok;
  // Quarantine may be >0; it is an explicit disposition, not UNKNOWN.

  const verdict = liveCutoverReady
    ? "LIVE PRODUCTION CUTOVER READY"
    : "LIVE PRODUCTION CUTOVER BLOCKED";

  const payload = {
    authority: "gate3_live_production_cutover_dry_run_v1",
    startedAt,
    finishedAt: new Date().toISOString(),
    apply: false,
    supabaseHost: (() => {
      try {
        return new URL(url).host;
      } catch {
        return "unknown";
      }
    })(),
    counts: {
      legacyTotalRows: report.legacyTotalRows,
      aBackfillEligible: report.eligibleForA,
      bExcludedChat: report.eligibleForB,
      cExcludedOwner: report.eligibleForC,
      pushOnlyExcluded: report.pushOnlyExcluded,
      deletedExcluded: report.deletedRows,
      readRowsPreserved: report.readRows,
      alreadyCanonicalDuplicate: report.alreadyCanonicalDuplicate,
      unknownClassification: report.unknownClassification,
      identityContamination: report.identityContamination,
      quarantinedExcluded: report.quarantinedExcluded,
      quarantineReasons: report.quarantineReasons,
      proposedInserts: report.proposedInserts,
      aBackfillEligibleDeltaNote:
        "includes former unknowns reclassified to A when identity proven",
      secondRunInserts: idempotent.ok ? 0 : idempotent.secondInserts,
      unresolvedDuplicate: unresolvedDuplicates.length,
      unsafeBackfillRow: unsafeBackfillRows.length,
      contentIdentityCollisions: plan.filter(
        (p) => p.reason === "duplicate_content_identity"
      ).length,
      roomQuarantineMissingKey: roomQuarantine.missingDomainIdentityKey,
      roomQuarantineUuidFallback: roomQuarantine.roomUuidFallbackKey,
      roomUnreadDistinct: roomQuarantine.unreadRoomRows,
    },
    gates: {
      unknown: report.unknownClassification,
      identityContamination: report.identityContamination,
      unresolvedDuplicate: unresolvedDuplicates.length,
      unsafeBackfillRow: unsafeBackfillRows.length,
      secondRunInserts: idempotent.ok ? 0 : idempotent.secondInserts,
    },
    libraryCutoverReady: report.cutoverReady,
    liveCutoverReady,
    verdict,
    lists: {
      unknown: unknownList,
      identityContamination: contaminationList,
      unresolvedDuplicates: unresolvedDuplicates.slice(0, LIST_CAP),
      unsafeBackfillRows: unsafeBackfillRows.slice(0, LIST_CAP),
      roomQuarantineSample: roomQuarantine.sample,
    },
  };

  const stamp = Date.now();
  const jsonPath = join(OUT_DIR, `dry-run-${stamp}.json`);
  const latestPath = join(OUT_DIR, "dry-run-latest.json");
  const mdPath = join(OUT_DIR, `dry-run-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  writeFileSync(latestPath, JSON.stringify(payload, null, 2));

  const md = [
    `# Live Production Cutover Dry-run`,
    ``,
    `**Verdict:** \`${verdict}\``,
    ``,
    `| Metric | Count |`,
    `|--------|------:|`,
    `| legacy total rows | ${payload.counts.legacyTotalRows} |`,
    `| A backfill eligible | ${payload.counts.aBackfillEligible} |`,
    `| B exclude (chat) | ${payload.counts.bExcludedChat} |`,
    `| C exclude (owner) | ${payload.counts.cExcludedOwner} |`,
    `| push-only exclude | ${payload.counts.pushOnlyExcluded} |`,
    `| deleted exclude | ${payload.counts.deletedExcluded} |`,
    `| read rows (preserved flag) | ${payload.counts.readRowsPreserved} |`,
    `| already canonical duplicate | ${payload.counts.alreadyCanonicalDuplicate} |`,
    `| unknown | ${payload.counts.unknownClassification} |`,
    `| identity contamination | ${payload.counts.identityContamination} |`,
    `| quarantined excluded | ${payload.counts.quarantinedExcluded} |`,
    `| unresolved duplicate | ${payload.counts.unresolvedDuplicate} |`,
    `| unsafe backfill row | ${payload.counts.unsafeBackfillRow} |`,
    `| content identity collisions | ${payload.counts.contentIdentityCollisions} |`,
    `| proposed inserts | ${payload.counts.proposedInserts} |`,
    `| second run inserts | ${payload.counts.secondRunInserts} |`,
    ``,
    `### Quarantine reasons`,
    ``,
    ...Object.entries(payload.counts.quarantineReasons as Record<string, number>).map(
      ([k, v]) => `| ${k} | ${v} |`
    ),
    `| room quarantine missing key | ${payload.counts.roomQuarantineMissingKey} |`,
    `| room quarantine *:room: key | ${payload.counts.roomQuarantineUuidFallback} |`,
    ``,
    `## READY gates`,
    ``,
    `| Gate | Value | Required |`,
    `|------|------:|----------|`,
    `| unknown | ${payload.gates.unknown} | 0 |`,
    `| identity contamination | ${payload.gates.identityContamination} | 0 |`,
    `| unresolved duplicate | ${payload.gates.unresolvedDuplicate} | 0 |`,
    `| unsafe backfill row | ${payload.gates.unsafeBackfillRow} | 0 |`,
    ``,
    `## Unknown list (cap ${LIST_CAP})`,
    ``,
    unknownList.length
      ? unknownList.map((u) => `- \`${u.legacyId}\` user=\`${u.userId}\` · ${u.reason}`).join("\n")
      : "_none_",
    ``,
    `## Identity contamination list (cap ${LIST_CAP})`,
    ``,
    contaminationList.length
      ? contaminationList
          .map((u) => `- \`${u.legacyId}\` user=\`${u.userId}\` · ${u.reason}`)
          .join("\n")
      : "_none_",
    ``,
    `Apply: **FORBIDDEN** in this run.`,
    ``,
  ].join("\n");
  writeFileSync(mdPath, md);

  console.log(md);
  console.log("[live-dry-run] wrote", jsonPath);
  console.log("[live-dry-run] VERDICT:", verdict);

  if (!liveCutoverReady) process.exitCode = 2;
}

main().catch((err) => {
  console.error("[live-dry-run] FAIL", err);
  process.exit(1);
});
