"use client";

import { useCallback, useState } from "react";
import type { PointerEvent } from "react";
import { communityMessengerRoomIsTrade } from "@/lib/community-messenger/messenger-room-domain";
import type {
  CommunityMessengerCallLog,
  CommunityMessengerFriendRequest,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import { useMessengerLongPress } from "@/lib/community-messenger/use-messenger-long-press";
import {
  formatConversationTimestamp,
  getRoomTypeBadgeLabel,
} from "@/lib/community-messenger/use-community-messenger-home-state";

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
    }
  | {
      id: string;
      kind: "important_room";
      createdAt: string;
      room: CommunityMessengerRoomSummary;
      preview: string;
      highlightReason: "pinned" | "trade" | "delivery";
    };

type Summary = {
  requestCount: number;
  missedCallCount: number;
  importantCount: number;
};

type Props = {
  onClose: () => void;
  summary: Summary;
  items: MessengerNotificationCenterItem[];
  busyId: string | null;
  onRespondRequest: (requestId: string, action: "accept" | "reject" | "cancel") => Promise<void>;
  onOpenMissedCall: (call: CommunityMessengerCallLog) => void;
  onOpenImportantRoom: (roomId: string) => void;
  onDismissNotification: (id: string) => void;
  onMarkRoomRead: (roomId: string) => Promise<void>;
  onToggleRoomMute: (room: CommunityMessengerRoomSummary) => Promise<void>;
  onArchiveRoom: (room: CommunityMessengerRoomSummary) => Promise<void>;
};

function RowActionSheet({
  title,
  actions,
  onClose,
}: {
  title: string;
  actions: { label: string; onClick: () => void; disabled?: boolean; destructive?: boolean }[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[43] flex flex-col justify-end bg-black/30">
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={onClose} />
      <div className="rounded-t-[12px] border border-ui-border bg-ui-surface px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <p className="px-1 pb-2 text-center text-[12px] font-medium text-ui-muted">{title}</p>
        <div className="flex flex-col gap-1">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={action.disabled}
              onClick={() => {
                onClose();
                action.onClick();
              }}
              className={`rounded-ui-rect py-2.5 text-[14px] font-medium ${
                action.destructive ? "text-red-600" : "text-ui-fg"
              } disabled:opacity-50`}
            >
              {action.label}
            </button>
          ))}
        </div>
        <button type="button" className="mt-1 w-full py-2 text-[13px] text-ui-muted" onClick={onClose}>
          취소
        </button>
      </div>
    </div>
  );
}

function RequestRow({
  item,
  busyId,
  onAction,
  onDismiss,
}: {
  item: Extract<MessengerNotificationCenterItem, { kind: "request" }>;
  busyId: string | null;
  onAction: (requestId: string, action: "accept" | "reject" | "cancel") => Promise<void>;
  onDismiss: (id: string) => void;
}) {
  const request = item.request;
  const [menu, setMenu] = useState(false);
  const isIncoming = request.direction === "incoming";
  const label = isIncoming ? request.requesterLabel : request.addresseeLabel;

  const openMenu = useCallback(() => setMenu(true), []);

  const { bind, consumeClickSuppression } = useMessengerLongPress(openMenu);

  const onRowPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!isIncoming) return;
      bind.onPointerDown(e);
    },
    [bind, isIncoming]
  );

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <div
          className={`min-w-0 flex-1 ${isIncoming ? "touch-manipulation" : ""}`}
          onPointerDown={onRowPointerDown}
          onPointerMove={bind.onPointerMove}
          onPointerUp={bind.onPointerUp}
          onPointerCancel={bind.onPointerCancel}
          onClick={(e) => {
            if (!isIncoming) return;
            if (consumeClickSuppression()) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
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
      {menu && isIncoming ? (
        <RowActionSheet
          title={label}
          onClose={() => setMenu(false)}
          actions={[
            {
              label: "거절",
              destructive: true,
              disabled: busyId === `request:${request.id}:reject`,
              onClick: () => void onAction(request.id, "reject"),
            },
            {
              label: "알림 목록에서만 숨기기",
              onClick: () => onDismiss(item.id),
            },
          ]}
        />
      ) : null}
    </>
  );
}

function MissedCallRow({
  item,
  onOpen,
  onDismiss,
}: {
  item: Extract<MessengerNotificationCenterItem, { kind: "missed_call" }>;
  onOpen: () => void;
  onDismiss: (id: string) => void;
}) {
  const call = item.call;
  const kindLabel = call.callKind === "video" ? "영상" : "음성";
  const [menu, setMenu] = useState(false);
  const openMenu = useCallback(() => setMenu(true), []);
  const { bind, consumeClickSuppression } = useMessengerLongPress(openMenu);

  return (
    <>
      <div
        className="flex w-full touch-manipulation items-center justify-between gap-2 px-2.5 py-2 hover:bg-ui-hover"
        onPointerDown={bind.onPointerDown}
        onPointerMove={bind.onPointerMove}
        onPointerUp={bind.onPointerUp}
        onPointerCancel={bind.onPointerCancel}
      >
        <button
          type="button"
          onClick={(e) => {
            if (consumeClickSuppression()) {
              e.preventDefault();
              return;
            }
            onOpen();
          }}
          disabled={!call.roomId}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left disabled:opacity-60"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="rounded-ui-rect border border-ui-border bg-ui-page px-1 py-0.5 text-[9px] font-medium text-ui-muted">
                부재
              </span>
              <p className="truncate text-[13px] font-medium text-ui-fg">{call.peerLabel}</p>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-ui-muted">
              {kindLabel} · {formatConversationTimestamp(call.startedAt)}
            </p>
          </div>
          <span className="shrink-0 text-[10px] text-ui-muted">{call.roomId ? "열기" : "—"}</span>
        </button>
      </div>
      {menu ? (
        <RowActionSheet
          title={call.peerLabel}
          onClose={() => setMenu(false)}
          actions={[
            ...(call.roomId
              ? [
                  {
                    label: "대화 열기",
                    onClick: onOpen,
                  },
                ]
              : []),
            {
              label: "알림 목록에서만 숨기기",
              onClick: () => onDismiss(item.id),
            },
          ]}
        />
      ) : null}
    </>
  );
}

function highlightReasonLabel(reason: "pinned" | "trade" | "delivery"): string {
  if (reason === "pinned") return "고정";
  if (reason === "trade") return "거래";
  return "배달";
}

function ImportantRoomRow({
  item,
  busyId,
  onOpen,
  onDismiss,
  onMarkRoomRead,
  onToggleRoomMute,
  onArchiveRoom,
}: {
  item: Extract<MessengerNotificationCenterItem, { kind: "important_room" }>;
  busyId: string | null;
  onOpen: () => void;
  onDismiss: (id: string) => void;
  onMarkRoomRead: (roomId: string) => Promise<void>;
  onToggleRoomMute: (room: CommunityMessengerRoomSummary) => Promise<void>;
  onArchiveRoom: (room: CommunityMessengerRoomSummary) => Promise<void>;
}) {
  const room = item.room;
  const [menu, setMenu] = useState(false);
  const openMenu = useCallback(() => setMenu(true), []);
  const { bind, consumeClickSuppression } = useMessengerLongPress(openMenu);
  const badge = getRoomTypeBadgeLabel(room);
  const busyRead = busyId === `room-read:${room.id}`;
  const busyMute = busyId === `room-settings:${room.id}`;
  const busyArchive = busyId === `room-archive:${room.id}`;

  return (
    <>
      <div
        className="flex w-full touch-manipulation items-center gap-2 px-2.5 py-2 hover:bg-ui-hover"
        onPointerDown={bind.onPointerDown}
        onPointerMove={bind.onPointerMove}
        onPointerUp={bind.onPointerUp}
        onPointerCancel={bind.onPointerCancel}
      >
        <button
          type="button"
          onClick={(e) => {
            if (consumeClickSuppression()) {
              e.preventDefault();
              return;
            }
            onOpen();
          }}
          className="flex min-w-0 flex-1 flex-col items-start text-left"
        >
          <div className="flex w-full items-center gap-1.5">
            <span className="rounded-ui-rect border border-ui-border bg-ui-page px-1 py-0.5 text-[9px] font-medium text-ui-muted">
              {highlightReasonLabel(item.highlightReason)}
            </span>
            <span className="rounded-ui-rect border border-ui-border bg-ui-page px-1 py-0.5 text-[9px] font-medium text-ui-muted">
              {badge}
            </span>
            <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ui-fg">{room.title}</p>
            {room.unreadCount > 0 ? (
              <span className="shrink-0 rounded-full bg-ui-fg px-1.5 py-0.5 text-[10px] font-semibold text-ui-surface">
                {room.unreadCount > 99 ? "99+" : room.unreadCount}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 line-clamp-2 w-full text-left text-[11px] text-ui-muted">{item.preview}</p>
          <p className="mt-0.5 text-[10px] text-ui-muted">{formatConversationTimestamp(room.lastMessageAt)}</p>
        </button>
      </div>
      {menu ? (
        <RowActionSheet
          title={room.title}
          onClose={() => setMenu(false)}
          actions={[
            {
              label: "대화 열기",
              onClick: onOpen,
            },
            {
              label: "읽음 처리",
              disabled: busyRead || room.unreadCount < 1,
              onClick: () => void onMarkRoomRead(room.id),
            },
            {
              label: room.isMuted ? "이 방 알림 받기" : "이 방 알림 끄기",
              disabled: busyMute,
              onClick: () => void onToggleRoomMute(room),
            },
            {
              label: "보관함으로",
              disabled: busyArchive,
              onClick: () => void onArchiveRoom(room),
            },
            {
              label: "알림 목록에서만 숨기기",
              onClick: () => onDismiss(item.id),
            },
          ]}
        />
      ) : null}
    </>
  );
}

function buildSummaryLine(summary: Summary): string | null {
  const parts: string[] = [];
  if (summary.requestCount > 0) parts.push(`요청 ${summary.requestCount}`);
  if (summary.missedCallCount > 0) parts.push(`부재 통화 ${summary.missedCallCount}`);
  if (summary.importantCount > 0) parts.push(`중요 대화 ${summary.importantCount}`);
  if (!parts.length) return null;
  return parts.join(" · ");
}

export function MessengerNotificationCenterSheet({
  onClose,
  summary,
  items,
  busyId,
  onRespondRequest,
  onOpenMissedCall,
  onOpenImportantRoom,
  onDismissNotification,
  onMarkRoomRead,
  onToggleRoomMute,
  onArchiveRoom,
}: Props) {
  const summaryLine = buildSummaryLine(summary);

  return (
    <div className="fixed inset-0 z-[42] flex flex-col justify-end bg-black/25">
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="알림 센터"
        className="max-h-[min(78vh,calc(100dvh-2rem))] overflow-y-auto rounded-t-[12px] border border-ui-border bg-ui-surface px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
      >
        <p className="text-center text-[15px] font-semibold text-ui-fg">알림</p>
        {summaryLine ? (
          <p className="mt-1 text-center text-[11px] leading-snug text-ui-muted">{summaryLine}</p>
        ) : null}
        <div className="mt-2 divide-y divide-ui-border overflow-hidden rounded-ui-rect border border-ui-border">
          {items.length ? (
            items.map((item) =>
              item.kind === "request" ? (
                <RequestRow
                  key={item.id}
                  item={item}
                  busyId={busyId}
                  onAction={onRespondRequest}
                  onDismiss={onDismissNotification}
                />
              ) : item.kind === "missed_call" ? (
                <MissedCallRow
                  key={item.id}
                  item={item}
                  onOpen={() => {
                    onClose();
                    onOpenMissedCall(item.call);
                  }}
                  onDismiss={onDismissNotification}
                />
              ) : (
                <ImportantRoomRow
                  key={item.id}
                  item={item}
                  busyId={busyId}
                  onOpen={() => {
                    onClose();
                    onOpenImportantRoom(item.room.id);
                  }}
                  onDismiss={onDismissNotification}
                  onMarkRoomRead={onMarkRoomRead}
                  onToggleRoomMute={onToggleRoomMute}
                  onArchiveRoom={onArchiveRoom}
                />
              )
            )
          ) : (
            <p className="px-3 py-4 text-center text-[12px] text-ui-muted">새 알림이 없습니다.</p>
          )}
        </div>
        <button type="button" className="mt-2 w-full py-2 text-[13px] text-ui-muted" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}

export function resolveImportantRoomHighlightReason(
  room: CommunityMessengerRoomSummary
): "pinned" | "trade" | "delivery" {
  if (room.isPinned) return "pinned";
  if (communityMessengerRoomIsTrade(room)) return "trade";
  return "delivery";
}
