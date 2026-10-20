"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MyPageData } from "@/lib/my/types";
import { useMypageHubModel } from "@/hooks/use-mypage-hub-model";
import { MyPageItemScreen, MyPageItemStaticContent } from "@/components/mypage/MyPageItemScreen";
import { MyScreen } from "@/components/mypage/ds/MyScreen";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { buildMypageSectionHref } from "@/lib/mypage/mypage-mobile-nav-registry";
import { resolveCustomerCenterBackHref, CUSTOMER_CENTER_HREF } from "@/lib/mypage/customer-center-paths";
import { MypageGuestSubrouteRedirect } from "@/components/mypage/MypageGuestSubrouteRedirect";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  isMypageItemWithoutHubWait,
  mypageItemScreenTemplate,
} from "@/lib/mypage/mypage-item-hub-wait";

/**
 * 섹션 화면 클라이언트 (최종 설계 Part B 공통 전제 · §1.7).
 * - 헤더(`MyScreen`)는 즉시 그린다.
 * - 정적·설정 화면(S10~S19)은 hub 데이터를 기다리지 않는다 — 본문을 바로 그리고 화면이 필요한 값만 스스로 조회.
 * - hub 값이 필요한 화면(S09 결제정보 등)은 서버 core 시드(`loadMypageServerShell`)로 첫 그림, 없을 때만 본문 스켈레톤.
 */
export function MyPageItemRouteClient({
  initialMyPageData,
  section,
  item,
  itemLabelKey,
}: {
  initialMyPageData: MyPageData | null;
  section: string;
  item: string;
  itemLabelKey: MessageKey;
}) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const membership = useClientMembershipState("mypage-item-route");
  // 세션 사용자 있으면 member 취급 (terminal checking 에서 "…" 고착 방지 — MyContent 와 동일)
  const sessionUser = getCurrentUser();
  const sessionMember = Boolean(sessionUser?.id) || membership.status === "member";
  const noHubWait = isMypageItemWithoutHubWait(section, item);
  const hubEnabled = sessionMember && !noHubWait;
  const template = mypageItemScreenTemplate(section, item);
  const itemLabel = t(itemLabelKey);
  const defaultBack = buildMypageSectionHref(section);
  const backHref =
    item === "notices" || item === "terms"
      ? resolveCustomerCenterBackHref(searchParams.get("from"), defaultBack)
      : defaultBack;
  const preferHistoryBack = backHref !== CUSTOMER_CENTER_HREF;
  const {
    data,
    loading,
    overviewCounts,
    ownerHubStoreId,
    addressDefaults,
    neighborhoodFromLife,
    load,
  } = useMypageHubModel(initialMyPageData ?? undefined, { enabled: hubEnabled });
  /* Mobile stack routes have no AccountTab home grid; badges only on desktop ?tab=account&section=home. */
  const favoriteBadge = null;
  const notificationBadge = null;

  const shell = (body: ReactNode) => (
    <MyScreen title={itemLabel} backHref={backHref} preferHistoryBack={preferHistoryBack} template={template}>
      {body}
    </MyScreen>
  );

  if (!sessionMember && membership.status === "guest") {
    return shell(<MypageGuestSubrouteRedirect />);
  }

  if (!sessionMember && membership.status === "checking") {
    return shell(<MyStateView kind="loading" template={template === "static" ? "list" : template} rows={3} />);
  }

  if (noHubWait) {
    return shell(<MyPageItemStaticContent section={section} item={item} />);
  }

  const hasOwnerStore = data?.hasOwnerStore ?? false;
  const storeAttentionSummary =
    hasOwnerStore && overviewCounts.storeAttention != null
      ? t("mypage_comp_store_attention_count", { count: overviewCounts.storeAttention })
      : hasOwnerStore
        ? t("mypage_comp_store_attention_summary")
        : null;

  if (loading && !data?.profile) {
    return shell(
      <MyStateView kind="loading" template={template === "static" ? "list" : template} rows={2} />,
    );
  }

  if (!data?.profile) {
    return shell(
      <MyStateView
        kind="error"
        template={template}
        error={{ message: t("mypage_home_load_failed"), onRetry: () => void load({ force: true }) }}
      />,
    );
  }

  const { profile, mannerScore, isBusinessMember, isAdmin, hasOwnerStore: hs } = data;

  return shell(
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
    />,
  );
}
