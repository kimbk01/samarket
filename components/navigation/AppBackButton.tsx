"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
  /** 이전 경로로 돌아간 뒤에도 URL이 같으면 이동할 폴백(예: 목록). */
  backHref?: string;
  /**
   * false이고 backHref가 있으면 항상 해당 경로로 Link 이동(고정).
   * 그 외(backHref만 주거나 true)는 이전 페이지 우선 후 backHref 폴백.
   */
  preferHistoryBack?: boolean;
  /** backHref가 없을 때만 사용됩니다. */
  onBack?: () => void;
  /** 미지정 시 기본: text-sam-fg hover:bg-sam-surface-muted */
  className?: string;
  iconClassName?: string;
  /** 접근성 라벨 (기본: 뒤로가기) */
  ariaLabel?: string;
};

const structuralClass =
  "sam-header-action flex h-10 w-10 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center";
const defaultToneClass = "text-sam-fg";

export function AppBackButton({
  backHref,
  preferHistoryBack,
  onBack,
  className,
  iconClassName,
  ariaLabel = "뒤로가기",
}: AppBackButtonProps) {
  const { tt } = useI18n();
  const router = useRouter();
  const mergedClass = `${structuralClass} ${className ?? defaultToneClass}`.trim();
  const resolvedAriaLabel = tt(ariaLabel);

  if (preferHistoryBack === false && backHref != null) {
    return (
      <Link href={backHref} className={mergedClass} aria-label={resolvedAriaLabel}>
        <AppBackIcon className={iconClassName} />
      </Link>
    );
  }

  if (backHref != null) {
    return (
      <button
        type="button"
        onClick={() => runHistoryBackWithFallback(router, backHref)}
        className={mergedClass}
        aria-label={resolvedAriaLabel}
      >
        <AppBackIcon className={iconClassName} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => (onBack ? onBack() : runHistoryBackWithFallback(router))}
      className={mergedClass}
      aria-label={resolvedAriaLabel}
    >
      <AppBackIcon className={iconClassName} />
    </button>
  );
}
