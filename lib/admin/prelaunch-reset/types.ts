import { createHash } from "node:crypto";
import type { PrelaunchResetDomainId } from "@/lib/admin/prelaunch-reset/domain-inventory";
import type { PrelaunchResetSelectiveScope } from "@/lib/admin/prelaunch-reset/selective-scopes";

export type PrelaunchResetPreset =
  | "TEST_CONTENT_ONLY"
  | "TEST_MEMBER_DATA"
  | "TEST_STORE_DATA"
  | "TEST_COMMERCE_DATA"
  | "TEST_ADS_DATA"
  | "FULL_PRELAUNCH_TEST_DATA";

export type PrelaunchResetSelector = {
  memberIds: string[];
  storeIds: string[];
  /** Optional explicit content (trade/community post) ids — never date-range guess. */
  contentIds: string[];
  /** Optional explicit delivery ad campaign ids. */
  deliveryAdCampaignIds: string[];
  /** ARO-RST-COV-001 — community_comments ids (comments-only; posts preserved). */
  commentIds: string[];
  /** ARO-RST-COV-001 — support_cases ids (messages CASCADE). */
  supportCaseIds: string[];
  /** ARO-RST-COV-001 — feed_ad_campaigns ids (Point ledger preserved). */
  feedAdCampaignIds: string[];
  /** ARO-RST-COV-001 — feed_ad_requests ids. */
  feedAdRequestIds: string[];
  /** ARO-RST-COV-001 — platform_popup_campaigns ids (Cash ledger preserved). */
  popupCampaignIds: string[];
  /** ARO-RST-COV-001 — platform_popup_owner_requests ids. */
  popupRequestIds: string[];
  /** ARO-RST-COV-001 — store_coupon_campaigns ids (unused only). */
  couponCampaignIds: string[];
  /** ARO-RST-COV-001 — community_messenger_rooms ids (safe chat subset). */
  chatRoomIds: string[];
};

/** ARO-RST-001 — type selection bound into planHash (not UI-only). */
export type { PrelaunchResetSelectiveScope };

export type PrelaunchResetCountBucket =
  | "members"
  | "stores"
  | "orders"
  | "content"
  | "ads"
  | "messages"
  | "notifications"
  | "finance"
  | "gift"
  | "storage"
  | "other";

export type PrelaunchResetCounts = Record<PrelaunchResetCountBucket, number>;

export type PrelaunchResetEntityRef = {
  kind: "member" | "store" | "content" | "delivery_ad" | "protected" | "blocked";
  id: string;
  label: string;
  reason?: string;
};

export type PrelaunchResetDeleteStep = {
  id: string;
  domain: PrelaunchResetDomainId;
  table: string;
  filterDescription: string;
  estimatedRows: number;
  phase: "DB" | "STORAGE" | "AUTH";
  executableInCutH: boolean;
};

export type PrelaunchResetStorageObject = {
  bucket: string;
  path: string;
  sourceKind: "member" | "store" | "content" | "delivery_ad";
  sourceId: string;
  reference: string;
};

export type PrelaunchResetAuthTarget = {
  userId: string;
  email: string | null;
  linkedEntity: string;
  action: "DELETE" | "PRESERVE" | "BLOCKED";
  reason: string;
};

export type PrelaunchResetPlan = {
  planId: string;
  preset: PrelaunchResetPreset;
  selector: PrelaunchResetSelector;
  /** ARO-RST-001 selective type scopes (hash-bound). */
  selectedScopes: PrelaunchResetSelectiveScope[];
  /** Per-scope dry-run summary for UI (planner-owned; not fake). */
  scopeImpact: Array<{
    scope: PrelaunchResetSelectiveScope;
    estimatedDbRows: number;
    storageObjects: number;
    authDelete: number;
    status: "active" | "idle" | "blocked" | "skipped";
    detail: string;
  }>;
  resolved: PrelaunchResetEntityRef[];
  protectedEntities: PrelaunchResetEntityRef[];
  blockedEntities: PrelaunchResetEntityRef[];
  warnings: string[];
  blockers: string[];
  counts: PrelaunchResetCounts;
  deleteSteps: PrelaunchResetDeleteStep[];
  storageSteps: PrelaunchResetDeleteStep[];
  /** Explicit Storage objects bound into planHash (CUT I-P0-11). */
  storageObjects: PrelaunchResetStorageObject[];
  /** Explicit Auth targets with DELETE | PRESERVE | BLOCKED (CUT I-P0-11). */
  authTargets: PrelaunchResetAuthTarget[];
  financialGuards: string[];
  externalReferences: string[];
  planHash: string;
  createdAt: string;
  createdBy: string;
  environment: "local" | "staging" | "production";
  executeAllowed: boolean;
  typedConfirmationPhrase: string;
};

export type PrelaunchResetPhaseResult = {
  phase: "DB" | "STORAGE" | "AUTH" | "VERIFY";
  status: "PASS" | "FAIL" | "SKIPPED" | "NOT_IMPLEMENTED" | "BLOCKED" | "FORBIDDEN";
  detail: string;
  deletedCounts?: Partial<PrelaunchResetCounts>;
};

export function emptyCounts(): PrelaunchResetCounts {
  return {
    members: 0,
    stores: 0,
    orders: 0,
    content: 0,
    ads: 0,
    messages: 0,
    notifications: 0,
    finance: 0,
    gift: 0,
    storage: 0,
    other: 0,
  };
}

export function totalDestructiveCount(counts: PrelaunchResetCounts): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

export function hashPlanPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24);
}

export function typedConfirmationForPlan(counts: PrelaunchResetCounts, planHash: string): string {
  const n = totalDestructiveCount(counts);
  return `RESET TEST DATA ${n} ${planHash.slice(0, 8)}`;
}

export function normalizeSelector(raw: Partial<PrelaunchResetSelector> | null | undefined): PrelaunchResetSelector {
  const uniq = (xs: unknown) =>
    [...new Set((Array.isArray(xs) ? xs : []).map((x) => String(x ?? "").trim()).filter(Boolean))];
  return {
    memberIds: uniq(raw?.memberIds),
    storeIds: uniq(raw?.storeIds),
    contentIds: uniq(raw?.contentIds),
    deliveryAdCampaignIds: uniq(raw?.deliveryAdCampaignIds),
    commentIds: uniq(raw?.commentIds),
    supportCaseIds: uniq(raw?.supportCaseIds),
    feedAdCampaignIds: uniq(raw?.feedAdCampaignIds),
    feedAdRequestIds: uniq(raw?.feedAdRequestIds),
    popupCampaignIds: uniq(raw?.popupCampaignIds),
    popupRequestIds: uniq(raw?.popupRequestIds),
    couponCampaignIds: uniq(raw?.couponCampaignIds),
    chatRoomIds: uniq(raw?.chatRoomIds),
  };
}
