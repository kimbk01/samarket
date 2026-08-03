/**
 * Gate 3 Step 10/14 — Legacy → Canonical A backfill (pure plan / dry-run).
 *
 * Production apply is FORBIDDEN until LIVE PRODUCTION CUTOVER READY.
 * Dedupe: legacy:notifications:{legacyId} (deterministic).
 * Idempotent: second plan against same canonical dedupe set → inserts 0.
 *
 * Unknown means "no disposition". Explicit quarantine is NOT unknown.
 */

import {
  isOwnerIntakeAttentionKey,
  isOwnerStoreOperationMetaKind,
} from "@/lib/notifications/badge-authority-rebuild/phase1-authority-contract";
import { isChatMessageNotificationType } from "@/lib/notifications/chat-notification-attention-projection";

export const LEGACY_CUTOVER_BACKFILL = "legacy_cutover_backfill_v2" as const;

export type LegacyNotificationsBackfillRow = Readonly<{
  id: string;
  user_id: string;
  notification_type: string;
  is_read: boolean;
  created_at: string;
  title?: string | null;
  body?: string | null;
  link_url?: string | null;
  ref_id?: string | null;
  meta?: Record<string, unknown> | null;
  push_kind?: string | null;
  deleted_at?: string | null;
  dismissed_at?: string | null;
}>;

export type LegacyBackfillDisposition =
  | "backfill_a"
  | "exclude_chat"
  | "exclude_owner_c"
  | "exclude_push_only"
  | "exclude_deleted"
  | "already_canonical"
  | "quarantine_excluded"
  | "unknown"
  | "identity_contamination";

export type LegacyQuarantineReason =
  | "quarantined_status_empty"
  | "quarantined_report_unresolved"
  | "quarantined_review_identity_incomplete"
  | "quarantined_trade_offer_unstructured"
  | "quarantined_community_identity_incomplete";

export type LegacyBackfillPlanItem = Readonly<{
  disposition: LegacyBackfillDisposition;
  legacyId: string;
  userId: string;
  dedupeKey: string;
  reason: string;
  /** Collapses structured trade offers (same offer → one A insert). */
  contentIdentityKey?: string | null;
  proposed?: Readonly<{
    type: string;
    category: string;
    title: string;
    body: string | null;
    unread: boolean;
    read_at: string | null;
    created_at: string;
    targetRoute: string | null;
    recipientScope: "member";
    recipientMemberId: string;
    meta?: Record<string, unknown>;
  }>;
}>;

export type LegacyBackfillDryRunReport = Readonly<{
  authority: typeof LEGACY_CUTOVER_BACKFILL;
  legacyTotalRows: number;
  eligibleForA: number;
  eligibleForB: number;
  eligibleForC: number;
  pushOnlyExcluded: number;
  alreadyCanonicalDuplicate: number;
  quarantinedExcluded: number;
  quarantineReasons: Readonly<Record<string, number>>;
  unknownClassification: number;
  identityContamination: number;
  readRows: number;
  deletedRows: number;
  proposedInserts: number;
  /** Ready when unknown + contamination are 0 (quarantine allowed). */
  cutoverReady: boolean;
}>;

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function metaKind(meta: Record<string, unknown> | null | undefined): string {
  if (!meta) return "";
  return trim(meta.kind ?? meta.notification_type ?? meta.event);
}

function metaStr(
  meta: Record<string, unknown> | null | undefined,
  keys: string[]
): string {
  if (!meta) return "";
  for (const k of keys) {
    const v = trim(meta[k]);
    if (v) return v;
  }
  return "";
}

export function legacyNotificationsDedupeKey(legacyId: string): string {
  return `legacy:notifications:${trim(legacyId)}`;
}

function hasSourceEntity(row: LegacyNotificationsBackfillRow): boolean {
  const meta = row.meta ?? {};
  if (
    metaStr(meta, [
      "post_id",
      "comment_id",
      "reply_id",
      "target_id",
      "entity_id",
      "source_id",
      "offer_id",
      "trade_offer_id",
      "listing_id",
      "item_id",
      "product_id",
      "order_id",
      "review_id",
    ])
  ) {
    return true;
  }
  if (trim(row.ref_id)) return true;
  if (trim(row.link_url)) return true;
  if (trim(row.title) || trim(row.body)) return true;
  return false;
}

function hasTradeOfferStructure(row: LegacyNotificationsBackfillRow): {
  ok: boolean;
  offerKey: string;
} {
  const meta = row.meta ?? {};
  const offerId = metaStr(meta, ["offer_id", "trade_offer_id", "price_offer_id"]);
  const listingId = metaStr(meta, ["listing_id", "item_id", "product_id", "post_id"]);
  const ref = trim(row.ref_id);
  if (offerId) return { ok: true, offerKey: `offer:${offerId}` };
  if (listingId && (ref || offerId || trim(row.link_url))) {
    return { ok: true, offerKey: `listing:${listingId}:${ref || trim(row.link_url)}` };
  }
  if (listingId) return { ok: true, offerKey: `listing:${listingId}` };
  if (ref && (trim(row.link_url).includes("offer") || trim(row.link_url).includes("trade"))) {
    return { ok: true, offerKey: `ref:${ref}` };
  }
  return { ok: false, offerKey: "" };
}

function hasReviewIdentity(row: LegacyNotificationsBackfillRow): boolean {
  const meta = row.meta ?? {};
  return Boolean(
    metaStr(meta, ["review_id", "order_id", "listing_id", "item_id", "product_id", "post_id"]) ||
      trim(row.ref_id) ||
      trim(row.link_url)
  );
}

function proposeA(
  row: LegacyNotificationsBackfillRow,
  userId: string,
  legacyId: string,
  dedupeKey: string,
  reason: string,
  canonical: { type: string; category: string; meta?: Record<string, unknown> },
  contentIdentityKey?: string | null
): LegacyBackfillPlanItem {
  const read = row.is_read === true;
  const created = trim(row.created_at) || new Date(0).toISOString();
  return {
    disposition: "backfill_a",
    legacyId,
    userId,
    dedupeKey,
    reason,
    contentIdentityKey: contentIdentityKey ?? null,
    proposed: {
      type: canonical.type,
      category: canonical.category,
      title: trim(row.title) || "Notification",
      body: row.body ?? null,
      unread: !read,
      read_at: read ? created : null,
      created_at: created,
      targetRoute: trim(row.link_url) || null,
      recipientScope: "member",
      recipientMemberId: userId,
      meta: {
        ...(row.meta ?? {}),
        ...(canonical.meta ?? {}),
        legacy_notification_type: trim(row.notification_type),
        legacy_kind: metaKind(row.meta),
      },
    },
  };
}

function quarantine(
  legacyId: string,
  userId: string,
  dedupeKey: string,
  reason: LegacyQuarantineReason
): LegacyBackfillPlanItem {
  return {
    disposition: "quarantine_excluded",
    legacyId,
    userId,
    dedupeKey,
    reason,
  };
}

/**
 * Classify one legacy notifications row for cutover dry-run / backfill plan.
 */
export function classifyLegacyNotificationsRowForBackfill(
  row: LegacyNotificationsBackfillRow,
  opts?: {
    canonicalDedupeKeys?: ReadonlySet<string>;
    expectedMemberId?: string | null;
  }
): LegacyBackfillPlanItem {
  const legacyId = trim(row.id);
  const userId = trim(row.user_id);
  const dedupeKey = legacyNotificationsDedupeKey(legacyId);
  const type = trim(row.notification_type);
  const kind = metaKind(row.meta);
  const pushKind = trim(row.push_kind).toLowerCase();
  const meta = row.meta ?? {};

  if (!legacyId || !userId) {
    return {
      disposition: "identity_contamination",
      legacyId: legacyId || "missing",
      userId: userId || "missing",
      dedupeKey,
      reason: "missing_legacy_id_or_user",
    };
  }

  const expected = trim(opts?.expectedMemberId ?? "");
  if (expected && expected !== userId) {
    return {
      disposition: "identity_contamination",
      legacyId,
      userId,
      dedupeKey,
      reason: "member_scope_mismatch",
    };
  }

  if (userId.startsWith("store:")) {
    return {
      disposition: "identity_contamination",
      legacyId,
      userId,
      dedupeKey,
      reason: "store_identity_as_member",
    };
  }

  if (trim(row.deleted_at) || trim(row.dismissed_at)) {
    return {
      disposition: "exclude_deleted",
      legacyId,
      userId,
      dedupeKey,
      reason: "legacy_deleted_or_dismissed",
    };
  }

  if (opts?.canonicalDedupeKeys?.has(dedupeKey)) {
    return {
      disposition: "already_canonical",
      legacyId,
      userId,
      dedupeKey,
      reason: "dedupe_key_exists",
    };
  }

  // Chat → Conversation B (never A event clone)
  if (
    isChatMessageNotificationType(type) ||
    type === "chat" ||
    pushKind === "chat" ||
    kind === "community_chat" ||
    kind === "trade_chat" ||
    kind === "group_chat" ||
    kind === "group_message" ||
    kind === "store_order_message"
  ) {
    return {
      disposition: "exclude_chat",
      legacyId,
      userId,
      dedupeKey,
      reason: "chat_belongs_to_conversation_b",
    };
  }

  // Owner C
  const attentionGuess =
    kind === "store_order_created" || kind.includes("owner")
      ? `order_status:owner_intake:${trim(meta.order_id ?? row.ref_id)}`
      : "";
  if (
    (kind && isOwnerStoreOperationMetaKind(kind)) ||
    (attentionGuess && isOwnerIntakeAttentionKey(attentionGuess)) ||
    (kind.startsWith("store_order") && kind.includes("owner"))
  ) {
    return {
      disposition: "exclude_owner_c",
      legacyId,
      userId,
      dedupeKey,
      reason: "owner_store_authority_c",
    };
  }

  // Push-only / marketing ephemeral
  if (
    type === "admin_marketing_banner" ||
    type === "marketing" ||
    kind === "admin_marketing_banner" ||
    pushKind === "marketing"
  ) {
    return {
      disposition: "exclude_push_only",
      legacyId,
      userId,
      dedupeKey,
      reason: "push_only_not_persistent_a",
    };
  }

  // --- Product disposition for former unknowns (Gate 3 live 245) ---

  // 1.1 Community like/comment — do not trust type===report alone
  const communityKind =
    kind === "community_like" ||
    kind === "community_reaction" ||
    kind === "community_comment" ||
    kind === "community_reply" ||
    type === "community_like" ||
    type === "community_comment" ||
    type === "community_reply" ||
    type === "community_reaction";

  if (communityKind) {
    // Recipient (userId) + community_* kind/domain is enough for A.
    // Prefer entity/route when present; never send to B/C.
    let cType = "community_reaction";
    if (kind === "community_comment" || type === "community_comment") cType = "community_comment";
    else if (kind === "community_reply" || type === "community_reply") cType = "community_reply";
    else if (kind === "community_like" || kind === "community_reaction") cType = "community_reaction";
    return proposeA(row, userId, legacyId, dedupeKey, "community_member_a", {
      type: cType,
      category: "community_activity",
      meta: { community_source_proven: hasSourceEntity(row) },
    });
  }

  // 1.3 trade lifecycle status
  if (
    kind === "trade_completed" ||
    kind === "trade_reserved" ||
    kind === "trade_status" ||
    type === "trade_status"
  ) {
    const status =
      kind === "trade_completed" || kind === "trade_reserved" ? kind : kind || "trade_status";
    return proposeA(
      row,
      userId,
      legacyId,
      dedupeKey,
      "trade_status_member_a",
      {
        type: "trade_status_changed",
        category: "trade_status",
        meta: { trade_status: status },
      }
    );
  }

  // 1.4 trade_offer — structured only
  if (kind === "trade_offer" || type === "trade_offer" || kind === "offer_created") {
    const structured = hasTradeOfferStructure(row);
    if (!structured.ok) {
      return quarantine(legacyId, userId, dedupeKey, "quarantined_trade_offer_unstructured");
    }
    const cType =
      kind === "offer_created" || metaStr(meta, ["offer_action"]) === "created"
        ? "trade_offer_received"
        : "trade_offer_updated";
    return proposeA(
      row,
      userId,
      legacyId,
      dedupeKey,
      "trade_offer_structured_a",
      { type: cType, category: "trade_status" },
      `trade_offer:${structured.offerKey}`
    );
  }

  // 1.5 review
  if (type === "review" || kind === "review" || kind.startsWith("review_")) {
    if (!hasReviewIdentity(row)) {
      return quarantine(legacyId, userId, dedupeKey, "quarantined_review_identity_incomplete");
    }
    let rType = "review_received";
    if (kind === "review_request" || type === "review_request") rType = "review_request";
    else if (kind === "review_result" || type === "review_result") rType = "review_result";
    else if (kind === "review_received") rType = "review_received";
    return proposeA(row, userId, legacyId, dedupeKey, "review_member_a", {
      type: rType,
      category: "community_activity",
    });
  }

  // 1.2 status + empty kind → explicit quarantine (not unknown)
  if (type === "status" && !kind) {
    return quarantine(legacyId, userId, dedupeKey, "quarantined_status_empty");
  }

  // 1.6 report/other unresolved (community_* already handled above)
  if (type === "report" || kind === "report") {
    return quarantine(legacyId, userId, dedupeKey, "quarantined_report_unresolved");
  }

  // Orphan missed_call only — room-bound missed stays B
  const roomId = trim(meta.room_id ?? meta.roomId);
  if ((type === "missed_call" || kind === "missed_call") && roomId) {
    return {
      disposition: "exclude_chat",
      legacyId,
      userId,
      dedupeKey,
      reason: "room_bound_missed_call_is_b",
    };
  }

  // Persistent A candidates (pre-existing)
  const aTypes = new Set([
    "admin_notice",
    "admin_announcement",
    "system",
    "trade",
    "trade_status",
    "commerce",
    "security_alert",
    "service_notice",
    "missed_call",
  ]);
  const aKinds = new Set([
    "admin_notice",
    "trade_status",
    "store_order_owner_status",
    "offer_created",
    "security_alert",
    "service_notice",
  ]);

  const isPersistentA =
    aTypes.has(type) ||
    aKinds.has(kind) ||
    (type === "commerce" && kind === "store_order_owner_status") ||
    type === "admin_notice";

  if (!isPersistentA) {
    return {
      disposition: "unknown",
      legacyId,
      userId,
      dedupeKey,
      reason: `unknown_type:${type || "empty"}:kind:${kind || "empty"}`,
    };
  }

  const mappedType =
    type === "system" ? "admin_notice" : type === "commerce" ? "order_status" : type;
  const mappedCategory = type === "commerce" ? "order_status" : type || "admin_notice";

  return proposeA(row, userId, legacyId, dedupeKey, "persistent_member_a", {
    type: mappedType,
    category: mappedCategory,
  });
}

/** Collapse structured content identities (e.g. same trade offer → one A). */
function collapseContentIdentityDuplicates(
  plan: LegacyBackfillPlanItem[],
  contentIdentitySeed?: ReadonlySet<string>
): LegacyBackfillPlanItem[] {
  const seen = new Set<string>();
  for (const k of contentIdentitySeed ?? []) {
    const ck = trim(k);
    if (ck) seen.add(ck);
  }
  return plan.map((item) => {
    const ck = trim(item.contentIdentityKey ?? "");
    if (!ck || item.disposition !== "backfill_a") return item;
    if (seen.has(ck)) {
      return {
        disposition: "already_canonical" as const,
        legacyId: item.legacyId,
        userId: item.userId,
        dedupeKey: item.dedupeKey,
        reason: "duplicate_content_identity",
        contentIdentityKey: ck,
      };
    }
    seen.add(ck);
    return item;
  });
}

export type LegacyBackfillPlanOpts = {
  canonicalDedupeKeys?: ReadonlySet<string>;
  expectedMemberId?: string | null;
  /** Content keys already represented in canonical / prior plan (idempotent second pass). */
  contentIdentitySeed?: ReadonlySet<string>;
};

export function planLegacyNotificationsBackfill(
  rows: readonly LegacyNotificationsBackfillRow[],
  opts?: LegacyBackfillPlanOpts
): LegacyBackfillPlanItem[] {
  const raw = rows.map((row) => classifyLegacyNotificationsRowForBackfill(row, opts));
  return collapseContentIdentityDuplicates(raw, opts?.contentIdentitySeed);
}

export function dryRunLegacyNotificationsBackfill(
  rows: readonly LegacyNotificationsBackfillRow[],
  opts?: LegacyBackfillPlanOpts
): LegacyBackfillDryRunReport {
  const plan = planLegacyNotificationsBackfill(rows, opts);
  const counts = {
    eligibleForA: 0,
    eligibleForB: 0,
    eligibleForC: 0,
    pushOnlyExcluded: 0,
    alreadyCanonicalDuplicate: 0,
    quarantinedExcluded: 0,
    unknownClassification: 0,
    identityContamination: 0,
    readRows: 0,
    deletedRows: 0,
    proposedInserts: 0,
  };
  const quarantineReasons: Record<string, number> = {};

  for (const item of plan) {
    switch (item.disposition) {
      case "backfill_a":
        counts.eligibleForA += 1;
        counts.proposedInserts += 1;
        break;
      case "exclude_chat":
        counts.eligibleForB += 1;
        break;
      case "exclude_owner_c":
        counts.eligibleForC += 1;
        break;
      case "exclude_push_only":
        counts.pushOnlyExcluded += 1;
        break;
      case "already_canonical":
        counts.alreadyCanonicalDuplicate += 1;
        break;
      case "quarantine_excluded":
        counts.quarantinedExcluded += 1;
        quarantineReasons[item.reason] = (quarantineReasons[item.reason] ?? 0) + 1;
        break;
      case "unknown":
        counts.unknownClassification += 1;
        break;
      case "identity_contamination":
        counts.identityContamination += 1;
        break;
      case "exclude_deleted":
        counts.deletedRows += 1;
        break;
      default:
        break;
    }
  }

  for (const row of rows) {
    if (row.is_read === true) counts.readRows += 1;
  }

  const cutoverReady =
    counts.unknownClassification === 0 && counts.identityContamination === 0;

  return {
    authority: LEGACY_CUTOVER_BACKFILL,
    legacyTotalRows: rows.length,
    ...counts,
    quarantineReasons,
    cutoverReady,
  };
}

export function assertBackfillIdempotent(
  rows: readonly LegacyNotificationsBackfillRow[]
): { ok: true; secondInserts: 0 } | { ok: false; secondInserts: number } {
  const first = planLegacyNotificationsBackfill(rows);
  const keys = new Set(
    first.filter((p) => p.disposition === "backfill_a").map((p) => p.dedupeKey)
  );
  const contentIdentitySeed = new Set(
    first
      .map((p) => trim(p.contentIdentityKey ?? ""))
      .filter(Boolean)
  );
  const second = dryRunLegacyNotificationsBackfill(rows, {
    canonicalDedupeKeys: keys,
    contentIdentitySeed,
  });
  if (second.proposedInserts !== 0) {
    return { ok: false, secondInserts: second.proposedInserts };
  }
  return { ok: true, secondInserts: 0 };
}

/** Every row must receive exactly one disposition (no missing). */
export function assertEveryRowHasDisposition(
  rows: readonly LegacyNotificationsBackfillRow[]
): { ok: true; count: number } | { ok: false; missing: number } {
  const plan = planLegacyNotificationsBackfill(rows);
  if (plan.length !== rows.length) {
    return { ok: false, missing: rows.length - plan.length };
  }
  const missing = plan.filter((p) => !p.disposition).length;
  if (missing > 0) return { ok: false, missing };
  return { ok: true, count: plan.length };
}
