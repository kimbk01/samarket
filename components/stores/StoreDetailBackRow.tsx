"use client";

import { usePathname, useRouter } from "next/navigation";
import { AppBackIcon, AppCloseIcon } from "@/components/navigation/AppBackButton";
import { useStoreDetailAnimatedBack } from "@/lib/dibay/store-detail-animated-back-context";
import { markStoreDetailMenuTabsLanding } from "@/lib/dibay/store-detail-nav-intent";
import { runStoreDetailDirectBack } from "@/lib/navigation/store-detail-animated-back";
import {
  decodeSlugSegment,
  isStoreSlugConsumerSubtree,
  isStoreSlugOrderMenuRoot,
} from "@/lib/stores/store-consumer-route";

type Variant = "back" | "close";

/**
 * 매장 상단 — fallbackHref 로 직접 이동(업종 browse 전체 목록 등).
 * `close`: 참고 앱처럼 X(닫기) 아이콘.
 */
export function StoreDetailBackLink({
  fallbackHref,
  variant = "back",
  className,
}: {
  fallbackHref: string;
  variant?: Variant;
  /** 투명 헤더·히어로 위 등 — 기본은 text-sam-fg */
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const animatedBack = useStoreDetailAnimatedBack();
  const label = variant === "close" ? "닫기" : "뒤로가기";

  const onBackPress = () => {
    const fallbackPath = (fallbackHref || "").split("?")[0] ?? "";
    const menuRootMatch = fallbackPath.match(/^\/stores\/([^/]+)$/);
    const targetSlug = menuRootMatch ? decodeSlugSegment(menuRootMatch[1] ?? "") : "";
    const onStoreChildRoute =
      targetSlug &&
      isStoreSlugConsumerSubtree(pathname, targetSlug) &&
      !isStoreSlugOrderMenuRoot(pathname, targetSlug);

    if (onStoreChildRoute) {
      markStoreDetailMenuTabsLanding();
      router.push(fallbackHref, { scroll: false });
      return;
    }
    runStoreDetailDirectBack(router, fallbackHref, animatedBack);
  };

  return (
    <button
      type="button"
      onClick={onBackPress}
      className={
        className ??
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-ui-rect text-sam-fg hover:bg-sam-surface-muted/90 active:bg-sam-border-soft/80"
      }
      aria-label={label}
    >
      {variant === "close" ? (
        <AppCloseIcon className="h-6 w-6" />
      ) : (
        <AppBackIcon className="h-6 w-6" />
      )}
    </button>
  );
}
