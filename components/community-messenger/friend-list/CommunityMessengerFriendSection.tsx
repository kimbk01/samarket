"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

type Props = {
  titleKey: MessageKey;
  /** 제목 옆 인원 수 (예: 친구 5) */
  count?: number;
  /** 제목 줄 오른쪽 회색 글 (예: 새 친구 「최근 7일」) */
  rightKey?: MessageKey;
  children: ReactNode;
  defaultOpen?: boolean;
  /** 묶음 표시 — 시험·실기 확인용 */
  sectionId?: string;
};

/**
 * 친구 탭 묶음 (채팅 시안 4판 「2. 친구 탭」) — 제목 12.5px 회색 · 굵지 않게 · 여백 14 16 6 · 오른쪽 보조 글.
 */
export function CommunityMessengerFriendSection({
  titleKey,
  count,
  rightKey,
  children,
  defaultOpen = true,
  sectionId,
}: Props) {
  const { t } = useI18n();
  if (!defaultOpen) return null;
  return (
    <section data-cm-friend-section={sectionId}>
      <MessengerFriendTabSectionLabel title={t(titleKey)} count={count} right={rightKey ? t(rightKey) : null} />
      <div>{children}</div>
    </section>
  );
}

export function MessengerFriendTabSectionLabel({
  title,
  count,
  right = null,
}: {
  title: string;
  count?: number;
  right?: ReactNode;
}) {
  return (
    <header
      className="flex items-center justify-between gap-2 px-4 pb-1.5 pt-3.5 text-[12.5px] leading-[1.3]"
      style={{ color: "var(--cm-chat-sub)" }}
    >
      <h3 className="min-w-0 truncate font-normal">
        {title}
        {typeof count === "number" ? <span className="ml-1 tabular-nums">{count}</span> : null}
      </h3>
      {right ? <span className="shrink-0">{right}</span> : null}
    </header>
  );
}
