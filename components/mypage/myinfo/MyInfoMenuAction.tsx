"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  MYPAGE_HOME_CHEVRON_CLASS,
  MYPAGE_HOME_DANGER_TEXT_CLASS,
  MYPAGE_HOME_ICON_WRAP_CLASS,
  MYPAGE_HOME_MENU_TITLE_CLASS,
  MYPAGE_HOME_ROW_CLASS,
  MYPAGE_HOME_ROW_DIVIDER_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

/** 로그아웃 등 링크 없는 행 */
export function MyInfoMenuAction({
  title,
  icon,
  onClick,
  tone = "default",
  first = false,
}: {
  title: string;
  icon?: ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
  first?: boolean;
}) {
  const titleClass = tone === "danger" ? MYPAGE_HOME_DANGER_TEXT_CLASS : MYPAGE_HOME_MENU_TITLE_CLASS;
  const iconWrapClass =
    tone === "danger"
      ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FDEDEC] text-[#C0392B]"
      : MYPAGE_HOME_ICON_WRAP_CLASS;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${MYPAGE_HOME_ROW_CLASS} ${first ? "" : MYPAGE_HOME_ROW_DIVIDER_CLASS} w-full text-left`}
    >
      {icon ? <span className={iconWrapClass}>{icon}</span> : null}
      <span className={`min-w-0 flex-1 ${titleClass}`}>{title}</span>
      <ChevronRight className={MYPAGE_HOME_CHEVRON_CLASS} strokeWidth={2} />
    </button>
  );
}

/** 관리자 등 `<li>` 래퍼용 링크 행 */
export function MyInfoMenuLinkRow({
  href,
  title,
  first = false,
}: {
  href: string;
  title: string;
  first?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`${MYPAGE_HOME_ROW_CLASS} ${first ? "" : MYPAGE_HOME_ROW_DIVIDER_CLASS}`}
    >
      <span className={`min-w-0 flex-1 ${MYPAGE_HOME_MENU_TITLE_CLASS}`}>{title}</span>
      <ChevronRight className={MYPAGE_HOME_CHEVRON_CLASS} strokeWidth={2} />
    </Link>
  );
}
