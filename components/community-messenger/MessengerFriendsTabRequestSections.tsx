"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  formatFriendRejectCooldownShort,
  shouldDisableMessengerIncomingFriendActionButtons,
  shouldDisableMessengerOutgoingFriendCancelButton,
} from "@/lib/community-messenger/community-messenger-friend-request-client";
import {
  MessengerFriendAddCtaLabelKeys,
  MessengerFriendRequestSheetLabelKeys,
} from "@/lib/community-messenger/messenger-friend-add-cta";
import type { MessengerFriendRejectedPeerEntry } from "@/lib/community-messenger/partition-messenger-friend-requests";
import type { CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";

type Props = {
  received: CommunityMessengerFriendRequest[];
  sent: CommunityMessengerFriendRequest[];
  rejectedPeers: MessengerFriendRejectedPeerEntry[];
  busyId: string | null;
  cooldownNowMs: number;
  onRespondRequest: (requestId: string, action: "accept" | "reject" | "cancel") => void;
};

function RequestAvatar({ label }: { label: string }) {
  const initial = label.trim().slice(0, 1) || "?";
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--messenger-primary-soft)] sam-text-body-secondary font-semibold"
      style={{ color: "var(--messenger-text-secondary)" }}
      aria-hidden
    >
      {initial}
    </div>
  );
}

function SectionShell({
  title,
  count,
  accent,
  topDivider,
  children,
}: {
  title: string;
  count: number;
  accent?: string;
  topDivider?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`mt-2 overflow-hidden bg-[color:var(--messenger-bg)] ${topDivider !== false ? "border-t border-[color:var(--messenger-divider)]" : ""}`}
    >
      <div className="flex items-center justify-between px-3 py-1.5">
        <h2 className="flex min-w-0 items-center gap-1.5 sam-text-body-secondary font-bold" style={{ color: accent ?? "var(--messenger-text)" }}>
          <span className="truncate">{title}</span>
          {accent && count > 0 ? (
            <span
              className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[#e53935] px-1 text-[9px] font-bold leading-none text-white"
              aria-hidden
            >
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </h2>
        {!accent || count === 0 ? (
          <span className="sam-text-helper tabular-nums" style={{ color: "var(--messenger-text-secondary)" }}>
            {count}
          </span>
        ) : null}
      </div>
      <div className="divide-y divide-[color:var(--messenger-divider)] border-y border-[color:var(--messenger-divider)]">
        {children}
      </div>
    </div>
  );
}

/**
 * 친구 탭 상단 — 받은·보낸 pending 요청과 (요청자) 최근 거절 구간.
 * `data.requests`(pending)와 `respondRequest` API 계약만 사용한다.
 */
export function MessengerFriendsTabRequestSections({
  received,
  sent,
  rejectedPeers,
  busyId,
  cooldownNowMs,
  onRespondRequest,
}: Props) {
  const { t } = useI18n();
  const L = MessengerFriendRequestSheetLabelKeys;
  const C = MessengerFriendAddCtaLabelKeys;

  const hasReceived = received.length > 0;
  const hasSent = sent.length > 0;
  const hasRejected = rejectedPeers.length > 0;
  if (!hasReceived && !hasSent && !hasRejected) return null;

  let sectionIndex = 0;

  return (
    <>
      {hasReceived ? (
        <SectionShell
          title={t(L.sectionReceived)}
          count={received.length}
          accent="var(--messenger-primary)"
          topDivider={sectionIndex++ === 0}
        >
          {received.map((request) => (
            <div key={request.id} className="flex items-center gap-2.5 px-3 py-2.5">
              <RequestAvatar label={request.requesterLabel} />
              <div className="min-w-0 flex-1">
                <p className="truncate sam-text-body font-medium" style={{ color: "var(--messenger-text)" }}>
                  {request.requesterLabel || t("cm_ui_peer_fallback")}
                </p>
                <p className="truncate sam-text-xxs" style={{ color: "var(--messenger-text-secondary)" }}>
                  {t(L.subtitleReceived)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => onRespondRequest(request.id, "reject")}
                  disabled={shouldDisableMessengerIncomingFriendActionButtons(busyId, request.id)}
                  className="rounded-ui-rect border border-[color:var(--messenger-divider)] px-2.5 py-1 sam-text-helper disabled:opacity-50"
                  style={{ color: "var(--messenger-text)" }}
                >
                  {busyId === `request:${request.id}:reject` ? t(L.processing) : t(C.reject)}
                </button>
                <button
                  type="button"
                  onClick={() => onRespondRequest(request.id, "accept")}
                  disabled={shouldDisableMessengerIncomingFriendActionButtons(busyId, request.id)}
                  className="rounded-ui-rect border border-[color:var(--messenger-primary)] bg-[color:var(--messenger-primary)] px-2.5 py-1 sam-text-helper font-semibold text-white disabled:opacity-50"
                >
                  {busyId === `request:${request.id}:accept` ? t(L.processing) : t(C.accept)}
                </button>
              </div>
            </div>
          ))}
        </SectionShell>
      ) : null}

      {hasSent ? (
        <SectionShell
          title={t(L.sectionSent)}
          count={sent.length}
          topDivider={sectionIndex++ === 0}
        >
          {sent.map((request) => (
            <div key={request.id} className="flex items-center gap-2.5 px-3 py-2.5">
              <RequestAvatar label={request.addresseeLabel} />
              <div className="min-w-0 flex-1">
                <p className="truncate sam-text-body font-medium" style={{ color: "var(--messenger-text)" }}>
                  {request.addresseeLabel || t("cm_ui_peer_fallback")}
                </p>
                <p className="truncate sam-text-xxs" style={{ color: "var(--messenger-text-secondary)" }}>
                  {t("cm_friend_friends_tab_sent_waiting")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRespondRequest(request.id, "cancel")}
                disabled={shouldDisableMessengerOutgoingFriendCancelButton(busyId, {
                  requestId: request.id,
                  addresseeUserId: request.addresseeId,
                })}
                className="shrink-0 rounded-ui-rect border border-[color:var(--messenger-divider)] px-2.5 py-1 sam-text-helper disabled:opacity-50"
                style={{ color: "var(--messenger-text)" }}
              >
                {busyId === `request:${request.id}:cancel` ? t(L.processing) : t(C.cancel)}
              </button>
            </div>
          ))}
        </SectionShell>
      ) : null}

      {hasRejected ? (
        <SectionShell
          title={t("cm_friend_friends_tab_rejected_section")}
          count={rejectedPeers.length}
          topDivider={sectionIndex++ === 0}
        >
          {rejectedPeers.map((entry) => {
            const remainingMs = Math.max(0, entry.cooldownUntilMs - cooldownNowMs);
            return (
              <div key={entry.peerId} className="flex items-center gap-2.5 px-3 py-2.5">
                <RequestAvatar label={entry.label} />
                <div className="min-w-0 flex-1">
                  <p className="truncate sam-text-body font-medium" style={{ color: "var(--messenger-text)" }}>
                    {entry.label}
                  </p>
                  <p className="truncate sam-text-xxs" style={{ color: "var(--messenger-text-secondary)" }}>
                    {remainingMs > 0
                      ? t("cm_friend_friends_tab_rejected_cooldown", {
                          duration: formatFriendRejectCooldownShort(remainingMs),
                        })
                      : t("cm_friend_friends_tab_rejected_status")}
                  </p>
                </div>
              </div>
            );
          })}
        </SectionShell>
      ) : null}
    </>
  );
}
