"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerHomeBottomSheetShell } from "@/components/community-messenger/MessengerSheetUi";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import {
  MessengerFriendRelationCta,
  type MessengerFriendCtaBusy,
} from "@/components/community-messenger/friend-cta/MessengerFriendRelationCta";
import type { CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import {
  patchCommunityMessengerFriendRequestApi,
  postCancelOutgoingCommunityMessengerFriendRequestApi,
} from "@/lib/community-messenger/community-messenger-friend-request-client";
import { useIncomingFriendRequestPopupStore } from "@/lib/community-messenger/stores/incoming-friend-request-popup-store";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";

export type MessengerFriendRequestsSheetTab = "received" | "sent";

type Props = {
  open: boolean;
  onClose: () => void;
  requests: CommunityMessengerFriendRequest[];
  onChanged: () => void;
  initialTab?: MessengerFriendRequestsSheetTab;
};

/** 친구 요청 시트 — 받은 요청(거절·수락) / 보낸 요청(요청 취소). 1단계 문서 §3-2 ④·④'. */
export function MessengerReceivedFriendRequestsSheet({ open, onClose, requests, onChanged, initialTab = "received" }: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<MessengerFriendRequestsSheetTab>(initialTab);
  const [busy, setBusy] = useState<{ id: string; action: Exclude<MessengerFriendCtaBusy, null> } | null>(null);
  const incoming = requests.filter((r) => r.status === "pending" && r.direction === "incoming");
  const outgoing = requests.filter((r) => r.status === "pending" && r.direction === "outgoing");

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  if (!open) return null;

  const respond = async (request: CommunityMessengerFriendRequest, action: "accept" | "reject") => {
    setBusy({ id: request.id, action });
    try {
      const result = await patchCommunityMessengerFriendRequestApi(request.id, action);
      if (!result.ok) {
        const gone = result.error === "not_pending" || result.error === "request_not_found";
        showMessengerSnackbar(t(gone ? "cm_friend_request_no_longer_pending" : "cm_friend_request_respond_failed"), {
          variant: "error",
        });
        if (gone) onChanged();
        return;
      }
      useIncomingFriendRequestPopupStore.getState().removeFriendRequestIfId(request.id);
      showMessengerSnackbar(
        t(action === "accept" ? "cm_friend_request_you_accepted" : "cm_friend_request_you_rejected", {
          name: request.requesterLabel,
        }),
        { variant: action === "accept" ? "success" : "default" }
      );
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (request: CommunityMessengerFriendRequest) => {
    setBusy({ id: request.id, action: "cancel" });
    try {
      const result = await postCancelOutgoingCommunityMessengerFriendRequestApi(request.addresseeId);
      if (!result.ok) {
        showMessengerSnackbar(t("cm_friend_request_cancel_failed"), { variant: "error" });
        return;
      }
      showMessengerSnackbar(t("cm_friend_request_cancelled"), { variant: "default" });
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const rows = tab === "received" ? incoming : outgoing;

  return (
    <MessengerHomeBottomSheetShell
      onClose={onClose}
      closeAriaLabel={t("nav_close")}
      dialogAriaLabel={t("cm_friend_sheet_title")}
      anchor="center"
      panelClassName="rounded-[length:var(--overlay-radius-lg)]"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--messenger-divider)] px-3 py-2.5">
        <p className="sam-text-body-lg font-semibold" style={{ color: "var(--messenger-text)" }}>
          {t("cm_friend_sheet_title")}
        </p>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-ui-rect text-[color:var(--messenger-text-secondary)] active:bg-[color:var(--messenger-primary-soft)]"
          aria-label={t("nav_close")}
          onClick={onClose}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex shrink-0 border-b border-[color:var(--messenger-divider)]" role="tablist">
        {(["received", "sent"] as const).map((key) => {
          const active = tab === key;
          const count = key === "received" ? incoming.length : outgoing.length;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={`relative min-w-0 flex-1 px-1 py-2.5 sam-text-helper ${active ? "font-semibold" : "font-medium"}`}
              style={{ color: active ? "var(--messenger-text)" : "var(--messenger-text-secondary)" }}
            >
              {t(key === "received" ? "cm_friend_sheet_received" : "cm_friend_sheet_sent")}
              {count > 0 ? ` ${count}` : ""}
              {active ? (
                <span
                  className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                  style={{ backgroundColor: "var(--messenger-primary)" }}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="max-h-[min(60vh,420px)] overflow-y-auto px-3 py-2">
        {rows.length === 0 ? (
          <p className="py-8 text-center sam-text-body-secondary" style={{ color: "var(--messenger-text-secondary)" }}>
            {t(tab === "received" ? "cm_friend_sheet_empty_received" : "cm_friend_sheet_empty_sent")}
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--messenger-divider)]">
            {rows.map((req) => {
              const isIncoming = tab === "received";
              const label = isIncoming ? req.requesterLabel : req.addresseeLabel;
              const avatar = isIncoming ? req.requesterAvatarUrl : req.addresseeAvatarUrl;
              const handle = isIncoming ? req.requesterHandle : req.addresseeHandle;
              const rowBusy: MessengerFriendCtaBusy = busy?.id === req.id ? busy.action : null;
              return (
                <li key={req.id} className="flex items-center gap-2 py-3">
                  <span className="inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-full">
                    <SamarketThumbnail
                      src={resolveUserAvatarImageSrc(avatar ?? undefined)}
                      size={40}
                      roundedClassName="rounded-full"
                      fallbackSrc=""
                      fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate sam-text-body font-medium" style={{ color: "var(--messenger-text)" }}>
                      {label}
                    </p>
                    <p className="truncate sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
                      {handle ? `@${handle}` : isIncoming ? t("cm_friend_status_incoming_waiting") : t("cm_friend_sent_status_line")}
                    </p>
                  </div>
                  <MessengerFriendRelationCta
                    cta={isIncoming ? { kind: "pending_incoming", requestId: req.id } : { kind: "pending_outgoing" }}
                    layout="row"
                    busy={rowBusy}
                    disabled={busy !== null && rowBusy === null}
                    peerLabel={label}
                    onAccept={isIncoming ? () => void respond(req, "accept") : undefined}
                    onReject={isIncoming ? () => void respond(req, "reject") : undefined}
                    onCancel={!isIncoming ? () => void cancel(req) : undefined}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </MessengerHomeBottomSheetShell>
  );
}
