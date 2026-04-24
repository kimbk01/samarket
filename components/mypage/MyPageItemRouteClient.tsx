"use client";

import type { MyPageData } from "@/lib/my/types";
import { useMypageHubModel } from "@/hooks/use-mypage-hub-model";
import { MyPageItemScreen } from "@/components/mypage/MyPageItemScreen";
import { MyPageStackShell } from "@/components/mypage/mobile/MyPageStackShell";
import { buildMypageSectionHref } from "@/lib/mypage/mypage-mobile-nav-registry";

export function MyPageItemRouteClient({
  initialMyPageData,
  section,
  item,
  itemLabel,
}: {
  initialMyPageData: MyPageData | null;
  section: string;
  item: string;
  itemLabel: string;
}) {
  const {
    data,
    loading,
    overviewCounts,
    ownerHubStoreId,
    addressDefaults,
    neighborhoodFromLife,
  } = useMypageHubModel(initialMyPageData ?? undefined);
  /* Mobile stack routes have no AccountTab home grid; badges only on desktop ?tab=account&section=home. */
  const favoriteBadge = null;
  const notificationBadge = null;

  const hasOwnerStore = data?.hasOwnerStore ?? false;
  const storeAttentionSummary =
    hasOwnerStore && overviewCounts.storeAttention != null
      ? `처리 ${overviewCounts.storeAttention}건`
      : hasOwnerStore
        ? "새 주문·문의 확인"
        : null;

  if (loading) {
    return (
      <MyPageStackShell title={itemLabel} backHref={buildMypageSectionHref(section)}>
        <div className="py-6 text-center sam-text-body text-sam-muted">불러오는 중…</div>
      </MyPageStackShell>
    );
  }

  if (!data?.profile) {
    return (
      <MyPageStackShell title={itemLabel} backHref={buildMypageSectionHref(section)}>
        <div className="py-6 text-center sam-text-body text-sam-muted">로그인이 필요합니다.</div>
      </MyPageStackShell>
    );
  }

  const { profile, mannerScore, isBusinessMember, isAdmin, hasOwnerStore: hs } = data;

  return (
    <MyPageStackShell title={itemLabel} backHref={buildMypageSectionHref(section)}>
      <MyPageItemScreen
        section={section}
        item={item}
        profile={profile}
        mannerScore={mannerScore}
        isBusinessMember={isBusinessMember}
        hasOwnerStore={hs}
        ownerHubStoreId={ownerHubStoreId}
        isAdmin={isAdmin}
        addressDefaults={addressDefaults}
        neighborhoodFromLife={neighborhoodFromLife}
        overviewCounts={overviewCounts}
        favoriteBadge={favoriteBadge}
        notificationBadge={notificationBadge}
        storeAttentionSummary={storeAttentionSummary}
      />
    </MyPageStackShell>
  );
}
