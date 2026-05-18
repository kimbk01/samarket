"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type {
  CommunityMessengerMessage,
  CommunityMessengerMessageActionAnchorRect,
  CommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/types";
import { getMessageLongPressActions } from "@/lib/community-messenger/message-actions/message-long-press-policy";
import { messageRoomKindForActions } from "@/lib/community-messenger/message-actions/message-room-kind";
import { canDeleteMessageForEveryone, canDeleteMessageForMe } from "@/lib/community-messenger/message-actions/message-delete-policy";
import {
  canCopyMessageLink,
  canShareMessageExternally,
  canShareMessageToRoom,
} from "@/lib/community-messenger/message-actions/message-share-policy";
import { MessageActionMenu } from "@/components/community-messenger/room/message/MessageActionMenu";
import { MessageReactionBar } from "@/components/community-messenger/room/message/MessageReactionBar";

type Item = CommunityMessengerMessage & { pending?: boolean };

export type MessageLongPressPopoverProps = {
  open: { item: Item; anchorRect: CommunityMessengerMessageActionAnchorRect };
  busy: string | null;
  roomUnavailable: boolean;
  snapshot: CommunityMessengerRoomSnapshot;
  onClose: () => void;
  onCopy: () => void;
  onReply: () => void;
  onShareToRoom: () => void;
  onShareExternal: () => void;
  onShareCopyLink: () => void;
  onReaction: (reactionKey: string) => void;
  onHideForMe: () => void;
  onDeleteForEveryone: () => void;
  onDeleteVoice?: () => void;
};

export function MessageLongPressPopover(props: MessageLongPressPopoverProps) {
  const { t } = useI18n();
  const { open, busy, roomUnavailable, snapshot, onClose } = props;
  const { item, anchorRect } = open;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: anchorRect.top, left: anchorRect.left });
  const [shareExpanded, setShareExpanded] = useState(false);
  const [deleteExpanded, setDeleteExpanded] = useState(false);

  const roomKind = messageRoomKindForActions({
    roomType: snapshot.room.roomType,
    contextMeta: snapshot.room.contextMeta ?? null,
  });
  const actions = getMessageLongPressActions({
    message: item,
    room: {
      roomType: snapshot.room.roomType,
      contextMeta: snapshot.room.contextMeta ?? null,
      isReadonly: snapshot.room.isReadonly,
      roomStatus: snapshot.room.roomStatus,
    },
    viewerUserId: snapshot.viewerUserId,
    roomUnavailable,
  });

  useEffect(() => {
    setShareExpanded((prev) => (prev ? false : prev));
    setDeleteExpanded((prev) => (prev ? false : prev));
  }, [item.id]);

  /** 앵커·말풍선 정렬 + 공유/삭제 펼침 등으로 패널 높이가 바뀔 때마다 보정(ResizeObserver). */
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const layout = () => {
      const vw = typeof window !== "undefined" ? window.innerWidth : 400;
      const vh = typeof window !== "undefined" ? window.innerHeight : 800;
      const pw = el.offsetWidth || 260;
      const ph = el.offsetHeight || 200;
      const margin = 8;
      let top = anchorRect.top - ph - margin;
      if (top < margin) {
        top = Math.min(anchorRect.bottom + margin, vh - ph - margin);
      }
      let left: number;
      if (item.isMine) {
        left = anchorRect.right - pw - margin;
      } else {
        left = anchorRect.left;
      }
      left = Math.max(margin, Math.min(left, vw - pw - margin));
      setPos({ top, left });
    };
    layout();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => layout()) : null;
    ro?.observe(el);
    const raf = requestAnimationFrame(() => layout());
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [anchorRect.bottom, anchorRect.left, anchorRect.right, anchorRect.top, item.isMine]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copyLabel =
    item.messageType === "image" ? t("cm_ui_copy_image_address") : item.messageType === "file" ? t("cm_ui_copy_file_link") : t("common_copy");
  const copyAction = actions.find((a) => a.action === "copy");
  const replyAction = actions.find((a) => a.action === "reply");
  const shareAction = actions.find((a) => a.action === "share");
  const deleteAction = actions.find((a) => a.action === "delete");
  const reactAction = actions.find((a) => a.action === "react");

  const canHide = canDeleteMessageForMe(item, roomKind);
  const canEveryone = canDeleteMessageForEveryone(item, roomKind);
  const isVoice = item.messageType === "voice";

  const shareToRoomOk = !roomUnavailable && canShareMessageToRoom(item, roomKind);
  const shareExternalOk = !roomUnavailable && canShareMessageExternally(item, roomKind);
  const shareLinkOk = !roomUnavailable && canCopyMessageLink(item, roomKind);
  const shareBranches = shareToRoomOk || shareExternalOk || shareLinkOk;

  const showDeleteSection = item.isMine && !item.pending && item.messageType !== "system";

  const deleteForMe = showDeleteSection
    ? {
        disabled: !canHide || busy === "hide-message",
        title: !canHide ? t("cm_ui_cannot_delete_message") : undefined,
        onClick: () => {
          props.onHideForMe();
        },
      }
    : undefined;

  const deleteForEveryone = showDeleteSection
    ? {
        disabled: !canEveryone || busy === "delete-for-everyone",
        title: !canEveryone ? t("cm_ui_delete_own_within_24h_only") : deleteAction?.reason,
        onClick: () => {
          props.onDeleteForEveryone();
        },
      }
    : undefined;

  const deleteVoiceHard =
    showDeleteSection && isVoice && props.onDeleteVoice
      ? {
          onClick: () => {
            props.onDeleteVoice?.();
          },
        }
      : undefined;

  const node = (
    <div className="fixed inset-0 z-[60]" role="presentation">
      <button type="button" className="absolute inset-0 cursor-default bg-black/45" aria-label={t("nav_close")} onClick={onClose} />
      <div
        ref={panelRef}
        className="absolute z-[61] w-[min(92vw,280px)] overflow-hidden rounded-[14px] border border-neutral-200 bg-white text-neutral-900 shadow-[0_8px_32px_rgba(0,0,0,0.22)] dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
        style={{ top: pos.top, left: pos.left }}
        role="dialog"
        aria-modal="true"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <MessageReactionBar
          enabled={Boolean(reactAction?.enabled)}
          onPick={(k) => {
            props.onReaction(k);
          }}
        />
        <MessageActionMenu
          roomUnavailable={roomUnavailable}
          copyLabel={copyLabel}
          copyDisabled={!copyAction?.enabled}
          copyTitle={copyAction?.reason}
          onCopy={props.onCopy}
          replyDisabled={!replyAction?.enabled}
          replyTitle={replyAction?.reason}
          onReply={props.onReply}
          shareExpanded={shareExpanded}
          shareDisabled={!shareAction?.enabled || !shareBranches}
          shareTitle={shareAction?.reason ?? (!shareBranches ? t("cm_ui_cannot_share_in_this_room") : undefined)}
          onToggleShare={() => {
            setDeleteExpanded(false);
            if (!shareAction?.enabled || !shareBranches) return;
            setShareExpanded((v) => !v);
          }}
          deleteExpanded={deleteExpanded}
          onToggleDelete={() => {
            setShareExpanded(false);
            if (!showDeleteSection) return;
            setDeleteExpanded((v) => !v);
          }}
          onCancelDeleteNested={() => setDeleteExpanded(false)}
          shareNested={
            shareExpanded && shareBranches
              ? {
                  toRoom: {
                    label: t("cm_ui_share_to_chat_room"),
                    disabled: !shareToRoomOk,
                    title: !shareToRoomOk ? t("cm_ui_cannot_send_to_other_room") : undefined,
                    onClick: () => {
                      setShareExpanded(false);
                      props.onShareToRoom();
                    },
                  },
                  external: {
                    disabled: !shareExternalOk,
                    title: !shareExternalOk ? t("cm_ui_external_share_restricted_in_trade_room") : undefined,
                    onClick: () => {
                      setShareExpanded(false);
                      void props.onShareExternal();
                    },
                  },
                  link: {
                    disabled: !shareLinkOk,
                    title: !shareLinkOk ? t("cm_ui_copy_link_restricted_in_trade_room") : undefined,
                    onClick: () => {
                      setShareExpanded(false);
                      void props.onShareCopyLink();
                    },
                  },
                }
              : null
          }
          deleteForMe={deleteForMe}
          deleteForEveryone={deleteForEveryone}
          deleteVoiceHard={deleteVoiceHard}
        />
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}
