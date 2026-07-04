"use client";

import { useCallback, useState } from "react";
import type { PointerEvent } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type {
  CommunityMessengerCallLog,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import type { MessengerNotificationCenterItem } from "@/lib/community-messenger/messenger-notification-center-model";
import { MessengerHomeBottomSheetShell } from "@/components/community-messenger/MessengerSheetUi";
import { useMessengerLongPress } from "@/lib/community-messenger/use-messenger-long-press";
import {
  formatConversationTimestamp,
  getRoomTypeBadgeLabel,
} from "@/lib/community-messenger/use-community-messenger-home-state";

export type { MessengerNotificationCenterItem } from "@/lib/community-messenger/messenger-notification-center-model";
export { resolveImportantRoomHighlightReason } from "@/lib/community-messenger/messenger-notification-center-model";

type Summary = {
  groupInviteCount: number;
  missedCallCount: number;
  importantCount: number;
};

type Props = {
  onClose: () => void;
  summary: Summary;
  items: MessengerNotificationCenterItem[];
  busyId: string | null;
  onOpenMissedCall: (call: CommunityMessengerCallLog) => void;
  onOpenImportantRoom: (roomId: string) => void;
  onOpenGroupInvite: (roomId: string, inviteId: string) => void;
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
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-[43] flex flex-col justify-end bg-black/30">
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label={t("nav_close")} onClick={onClose} />
      <div className="rounded-t-[12px] border border-ui-border bg-ui-surface px-3 pb-[max(0.75rem,var(--safe-bottom))] pt-2">
        <p className="px-1 pb-2 text-center sam-text-helper font-medium text-ui-muted">{title}</p>
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
              className={`rounded-ui-rect py-2.5 sam-text-body font-medium ${
                action.destructive ? "text-red-600" : "text-ui-fg"
              } disabled:opacity-50`}
            >
              {action.label}
            </button>
          ))}
        </div>
        <button type="button" className="mt-1 w-full py-2 sam-text-body-secondary text-ui-muted" onClick={onClose}>
          {t("common_cancel")}
        </button>
      </div>
    </div>
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
  const { t } = useI18n();
  const call = item.call;
  const kindLabel = call.callKind === "video" ? t("nav_video_call_label") : t("nav_voice_call_label");
  const [menu, setMenu] = useState(false);
  const openMenu = useCallback(() => setMenu((prev) => (prev ? prev : true)), []);
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
              <span className="rounded-ui-rect border border-ui-border bg-ui-page px-1 py-0.5 sam-text-xxs font-medium text-ui-muted">
                {t("cm_ui_missed")}
              </span>
              <p className="truncate sam-text-body-secondary font-medium text-ui-fg">{call.peerLabel}</p>
            </div>
            <p className="mt-0.5 truncate sam-text-xxs text-ui-muted">
              {kindLabel} · {formatConversationTimestamp(call.startedAt)}
            </p>
          </div>
          <span className="shrink-0 sam-text-xxs text-ui-muted">{call.roomId ? t("cm_ui_open") : "—"}</span>
        </button>
      </div>
      {menu ? (
        <RowActionSheet
          title={call.peerLabel}
          onClose={() => setMenu((prev) => (prev ? false : prev))}
          actions={[
            ...(call.roomId
              ? [
                  {
                    label: t("cm_ui_open_conversation"),
                    onClick: onOpen,
                  },
                ]
              : []),
            {
              label: t("cm_ui_hide_only_from_notification_list"),
              onClick: () => onDismiss(item.id),
            },
          ]}
        />
      ) : null}
    </>
  );
}

function GroupInviteRow({
  item,
  onOpen,
  onDismiss,
}: {
  item: Extract<MessengerNotificationCenterItem, { kind: "group_invite" }>;
  onOpen: () => void;
  onDismiss: (id: string) => void;
}) {
  const { t } = useI18n();
  const invite = item.invite;
  const roomTitle = invite.roomTitle.trim() || t("cm_ui_group");
  const inviterLabel = invite.inviterLabel.trim() || t("common_partner");
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-2">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5">
          <span className="rounded-ui-rect border border-ui-border bg-ui-page px-1 py-0.5 sam-text-xxs font-medium text-ui-muted">
            {t("cm_ui_group_invite")}
          </span>
          <p className="truncate sam-text-body-secondary font-medium text-ui-fg">{roomTitle}</p>
        </div>
        <p className="mt-0.5 truncate sam-text-xxs text-ui-muted">
          {t("cm_ui_group_invite_added_by", { name: inviterLabel })}
        </p>
      </button>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={onOpen}
          className="rounded-ui-rect border border-ui-fg bg-ui-fg px-2 py-1 sam-text-xxs font-semibold text-ui-surface"
        >
          {t("cm_ui_open")}
        </button>
        <button
          type="button"
          onClick={() => onDismiss(item.id)}
          className="rounded-ui-rect border border-ui-border px-2 py-1 sam-text-xxs text-ui-fg"
        >
          {t("nav_close")}
        </button>
      </div>
    </div>
  );
}

function highlightReasonLabel(reason: "pinned" | "trade" | "delivery"): "cm_ui_reason_pinned" | "cm_ui_reason_trade" | "cm_ui_reason_delivery" {
  if (reason === "pinned") return "cm_ui_reason_pinned";
  if (reason === "trade") return "cm_ui_reason_trade";
  return "cm_ui_reason_delivery";
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
  const { t } = useI18n();
  const room = item.room;
  const [menu, setMenu] = useState(false);
  const openMenu = useCallback(() => setMenu((prev) => (prev ? prev : true)), []);
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
            <span className="rounded-ui-rect border border-ui-border bg-ui-page px-1 py-0.5 sam-text-xxs font-medium text-ui-muted">
              {t(highlightReasonLabel(item.highlightReason))}
            </span>
            <span className="rounded-ui-rect border border-ui-border bg-ui-page px-1 py-0.5 sam-text-xxs font-medium text-ui-muted">
              {badge}
            </span>
            <p className="min-w-0 flex-1 truncate sam-text-body-secondary font-medium text-ui-fg">{room.title}</p>
            {room.unreadCount > 0 ? (
              <span className="shrink-0 rounded-full bg-ui-fg px-1.5 py-0.5 sam-text-xxs font-semibold text-ui-surface">
                {room.unreadCount > 99 ? "99+" : room.unreadCount}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 line-clamp-2 w-full text-left sam-text-xxs text-ui-muted">{item.preview}</p>
          <p className="mt-0.5 sam-text-xxs text-ui-muted">{formatConversationTimestamp(room.lastMessageAt)}</p>
        </button>
      </div>
      {menu ? (
        <RowActionSheet
          title={room.title}
          onClose={() => setMenu((prev) => (prev ? false : prev))}
          actions={[
            {
              label: t("cm_ui_open_conversation"),
              onClick: onOpen,
            },
            {
              label: t("cm_ui_mark_as_read"),
              disabled: busyRead || room.unreadCount < 1,
              onClick: () => void onMarkRoomRead(room.id),
            },
            {
              label: room.isMuted ? t("cm_ui_receive_room_notifications") : t("cm_ui_turn_off_room_notifications"),
              disabled: busyMute,
              onClick: () => void onToggleRoomMute(room),
            },
            {
              label: t("cm_ui_move_to_archive"),
              disabled: busyArchive,
              onClick: () => void onArchiveRoom(room),
            },
            {
              label: t("cm_ui_hide_only_from_notification_list"),
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
  if (summary.groupInviteCount > 0) parts.push(`group_invite ${summary.groupInviteCount}`);
  if (summary.missedCallCount > 0) parts.push(`missed ${summary.missedCallCount}`);
  if (summary.importantCount > 0) parts.push(`important ${summary.importantCount}`);
  if (!parts.length) return null;
  return parts.join(" · ");
}

export function MessengerNotificationCenterSheet({
  onClose,
  summary,
  items,
  busyId,
  onOpenMissedCall,
  onOpenImportantRoom,
  onOpenGroupInvite,
  onDismissNotification,
  onMarkRoomRead,
  onToggleRoomMute,
  onArchiveRoom,
}: Props) {
  const { t } = useI18n();
  const summaryLineRaw = buildSummaryLine(summary);
  const summaryLine =
    summaryLineRaw == null
      ? null
      : summaryLineRaw
          .replace(/group_invite (\d+)/g, (_, n) => t("cm_ui_group_invite_count", { count: Number(n) }))
          .replace(/missed (\d+)/g, (_, n) => t("cm_ui_missed_call_count", { count: Number(n) }))
          .replace(/important (\d+)/g, (_, n) => t("cm_ui_important_chat_count", { count: Number(n) }));

  return (
    <MessengerHomeBottomSheetShell
      onClose={onClose}
      closeAriaLabel={t("nav_close")}
      dialogAriaLabel={t("cm_ui_notification_center")}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-2">
        <p className="text-center sam-text-body font-semibold" style={{ color: "var(--messenger-text)" }}>
          {t("common_notifications")}
        </p>
        {summaryLine ? (
          <p className="mt-1 text-center sam-text-xxs leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
            {summaryLine}
          </p>
        ) : null}
        <div className="mt-2 divide-y divide-[color:var(--messenger-divider)] overflow-hidden rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)]">
          {items.length ? (
            items.map((item) =>
              item.kind === "group_invite" ? (
                <GroupInviteRow
                  key={item.id}
                  item={item}
                  onOpen={() => {
                    onClose();
                    onOpenGroupInvite(item.invite.roomId, item.invite.id);
                  }}
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
            <p className="px-3 py-4 text-center sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
              {t("cm_ui_no_new_notifications")}
            </p>
          )}
        </div>
        <button
          type="button"
          className="mt-2 w-full py-2 sam-text-body-secondary"
          style={{ color: "var(--messenger-text-secondary)" }}
          onClick={onClose}
        >
          {t("nav_close")}
        </button>
        </div>
      </div>
    </MessengerHomeBottomSheetShell>
  );
}
