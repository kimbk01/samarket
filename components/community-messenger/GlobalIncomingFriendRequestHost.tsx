"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { MessengerIncomingGroupInvitePopup } from "@/components/community-messenger/MessengerIncomingGroupInvitePopup";
import { useIncomingFriendRequestPopupStore } from "@/lib/community-messenger/stores/incoming-friend-request-popup-store";
import { BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS } from "@/lib/main-menu/bottom-nav-config";

/**
 * `(main)` 전역 — 그룹 초대 하단 팝업만 표시 (P4: friend-request popup 제거).
 */
export function GlobalIncomingFriendRequestHost({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const groupInviteList = useIncomingFriendRequestPopupStore((s) => s.groupInviteList);
  const dismissGroupInviteIfId = useIncomingFriendRequestPopupStore((s) => s.dismissGroupInviteIfId);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!enabled) {
      useIncomingFriendRequestPopupStore.getState().dismissAllGroupInvites();
    }
  }, [enabled]);

  if (!mounted || typeof document === "undefined") return null;
  if (!groupInviteList.length) return null;

  return createPortal(
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
  );
}
