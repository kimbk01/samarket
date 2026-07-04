"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";
import { APP_BACK_GLYPH_CHAR, APP_BACK_GLYPH_CLASS } from "@/lib/ui/app-back-glyph";
import { SECTOR_HEADER_BACK_CLASS } from "@/lib/ui/sector-header-classes";

export function AppBackIcon({ className }: { className?: string }) {
  return (
    <span
      className={[APP_BACK_GLYPH_CLASS, className].filter(Boolean).join(" ")}
      aria-hidden
    >
      {APP_BACK_GLYPH_CHAR}
    </span>
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
   * true를 반환하면 뒤로가기/폴백 이동을 하지 않습니다(호출 측에서 가로채기).
   * 예: 매장 기본 정보 미저장 이탈 확인.
   */
  interceptBack?: () => boolean;
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
  /** 접근성 라벨 키 (기본: nav_back) */
  ariaLabelKey?: MessageKey;
  /** @deprecated ariaLabelKey 사용. 역검색(tt) 호환용 */
  ariaLabel?: string;
};

const defaultToneClass = "";

export function AppBackButton({
  backHref,
  interceptBack,
  preferHistoryBack,
  onBack,
  className,
  iconClassName,
  ariaLabelKey,
  ariaLabel,
}: AppBackButtonProps) {
  const { t, tt } = useI18n();
  const router = useRouter();
  const mergedClass = `${SECTOR_HEADER_BACK_CLASS} ${className ?? defaultToneClass}`.trim();
  const resolvedAriaLabel = ariaLabelKey
    ? t(ariaLabelKey)
    : ariaLabel
      ? tt(ariaLabel)
      : t("nav_back");

  if (preferHistoryBack === false && backHref != null) {
    return (
      <Link
        href={backHref}
        className={mergedClass}
        aria-label={resolvedAriaLabel}
        scroll={false}
        onClick={(e) => {
          if (interceptBack?.()) e.preventDefault();
        }}
      >
        <AppBackIcon className={iconClassName} />
      </Link>
    );
  }

  if (backHref != null) {
    return (
      <button
        type="button"
        onClick={() => {
          if (interceptBack?.()) return;
          runHistoryBackWithFallback(router, backHref);
        }}
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
      onClick={() => {
        if (interceptBack?.()) return;
        onBack ? onBack() : runHistoryBackWithFallback(router);
      }}
      className={mergedClass}
      aria-label={resolvedAriaLabel}
    >
      <AppBackIcon className={iconClassName} />
    </button>
  );
}
