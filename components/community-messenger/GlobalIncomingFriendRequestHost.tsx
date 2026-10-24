"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { MessengerIncomingGroupInvitePopup } from "@/components/community-messenger/MessengerIncomingGroupInvitePopup";
import { MessengerIncomingFriendRequestPopup } from "@/components/community-messenger/MessengerIncomingFriendRequestPopup";
import { useIncomingFriendRequestPopupStore } from "@/lib/community-messenger/stores/incoming-friend-request-popup-store";
import { BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useGlobalFriendRequestFeed } from "@/lib/community-messenger/realtime/use-global-friend-request-feed";

/**
 * `(main)` 전역 — 그룹 초대 하단 스택 + 친구 요청 중앙 팝업.
 * 친구 요청 팝업 닫기 ≠ 거절 (DB pending 유지).
 * 팝업 데이터는 전역 피드(`useGlobalFriendRequestFeed`)가 채운다 — 메신저 홈이 아니어도 뜬다.
 */
export function GlobalIncomingFriendRequestHost({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const groupInviteList = useIncomingFriendRequestPopupStore((s) => s.groupInviteList);
  const dismissGroupInviteIfId = useIncomingFriendRequestPopupStore((s) => s.dismissGroupInviteIfId);
  const friendRequestList = useIncomingFriendRequestPopupStore((s) => s.friendRequestList);
  const dismissFriendRequestIfId = useIncomingFriendRequestPopupStore((s) => s.dismissFriendRequestIfId);
  const removeFriendRequestIfId = useIncomingFriendRequestPopupStore((s) => s.removeFriendRequestIfId);

  const activeFriendRequest = friendRequestList[0] ?? null;

  useGlobalFriendRequestFeed({
    enabled,
    onAcceptedByPeer: (peerLabel) => {
      showMessengerSnackbar(
        t("cm_friend_request_accepted_by_peer", { name: peerLabel || t("notify_peer_fallback") }),
        { variant: "success" }
      );
    },
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!enabled) {
      useIncomingFriendRequestPopupStore.getState().dismissAllGroupInvites();
      useIncomingFriendRequestPopupStore.getState().dismissAllFriendRequests();
    }
  }, [enabled]);

  if (!mounted || typeof document === "undefined") return null;

  return (
    <>
      {activeFriendRequest ? (
        <MessengerIncomingFriendRequestPopup
          entry={activeFriendRequest}
          onDismiss={() => dismissFriendRequestIfId(activeFriendRequest.id)}
          onGone={() => removeFriendRequestIfId(activeFriendRequest.id)}
          onResolved={(action) => {
            removeFriendRequestIfId(activeFriendRequest.id);
            if (action === "accept") {
              showMessengerSnackbar(
                t("cm_friend_request_you_accepted", { name: activeFriendRequest.requesterLabel }),
                { variant: "success" }
              );
            } else {
              showMessengerSnackbar(
                t("cm_friend_request_you_rejected", { name: activeFriendRequest.requesterLabel }),
                { variant: "default" }
              );
            }
          }}
        />
      ) : null}

      {groupInviteList.length
        ? createPortal(
            <div
              className={`pointer-events-none fixed inset-x-0 z-[118] flex max-h-[min(46vh,380px)] flex-col-reverse gap-2 overflow-y-auto px-3 pb-1 pt-1 ${BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS}`}
              data-global-incoming-group-invite
            >
              {groupInviteList.map((invite) => (
                <MessengerIncomingGroupInvitePopup
                  key={invite.id}
                  layout="stack"
                  invite={invite}
                  onDismiss={() => dismissGroupInviteIfId(invite.id)}
                  onOpen={() => {
                    dismissGroupInviteIfId(invite.id);
                    router.push(`/community-messenger/rooms/${encodeURIComponent(invite.roomId)}`);
                  }}
                />
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
