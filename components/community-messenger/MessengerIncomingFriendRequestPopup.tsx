"use client";

import type { CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";

type Props = {
  request: CommunityMessengerFriendRequest;
  busyId: string | null;
  onDismiss: () => void;
  onRespond: (requestId: string, action: "accept" | "reject") => void;
};

export function MessengerIncomingFriendRequestPopup({ request, busyId, onDismiss, onRespond }: Props) {
  const busyAccept = busyId === `request:${request.id}:accept`;
  const busyReject = busyId === `request:${request.id}:reject`;
  const initial = request.requesterLabel.trim().slice(0, 1) || "?";

  return (
    <div
      className="pointer-events-auto fixed inset-x-0 bottom-[max(6px,env(safe-area-inset-bottom))] z-[62] px-3"
      role="dialog"
      aria-labelledby="messenger-incoming-fr-title"
    >
      <div
        className="mx-auto max-w-lg overflow-hidden rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] shadow-[var(--messenger-shadow-soft)]"
        style={{ color: "var(--messenger-text)" }}
      >
        <div className="flex items-start gap-3 p-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--messenger-primary-soft)] text-[15px] font-semibold"
            style={{ color: "var(--messenger-text-secondary)" }}
            aria-hidden
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p id="messenger-incoming-fr-title" className="text-[14px] font-semibold leading-snug">
              친구 요청
            </p>
            <p className="mt-0.5 truncate text-[13px] leading-snug">
              <span className="font-medium">{request.requesterLabel}</span>
              <span style={{ color: "var(--messenger-text-secondary)" }}> 님의 요청</span>
            </p>
          </div>
        </div>
        <div className="flex gap-2 border-t border-[color:var(--messenger-divider)] px-3 py-2.5">
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-[40px] flex-1 rounded-[var(--messenger-radius-sm)] border border-[color:var(--messenger-divider)] text-[13px] font-medium active:bg-[color:var(--messenger-primary-soft)]"
            style={{ color: "var(--messenger-text-secondary)" }}
          >
            닫기
          </button>
          <button
            type="button"
            disabled={busyReject}
            onClick={() => onRespond(request.id, "reject")}
            className="min-h-[40px] flex-1 rounded-[var(--messenger-radius-sm)] border border-[color:var(--messenger-divider)] text-[13px] font-medium disabled:opacity-50"
          >
            {busyReject ? "…" : "거절"}
          </button>
          <button
            type="button"
            disabled={busyAccept}
            onClick={() => onRespond(request.id, "accept")}
            className="min-h-[40px] flex-[1.1] rounded-[var(--messenger-radius-sm)] bg-[color:var(--messenger-primary)] text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {busyAccept ? "…" : "수락"}
          </button>
        </div>
      </div>
    </div>
  );
}
