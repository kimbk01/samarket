"use client";

import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MyPageData } from "@/lib/my/types";
import { useMypageHubModel } from "@/hooks/use-mypage-hub-model";
import { MyPageItemScreen } from "@/components/mypage/MyPageItemScreen";
import { MyPageStackShell } from "@/components/mypage/mobile/MyPageStackShell";
import { buildMypageSectionHref } from "@/lib/mypage/mypage-mobile-nav-registry";
import { resolveCustomerCenterBackHref, CUSTOMER_CENTER_HREF } from "@/lib/mypage/customer-center-paths";
import { MypageGuestSubrouteRedirect } from "@/components/mypage/MypageGuestSubrouteRedirect";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";

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
  const hubEnabled = membership.status === "member";
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
  } = useMypageHubModel(initialMyPageData ?? undefined, { enabled: hubEnabled });
  /* Mobile stack routes have no AccountTab home grid; badges only on desktop ?tab=account&section=home. */
  const favoriteBadge = null;
  const notificationBadge = null;

  const hasOwnerStore = data?.hasOwnerStore ?? false;
  const storeAttentionSummary =
    hasOwnerStore && overviewCounts.storeAttention != null
      ? t("mypage_comp_store_attention_count", { count: overviewCounts.storeAttention })
      : hasOwnerStore
        ? t("mypage_comp_store_attention_summary")
        : null;

  if (membership.status === "checking") {
    return (
      <MyPageStackShell title={itemLabel} backHref={backHref} preferHistoryBack={preferHistoryBack}>
        <div className="py-6 text-center sam-text-body text-sam-muted">{t("mypage_comp_loading_ellipsis")}</div>
      </MyPageStackShell>
    );
  }

  if (membership.status === "guest") {
    return (
      <MyPageStackShell title={itemLabel} backHref="/mypage">
        <MypageGuestSubrouteRedirect />
      </MyPageStackShell>
    );
  }

  if (loading) {
    return (
      <MyPageStackShell title={itemLabel} backHref={backHref} preferHistoryBack={preferHistoryBack}>
        <div className="py-6 text-center sam-text-body text-sam-muted">{t("mypage_comp_loading_ellipsis")}</div>
      </MyPageStackShell>
    );
  }

  if (!data?.profile) {
    return (
      <MyPageStackShell title={itemLabel} backHref={backHref} preferHistoryBack={preferHistoryBack}>
        <div className="py-6 text-center sam-text-body text-sam-muted">
          {t("mypage_comp_profile_load_failed_short")}
        </div>
      </MyPageStackShell>
    );
  }

  const { profile, mannerScore, isBusinessMember, isAdmin, hasOwnerStore: hs } = data;

  return (
    <MyPageStackShell title={itemLabel} backHref={backHref} preferHistoryBack={preferHistoryBack}>
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
