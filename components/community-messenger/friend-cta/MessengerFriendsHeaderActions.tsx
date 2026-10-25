"use client";

import { SlidersHorizontal } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = {
  /** 숨김·차단·알림 끔 합계 — 1 이상이면 관리 아이콘에 점 */
  manageCount: number;
  onOpenManage: () => void;
};

const ICON_BTN =
  "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-ui-rect border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] text-[color:var(--messenger-text)] transition-[transform,background-color] duration-100 active:scale-[0.96] active:bg-[color:var(--messenger-primary-soft)]";

/**
 * 친구 탭 검색 줄 오른쪽 — 친구 관리(숨김·차단·알림 끔이 있으면 점).
 * §15-3: [친구 추가]는 탭 줄(`MessengerHomeSectionTabs`)로 옮겨 네 탭 공통.
 */
export function MessengerFriendsHeaderActions({ manageCount, onOpenManage }: Props) {
  const { t } = useI18n();
  return (
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
  );
}
