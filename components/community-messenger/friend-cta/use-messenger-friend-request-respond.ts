"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessengerFriendCtaBusy } from "@/components/community-messenger/friend-cta/MessengerFriendRelationCta";
import type { CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";
import {
  patchCommunityMessengerFriendRequestApi,
  postCancelOutgoingCommunityMessengerFriendRequestApi,
} from "@/lib/community-messenger/community-messenger-friend-request-client";
import { useIncomingFriendRequestPopupStore } from "@/lib/community-messenger/stores/incoming-friend-request-popup-store";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";

export type MessengerFriendRequestBusy = { id: string; action: Exclude<MessengerFriendCtaBusy, null> } | null;

/**
 * 받은 친구 요청 수락·거절 / 보낸 요청 취소 — 친구 요청 시트와 친구 탭 「받은 친구 요청」 줄이 같은 처리를 쓴다
 * (같은 API·같은 안내·처리 뒤 `onChanged(요청 id)` → 상위가 목록에서 빼고 서버와 다시 맞춤).
 */
export function useMessengerFriendRequestRespond(onChanged: (handledRequestId?: string) => void) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<MessengerFriendRequestBusy>(null);

  const respond = useCallback(
    async (request: CommunityMessengerFriendRequest, action: "accept" | "reject") => {
      setBusy({ id: request.id, action });
      try {
        const result = await patchCommunityMessengerFriendRequestApi(request.id, action);
        if (!result.ok) {
          const gone = result.error === "not_pending" || result.error === "request_not_found";
          showMessengerSnackbar(t(gone ? "cm_friend_request_no_longer_pending" : "cm_friend_request_respond_failed"), {
            variant: "error",
          });
          if (gone) onChanged(request.id);
          return;
        }
        useIncomingFriendRequestPopupStore.getState().removeFriendRequestIfId(request.id);
        showMessengerSnackbar(
          t(action === "accept" ? "cm_friend_request_you_accepted" : "cm_friend_request_you_rejected", {
            name: request.requesterLabel,
          }),
          { variant: action === "accept" ? "success" : "default" }
        );
        onChanged(request.id);
      } finally {
        setBusy(null);
      }
    },
    [onChanged, t]
  );

  const cancel = useCallback(
    async (request: CommunityMessengerFriendRequest) => {
      setBusy({ id: request.id, action: "cancel" });
      try {
        const result = await postCancelOutgoingCommunityMessengerFriendRequestApi(request.addresseeId);
        if (!result.ok) {
          showMessengerSnackbar(t("cm_friend_request_cancel_failed"), { variant: "error" });
          return;
        }
        showMessengerSnackbar(t("cm_friend_request_cancelled"), { variant: "default" });
        onChanged(request.id);
      } finally {
        setBusy(null);
      }
    },
    [onChanged, t]
  );

  return { busy, respond, cancel };
}
