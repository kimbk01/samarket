"use client";

import { SlidersHorizontal, UserPlus } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = {
  incomingCount: number;
  outgoingCount: number;
  /** 숨김·차단·알림 끔 합계 — 1 이상이면 관리 아이콘에 점 */
  manageCount: number;
  onOpenRequests: () => void;
  onOpenManage: () => void;
};

const ICON_BTN =
  "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-ui-rect border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] text-[color:var(--messenger-text)] transition-[transform,background-color] duration-100 active:scale-[0.96] active:bg-[color:var(--messenger-primary-soft)]";

/**
 * 친구 탭 검색 줄 오른쪽 — 친구 요청(받은 요청 수 배지) · 친구 관리(숨김·차단·알림 끔이 있으면 점).
 * 1단계 문서 §11: 전체 폭 글자 행 2개를 대신한다.
 */
export function MessengerFriendsHeaderActions({
  incomingCount,
  outgoingCount,
  manageCount,
  onOpenRequests,
  onOpenManage,
}: Props) {
  const { t } = useI18n();
  const badge = incomingCount > 99 ? "99+" : String(incomingCount);
  return (
    <>
      <button
        type="button"
        className={ICON_BTN}
        onClick={onOpenRequests}
        aria-label={t("cm_friend_requests_button_aria", { received: incomingCount, sent: outgoingCount })}
        data-cm-friend-requests-button=""
      >
        <UserPlus className="h-5 w-5" strokeWidth={2} aria-hidden />
        {incomingCount > 0 ? (
          <span
            className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[color:var(--sm-color-danger)] px-1 text-[11px] font-bold leading-none text-white ring-2 ring-[color:var(--messenger-bg)]"
            aria-hidden
          >
            {badge}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        className={ICON_BTN}
        onClick={onOpenManage}
        aria-label={t("cm_ui_friend_manage")}
        data-cm-friend-manage-button=""
      >
        <SlidersHorizontal className="h-5 w-5" strokeWidth={2} aria-hidden />
        {manageCount > 0 ? (
          <span
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[color:var(--messenger-primary)] ring-2 ring-[color:var(--messenger-surface)]"
            aria-hidden
          />
        ) : null}
      </button>
    </>
  );
}
