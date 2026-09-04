import { createHash } from "node:crypto";
import type { PrelaunchResetDomainId } from "@/lib/admin/prelaunch-reset/domain-inventory";

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
};

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

export type PrelaunchResetPlan = {
  planId: string;
  preset: PrelaunchResetPreset;
  selector: PrelaunchResetSelector;
  resolved: PrelaunchResetEntityRef[];
  protectedEntities: PrelaunchResetEntityRef[];
  blockedEntities: PrelaunchResetEntityRef[];
  warnings: string[];
  blockers: string[];
  counts: PrelaunchResetCounts;
  deleteSteps: PrelaunchResetDeleteStep[];
  storageSteps: PrelaunchResetDeleteStep[];
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
  };
}
