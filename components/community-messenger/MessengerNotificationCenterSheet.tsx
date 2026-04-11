"use client";

import { MiniMetricCard } from "@/components/community-messenger/MessengerSheetUi";
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

function RequestCard({
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
    <div className="flex items-center justify-between gap-3 rounded-ui-rect border border-ui-border bg-ui-surface px-3 py-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="rounded-ui-rect border border-ui-border bg-ui-page px-1.5 py-0.5 text-[10px] font-medium text-ui-muted">
            {isIncoming ? "받은 요청" : "보낸 요청"}
          </span>
          <p className="text-[14px] font-semibold text-ui-fg">{label}</p>
        </div>
        <p className="mt-1 text-[12px] text-ui-muted">
          {isIncoming ? "나에게 온 친구 요청" : "내가 보낸 친구 요청"}
        </p>
      </div>
      <div className="flex gap-2">
        {isIncoming ? (
          <>
            <button
              type="button"
              onClick={() => void onAction(request.id, "reject")}
              disabled={busyId === `request:${request.id}:reject`}
              className="rounded-ui-rect border border-ui-border px-3 py-2 text-[12px] text-ui-fg"
            >
              거절
            </button>
            <button
              type="button"
              onClick={() => void onAction(request.id, "accept")}
              disabled={busyId === `request:${request.id}:accept`}
              className="rounded-ui-rect border border-ui-border bg-ui-fg px-3 py-2 text-[12px] font-semibold text-ui-surface"
            >
              수락
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void onAction(request.id, "cancel")}
            disabled={busyId === `request:${request.id}:cancel`}
            className="rounded-ui-rect border border-ui-border px-3 py-2 text-[12px] text-ui-fg"
          >
            요청 취소
          </button>
        )}
      </div>
    </div>
  );
}

function NotificationCenterCallCard({ call, onOpen }: { call: CommunityMessengerCallLog; onOpen: () => void }) {
  const kindLabel = call.callKind === "video" ? "영상 통화" : "음성 통화";
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!call.roomId}
      className="flex w-full items-center justify-between gap-3 rounded-ui-rect border border-ui-border bg-ui-surface px-3 py-3 text-left disabled:opacity-60"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="rounded-ui-rect border border-ui-border bg-ui-page px-2 py-0.5 text-[11px] font-semibold text-ui-muted">
            부재중 통화
          </span>
          <p className="truncate text-[14px] font-semibold text-ui-fg">{call.peerLabel}</p>
        </div>
        <p className="mt-1 truncate text-[12px] text-ui-muted">
          {kindLabel} · {formatConversationTimestamp(call.startedAt)}
        </p>
      </div>
      <span className="shrink-0 text-[12px] font-medium text-ui-muted">{call.roomId ? "열기" : "기록만 있음"}</span>
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
      <div className="max-h-[70vh] overflow-y-auto rounded-t-[12px] border border-ui-border bg-ui-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[var(--ui-shadow-card)]">
        <p className="text-center text-[14px] font-semibold text-ui-fg">알림센터</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <MiniMetricCard label="친구 요청" value={String(summary.requestCount)} helper="수락 또는 거절" />
          <MiniMetricCard label="부재중 통화" value={String(summary.missedCallCount)} helper="기록에서 바로 열기" />
        </div>
        <div className="mt-3 space-y-2">
          {items.length ? (
            items.map((item) =>
              item.kind === "request" ? (
                <RequestCard key={item.id} request={item.request} busyId={busyId} onAction={onRespondRequest} />
              ) : (
                <NotificationCenterCallCard
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
            <p className="py-8 text-center text-[13px] text-ui-muted">새 알림이 없습니다.</p>
          )}
        </div>
        <button type="button" className="mt-2 w-full py-3 text-[14px] font-medium text-ui-muted" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
