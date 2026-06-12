"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import {
  MYPAGE_HOME_CHEVRON_CLASS,
  MYPAGE_HOME_DANGER_TEXT_CLASS,
  MYPAGE_HOME_ICON_WRAP_CLASS,
  MYPAGE_HOME_MENU_TITLE_CLASS,
  MYPAGE_HOME_META_TEXT_CLASS,
  MYPAGE_HOME_ROW_CLASS,
  MYPAGE_HOME_ROW_DIVIDER_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

export function MyInfoMenuItem({
  title,
  href,
  icon,
  accessory,
  tone = "default",
  first = false,
  onPress,
}: {
  title: string;
  /** @deprecated 설명 미표시 — 호환용 */
  description?: string;
  href: string;
  icon?: ReactNode;
  accessory?: ReactNode;
  tone?: "default" | "danger";
  /** 섹션 카드 첫 행 — 상단 구분선 생략 */
  first?: boolean;
  /** 비로그인 — Link 대신 탭 시 로그인 유도 */
  onPress?: () => void;
}) {
  const titleClass = tone === "danger" ? MYPAGE_HOME_DANGER_TEXT_CLASS : MYPAGE_HOME_MENU_TITLE_CLASS;
  const rowClass = `${MYPAGE_HOME_ROW_CLASS} ${first ? "" : MYPAGE_HOME_ROW_DIVIDER_CLASS}`;

  const inner = (
    <>
      {icon ? <span className={MYPAGE_HOME_ICON_WRAP_CLASS}>{icon}</span> : null}
      <span className={`min-w-0 flex-1 ${titleClass}`}>{title}</span>
      {accessory ? (
        <span className={`shrink-0 tabular-nums ${MYPAGE_HOME_META_TEXT_CLASS}`}>{accessory}</span>
      ) : null}
      <ChevronRight className={MYPAGE_HOME_CHEVRON_CLASS} strokeWidth={2} />
    </>
  );

  if (onPress) {
    return (
      <button type="button" onClick={onPress} className={`${rowClass} w-full text-left`}>
        {inner}
      </button>
    );
  }

  return (
    <Link href={href} className={rowClass}>
      {inner}
    </Link>
  );
}
