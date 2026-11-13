"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useLayoutEffect, useMemo } from "react";
import { Tier1NotificationAnchor } from "@/components/notifications/Tier1NotificationAnchor";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import {
  SAM_TIER1_HEADER_ACTION_BTN_CLASS,
  SAM_TIER1_HEADER_ICON_GLYPH_CLASS,
  samTier1HeaderIconCluster,
} from "@/lib/ui/tier1-header-icon";
import { DibayHeaderShareButton } from "@/components/share/DibayHeaderShareButton";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { isCommunityHomeSurfacePath, isHomeSurfacePath } from "@/lib/layout/resolve-main-surface";
import type { FixedDestinationBackOptions } from "@/lib/navigation/fixed-destination-back";

function splitHref(href: string): { path: string; search: string } {
  const q = href.indexOf("?");
  return q === -1 ? { path: href, search: "" } : { path: href.slice(0, q), search: href.slice(q) };
}

/**
 * 같은 화면 판정 — 커뮤니티 허브 별칭(`/philife`·`/community`)끼리, HOME 별칭(`/`·`/home`)끼리.
 * (2026-11-09 앱 홈 분리로 `/`·`/home` 은 커뮤니티가 아닌 HOME 화면이다.)
 */
export const COMMUNITY_FIXED_BACK_OPTIONS: FixedDestinationBackOptions = {
  isSameDestination: (prev, target) => {
    const a = splitHref(prev);
    const b = splitHref(target);
    if (a.search !== b.search) return false;
    if (isCommunityHomeSurfacePath(a.path) && isCommunityHomeSurfacePath(b.path)) return true;
    return isHomeSurfacePath(a.path) && isHomeSurfacePath(b.path);
  },
};

/** ‹ 읽기 이름 — 목적지가 HOME 이면 「피드로」가 아니라 「뒤로가기」 */
export function backAriaKey(backHref: string): "nav_back" | "community_feed_back_aria" {
  return isHomeSurfacePath(splitHref(backHref).path) ? "nav_back" : "community_feed_back_aria";
}

type Props = {
  titleText: string;
  backHref: string;
  /**
   * Navigation API 가 없을 때만: 이 글의 진입 기록(같은 postId 출처)이 있으면 직전 기록 = 목적지로 본다.
   */
  hasEntryOriginForPost?: boolean;
  /** 글 공유 — 화면의 공유는 이 머리글 1곳 (Owner 2026-11-14 §N-3). 없으면 아이콘을 그리지 않는다 */
  onShare?: () => void;
};

/** 상세 1단 우측 — [공유] + 피드 목록과 동일 `bottom_nav_community` 알림함 */
export function CommunityPostDetailHeader({ titleText, backHref, hasEntryOriginForPost = false, onShare }: Props) {
  const { t } = useI18n();
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();

  const rightSlot = useMemo(
    () => (
      <div className={samTier1HeaderIconCluster}>
        {onShare ? (
          <DibayHeaderShareButton
            onClick={onShare}
            buttonClassName={SAM_TIER1_HEADER_ACTION_BTN_CLASS}
            glyphClassName={SAM_TIER1_HEADER_ICON_GLYPH_CLASS}
          />
        ) : null}
        <Tier1NotificationAnchor surface="bottom_nav_community" />
      </div>
    ),
    [onShare]
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
        ariaLabel={t(backAriaKey(backHref))}
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
        ariaLabel: t(backAriaKey(backHref)),
        showHubQuickActions: false,
        leftSlot,
        rightSlot,
      },
    });
    return () => setMainTier1Extras(null);
  }, [setMainTier1Extras, titleText, backHref, leftSlot, rightSlot, t]);

  return null;
}
