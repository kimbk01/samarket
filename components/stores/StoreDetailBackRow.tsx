"use client";

import { useRouter } from "next/navigation";
import { AppBackIcon, AppCloseIcon } from "@/components/navigation/AppBackButton";
import { useStoreDetailAnimatedBack } from "@/lib/dibay/store-detail-animated-back-context";
import { runStoreDetailDirectBack } from "@/lib/navigation/store-detail-animated-back";

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
  const animatedBack = useStoreDetailAnimatedBack();
  const label = variant === "close" ? "닫기" : "뒤로가기";

  return (
    <button
      type="button"
      onClick={() => runStoreDetailDirectBack(router, fallbackHref, animatedBack)}
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
