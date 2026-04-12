"use client";

import type { CommunityMessengerCallLog, CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";
import { formatConversationTimestamp } from "@/lib/community-messenger/use-community-messenger-home-state";

export type MessengerNotificationCenterItem =
  | {
      id: string;
      kind: "request";
      createdAt: string;
      request: CommunityMessengerFriendRequest;
    }
  | {
      id: string;
      kind: "missed_call";
      createdAt: string;
      call: CommunityMessengerCallLog;
    };

type Props = {
  onClose: () => void;
  summary: { requestCount: number; missedCallCount: number };
  items: MessengerNotificationCenterItem[];
  busyId: string | null;
  onRespondRequest: (requestId: string, action: "accept" | "reject" | "cancel") => Promise<void>;
  onOpenMissedCall: (call: CommunityMessengerCallLog) => void;
};

function RequestRow({
  request,
  busyId,
  onAction,
}: {
  request: CommunityMessengerFriendRequest;
  busyId: string | null;
  onAction: (requestId: string, action: "accept" | "reject" | "cancel") => Promise<void>;
}) {
  const isIncoming = request.direction === "incoming";
  const label = isIncoming ? request.requesterLabel : request.addresseeLabel;
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="rounded-ui-rect border border-ui-border bg-ui-page px-1 py-0.5 text-[9px] font-medium text-ui-muted">
            {isIncoming ? "요청" : "보냄"}
          </span>
          <p className="truncate text-[13px] font-medium text-ui-fg">{label}</p>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-ui-muted">{isIncoming ? "친구 요청" : "보낸 요청"}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        {isIncoming ? (
          <>
            <button
              type="button"
              onClick={() => void onAction(request.id, "reject")}
              disabled={busyId === `request:${request.id}:reject`}
              className="rounded-ui-rect border border-ui-border px-2 py-1 text-[11px] text-ui-fg"
            >
              거절
            </button>
            <button
              type="button"
              onClick={() => void onAction(request.id, "accept")}
              disabled={busyId === `request:${request.id}:accept`}
              className="rounded-ui-rect border border-ui-fg bg-ui-fg px-2 py-1 text-[11px] font-semibold text-ui-surface"
            >
              수락
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void onAction(request.id, "cancel")}
            disabled={busyId === `request:${request.id}:cancel`}
            className="rounded-ui-rect border border-ui-border px-2 py-1 text-[11px] text-ui-fg"
          >
            취소
          </button>
        )}
      </div>
    </div>
  );
}

function MissedCallRow({ call, onOpen }: { call: CommunityMessengerCallLog; onOpen: () => void }) {
  const kindLabel = call.callKind === "video" ? "영상" : "음성";
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!call.roomId}
      className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-ui-hover disabled:opacity-60"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="rounded-ui-rect border border-ui-border bg-ui-page px-1 py-0.5 text-[9px] font-medium text-ui-muted">부재</span>
          <p className="truncate text-[13px] font-medium text-ui-fg">{call.peerLabel}</p>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-ui-muted">
          {kindLabel} · {formatConversationTimestamp(call.startedAt)}
        </p>
      </div>
      <span className="shrink-0 text-[10px] text-ui-muted">{call.roomId ? "열기" : "—"}</span>
    </button>
  );
}

export function MessengerNotificationCenterSheet({
  onClose,
  summary,
  items,
  busyId,
  onRespondRequest,
  onOpenMissedCall,
}: Props) {
  return (
    <div className="fixed inset-0 z-[42] flex flex-col justify-end bg-black/25">
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={onClose} />
      <div className="max-h-[72vh] overflow-y-auto rounded-t-[12px] border border-ui-border bg-ui-surface px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <p className="text-center text-[15px] font-semibold text-ui-fg">알림</p>
        <p className="mt-1 text-center text-[11px] text-ui-muted">
          요청 {summary.requestCount} · 부재 통화 {summary.missedCallCount}
        </p>
        <div className="mt-2 divide-y divide-ui-border overflow-hidden rounded-ui-rect border border-ui-border">
          {items.length ? (
            items.map((item) =>
              item.kind === "request" ? (
                <RequestRow key={item.id} request={item.request} busyId={busyId} onAction={onRespondRequest} />
              ) : (
                <MissedCallRow
                  key={item.id}
                  call={item.call}
                  onOpen={() => {
                    onClose();
                    onOpenMissedCall(item.call);
                  }}
                />
              )
            )
          ) : (
            <p className="px-3 py-6 text-center text-[12px] text-ui-muted">새 알림이 없습니다.</p>
          )}
        </div>
        <button type="button" className="mt-2 w-full py-2 text-[13px] text-ui-muted" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
