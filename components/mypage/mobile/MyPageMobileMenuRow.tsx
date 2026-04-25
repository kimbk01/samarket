import type { ReactNode } from "react";
import { memo } from "react";
import Link from "next/link";
import { PHILIFE_FB_CARD_CLASS } from "@/lib/philife/philife-flat-ui-classes";

type Props = {
  href?: string;
  title: string;
  icon?: ReactNode;
  /** 오른쪽 보조 텍스트(배지 등) */
  accessory?: ReactNode;
  /** 로그아웃 등 강조 */
  tone?: "default" | "danger";
  /**
   * `card` — 거래 홈 피드와 동일: 카드 한 장씩(`sam-card` + `sam-card-pad`).
   * `grouped` — 섹션 설정 등 단일 박스 안 행(하단 보더).
   */
  surface?: "card" | "grouped";
  onClick?: () => void;
};

export const MyPageMobileMenuRow = memo(function MyPageMobileMenuRow({
  href,
  title,
  icon,
  accessory,
  tone = "default",
  surface = "grouped",
  onClick,
}: Props) {
  const titleClass =
    tone === "danger"
      ? "min-w-0 flex-1 sam-text-card-title text-sam-danger"
      : "min-w-0 flex-1 sam-text-card-title text-sam-fg";

  const surfaceClass =
    surface === "card"
      ? `${PHILIFE_FB_CARD_CLASS} flex min-h-[56px] w-full min-w-0 items-center gap-3 sam-card-pad transition duration-100 active:scale-[0.99] active:bg-sam-surface-muted`
      : "flex min-h-[56px] w-full min-w-0 items-center gap-3 border-b border-sam-border-soft bg-sam-surface sam-card-pad-x py-3 last:border-b-0 transition duration-100 active:scale-[0.99] active:bg-sam-app";

  const inner = (
    <>
      {icon ? <span className="flex h-8 w-8 shrink-0 items-center justify-center text-sam-muted">{icon}</span> : null}
      <span className={titleClass}>{title}</span>
      {accessory ? <span className="shrink-0 sam-text-body-secondary text-sam-muted">{accessory}</span> : null}
      <Chevron />
    </>
  );

  if (href) {
    return (
      <Link href={href} className={surfaceClass}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={surfaceClass}>
      {inner}
    </button>
  );
});

MyPageMobileMenuRow.displayName = "MyPageMobileMenuRow";

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-sam-meta" aria-hidden>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
