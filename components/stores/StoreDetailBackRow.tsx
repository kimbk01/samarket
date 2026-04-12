"use client";

import { useRouter } from "next/navigation";
import { AppBackIcon, AppCloseIcon } from "@/components/navigation/AppBackButton";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";

type Variant = "back" | "close";

/**
 * 매장 상단 — 히스토리 뒤로 우선, 없으면 fallbackHref.
 * `close`: 참고 앱처럼 X(닫기) 아이콘.
 */
export function StoreDetailBackLink({
  fallbackHref,
  variant = "back",
}: {
  fallbackHref: string;
  variant?: Variant;
}) {
  const router = useRouter();
  const label = variant === "close" ? "닫기" : "뒤로가기";

  return (
    <button
      type="button"
      onClick={() => runHistoryBackWithFallback(router, fallbackHref)}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-ui-rect text-sam-fg hover:bg-sam-surface-muted/90 active:bg-sam-border-soft/80"
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
