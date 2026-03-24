"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";

export function AppBackIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

/** 가게 정보 등 시트형 화면용 닫기(X) 아이콘 */
export function AppCloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

type AppBackButtonProps = {
  /** 있으면 Link로 이동 (히스토리 스택과 무관하게 고정 경로). preferHistoryBack이면 폴백 전용 */
  backHref?: string;
  /**
   * true면 먼저 router.back(), 경로가 바뀌지 않으면 backHref로 push.
   * 매장·상품 등에서 목록 고정 링크 대신 “이전 화면” 동작에 사용.
   */
  preferHistoryBack?: boolean;
  /** backHref 없을 때 호출. preferHistoryBack일 때는 무시됩니다. */
  onBack?: () => void;
  /** 미지정 시 기본: text-gray-900 hover:bg-gray-100 */
  className?: string;
  iconClassName?: string;
  /** 접근성 라벨 (기본: 뒤로가기) */
  ariaLabel?: string;
};

const structuralClass =
  "flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-none";
const defaultToneClass = "text-gray-900 hover:bg-gray-100";

export function AppBackButton({
  backHref,
  preferHistoryBack,
  onBack,
  className,
  iconClassName,
  ariaLabel = "뒤로가기",
}: AppBackButtonProps) {
  const router = useRouter();
  const mergedClass = `${structuralClass} ${className ?? defaultToneClass}`.trim();

  if (preferHistoryBack) {
    return (
      <button
        type="button"
        onClick={() => runHistoryBackWithFallback(router, backHref)}
        className={mergedClass}
        aria-label={ariaLabel}
      >
        <AppBackIcon className={iconClassName} />
      </button>
    );
  }

  if (backHref != null) {
    return (
      <Link href={backHref} className={mergedClass} aria-label={ariaLabel}>
        <AppBackIcon className={iconClassName} />
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => (onBack ? onBack() : router.back())}
      className={mergedClass}
      aria-label={ariaLabel}
    >
      <AppBackIcon className={iconClassName} />
    </button>
  );
}
