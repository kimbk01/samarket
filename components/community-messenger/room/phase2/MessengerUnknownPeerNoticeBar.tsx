"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { messengerMonitorRecord } from "@/lib/community-messenger/monitoring/client";
import { useEffect, type ReactNode } from "react";

/**
 * §15 대화방 2단 헤더 — 상태마다 배경·한 줄 설명·해야 할 버튼(CTA)을 분명히.
 * 밝은 화면 고정 토큰(--dibay-* / --sm-color-* / --sam-*)만 쓴다.
 */
const BTN_BASE =
  "inline-flex min-h-[36px] w-full items-center justify-center gap-1 rounded-ui-rect px-3 sam-text-body-secondary font-semibold transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";
const BTN_PRIMARY = `${BTN_BASE} bg-[color:var(--dibay-green)] text-white`;
const BTN_DANGER = `${BTN_BASE} border border-[color:var(--sam-danger)] bg-[color:var(--dibay-card)] text-[color:var(--sam-danger)]`;
const BTN_OUTLINE = `${BTN_BASE} border border-[color:var(--dibay-green)] bg-[color:var(--dibay-card)] text-[color:var(--dibay-green)]`;

const SURFACE = "border-b border-[color:var(--sm-color-border)] px-3 py-2.5";
const SURFACE_BG = {
  stranger: "color-mix(in srgb, var(--sam-warning-soft) 55%, var(--sam-bg-surface))",
  incoming_request: "color-mix(in srgb, var(--sam-warning-soft) 55%, var(--sam-bg-surface))",
  pending: "color-mix(in srgb, var(--sam-warning-soft) 55%, var(--sam-bg-surface))",
  blocked_by_me: "var(--sam-danger-soft)",
  /** §15-3: 시안 회색 그대로(토큰 베이지 불일치 정정) */
  rejected_by_peer: "#f1efe8",
} as const;

export type MessengerPeerNoticeVariant = keyof typeof SURFACE_BG;

type Props = {
  variant: MessengerPeerNoticeVariant;
  busy?: boolean;
  /** 받은 요청 문구의 상대 이름 */
  peerName?: string;
  onAddFriend?: () => void;
  onBlock?: () => void;
  onUnblock?: () => void;
  /** §17 R-2: 보낸 요청 취소 */
  onCancelRequest?: () => void;
  /** §17 R-2: 받은 요청 수락·거절 */
  onAcceptRequest?: () => void;
  onRejectRequest?: () => void;
};

const BTN_SECONDARY = `${BTN_BASE} border border-[color:var(--sm-color-border)] bg-[color:var(--dibay-card)] text-[color:var(--sm-color-text-main)]`;
const LINK_DANGER =
  "mx-auto mt-2 flex min-h-[32px] items-center justify-center gap-1 px-3 sam-text-helper font-medium text-[color:var(--sam-danger)] transition-transform active:scale-[0.98] disabled:opacity-60";

function BanIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M18 8v6M15 11h6" />
    </svg>
  );
}

/**
 * 1:1 room top notice — 친구 아님 / 받은 요청 / 요청 보냄 / 내가 차단 / 상대가 거절.
 */
export function MessengerUnknownPeerNoticeBar({
  variant,
  busy = false,
  peerName,
  onAddFriend,
  onBlock,
  onUnblock,
  onCancelRequest,
  onAcceptRequest,
  onRejectRequest,
}: Props) {
  const { t } = useI18n();

  useEffect(() => {
    if (variant === "stranger") {
      messengerMonitorRecord({
        category: "api.community_messenger",
        metric: "unknown_user_chat_notice_rendered",
        unit: "count",
        value: 1,
        labels: { variant },
      });
    }
  }, [variant]);

  const textTone =
    variant === "blocked_by_me"
      ? "text-[color:var(--sam-danger)]"
      : variant === "rejected_by_peer"
        ? "text-[color:var(--sm-color-text-main)]"
        : "text-[color:var(--sam-warning)]";

  const message =
    variant === "stranger" ? (
      <>
        <span className="font-semibold">{t("cm_peer_notice_stranger_title")}</span>
        {" · "}
        {t("cm_peer_notice_stranger_hint")}
      </>
    ) : variant === "incoming_request" ? (
      <span className="font-semibold">{t("cm_peer_notice_incoming_title", { name: peerName || t("cm_peer_notice_peer_fallback") })}</span>
    ) : variant === "pending" ? (
      <>
        <span className="font-semibold">{t("cm_peer_notice_pending_title")}</span>
        {" · "}
        {t("cm_peer_notice_pending_hint")}
      </>
    ) : variant === "blocked_by_me" ? (
      <span className="font-semibold">{t("cm_social_peer_blocked_notice")}</span>
    ) : (
      t("cm_peer_notice_rejected")
    );

  const buttons: ReactNode[] = [];
  if (variant === "stranger" && onAddFriend) {
    buttons.push(
      <button key="add" type="button" disabled={busy} onClick={onAddFriend} aria-busy={busy || undefined} className={BTN_PRIMARY}>
        <UserPlusIcon />
        {t("cm_social_add_friend")}
      </button>
    );
  }
  if (variant === "incoming_request") {
    if (onAcceptRequest) {
      buttons.push(
        <button key="accept" type="button" disabled={busy} onClick={onAcceptRequest} aria-busy={busy || undefined} className={BTN_PRIMARY}>
          <CheckIcon />
          {t("cm_friend_cta_accept")}
        </button>
      );
    }
    if (onRejectRequest) {
      buttons.push(
        <button key="reject" type="button" disabled={busy} onClick={onRejectRequest} className={BTN_SECONDARY}>
          {t("cm_friend_cta_reject")}
        </button>
      );
    }
  }
  if (variant === "pending" && onCancelRequest) {
    buttons.push(
      <button key="cancel" type="button" disabled={busy} onClick={onCancelRequest} className={BTN_SECONDARY}>
        {t("cm_friend_cta_cancel")}
      </button>
    );
  }
  if ((variant === "stranger" || variant === "pending") && onBlock) {
    buttons.push(
      <button key="block" type="button" disabled={busy} onClick={onBlock} className={BTN_DANGER}>
        <BanIcon />
        {t("cm_social_block")}
      </button>
    );
  }
  if (variant === "blocked_by_me" && onUnblock) {
    buttons.push(
      <button key="unblock" type="button" disabled={busy} onClick={onUnblock} aria-busy={busy || undefined} className={BTN_OUTLINE}>
        {t("cm_social_unblock")}
      </button>
    );
  }

  return (
    <div className={SURFACE} style={{ backgroundColor: SURFACE_BG[variant] }} data-cm-peer-notice={variant}>
      <p className={`sam-text-helper ${textTone}`}>{message}</p>
      {buttons.length > 0 ? (
        <div className={`mt-2 grid gap-2 ${buttons.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>{buttons}</div>
      ) : null}
      {variant === "incoming_request" && onBlock ? (
        <button type="button" disabled={busy} onClick={onBlock} className={LINK_DANGER}>
          <BanIcon />
          {t("cm_social_block")}
        </button>
      ) : null}
    </div>
  );
}
