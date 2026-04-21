import type { ReactNode } from "react";
import { memo } from "react";
import Link from "next/link";

type Props = {
  href: string;
  title: string;
  icon?: ReactNode;
  /** 오른쪽 보조 텍스트(배지 등) */
  accessory?: ReactNode;
  /** 로그아웃 등 강조 */
  tone?: "default" | "danger";
};

export const MyPageMobileMenuRow = memo(function MyPageMobileMenuRow({
  href,
  title,
  icon,
  accessory,
  tone = "default",
}: Props) {
  const titleClass =
    tone === "danger"
      ? "min-w-0 flex-1 sam-text-body font-medium text-red-600"
      : "min-w-0 flex-1 sam-text-body font-medium text-sam-fg";

  return (
    <Link
      href={href}
      className="flex min-h-[52px] items-center gap-3 border-b border-sam-border-soft bg-sam-surface px-4 py-3.5 active:bg-sam-app"
    >
      {icon ? <span className="flex h-8 w-8 shrink-0 items-center justify-center text-sam-muted">{icon}</span> : null}
      <span className={titleClass}>{title}</span>
      {accessory ? <span className="shrink-0 sam-text-body-secondary text-sam-muted">{accessory}</span> : null}
      <Chevron />
    </Link>
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
