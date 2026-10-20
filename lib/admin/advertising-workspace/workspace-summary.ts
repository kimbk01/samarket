/**
 * 광고 워크스페이스 목록·요약 카드 집계 — `/admin/advertising` 화면과 통합 대시보드가 같은 함수를 쓴다.
 * 입력은 `loadAdsControlPlane` 모델(화면은 `/api/admin/ads-control-plane`, 대시보드는 서버에서 직접 로드).
 * 클라이언트·서버 공용 (브라우저 API 없음).
 */
import type { AdsActionItem, AdsControlPlaneModel } from "@/lib/admin/ads-control-plane/types";
import { BANNER_PLACEMENT_CAPACITY_SSOT } from "@/lib/ads/banner-placement-capacity-ssot";
import {
  isAdsApprovalQueueRow,
  toAdsShellListRow,
  type AdsShellListRow,
  type AdsShellStatusTab,
} from "@/lib/admin/ads-exposure/shell-row";

export type AdvertisingWorkspaceMode = "all" | "applications" | "operations" | "history" | "boosts";

export { ADS_WORKSPACE_STATUS_URL_PARAM } from "@/lib/admin/advertising-workspace/workspace-url";

/** 실행 행까지 합친 화면 목록 원본 (id 중복 = 먼저 나온 신청 행 우선). */
export function collectAdsWorkspacePool(model: AdsControlPlaneModel): AdsActionItem[] {
  const pool = [
    ...model.actionRequired,
    ...model.applications,
    ...model.creatives,
    ...model.recent,
    ...model.currentExecution.map(
      (e): AdsActionItem => ({
        id: e.id,
        domain: e.domain,
        product: e.product,
        entity: "execution",
        applicantLabel: e.label,
        storeId: null,
        memberId: null,
        creativeHint: null,
        placementHint: e.placement,
        amountLabel: null,
        currency: e.currency,
        status: e.status,
        whyActionable: e.eligibility,
        paymentLabel: null,
        periodLabel: e.period,
        remainingLabel: e.remainingLabel,
        exposureLabel: e.eligibility,
        eligibility: e.eligibility,
        ageHours: null,
        at: model.generatedAt,
        source: e.source,
        href: e.href,
        statementHref: e.statementHref,
        financeHref: null,
        memberHref: null,
      })
    ),
  ];
  const seen = new Set<string>();
  const uniq: AdsActionItem[] = [];
  for (const r of pool) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    uniq.push(r);
  }
  return uniq;
}

function isBoostDomain(domain: string): boolean {
  return domain === "trade_promote" || domain === "community_promote";
}

export function filterAdsWorkspaceRowsByMode(rows: AdsShellListRow[], mode: AdvertisingWorkspaceMode): AdsShellListRow[] {
  if (mode === "boosts") {
    return rows.filter((r) => isBoostDomain(r.domain));
  }
  if (mode === "operations") {
    return rows.filter(
      (r) =>
        !isBoostDomain(r.domain) &&
        (r.applicationStatusLabel === "—" ||
          (r.domain === "popup" && String(r.id).startsWith("popup_campaign:"))) &&
        ["scheduled", "live", "waiting", "paused", "incomplete", "ended"].includes(r.statusTab)
    );
  }
  if (mode === "applications") {
    return rows.filter(
      (r) =>
        isAdsApprovalQueueRow(r) && ["pending", "incomplete", "rejected"].includes(r.statusTab)
    );
  }
  if (mode === "history") {
    return rows.filter((r) => r.statusTab === "ended" || r.statusTab === "rejected" || r.statusTab === "paused");
  }
  return rows;
}

export type AdsWorkspaceSummaryCounts = {
  pending: number;
  live: number;
  waiting: number;
  incomplete: number;
  scheduled: number;
};

/** 요약 카드 숫자 (승인 대기·노출 중·노출 대기·불완전/임시·예약) — 상태 탭 개수와 같다. */
export function computeAdsWorkspaceSummaryCounts(
  model: AdsControlPlaneModel,
  mode: AdvertisingWorkspaceMode
): AdsWorkspaceSummaryCounts {
  // 상태 탭은 표시 언어와 무관하다 (`resolveShellStatusTab`).
  const rows = filterAdsWorkspaceRowsByMode(
    collectAdsWorkspacePool(model).map((i) => toAdsShellListRow(i, true)),
    mode
  );
  const n = (tab: AdsShellStatusTab) => rows.filter((r) => r.statusTab === tab).length;
  return {
    pending: n("pending"),
    live: n("live"),
    waiting: n("waiting"),
    incomplete: n("incomplete"),
    scheduled: n("scheduled"),
  };
}

/** 요약 카드 「홈 배너 사용/정원」 — 사용 칸 = 정원 − 빈 칸. */
export function computeAdsWorkspaceHeroOccupancy(model: AdsControlPlaneModel): { used: number; capacity: number; vacant: number } {
  const hero = model.occupancy?.find((o) => o.placementKey === "STORES_HOME_HERO");
  const capacity = hero?.capacity ?? BANNER_PLACEMENT_CAPACITY_SSOT.STORES_HOME_HERO.defaultCapacity;
  const vacant = hero?.vacant ?? 0;
  return { used: capacity - vacant, capacity, vacant };
}
