"use client";

import { MessageCircle, Users, type LucideIcon } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerHomeBottomSheetShell } from "@/components/community-messenger/MessengerSheetUi";
import type { MessageKey } from "@/lib/i18n/messages";

type Props = {
  onClose: () => void;
  /** 「1:1 대화」 — 친구 고르기(1:1) 하위 화면 */
  onPickDirect: () => void;
  /** 「그룹 대화」 — 친구 고르기(그룹) 하위 화면으로 바로 (예전 「비공개 그룹 / 모임」 고르는 단계 없음) */
  onPickGroup: () => void;
};

const ITEMS: readonly {
  key: "direct" | "group";
  icon: LucideIcon;
  label: MessageKey;
  hint: MessageKey;
}[] = [
  {
    key: "direct",
    icon: MessageCircle,
    label: "cm_ui_new_conversation_direct",
    hint: "cm_ui_new_conversation_direct_hint",
  },
  {
    key: "group",
    icon: Users,
    label: "cm_ui_new_conversation_group",
    hint: "cm_ui_new_conversation_group_hint",
  },
];

/**
 * 대화 탭 「새 대화」 시트 (채팅 시안 4판 「5. 새 대화」, Owner 「정확히 시안대로」 2026-11-10) — 모달이라 공통 머리글 대상 아님.
 * 위 둥글기 18 · 손잡이 · 제목 「새 대화」 18/700 (왼쪽 20) · 줄 64 (좌우 20 · 간격 14) · 아이콘 칸 42 (둥글기 15, 연회색) ·
 * 이름 16/600 · 설명 13 회색. 버튼을 누르자마자 열리도록 홈이 정적으로 불러 둔다(지연 불러오기 없음).
 */
export function MessengerNewConversationSheet({ onClose, onPickDirect, onPickGroup }: Props) {
  const { t } = useI18n();
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <MessengerHomeBottomSheetShell
      onClose={onClose}
      closeAriaLabel={t("nav_close")}
      dialogAriaLabel={t("cm_ui_new_conversation")}
      panelClassName="!rounded-t-[18px]"
    >
      <div className="pb-[max(18px,var(--safe-bottom))] pt-2" data-cm-new-conversation-sheet="">
        <div className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-[color:var(--overlay-border)]" aria-hidden />
        <h2
          className="px-5 pb-2.5 pt-1 text-[18px] font-bold leading-[1.3]"
          style={{ color: "var(--cm-chat-fg)" }}
        >
          {t("cm_ui_new_conversation")}
        </h2>
        <ul role="list">
          {ITEMS.map(({ key, icon: Icon, label, hint }) => (
            <li key={key}>
              <button
                type="button"
                onClick={run(key === "direct" ? onPickDirect : onPickGroup)}
                data-cm-new-conversation-item={key}
                className="flex h-16 w-full items-center gap-3.5 px-5 text-left transition-colors active:bg-[color:var(--cm-chat-band)]"
              >
                <span
                  className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[15px] bg-[color:var(--cm-chat-band)]"
                  style={{ color: "var(--cm-chat-fg)" }}
                  aria-hidden
                >
                  <Icon className="h-5 w-5" strokeWidth={1.7} />
                </span>
                <span className="min-w-0">
                  <span
                    className="block truncate text-[16px] font-semibold leading-[1.35]"
                    style={{ color: "var(--cm-chat-fg)" }}
                  >
                    {t(label)}
                  </span>
                  <span className="block truncate text-[13px] leading-[1.35]" style={{ color: "var(--cm-chat-sub)" }}>
                    {t(hint)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </MessengerHomeBottomSheetShell>
  );
}
