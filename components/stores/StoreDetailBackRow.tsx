"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { usePathname, useRouter } from "next/navigation";
import { AppCloseIcon } from "@/components/navigation/AppBackButton";
import { HeaderBackRoundButton } from "@/components/navigation/HeaderBackRoundButton";
import { DELIVERY_CONSUMER_HEADER_ICON_BTN_CLASS } from "@/lib/design/delivery-chrome";
import { useStoreDetailAnimatedBack } from "@/lib/dibay/store-detail-animated-back-context";
import { markStoreDetailMenuTabsLanding } from "@/lib/dibay/store-detail-nav-intent";
import { readNavigationEntryContext } from "@/lib/navigation/dibay-navigation-context-store";
import { resolveDibayBackTarget } from "@/lib/navigation/resolve-dibay-back-target";
import { runDibayBackResolution } from "@/lib/navigation/run-dibay-back-resolution";
import { decodeSlugSegment } from "@/lib/stores/store-consumer-route";

type Variant = "back" | "close";

/** Same SVG icon-slot contract as StoreOrderStickyHeader SEARCH/SHARE/CART — no app-back-glyph translate nudge. */
function StoreHeaderActionBackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 6 9 12l6 6" />
    </svg>
  );
}

/**
 * 매장 하위 화면 뒤로/닫기 — 목적지 = `resolveDibayBackTarget` 단일 정책 (S3-06).
 * `StoreDetailBackLink` · 하위 화면 헤더(`DeliverySubpageHeader`) · 리뷰 페이지 닫기가 같은 핸들러를 쓴다.
 */
export function useStoreDetailBackPress(storeSlug?: string): () => void {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const animatedBack = useStoreDetailAnimatedBack();

  return () => {
    const pathSlug =
      storeSlug?.trim() ||
      (() => {
        const parts = pathname.split("/").filter(Boolean);
        if (parts[0] === "stores" && parts[1]) return decodeSlugSegment(parts[1]);
        return "";
      })();
    if (!pathSlug) return;

    const search = typeof window !== "undefined" ? window.location.search : "";
    const entryContext = readNavigationEntryContext(pathSlug);
    const resolution = resolveDibayBackTarget({
      currentPathname: pathname,
      currentSearch: search,
      storeSlug: pathSlug,
      entryContext,
    });

    if (
      resolution.action === "PUSH" ||
      resolution.action === "REPLACE"
    ) {
      const targetPath = resolution.targetHref.split("?")[0] ?? "";
      if (targetPath === `/stores/${encodeURIComponent(pathSlug)}`) {
        markStoreDetailMenuTabsLanding();
      }
    }

    runDibayBackResolution(router, resolution, animatedBack);
  };
}

/**
 * 매장 상단 Back — destination policy = resolveDibayBackTarget only (CUT 2).
 * DO NOT invent browse URLs from DB category here.
 * Icon geometry for sticky header actions is SVG-centered (not FAB, not glyph nudge).
 */
export function StoreDetailBackLink({
  storeSlug,
  /** @deprecated Ignored for destination — resolver owns policy. Kept for call-site compat. */
  fallbackHref: _fallbackHref,
  variant = "back",
  className,
  round = true,
}: {
  storeSlug?: string;
  fallbackHref?: string;
  variant?: Variant;
  className?: string;
  /**
   * 헤더 뒤로 원형(2026-11-16) — 흰 헤더는 원형. 매장 사진 위(투명·유리 버튼)는 배달 매장 헤더 계약(§WP6 「배너 위 투명 + 흰 아이콘」)대로
   * 지금 모양을 유지하므로 `StoreOrderStickyHeader` 가 false 를 준다.
   */
  round?: boolean;
}) {
  const { t } = useI18n();
  const label = variant === "close" ? t("common_close") : t("nav_back");
  const onBackPress = useStoreDetailBackPress(storeSlug);
  const btnClass =
    className ?? `${DELIVERY_CONSUMER_HEADER_ICON_BTN_CLASS} hover:bg-sam-surface-muted/90 active:bg-sam-border-soft/80`;

  if (variant === "back" && round) {
    return <HeaderBackRoundButton onClick={onBackPress} className={btnClass} aria-label={label} />;
  }

  return (
    <button
      type="button"
      onClick={onBackPress}
      className={btnClass}
      aria-label={label}
    >
      {variant === "close" ? (
        <AppCloseIcon className="h-6 w-6" />
      ) : (
        <StoreHeaderActionBackIcon />
      )}
    </button>
  );
}
