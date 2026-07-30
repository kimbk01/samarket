"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { CommunityMessengerCallActionButton } from "@/components/community-messenger/call-history/CommunityMessengerCallActionButton";
import { CommunityMessengerCallDirectionBadge } from "@/components/community-messenger/call-history/CommunityMessengerCallDirectionBadge";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import {
  CALL_LOG_SWIPE_ACTION_ATTR,
  COMMUNITY_MESSENGER_CALL_LOG_SWIPE_ACTION_W_PX,
  communityMessengerCallLogSwipeItemId,
  isCallLogSwipeDeleteActionInteractive,
} from "@/lib/community-messenger/call-history/call-log-swipe";
import { presentCallHistoryRow } from "@/lib/community-messenger/call-history/call-history-presenter";
import { formatCallLogListTime, resolveCallLogListTimestampIso } from "@/lib/community-messenger/call-log-row-copy";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";
import {
  CALL_UI_CALL_LIST_ROW_ACTIVE_CLASS,
  CALL_UI_CALL_LIST_ROW_CLASS,
} from "@/lib/community-messenger/call-ui/call-ui-tokens";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";

const DRAG_START_X = 16;
const DRAG_CANCEL_Y = 14;

type Props = {
  call: CommunityMessengerCallLog;
  onNavigate: (call: CommunityMessengerCallLog) => void;
  onRequestOutgoingConfirm: (call: CommunityMessengerCallLog, kind: "voice" | "video") => void;
  onDeleteRequest: (call: CommunityMessengerCallLog) => void;
  globalRedialBlocked: boolean;
  openedSwipeItemId: string | null;
  onOpenSwipeItem: (id: string | null) => void;
  swipeSurfaceDataAttr?: "open";
};

export function CommunityMessengerCallRow({
  call,
  onNavigate,
  onRequestOutgoingConfirm,
  onDeleteRequest,
  globalRedialBlocked,
  openedSwipeItemId,
  onOpenSwipeItem,
  swipeSurfaceDataAttr,
}: Props) {
  const { t, safeT, language } = useI18n();
  const vm = presentCallHistoryRow(call);
  const swipeItemId = communityMessengerCallLogSwipeItemId(call.id);
  const actionWidth = COMMUNITY_MESSENGER_CALL_LOG_SWIPE_ACTION_W_PX;
  const swipeOpen = openedSwipeItemId === swipeItemId;

  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragXRef = useRef(0);
  const dragRef = useRef({
    startX: 0,
    startY: 0,
    origin: 0,
    active: false,
    dragging: false,
  });
  /** 삭제·스와이프 액션 탭 직후 navigate click 재타겟팅 차단 */
  const swipeActionTapRef = useRef(false);

  const deleteActionInteractive = isCallLogSwipeDeleteActionInteractive(dragX) || swipeOpen;

  useEffect(() => {
    dragXRef.current = dragX;
  }, [dragX]);

  useEffect(() => {
    if (openedSwipeItemId && openedSwipeItemId !== swipeItemId) {
      dragXRef.current = 0;
      setDragX(0);
    }
  }, [openedSwipeItemId, swipeItemId]);

  useEffect(() => {
    if (swipeOpen) {
      dragXRef.current = -actionWidth;
      setDragX(-actionWidth);
      return;
    }
    dragXRef.current = 0;
    setDragX((prev) => (prev === 0 ? prev : 0));
  }, [actionWidth, swipeOpen]);

  const clamp = useCallback((x: number) => Math.max(-actionWidth, Math.min(0, x)), [actionWidth]);

  const closeSwipe = useCallback(() => {
    dragXRef.current = 0;
    setDragX(0);
    onOpenSwipeItem(null);
  }, [onOpenSwipeItem]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origin: dragXRef.current,
        active: true,
        dragging: false,
      };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    []
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (!dragRef.current.dragging) {
        if (Math.abs(dy) > DRAG_CANCEL_Y && Math.abs(dy) > Math.abs(dx)) {
          dragRef.current.active = false;
          return;
        }
        if (Math.abs(dx) < DRAG_START_X || Math.abs(dx) <= Math.abs(dy)) return;
        dragRef.current.dragging = true;
        setIsDragging(true);
      }
      const next = clamp(dragRef.current.origin + dx);
      dragXRef.current = next;
      setDragX(next);
    },
    [clamp]
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current.active) return;
      const wasDragging = dragRef.current.dragging;
      dragRef.current.active = false;
      dragRef.current.dragging = false;
      setIsDragging(false);
      try {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      } catch {
        /* noop */
      }
      if (!wasDragging) return;
      const snap = dragXRef.current <= -actionWidth / 2 ? -actionWidth : 0;
      dragXRef.current = snap;
      setDragX(snap);
      onOpenSwipeItem(snap === -actionWidth ? swipeItemId : null);
    },
    [actionWidth, onOpenSwipeItem, swipeItemId]
  );

  const handleDeleteRequest = useCallback(() => {
    swipeActionTapRef.current = true;
    closeSwipe();
    onDeleteRequest(call);
    window.setTimeout(() => {
      swipeActionTapRef.current = false;
    }, 500);
  }, [call, closeSwipe, onDeleteRequest]);

  const handleNavigate = useCallback(() => {
    if (swipeActionTapRef.current) return;
    if (swipeOpen) {
      closeSwipe();
      return;
    }
    if (vm.canNavigate) onNavigate(call);
  }, [call, closeSwipe, onNavigate, swipeOpen, vm.canNavigate]);

  const timeLabel = formatCallLogListTime(
    resolveCallLogListTimestampIso(call),
    language,
    t("cm_ui_call_log_time_yesterday")
  );
  const subtitleText = safeT(vm.subtitleMessageKey, {
    fallbackKo: "통화 기록",
    fallbackEn: "Call log",
  });
  const durationOnly = vm.durationLabel?.trim() || null;

  const avatarNode = (
    <SamarketThumbnail
      src={resolveUserAvatarImageSrc(vm.peerAvatarUrl)}
      size={48}
      roundedClassName="rounded-full"
      className="h-full w-full shrink-0 bg-sam-surface-muted ring-1 ring-sam-border"
      fallbackSrc=""
      fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
    />
  );

  return (
    <li className={`relative overflow-hidden ${CALL_UI_CALL_LIST_ROW_CLASS}`} data-call-log-row="true">
      <div
        className={`absolute inset-y-0 right-0 flex items-stretch ${
          deleteActionInteractive ? "pointer-events-auto" : "pointer-events-none"
        }`}
        style={{ width: actionWidth }}
        aria-hidden={dragX === 0}
        {...{ [CALL_LOG_SWIPE_ACTION_ATTR]: "delete" }}
      >
        <button
          type="button"
          data-call-log-delete-action="true"
          {...{ [CALL_LOG_SWIPE_ACTION_ATTR]: "delete" }}
          onPointerDownCapture={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.button !== 0 || !deleteActionInteractive) return;
            handleDeleteRequest();
          }}
          className="flex h-full w-full items-center justify-center bg-red-600 px-2 text-center text-sm font-semibold text-white active:opacity-90"
        >
          {t("common_delete")}
        </button>
      </div>

      <div
        className={`relative z-[1] flex w-full touch-pan-y items-stretch bg-white dark:bg-[#1F1F1F]`}
        data-call-log-swipe-surface={swipeSurfaceDataAttr}
        style={{
          transform: `translate3d(${dragX}px,0,0)`,
          transition: isDragging ? "none" : "transform 180ms cubic-bezier(0.2,0,0,1)",
        }}
        onPointerDown={(e) => {
          if (openedSwipeItemId && openedSwipeItemId !== swipeItemId) {
            onOpenSwipeItem(null);
          }
          onPointerDown(e);
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <button
          type="button"
          disabled={!vm.canNavigate}
          onClick={(e) => {
            e.stopPropagation();
            if (isDragging || swipeActionTapRef.current) return;
            handleNavigate();
          }}
          data-cm-messenger-list-row=""
          data-cm-list-surface="call"
          className={`flex min-w-0 flex-1 items-center py-1.5 text-left transition-transform duration-100 active:scale-[0.98] ${CALL_UI_CALL_LIST_ROW_ACTIVE_CLASS} ${
            vm.canNavigate ? "cursor-pointer" : "cursor-default"
          }`}
        >
          <div data-cm-list-avatar-slot="">{avatarNode}</div>
          <div className="min-w-0 flex-1">
            <p data-cm-list-title="" className="truncate font-semibold text-sam-fg">
              {vm.peerName}
              {vm.peerPublicId && vm.peerName.toLowerCase() !== vm.peerPublicId.toLowerCase() ? (
                <span className="font-medium text-sam-fg-muted">(@{vm.peerPublicId})</span>
              ) : null}
            </p>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1">
              {call.peerRelationLabel && call.peerRelationLabel !== "mutual_friend" ? (
                <span className="shrink-0 text-sam-fg-muted" data-cm-list-preview="">
                  {t("cm_peer_badge_not_friend")}
                </span>
              ) : null}
              {call.peerRelationLabel && call.peerRelationLabel !== "mutual_friend" ? (
                <span className="text-sam-border" aria-hidden>
                  ·
                </span>
              ) : null}
              <CommunityMessengerCallDirectionBadge displayType={vm.displayType} />
              <p data-cm-list-preview="" className="min-w-0 truncate" style={{ color: vm.subtitleColor }}>
                {subtitleText}
                {durationOnly ? ` · ${durationOnly}` : ""}
              </p>
            </div>
          </div>
        </button>

        <aside className="flex w-auto min-w-[52px] shrink-0 grow-0 basis-auto flex-col items-end justify-center gap-1 px-1.5 py-1">
          {timeLabel ? (
            <span
              data-cm-list-meta=""
              data-cm-call-occurrence-time=""
              className="shrink-0 grow-0 basis-auto whitespace-nowrap text-right tabular-nums text-sam-fg-muted"
            >
              {timeLabel}
            </span>
          ) : null}
          {vm.canRedial ? (
            <div onPointerDown={(e) => e.stopPropagation()}>
              <CommunityMessengerCallActionButton
                kind={vm.callKind}
                ariaLabel={vm.callKind === "video" ? t("cm_ui_call_log_redial_video") : t("cm_ui_call_log_redial_voice")}
                disabled={globalRedialBlocked}
                onPress={() => onRequestOutgoingConfirm(call, vm.callKind)}
              />
            </div>
          ) : (
            <span className="h-12 w-12" aria-hidden />
          )}
        </aside>
      </div>
    </li>
  );
}
