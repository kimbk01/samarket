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
  MYPAGE_HOME_ROW_ARMED_CLASS,
  MYPAGE_HOME_ROW_CLASS,
  MYPAGE_HOME_ROW_DIVIDER_CLASS,
  MYPAGE_HOME_ROW_PRESS_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

export type MyInfoMenuTrailing = "chevron" | "value" | "badge" | "status" | "none";

export function MyInfoMenuItem({
  title,
  href,
  icon,
  accessory,
  trailing = "chevron",
  tone = "default",
  first = false,
  pressFeedback = false,
  armed = false,
  onNavigate,
  onPress,
}: {
  title: string;
  /** @deprecated 설명 미표시 — 호환용 */
  description?: string;
  href: string;
  icon?: ReactNode;
  /** Right-side value / badge / status text */
  accessory?: ReactNode;
  /**
   * Trailing control — do not flatten every row to chevron.
   * `value`/`badge`/`status` show accessory; chevron only when trailing=chevron (default for links).
   */
  trailing?: MyInfoMenuTrailing;
  tone?: "default" | "danger";
  /** 섹션 첫 행 — 상단 구분선 생략 */
  first?: boolean;
  /** 매장 CTA 등 — scale 0.98 pressed feedback */
  pressFeedback?: boolean;
  /** 매장 진입 등 — 탭 직후~이동 전 armed 톤 */
  armed?: boolean;
  /** Link 클릭 직전(기본 네비게이션 유지) — 캐시 무효화 등 */
  onNavigate?: () => void;
  /** 비로그인 — Link 대신 탭 시 로그인 유도 */
  onPress?: () => void;
}) {
  const titleClass = tone === "danger" ? MYPAGE_HOME_DANGER_TEXT_CLASS : MYPAGE_HOME_MENU_TITLE_CLASS;
  const rowClass = [
    MYPAGE_HOME_ROW_CLASS,
    first ? "" : MYPAGE_HOME_ROW_DIVIDER_CLASS,
    pressFeedback ? MYPAGE_HOME_ROW_PRESS_CLASS : "",
    armed ? MYPAGE_HOME_ROW_ARMED_CLASS : "",
  ]
    .filter(Boolean)
    .join(" ");
  const showChevron = trailing === "chevron";
  const showAccessory = accessory != null && trailing !== "none";

  const inner = (
    <>
      {icon ? <span className={MYPAGE_HOME_ICON_WRAP_CLASS}>{icon}</span> : null}
      <span className={`min-w-0 flex-1 ${titleClass}`}>{title}</span>
      {showAccessory ? (
        <span className={`shrink-0 tabular-nums ${MYPAGE_HOME_META_TEXT_CLASS}`} data-trailing={trailing}>
          {accessory}
        </span>
      ) : null}
      {showChevron ? <ChevronRight className={MYPAGE_HOME_CHEVRON_CLASS} strokeWidth={2} /> : null}
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
    <Link
      href={href}
      className={rowClass}
      onClick={onNavigate ? () => onNavigate() : undefined}
    >
      {inner}
    </Link>
  );
}
