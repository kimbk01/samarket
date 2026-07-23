/**
 * Phase 11D-B — Legacy ↔ New Shadow Parity classifiers (read-only).
 * Legacy projection lives in scripts (community-messenger). This module must not
 * import @/lib/community-messenger (architecture boundary).
 *
 * FORBIDDEN: UI wiring · shadow write · merge · commit/push.
 */
import { createHash } from "node:crypto";

export const PHASE11D_B_SHADOW_WRITE = false as const;
export const PHASE11D_B_UI_WIRING = false as const;
export const PHASE11D_B_MERGE_FORBIDDEN = true as const;

/** overlapping room latestActivity 시계열 불일치 시 INVALID */
export const PHASE11D_B_ACTIVITY_SKEW_INVALID_MS = 2_000;

export type Phase11dBDiffClass =
  | "NEW_CORRECT_LEGACY_WRONG"
  | "LEGACY_CORRECT_NEW_MISSING"
  | "NEW_EXTRA_UNAUTHORIZED"
  | "POLICY_DIFFERENCE"
  | "PRESENTATION_DIFFERENCE"
  | "ORDERING_DIFFERENCE"
  | "UNKNOWN";

export type Phase11dBParityRow = Readonly<{
  roomId: string;
  chatDomain: string | null;
  domainIdentityKey: string | null;
  title: string;
  avatar: string | null;
  preview: string;
  lastMessageAt: string | null;
  unread: number;
  orderId?: string | null;
}>;

export type Phase11dBRoomDiff = Readonly<{
  roomId: string;
  domainIdentityKey: string | null;
  classification: Phase11dBDiffClass;
  reason: string;
  legacy?: Partial<Phase11dBParityRow> | null;
  neu?: Partial<Phase11dBParityRow> | null;
}>;

export type Phase11dBHubSnap = Readonly<{
  roomCount: number;
  unreadMetric: number;
  unreadUnit: "message_sum" | "unread_room_count";
  latestRoomId: string | null;
  latestActivityAt: string | null;
  preview: string;
  href: string;
}>;

export function hashIdentitySet(
  rows: ReadonlyArray<{ roomId: string; domainIdentityKey: string | null }>
): string {
  const parts = [...rows]
    .map((r) => `${r.roomId}:${r.domainIdentityKey ?? ""}`)
    .sort();
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex").slice(0, 16);
}

function classifyMissingInNew(
  legacyRow: Phase11dBParityRow,
  domain: string,
  opts?: {
    storeOrderOwnerRoomIds?: ReadonlySet<string>;
  }
): Phase11dBRoomDiff {
  if (domain === "store_order" && opts?.storeOrderOwnerRoomIds?.has(legacyRow.roomId)) {
    return {
      roomId: legacyRow.roomId,
      domainIdentityKey: legacyRow.domainIdentityKey,
      classification: "NEW_CORRECT_LEGACY_WRONG",
      reason:
        "store_order_owner_surface_in_legacy_home_excluded_from_customer_new_member_identity_likely",
      legacy: legacyRow,
      neu: null,
    };
  }
  return {
    roomId: legacyRow.roomId,
    domainIdentityKey: legacyRow.domainIdentityKey,
    classification: "LEGACY_CORRECT_NEW_MISSING",
    reason: `${domain}_present_in_legacy_absent_in_new`,
    legacy: legacyRow,
    neu: null,
  };
}

function classifyExtraInNew(
  newRow: Phase11dBParityRow,
  domain: string,
  opts: {
    legacyCap: number;
    legacyAllRoomIds: Set<string>;
    legacyLifecycleFilteredIds?: ReadonlySet<string>;
  }
): Phase11dBRoomDiff {
  if (!opts.legacyAllRoomIds.has(newRow.roomId)) {
    return {
      roomId: newRow.roomId,
      domainIdentityKey: newRow.domainIdentityKey,
      classification: "POLICY_DIFFERENCE",
      reason: `${domain}_in_new_not_in_legacy_home_sync_cap_${opts.legacyCap}_or_lifecycle`,
      legacy: null,
      neu: newRow,
    };
  }
  if (opts.legacyLifecycleFilteredIds?.has(newRow.roomId)) {
    return {
      roomId: newRow.roomId,
      domainIdentityKey: newRow.domainIdentityKey,
      classification: "POLICY_DIFFERENCE",
      reason: `${domain}_in_legacy_payload_but_hidden_by_lifecycle_filter`,
      legacy: null,
      neu: newRow,
    };
  }
  return {
    roomId: newRow.roomId,
    domainIdentityKey: newRow.domainIdentityKey,
    classification: "UNKNOWN",
    reason: `${domain}_in_new_and_legacy_all_but_not_in_filtered_surface`,
    legacy: null,
    neu: newRow,
  };
}

function presentationDiffs(
  domain: string,
  legacy: Phase11dBParityRow,
  neu: Phase11dBParityRow
): Phase11dBRoomDiff[] {
  const diffs: Phase11dBRoomDiff[] = [];
  const push = (
    field: "title" | "avatar" | "preview",
    lv: string | null | undefined,
    nv: string | null | undefined
  ) => {
    const a = (lv ?? "").trim();
    const b = (nv ?? "").trim();
    if (a === b) return;
    diffs.push({
      roomId: legacy.roomId,
      domainIdentityKey: neu.domainIdentityKey,
      classification: "PRESENTATION_DIFFERENCE",
      reason: `${domain}_${field}_mismatch`,
      legacy,
      neu,
    });
  };
  push("title", legacy.title, neu.title);
  push("avatar", legacy.avatar, neu.avatar);
  push("preview", legacy.preview, neu.preview);
  if ((legacy.unread ?? 0) !== (neu.unread ?? 0)) {
    diffs.push({
      roomId: legacy.roomId,
      domainIdentityKey: neu.domainIdentityKey,
      classification: "PRESENTATION_DIFFERENCE",
      reason: `${domain}_unread_count_mismatch`,
      legacy,
      neu,
    });
  }
  if ((legacy.domainIdentityKey ?? "") !== (neu.domainIdentityKey ?? "")) {
    diffs.push({
      roomId: legacy.roomId,
      domainIdentityKey: neu.domainIdentityKey,
      classification: "UNKNOWN",
      reason: `${domain}_domainIdentityKey_mismatch`,
      legacy,
      neu,
    });
  }
  if ((legacy.chatDomain ?? "") !== (neu.chatDomain ?? "")) {
    diffs.push({
      roomId: legacy.roomId,
      domainIdentityKey: neu.domainIdentityKey,
      classification: "NEW_CORRECT_LEGACY_WRONG",
      reason: `${domain}_chatDomain_mismatch_new_is_ssot`,
      legacy,
      neu,
    });
  }
  return diffs;
}

export function compareDomainRoomSets(input: {
  domain: "general_direct" | "group" | "trade" | "store_order";
  legacy: ReadonlyArray<Phase11dBParityRow>;
  neu: ReadonlyArray<Phase11dBParityRow>;
  legacyCap: number;
  legacyAllRoomIds: Set<string>;
  storeOrderOwnerRoomIds?: ReadonlySet<string>;
  legacyLifecycleHiddenIds?: ReadonlySet<string>;
}): {
  identityHashLegacy: string;
  identityHashNew: string;
  orderMatch: boolean;
  diffs: Phase11dBRoomDiff[];
} {
  const lMap = new Map(input.legacy.map((r) => [r.roomId, r]));
  const nMap = new Map(input.neu.map((r) => [r.roomId, r]));
  const diffs: Phase11dBRoomDiff[] = [];

  for (const [, row] of lMap) {
    if (!nMap.has(row.roomId)) {
      diffs.push(
        classifyMissingInNew(row, input.domain, {
          storeOrderOwnerRoomIds: input.storeOrderOwnerRoomIds,
        })
      );
    }
  }
  for (const [, row] of nMap) {
    if (!lMap.has(row.roomId)) {
      diffs.push(
        classifyExtraInNew(row, input.domain, {
          legacyCap: input.legacyCap,
          legacyAllRoomIds: input.legacyAllRoomIds,
          legacyLifecycleFilteredIds: input.legacyLifecycleHiddenIds,
        })
      );
    }
  }
  for (const [id, lrow] of lMap) {
    const nrow = nMap.get(id);
    if (!nrow) continue;
    diffs.push(...presentationDiffs(input.domain, lrow, nrow));
  }

  const lOrder = input.legacy.map((r) => r.roomId);
  const nOrder = input.neu.map((r) => r.roomId);
  const sameSet =
    lOrder.length === nOrder.length && [...lOrder].sort().join() === [...nOrder].sort().join();
  const orderMatch = lOrder.join() === nOrder.join();
  if (sameSet && !orderMatch) {
    diffs.push({
      roomId: "*",
      domainIdentityKey: null,
      classification: "ORDERING_DIFFERENCE",
      reason: `${input.domain}_same_set_different_order`,
      legacy: null,
      neu: null,
    });
  }

  return {
    identityHashLegacy: hashIdentitySet(input.legacy),
    identityHashNew: hashIdentitySet(input.neu),
    orderMatch,
    diffs,
  };
}

export function compareHubs(input: {
  domain: "trade" | "store_order";
  legacy: Phase11dBHubSnap;
  neu: Phase11dBHubSnap;
}): Phase11dBRoomDiff[] {
  const diffs: Phase11dBRoomDiff[] = [];
  if (input.legacy.roomCount !== input.neu.roomCount) {
    diffs.push({
      roomId: "*",
      domainIdentityKey: null,
      classification: "POLICY_DIFFERENCE",
      reason: `${input.domain}_hub_roomCount_legacy_home_cap_vs_full_domain`,
      legacy: { roomId: "*", title: String(input.legacy.roomCount) } as Phase11dBParityRow,
      neu: { roomId: "*", title: String(input.neu.roomCount) } as Phase11dBParityRow,
    });
  }
  if (input.legacy.latestRoomId !== input.neu.latestRoomId) {
    diffs.push({
      roomId: input.neu.latestRoomId ?? input.legacy.latestRoomId ?? "*",
      domainIdentityKey: null,
      classification:
        input.legacy.roomCount < input.neu.roomCount ? "POLICY_DIFFERENCE" : "UNKNOWN",
      reason: `${input.domain}_hub_latestRoomId_mismatch`,
      legacy: {
        roomId: input.legacy.latestRoomId ?? "",
        lastMessageAt: input.legacy.latestActivityAt,
        preview: input.legacy.preview,
      } as Phase11dBParityRow,
      neu: {
        roomId: input.neu.latestRoomId ?? "",
        lastMessageAt: input.neu.latestActivityAt,
        preview: input.neu.preview,
      } as Phase11dBParityRow,
    });
  } else if (
    input.legacy.preview !== input.neu.preview &&
    input.legacy.latestRoomId &&
    input.legacy.latestRoomId === input.neu.latestRoomId
  ) {
    diffs.push({
      roomId: input.legacy.latestRoomId,
      domainIdentityKey: null,
      classification: "PRESENTATION_DIFFERENCE",
      reason: `${input.domain}_hub_preview_mismatch`,
      legacy: { preview: input.legacy.preview } as Phase11dBParityRow,
      neu: { preview: input.neu.preview } as Phase11dBParityRow,
    });
  }
  if (input.legacy.href !== input.neu.href) {
    diffs.push({
      roomId: "*",
      domainIdentityKey: null,
      classification: "POLICY_DIFFERENCE",
      reason: `${input.domain}_hub_href_path_difference`,
      legacy: { title: input.legacy.href } as Phase11dBParityRow,
      neu: { title: input.neu.href } as Phase11dBParityRow,
    });
  }
  return diffs;
}

export function summarizeClassCounts(
  diffs: ReadonlyArray<Phase11dBRoomDiff>
): Record<Phase11dBDiffClass, number> {
  const out: Record<Phase11dBDiffClass, number> = {
    NEW_CORRECT_LEGACY_WRONG: 0,
    LEGACY_CORRECT_NEW_MISSING: 0,
    NEW_EXTRA_UNAUTHORIZED: 0,
    POLICY_DIFFERENCE: 0,
    PRESENTATION_DIFFERENCE: 0,
    ORDERING_DIFFERENCE: 0,
    UNKNOWN: 0,
  };
  for (const d of diffs) out[d.classification] += 1;
  return out;
}

export function evaluateUiCanaryGate(input: {
  validRounds: number;
  classCounts: Record<Phase11dBDiffClass, number>;
  ownerNameLeak: boolean;
  hubLatestAlignedWhenComparable: boolean;
}): { allowed: false; blockers: string[] } | { allowed: true; blockers: [] } {
  const blockers: string[] = [];
  if (input.validRounds < 3) blockers.push("valid_rounds_lt_3");
  if (input.classCounts.NEW_EXTRA_UNAUTHORIZED > 0) blockers.push("NEW_EXTRA_UNAUTHORIZED");
  if (input.classCounts.LEGACY_CORRECT_NEW_MISSING > 0) blockers.push("LEGACY_CORRECT_NEW_MISSING");
  if (input.ownerNameLeak) blockers.push("store_order_owner_identity_leak");
  if (!input.hubLatestAlignedWhenComparable) blockers.push("hub_latest_not_aligned");
  if (blockers.length) return { allowed: false, blockers };
  return { allowed: true, blockers: [] };
}

export function detectActivitySkewInvalid(input: {
  overlapping: ReadonlyArray<{ roomId: string; legacyAt: string | null; newAt: string | null }>;
}): { invalid: boolean; skewedRoomIds: string[] } {
  const skewedRoomIds: string[] = [];
  for (const o of input.overlapping) {
    if (!o.legacyAt || !o.newAt) continue;
    const a = Date.parse(o.legacyAt);
    const b = Date.parse(o.newAt);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (Math.abs(a - b) > PHASE11D_B_ACTIVITY_SKEW_INVALID_MS) {
      skewedRoomIds.push(o.roomId);
    }
  }
  return { invalid: skewedRoomIds.length > 0, skewedRoomIds };
}
