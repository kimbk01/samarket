"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MyPageData } from "@/lib/my/types";
import { useMypageHubModel } from "@/hooks/use-mypage-hub-model";
import { MyPageItemScreen } from "@/components/mypage/MyPageItemScreen";
import { MyPageStackShell } from "@/components/mypage/mobile/MyPageStackShell";
import { buildMypageSectionHref } from "@/lib/mypage/mypage-mobile-nav-registry";

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
  const itemLabel = t(itemLabelKey);
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
      ? t("mypage_comp_store_attention_count", { count: overviewCounts.storeAttention })
      : hasOwnerStore
        ? t("mypage_comp_store_attention_summary")
        : null;

  if (loading) {
    return (
      <MyPageStackShell title={itemLabel} backHref={buildMypageSectionHref(section)}>
        <div className="py-6 text-center sam-text-body text-sam-muted">{t("mypage_comp_loading_ellipsis")}</div>
      </MyPageStackShell>
    );
  }

  if (!data?.profile) {
    return (
      <MyPageStackShell title={itemLabel} backHref={buildMypageSectionHref(section)}>
        <div className="py-6 text-center sam-text-body text-sam-muted">{t("mypage_comp_login_required")}</div>
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
