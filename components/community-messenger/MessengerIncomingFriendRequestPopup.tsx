"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerHomeBottomSheetShell } from "@/components/community-messenger/MessengerSheetUi";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import type { IncomingFriendRequestPopupEntry } from "@/lib/community-messenger/stores/incoming-friend-request-popup-store";
import { patchCommunityMessengerFriendRequestApi } from "@/lib/community-messenger/community-messenger-friend-request-client";

type Props = {
  entry: IncomingFriendRequestPopupEntry;
  /** UI dismiss only — must NOT reject DB pending. */
  onDismiss: () => void;
  onResolved: (action: "accept" | "reject") => void;
};

/**
 * Center popup for incoming friend request.
 * X / back / outside = dismiss UI only (pending stays in DB + received list).
 */
export function MessengerIncomingFriendRequestPopup({ entry, onDismiss, onResolved }: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);

  const run = async (action: "accept" | "reject") => {
    if (busy) return;
    setBusy(action);
    try {
      const result = await patchCommunityMessengerFriendRequestApi(entry.id, action);
      if (result.ok) onResolved(action);
      else onDismiss();
    } finally {
      setBusy(null);
    }
  };

  return (
    <MessengerHomeBottomSheetShell
      onClose={onDismiss}
      closeAriaLabel={t("nav_close")}
      dialogAriaLabel={t("cm_ui_friend_request")}
      anchor="center"
      panelClassName="rounded-ui-rect bg-[color:var(--messenger-bg)]"
    >
      <div className="px-4 pb-4 pt-3" data-messenger-incoming-friend-request-popup="">
        <div className="flex items-start justify-between gap-2">
          <p className="sam-text-body-lg font-semibold" style={{ color: "var(--messenger-text)" }}>
            {t("cm_ui_friend_request")}
          </p>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-ui-rect text-[color:var(--messenger-text-secondary)] transition-transform active:scale-[0.96] active:bg-[color:var(--messenger-primary-soft)]"
            aria-label={t("nav_close")}
            onClick={onDismiss}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-4 flex flex-col items-center text-center">
          <span className="inline-flex h-16 w-16 shrink-0 overflow-hidden rounded-full">
            <SamarketThumbnail
              src={resolveUserAvatarImageSrc(entry.requesterAvatarUrl ?? undefined)}
              size={64}
              roundedClassName="rounded-full"
              fallbackSrc=""
              fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
            />
          </span>
          <p className="mt-3 sam-text-body font-semibold" style={{ color: "var(--messenger-text)" }}>
            {entry.requesterLabel}
          </p>
          <p className="mt-1 sam-text-body-secondary" style={{ color: "var(--messenger-text-secondary)" }}>
            {t("cm_friend_incoming_popup_body")}
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void run("reject")}
            className="rounded-ui-rect border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] py-3 sam-text-body font-semibold transition-transform duration-100 active:scale-[0.98] disabled:opacity-50"
            style={{ color: "var(--messenger-text)" }}
          >
            {busy === "reject" ? t("common_processing") : t("cm_friend_cta_reject")}
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void run("accept")}
            className="rounded-ui-rect bg-[color:var(--sam-primary)] py-3 sam-text-body font-semibold text-white transition-transform duration-100 active:scale-[0.98] disabled:opacity-50"
          >
            {busy === "accept" ? t("common_processing") : t("cm_friend_cta_accept")}
          </button>
        </div>
      </div>
    </MessengerHomeBottomSheetShell>
  );
}
