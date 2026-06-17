"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useLayoutEffect, useMemo } from "react";
import { Tier1NotificationAnchor } from "@/components/notifications/Tier1NotificationAnchor";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { samTier1HeaderIconCluster } from "@/lib/ui/tier1-header-icon";

type Props = {
  titleText: string;
  backHref: string;
};

/** 상세 1단 우측 — 피드 목록과 동일 `bottom_nav_community` 알림함 */
export function CommunityPostDetailHeader({ titleText, backHref }: Props) {
  const { t } = useI18n();
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();

  const rightSlot = useMemo(
    () => (
      <div className={samTier1HeaderIconCluster}>
        <Tier1NotificationAnchor surface="bottom_nav_community" />
      </div>
    ),
    []
  );

  useLayoutEffect(() => {
    if (!setMainTier1Extras) return;
    setMainTier1Extras({
      tier1: {
        titleText: titleText || t("community_community_label"),
        backHref,
        preferHistoryBack: false,
        ariaLabel: t("community_feed_back_aria"),
        showHubQuickActions: false,
        rightSlot,
      },
    });
    return () => setMainTier1Extras(null);
  }, [setMainTier1Extras, titleText, backHref, rightSlot, t]);

  return null;
}
