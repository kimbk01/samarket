/**
 * 어드민 「입점 계약」 목록 — 순수 규칙 (서버·화면·테스트 공용).
 * 실매장(store_kind='real')만. 필터: 승인 대기 / 승인 / 재동의 필요(현재 게시 버전 미동의) / 전체.
 */
import {
  activeFreeUntilOrNull,
  resolveLaunchFreeUntilForApproval,
  storeHasAgreedToVersion,
  type StorePartnerAgreementRow,
} from "@/lib/stores/partner/store-partner-agreement-contract";

export const ADMIN_PARTNER_AGREEMENT_FILTERS = ["pending", "approved", "reconsent", "all"] as const;
export type AdminPartnerAgreementFilter = (typeof ADMIN_PARTNER_AGREEMENT_FILTERS)[number];

export function parseAdminPartnerAgreementFilter(v: string | null | undefined): AdminPartnerAgreementFilter {
  const s = String(v ?? "").trim();
  return (ADMIN_PARTNER_AGREEMENT_FILTERS as readonly string[]).includes(s) ? (s as AdminPartnerAgreementFilter) : "pending";
}

/** 심사 상태 묶음 — 승인 대기 = 신청·심사 중·보완 요청, 승인 = 승인·운영 중지 */
export const PARTNER_PENDING_STATUSES = ["pending", "under_review", "revision_requested"] as const;
export const PARTNER_APPROVED_STATUSES = ["approved", "suspended"] as const;

export type LaunchFreePolicyState = "policy" | "on_approval" | "none";

export type AdminPartnerAgreementStoreInput = {
  id: string;
  storeName: string;
  ownerLabel: string;
  approvalStatus: string;
  categoryName: string;
  topicName: string;
};

export type AdminPartnerAgreementListRow = {
  storeId: string;
  storeName: string;
  ownerLabel: string;
  approvalStatus: string;
  categoryName: string;
  topicName: string;
  latestVersion: string | null;
  latestAgreedAt: string | null;
  latestSource: "application" | "reconsent" | null;
  /** 서명 당시 무료 종료일 (최신 동의) */
  agreedFreeUntil: string | null;
  feePercentAfter: number | null;
  agreementCount: number;
  /** 어드민이 바꾼 무료 종료일 */
  overrideFreeUntil: string | null;
  /** 현재 게시 버전에 동의했는지 (게시본 없으면 true) */
  agreedCurrentVersion: boolean;
  launchPolicyState: LaunchFreePolicyState;
  launchPolicyEndsAt: string | null;
};

export function isApprovedLikeStatus(status: string): boolean {
  return (PARTNER_APPROVED_STATUSES as readonly string[]).includes(status);
}

export function isPendingLikeStatus(status: string): boolean {
  return (PARTNER_PENDING_STATUSES as readonly string[]).includes(status);
}

/** 0% 정책 칸 — 현재 launch_free 정책 / 승인 시 생성(승인 전 + 무료 종료일 진행 중) / 없음 */
export function resolveLaunchPolicyState(input: {
  approvalStatus: string;
  launchPolicyEndsAt: string | null;
  hasLaunchPolicy: boolean;
  overrideFreeUntil: string | null;
  agreedFreeUntil: string | null;
  now?: Date;
}): LaunchFreePolicyState {
  if (input.hasLaunchPolicy) return "policy";
  if (isApprovedLikeStatus(input.approvalStatus)) return "none";
  const fu = resolveLaunchFreeUntilForApproval({
    overrideFreeUntil: input.overrideFreeUntil,
    latestAgreementFreeUntil: input.agreedFreeUntil,
  });
  return activeFreeUntilOrNull(fu, input.now) ? "on_approval" : "none";
}

export function buildAdminPartnerAgreementRow(input: {
  store: AdminPartnerAgreementStoreInput;
  agreements: readonly StorePartnerAgreementRow[];
  overrideFreeUntil: string | null;
  launchPolicy: { endsAt: string | null } | null;
  currentVersion: string | null;
  now?: Date;
}): AdminPartnerAgreementListRow {
  const sorted = [...input.agreements].sort((a, b) => (a.agreedAt < b.agreedAt ? 1 : a.agreedAt > b.agreedAt ? -1 : 0));
  const latest = sorted[0] ?? null;
  return {
    storeId: input.store.id,
    storeName: input.store.storeName,
    ownerLabel: input.store.ownerLabel,
    approvalStatus: input.store.approvalStatus,
    categoryName: input.store.categoryName,
    topicName: input.store.topicName,
    latestVersion: latest?.documentVersion ?? null,
    latestAgreedAt: latest?.agreedAt ?? null,
    latestSource: latest?.source ?? null,
    agreedFreeUntil: latest?.freeUntil ?? null,
    feePercentAfter: latest?.feePercentAfter ?? null,
    agreementCount: sorted.length,
    overrideFreeUntil: input.overrideFreeUntil,
    agreedCurrentVersion: storeHasAgreedToVersion(sorted, input.currentVersion),
    launchPolicyState: resolveLaunchPolicyState({
      approvalStatus: input.store.approvalStatus,
      hasLaunchPolicy: input.launchPolicy != null,
      launchPolicyEndsAt: input.launchPolicy?.endsAt ?? null,
      overrideFreeUntil: input.overrideFreeUntil,
      agreedFreeUntil: latest?.freeUntil ?? null,
      now: input.now,
    }),
    launchPolicyEndsAt: input.launchPolicy?.endsAt ?? null,
  };
}

export function adminPartnerAgreementRowMatches(
  row: AdminPartnerAgreementListRow,
  filter: AdminPartnerAgreementFilter
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "pending":
      return isPendingLikeStatus(row.approvalStatus);
    case "approved":
      return isApprovedLikeStatus(row.approvalStatus);
    case "reconsent":
      return isApprovedLikeStatus(row.approvalStatus) && !row.agreedCurrentVersion;
  }
}
