import type { ReactNode } from "react";
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

export function MyPageMobileMenuRow({ href, title, icon, accessory, tone = "default" }: Props) {
  const titleClass =
    tone === "danger"
      ? "min-w-0 flex-1 text-[15px] font-medium text-red-600"
      : "min-w-0 flex-1 text-[15px] font-medium text-gray-900";

  return (
    <Link
      href={href}
      className="flex min-h-[52px] items-center gap-3 border-b border-gray-100 bg-white px-4 py-3.5 active:bg-gray-50"
    >
      {icon ? <span className="flex h-8 w-8 shrink-0 items-center justify-center text-gray-600">{icon}</span> : null}
      <span className={titleClass}>{title}</span>
      {accessory ? <span className="shrink-0 text-[13px] text-gray-500">{accessory}</span> : null}
      <Chevron />
    </Link>
  );
}

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-gray-300" aria-hidden>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
