"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useLayoutEffect, useMemo } from "react";
import { Tier1NotificationAnchor } from "@/components/notifications/Tier1NotificationAnchor";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { samTier1HeaderIconCluster } from "@/lib/ui/tier1-header-icon";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { isCommunityHomeSurfacePath } from "@/lib/layout/resolve-main-surface";
import type { FixedDestinationBackOptions } from "@/lib/navigation/fixed-destination-back";

function splitHref(href: string): { path: string; search: string } {
  const q = href.indexOf("?");
  return q === -1 ? { path: href, search: "" } : { path: href.slice(0, q), search: href.slice(q) };
}

/** 커뮤니티 허브 별칭(`/`·`/philife`·`/home`·`/community`)은 같은 목록 화면 */
const COMMUNITY_FIXED_BACK_OPTIONS: FixedDestinationBackOptions = {
  isSameDestination: (prev, target) => {
    const a = splitHref(prev);
    const b = splitHref(target);
    return isCommunityHomeSurfacePath(a.path) && isCommunityHomeSurfacePath(b.path) && a.search === b.search;
  },
};

type Props = {
  titleText: string;
  backHref: string;
  /**
   * Navigation API 가 없을 때만: 이 글의 진입 기록(같은 postId 출처)이 있으면 직전 기록 = 목적지로 본다.
   */
  hasEntryOriginForPost?: boolean;
};

/** 상세 1단 우측 — 피드 목록과 동일 `bottom_nav_community` 알림함 */
export function CommunityPostDetailHeader({ titleText, backHref, hasEntryOriginForPost = false }: Props) {
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

  /** FIXED 목적지(정확한 피드 출처) 유지 + settle 이동 (Q7: 상세→목록→상세 루프·목록 중복 없음) */
  const leftSlot = useMemo(
    () => (
      <AppBackButton
        preferHistoryBack={false}
        backHref={backHref}
        fixedBackHistory="settle"
        fixedBackOptions={{
          ...COMMUNITY_FIXED_BACK_OPTIONS,
          assumePreviousIsTarget: () => hasEntryOriginForPost,
        }}
        ariaLabel={t("community_feed_back_aria")}
      />
    ),
    [backHref, hasEntryOriginForPost, t]
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
        leftSlot,
        rightSlot,
      },
    });
    return () => setMainTier1Extras(null);
  }, [setMainTier1Extras, titleText, backHref, leftSlot, rightSlot, t]);

  return null;
}
