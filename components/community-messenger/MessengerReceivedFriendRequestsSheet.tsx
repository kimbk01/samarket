"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerHomeBottomSheetShell } from "@/components/community-messenger/MessengerSheetUi";
import type { CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";
import {
  patchCommunityMessengerFriendRequestApi,
  shouldDisableMessengerIncomingFriendActionButtons,
} from "@/lib/community-messenger/community-messenger-friend-request-client";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";

type Props = {
  open: boolean;
  onClose: () => void;
  requests: CommunityMessengerFriendRequest[];
  onChanged: () => void;
};

export function MessengerReceivedFriendRequestsSheet({ open, onClose, requests, onChanged }: Props) {
  const { t } = useI18n();
  const [busyId, setBusyId] = useState<string | null>(null);
  const incoming = requests.filter((r) => r.status === "pending" && r.direction === "incoming");

  if (!open) return null;

  const respond = async (request: CommunityMessengerFriendRequest, action: "accept" | "reject") => {
    setBusyId(`request:${request.id}:${action}`);
    try {
      const result = await patchCommunityMessengerFriendRequestApi(request.id, action);
      if (!result.ok) {
        showMessengerSnackbar(t("cm_ui_friend_request_respond_failed"), { variant: "error" });
        return;
      }
      if (action === "accept") {
        showMessengerSnackbar(t("cm_friend_request_you_accepted", { name: request.requesterLabel }), {
          variant: "success",
        });
      } else {
        showMessengerSnackbar(t("cm_friend_request_you_rejected", { name: request.requesterLabel }), {
          variant: "default",
        });
      }
      onChanged();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <MessengerHomeBottomSheetShell
      onClose={onClose}
      closeAriaLabel={t("nav_close")}
      dialogAriaLabel={t("cm_friend_sheet_received")}
      anchor="center"
      panelClassName="rounded-ui-rect"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--messenger-divider)] px-3 py-2.5">
        <p className="sam-text-body-lg font-semibold" style={{ color: "var(--messenger-text)" }}>
          {t("cm_friend_section_pending_received")}
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

      <div className="max-h-[min(60vh,420px)] overflow-y-auto px-3 py-2">
        {incoming.length === 0 ? (
          <p className="py-8 text-center sam-text-body-secondary" style={{ color: "var(--messenger-text-secondary)" }}>
            {t("cm_friend_sheet_empty_received")}
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--messenger-divider)]">
            {incoming.map((req) => {
              const disabled = shouldDisableMessengerIncomingFriendActionButtons(busyId, req.id);
              return (
                <li key={req.id} className="flex items-center gap-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate sam-text-body font-medium" style={{ color: "var(--messenger-text)" }}>
                      {req.requesterLabel}
                    </p>
                    <p className="sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
                      {t("cm_friend_incoming_popup_body")}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => void respond(req, "reject")}
                    className="rounded-ui-rect border border-[color:var(--messenger-divider)] px-2.5 py-1.5 sam-text-helper font-semibold transition-transform active:scale-[0.98] disabled:opacity-50"
                    style={{ color: "var(--messenger-text)" }}
                  >
                    {t("cm_friend_cta_reject")}
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => void respond(req, "accept")}
                    className="rounded-ui-rect bg-[color:var(--sam-primary)] px-2.5 py-1.5 sam-text-helper font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
                  >
                    {t("cm_friend_cta_accept")}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </MessengerHomeBottomSheetShell>
  );
}
