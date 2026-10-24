"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayDialog, type DibayOverlayAction } from "@/components/ui/dibay-overlay";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import type { IncomingFriendRequestPopupEntry } from "@/lib/community-messenger/stores/incoming-friend-request-popup-store";
import { patchCommunityMessengerFriendRequestApi } from "@/lib/community-messenger/community-messenger-friend-request-client";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";

type Props = {
  entry: IncomingFriendRequestPopupEntry;
  /** UI dismiss only — must NOT reject DB pending. */
  onDismiss: () => void;
  onResolved: (action: "accept" | "reject") => void;
  /** 이미 처리된 요청(다른 기기 등) — 팝업 큐에서 제거 */
  onGone: () => void;
};

/**
 * Center popup for incoming friend request (DibayDialog · 16px · [거절][수락]).
 * X / back / outside = dismiss UI only (pending stays in DB + received list).
 * 실패 시 팝업을 유지하고 오류 안내 — 조용히 닫지 않는다.
 */
export function MessengerIncomingFriendRequestPopup({ entry, onDismiss, onResolved, onGone }: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);

  const run = async (action: "accept" | "reject") => {
    if (busy) return;
    setBusy(action);
    try {
      const result = await patchCommunityMessengerFriendRequestApi(entry.id, action);
      if (result.ok) {
        onResolved(action);
        return;
      }
      if (result.error === "not_pending" || result.error === "request_not_found") {
        showMessengerSnackbar(t("cm_friend_request_no_longer_pending"), { variant: "default" });
        onGone();
        return;
      }
      showMessengerSnackbar(t("cm_friend_request_respond_failed"), { variant: "error" });
    } finally {
      setBusy(null);
    }
  };

  const actions: DibayOverlayAction[] = [
    {
      key: "reject",
      label: t("cm_friend_cta_reject"),
      roleTone: "secondary",
      onClick: () => void run("reject"),
      disabled: busy !== null,
      loading: busy === "reject",
    },
    {
      key: "accept",
      label: t("cm_friend_cta_accept"),
      roleTone: "primary",
      onClick: () => void run("accept"),
      disabled: busy !== null,
      loading: busy === "accept",
    },
  ];

  const handle = entry.requesterHandle?.trim() ? `@${entry.requesterHandle.trim()}` : "";

  return (
    <DibayDialog
      open
      onClose={busy ? undefined : onDismiss}
      dismissible={busy === null}
      title={<span className="block w-full text-center">{t("cm_friend_incoming_popup_title")}</span>}
      ariaLabel={t("cm_friend_incoming_popup_title")}
      actions={actions}
    >
      <div className="mt-3 flex flex-col items-center text-center" data-messenger-incoming-friend-request-popup="">
        <span className="inline-flex h-16 w-16 shrink-0 overflow-hidden rounded-full">
          <SamarketThumbnail
            src={resolveUserAvatarImageSrc(entry.requesterAvatarUrl ?? undefined)}
            size={64}
            roundedClassName="rounded-full"
            fallbackSrc=""
            fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
          />
        </span>
        <p className="mt-3 sam-text-body font-semibold text-sam-fg">{entry.requesterLabel}</p>
        {handle ? <p className="mt-0.5 sam-text-helper text-sam-muted">{handle}</p> : null}
        <p className="mt-2 sam-text-body-secondary text-sam-muted">
          {t("cm_friend_incoming_popup_message", { name: entry.requesterLabel })}
        </p>
      </div>
    </DibayDialog>
  );
}
