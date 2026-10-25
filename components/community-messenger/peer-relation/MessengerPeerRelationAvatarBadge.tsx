"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * §15 친구 관계 표시 — 대화·통화 목록 공통.
 * - stranger: 친구 아님(대화 가능) → 주황 물음표 배지 + 행 띠(`messengerPeerRelationRowClass`, messenger-presentation.css)
 * - unavailable: 내가 차단 / 상대가 거절 → 빨간 금지 배지 + 회색 사진
 * 글자 「친구 아님」 대신 사진 배지로 구분하고, 화면 읽기용 이름표만 남긴다.
 */
export type MessengerPeerRelationMark = "stranger" | "unavailable";

/** 행 띠·배경 — `app/messenger-presentation.css` `.cm-peer-row--*` */
export function messengerPeerRelationRowClass(mark: MessengerPeerRelationMark | null): string {
  return mark ? `cm-peer-row--${mark}` : "";
}

export function MessengerPeerRelationAvatar({
  mark,
  children,
  className = "",
}: {
  mark: MessengerPeerRelationMark | null;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  if (!mark) return <>{children}</>;
  const label = mark === "stranger" ? t("cm_peer_badge_not_friend") : t("cm_peer_badge_unavailable");
  return (
    <span className={`relative inline-flex shrink-0 ${className}`.trim()}>
      <span
        className="inline-flex"
        data-cm-peer-relation-avatar=""
        style={mark === "unavailable" ? { filter: "grayscale(1)", opacity: 0.55 } : undefined}
      >
        {children}
      </span>
      <span
        role="img"
        aria-label={label}
        title={label}
        data-cm-peer-relation-badge={mark}
        className="pointer-events-none absolute -bottom-0.5 -right-0.5 z-[1] inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-white text-white"
        style={{ backgroundColor: mark === "stranger" ? "var(--cm-peer-stranger)" : "var(--sam-danger)" }}
      >
        {mark === "stranger" ? (
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
            <path d="M8.5 9a3.5 3.5 0 1 1 5 3.2c-.9.4-1.5 1.2-1.5 2.1v.7" />
            <path d="M12 19h.01" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="8" />
            <path d="M6.5 6.5l11 11" />
          </svg>
        )}
      </span>
    </span>
  );
}
