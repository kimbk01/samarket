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

/** `MyRow` 오른쪽 값 상태 — loading = 작은 스켈레톤, empty = 값 자리 비움(부분 오류 포함) */
export type MyInfoMenuValueState = "loading" | "ready" | "empty";

export type MyInfoMenuBadge = { count: number; tone: "danger" | "primary" };

/** 오른쪽 값 — 행 제목 15 / 값 14 보조색 (최종 설계 §1.1) */
const MY_ROW_VALUE_CLASS = "text-[14px] font-medium leading-snug text-sam-muted";

function formatBadgeCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

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
  value,
  valueState = "ready",
  badge,
  testId,
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
  /**
   * `MyRow` 오른쪽 값 — 지정하면 값과 chevron 을 **함께** 표시(`trailing="none"` 이면 chevron 숨김).
   * 기존 `accessory`+`trailing` 동작은 그대로.
   */
  value?: ReactNode;
  valueState?: MyInfoMenuValueState;
  /** 숫자 뱃지 — 0 이하이면 숨김, 100 이상은 99+ */
  badge?: MyInfoMenuBadge;
  /** 계약 testid 보존(예: `mypage-revenue-hub-entry`) */
  testId?: string;
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
  const usesValueSlot = value !== undefined || valueState !== "ready";
  const showChevron = usesValueSlot ? trailing !== "none" : trailing === "chevron";
  const showAccessory = accessory != null && trailing !== "none";
  const showBadge = badge != null && badge.count > 0;

  const inner = (
    <>
      {icon ? <span className={MYPAGE_HOME_ICON_WRAP_CLASS}>{icon}</span> : null}
      <span className={`min-w-0 flex-1 ${titleClass}`}>{title}</span>
      {usesValueSlot ? (
        <span className={`shrink-0 tabular-nums ${MY_ROW_VALUE_CLASS}`} data-row-value={valueState}>
          {valueState === "loading" ? (
            <span
              aria-hidden
              className="block h-3.5 w-12 rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse"
            />
          ) : valueState === "empty" ? null : (
            value
          )}
        </span>
      ) : null}
      {showBadge && badge ? (
        <span
          data-row-badge={badge.tone}
          className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums text-sam-surface ${
            badge.tone === "danger" ? "bg-sam-danger" : "bg-sam-primary"
          }`}
        >
          {formatBadgeCount(badge.count)}
        </span>
      ) : null}
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
      <button type="button" onClick={onPress} className={`${rowClass} w-full text-left`} data-testid={testId}>
        {inner}
      </button>
    );
  }

  return (
    <Link
      href={href}
      className={rowClass}
      data-testid={testId}
      onClick={onNavigate ? () => onNavigate() : undefined}
    >
      {inner}
    </Link>
  );
}
