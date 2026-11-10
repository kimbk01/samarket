"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { CommunityMessengerCallActionButton } from "@/components/community-messenger/call-history/CommunityMessengerCallActionButton";
import { GroupDomainAvatar } from "@/components/community-messenger/domain-shell-canary/GroupDomainAvatar";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import {
  CALL_LOG_SWIPE_ACTION_ATTR,
  COMMUNITY_MESSENGER_CALL_LOG_SWIPE_ACTION_W_PX,
  communityMessengerCallLogSwipeItemId,
  isCallLogSwipeDeleteActionInteractive,
} from "@/lib/community-messenger/call-history/call-log-swipe";
import { presentCallHistoryRow } from "@/lib/community-messenger/call-history/call-history-presenter";
import { resolveCallLogListTimestampIso } from "@/lib/community-messenger/call-log-row-copy";
import { formatCallHistoryRowLine } from "@/lib/community-messenger/call-history/call-history-row-line";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";
import { CALL_UI_CALL_LIST_ROW_ACTIVE_CLASS } from "@/lib/community-messenger/call-ui/call-ui-tokens";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import { useMessengerFriendActions } from "@/components/community-messenger/friend-cta/messenger-friend-actions-context";
import { resolveCallLogUnavailableReasonKey } from "@/lib/community-messenger/call-ui/direct-call-unavailable-reason";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import {
  MessengerPeerRelationAvatar,
  messengerPeerRelationRowClass,
  type MessengerPeerRelationMark,
} from "@/components/community-messenger/peer-relation/MessengerPeerRelationAvatarBadge";

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
  const { t } = useI18n();
  const vm = presentCallHistoryRow(call);
  /**
   * U-9 (1단계 문서 §13-6): 「친구 아님」은 홈의 현재 친구 목록 기준 — 서버 값은 목록 조회 시점이라
   * 그 뒤 수락·삭제가 있으면 오래된 값이 남는다. 홈 밖(친구 목록 없음)에서만 서버 값을 쓴다.
   */
  const friendActions = useMessengerFriendActions();
  /**
   * §15-2: 홈 친구 목록을 아직 받지 못했으면 friendIds=undefined(모름) → 서버 통화 기록 값으로 판정.
   * 서버 값은 친구 아님(stranger·상대만 저장)일 때만 배지 — 내가 친구로 둔 상대·차단(양방향이라 비노출)은 배지 없음.
   */
  const showNotFriend =
    call.sessionMode === "group" || !call.peerUserId
      ? false
      : friendActions?.friendIds
        ? !friendActions.friendIds.has(call.peerUserId)
        : call.peerRelationLabel === "stranger" || call.peerRelationLabel === "saved_by_peer";
  /**
   * §15-3 표시만: 대화·통화 불가(내가 차단 ∪ 내 요청을 거절) = 빨간 금지 배지. 홈이 목록을 알 때만(모르면 undefined).
   * 이전에는 홈 캐시 차단 목록을 처음 한 번만 읽어, 목록이 채워진 뒤에도 갱신되지 않았다(실기기 21:51 PHT).
   */
  const blockedByMe = Boolean(
    call.sessionMode !== "group" &&
      call.peerUserId?.trim() &&
      friendActions?.unavailablePeerIds?.has(call.peerUserId.trim())
  );
  const relationMark: MessengerPeerRelationMark | null = blockedByMe
    ? "unavailable"
    : showNotFriend
      ? "stranger"
      : null;
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

  /**
   * 채팅 시안 4판 「3. 통화 탭」 (Owner 「정확히 시안대로」 2026-11-10): 둘째 줄 하나에 종류 · 결과(또는 통화 시간) · 날짜 시각.
   * 상태 칩·오른쪽 시각 없음 — 줄이 화면 밖으로 나가지 않는다. 부재중(놓친 수신)만 이름·둘째 줄 빨강.
   */
  const line = formatCallHistoryRowLine(
    {
      callKind: vm.callKind,
      displayType: vm.displayType,
      badgeLabelKey: vm.badgeLabelKey,
      durationLabel: vm.durationLabel,
      timeIso: resolveCallLogListTimestampIso(call),
    },
    t
  );
  const isGroupCall = call.sessionMode === "group";

  /** 사진 48 둥근 사각(18) — 그룹 통화는 그룹 자리표시(참여자 사진을 쓰지 않음) */
  const avatarNode = isGroupCall ? (
    <GroupDomainAvatar imageUrl={null} fill shape="rounded-square" roundedClassName="rounded-[18px]" />
  ) : (
    <SamarketThumbnail
      src={resolveUserAvatarImageSrc(vm.peerAvatarUrl)}
      size={48}
      roundedClassName="rounded-[18px]"
      className="h-full w-full shrink-0 bg-[color:var(--cm-chat-band)]"
      fallbackSrc=""
      fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
    />
  );

  return (
    <li className="relative overflow-hidden bg-[color:var(--messenger-surface,#fff)]" data-call-log-row="true">
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
        className={`relative z-[1] flex h-[72px] w-full touch-pan-y items-center gap-3 bg-[color:var(--messenger-surface,#fff)] px-4 ${messengerPeerRelationRowClass(relationMark)}`}
        data-call-log-swipe-surface={swipeSurfaceDataAttr}
        style={{
          ...(relationMark === "stranger"
            ? {
                backgroundColor: "var(--cm-peer-stranger-row-bg)",
                boxShadow: "inset 3px 0 0 var(--cm-peer-stranger)",
              }
            : null),
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
          className={`flex min-w-0 flex-1 items-center self-stretch text-left transition-transform duration-100 active:scale-[0.98] ${CALL_UI_CALL_LIST_ROW_ACTIVE_CLASS} ${
            vm.canNavigate ? "cursor-pointer" : "cursor-default"
          }`}
        >
          <div data-cm-list-avatar-slot="" className="shrink-0">
            {relationMark ? (
              <MessengerPeerRelationAvatar mark={relationMark}>
                <span className="block h-[var(--cm-list-avatar)] w-[var(--cm-list-avatar)]">{avatarNode}</span>
              </MessengerPeerRelationAvatar>
            ) : (
              avatarNode
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <p
              data-cm-list-title=""
              className="truncate"
              style={{ color: line.missed ? "var(--cm-chat-danger)" : "var(--cm-chat-fg)" }}
            >
              {vm.peerName}
            </p>
            <p
              data-cm-list-preview=""
              data-cm-call-row-line=""
              data-cm-call-missed={line.missed ? "1" : undefined}
              className="truncate"
              style={{ color: line.missed ? "var(--cm-chat-danger)" : "var(--cm-chat-sub)" }}
            >
              {line.text}
            </p>
          </div>
        </button>

        {/* 다시 걸기 — 모든 줄 오른쪽 같은 자리(터치 48 안 아이콘 24 → 화면 끝 16), 초록 (음성 = 전화 · 영상 = 카메라). 다시 걸 수 없는 줄(그룹 통화)은 흐린 아이콘 */}
        <div className="flex shrink-0 items-center" onPointerDown={(e) => e.stopPropagation()}>
          <CommunityMessengerCallActionButton
            kind={vm.callKind}
            ariaLabel={vm.callKind === "video" ? t("cm_ui_call_log_redial_video") : t("cm_ui_call_log_redial_voice")}
            disabled={globalRedialBlocked || !vm.canRedial}
            dimmed={relationMark === "unavailable"}
            onPress={() => {
              /** §17-4 R-3: 대화·통화 불가 상대 — 발신 확인 대신 이유 안내 */
              if (relationMark === "unavailable") {
                const pid = call.peerUserId?.trim() ?? "";
                const key = resolveCallLogUnavailableReasonKey({
                  blockedByMe: Boolean(pid && friendActions?.blockedByMePeerIds?.has(pid)),
                });
                showMessengerSnackbar(t(key), { variant: "default" });
                return;
              }
              onRequestOutgoingConfirm(call, vm.callKind);
            }}
          />
        </div>
      </div>
    </li>
  );
}
