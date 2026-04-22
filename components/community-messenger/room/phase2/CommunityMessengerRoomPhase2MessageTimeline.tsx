"use client";

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  communityMessengerRoomIsGloballyUsable,
  type CommunityMessengerMessageActionAnchorRect,
} from "@/lib/community-messenger/types";

function messengerMessageAnchorRectFromDomRect(r: DOMRectReadOnly): CommunityMessengerMessageActionAnchorRect {
  return {
    top: r.top,
    left: r.left,
    right: r.right,
    bottom: r.bottom,
    width: r.width,
    height: r.height,
  };
}
import { CM_CLUSTER_GAP_MS } from "@/lib/community-messenger/room/messenger-room-ui-constants";
import { describeManagementEvent } from "@/lib/community-messenger/room/describe-management-event";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { BOTTOM_NAV_STACK_ABOVE_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { useMessengerRoomUiStore } from "@/lib/community-messenger/stores/messenger-room-ui-store";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import {
  BackIcon,
  communityMessengerMemberAvatar,
  communityMessengerMessageSearchText,
  communityMessengerVoiceAudioSrc,
  extractHttpUrls,
  FileIcon,
  formatDuration,
  formatFileMeta,
  formatParticipantStatus,
  formatRoomCallStatus,
  formatTime,
  formatVoiceRecordTenThousandths,
  getLatestCallStubForSession,
  looksLikeDirectImageUrl,
  mergeRoomMessages,
  MicHoldIcon,
  MoreIcon,
  PlusIcon,
  SendPlaneIcon,
  SendVoiceArrowIcon,
  TrashVoiceIcon,
  VideoCallIcon,
  VoiceCallIcon,
  VoiceRecordingLiveWaveform,
  ViberChatBubble,
} from "@/components/community-messenger/room/community-messenger-room-helpers";
import {
  CommunityMessengerTradeProcessSection,
  GroupRoomCallOverlay,
  MessengerTradeChatRoomDetailPrefetch,
  SeedTradeChatDetailMemoryFromSnapshot,
  VoiceMessageBubble,
} from "@/components/community-messenger/room/community-messenger-room-phase2-lazy";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
import { MessengerRoomNewMessagesBelowChip } from "@/components/community-messenger/room/MessengerRoomNewMessagesBelowChip";
import { MessengerChatImageBubble } from "@/components/community-messenger/room/MessengerChatImageBubble";
import { MessengerImageLightbox } from "@/components/community-messenger/room/MessengerImageLightbox";
import {
  messengerRoomReadBlockKeyImageLightbox,
  setMessengerRoomReadBlock,
} from "@/lib/community-messenger/room/messenger-room-read-gate";
import {
  formatReplyQuoteForMessage,
  formatReplyQuoteKakaoHeader,
} from "@/lib/community-messenger/message-actions/message-reply-policy";
import { MessageReactionRosterSheet } from "@/components/community-messenger/room/message/MessageReactionRosterSheet";

const MESSENGER_TIMELINE_MESSAGES_CAP = 100;

export const CommunityMessengerRoomPhase2MessageTimeline = memo(function CommunityMessengerRoomPhase2MessageTimeline() {
  const vm = useMessengerRoomPhase2View();
  const [imageLightbox, setImageLightbox] = useState<{
    urls: string[];
    originals: string[];
    index: number;
  } | null>(null);
  const [reactionRoster, setReactionRoster] = useState<{
    messageId: string;
    reactionKey: string;
    anchor: CommunityMessengerMessageActionAnchorRect;
  } | null>(null);

  /**
   * 내 최신 확정 발화 id + 상대 읽음 커서 비교 — 기존에는 역순 스캔 2회 + `filter(!pending)` 전체 1회가 겹쳤다.
   * 역순 1회로 mine id 확정 후, 읽음 판별에 필요한 두 id만 단일 순방향 스캔으로 찾는다.
   */
  const { latestReadableMineMessageId, peerHasReadMyLatestMessage } = useMemo(() => {
    const msgs = vm.displayRoomMessages;
    let latestMineId: string | null = null;
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      const item = msgs[i];
      if (item.pending) continue;
      if (!item.isMine) continue;
      if (item.messageType === "system") continue;
      latestMineId = item.id;
      break;
    }

    const readCursor = vm.snapshot.readReceipt?.lastReadMessageId?.trim() ?? "";
    if (!readCursor) {
      return { latestReadableMineMessageId: latestMineId, peerHasReadMyLatestMessage: false };
    }
    if (!latestMineId) {
      return { latestReadableMineMessageId: null, peerHasReadMyLatestMessage: false };
    }
    if (readCursor === latestMineId) {
      return { latestReadableMineMessageId: latestMineId, peerHasReadMyLatestMessage: true };
    }

    let cursorMsg: (typeof msgs)[number] | undefined;
    let mineLatestMsg: (typeof msgs)[number] | undefined;
    for (let i = 0; i < msgs.length; i += 1) {
      const m = msgs[i];
      if (m.pending) continue;
      if (m.id === readCursor) cursorMsg = m;
      if (m.id === latestMineId) mineLatestMsg = m;
      if (cursorMsg && mineLatestMsg) break;
    }

    const fromSnap = (id: string) => vm.snapshot.messages.find((msg) => msg.id === id);
    const cMsg = cursorMsg ?? fromSnap(readCursor);
    const mMsg = mineLatestMsg ?? fromSnap(latestMineId);
    if (!cMsg || !mMsg) {
      return { latestReadableMineMessageId: latestMineId, peerHasReadMyLatestMessage: false };
    }

    const ta = new Date(cMsg.createdAt).getTime();
    const tb = new Date(mMsg.createdAt).getTime();
    if (ta > tb) {
      return { latestReadableMineMessageId: latestMineId, peerHasReadMyLatestMessage: true };
    }
    if (ta < tb) {
      return { latestReadableMineMessageId: latestMineId, peerHasReadMyLatestMessage: false };
    }
    return {
      latestReadableMineMessageId: latestMineId,
      peerHasReadMyLatestMessage: readCursor.localeCompare(latestMineId) >= 0,
    };
  }, [vm.displayRoomMessages, vm.snapshot.messages, vm.snapshot.readReceipt?.lastReadMessageId]);

  /**
   * 스크롤은 초당 수십~수백 번 이벤트가 발생할 수 있어, state set 을 그대로 두면
   * 장시간 사용 시 렌더/GC 부담이 누적된다. rAF 로 1프레임 1회만 처리한다.
   */
  const scrollRafRef = useRef<number | null>(null);
  const onScroll = useCallback(() => {
    vm.updateStickToBottomFromScroll();
    if (vm.messageActionItem) vm.setMessageActionItem(null);
    if (vm.callStubSheet) vm.setCallStubSheet(null);
  }, [
    vm.updateStickToBottomFromScroll,
    vm.messageActionItem,
    vm.setMessageActionItem,
    vm.callStubSheet,
    vm.setCallStubSheet,
  ]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const key = messengerRoomReadBlockKeyImageLightbox(vm.streamRoomId);
    if (imageLightbox != null) setMessengerRoomReadBlock(key, true);
    return () => setMessengerRoomReadBlock(key, false);
  }, [imageLightbox, vm.streamRoomId]);

  useEffect(() => {
    if (vm.displayRoomMessages.length <= MESSENGER_TIMELINE_MESSAGES_CAP) return;
    vm.setRoomMessages((prev) =>
      prev.length > MESSENGER_TIMELINE_MESSAGES_CAP ? prev.slice(-MESSENGER_TIMELINE_MESSAGES_CAP) : prev
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 길이·방 전환 시에만 상한 재적용(vm 객체 참조는 매 렌더 갱신)
  }, [vm.displayRoomMessages.length, vm.setRoomMessages, vm.streamRoomId]);

  const scheduleScroll = useCallback(() => {
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      onScroll();
    });
  }, [onScroll]);

  /** 가상 행 map 직전: 행마다 `new Date(createdAt)` 2회·동일 viewer 아바타 N회·동일 sender `members.find` 반복을 줄인다. */
  const messageRowPreamble = useMemo(() => {
    const createdAtMs = vm.displayRoomMessages.map((m) => new Date(m.createdAt).getTime());
    const avatarBySenderId = new Map<string, ReturnType<typeof communityMessengerMemberAvatar>>();
    const peerAvatarFor = (senderId: string | null | undefined) => {
      if (!senderId) return null;
      if (avatarBySenderId.has(senderId)) return avatarBySenderId.get(senderId) ?? null;
      const v = communityMessengerMemberAvatar(vm.roomMembersDisplay, senderId);
      avatarBySenderId.set(senderId, v);
      return v;
    };
    const myRowAvatar = communityMessengerMemberAvatar(vm.roomMembersDisplay, vm.snapshot.viewerUserId);
    return { createdAtMs, peerAvatarFor, myRowAvatar };
  }, [vm.displayRoomMessages, vm.roomMembersDisplay, vm.snapshot.viewerUserId]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={vm.messagesViewportRef}
        data-cm-line-timeline
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-[color:var(--cm-room-chat-bg)]"
        onScroll={scheduleScroll}
      >
        <main className="space-y-2.5 px-3 py-3 pb-3 sm:px-3.5">
          {!communityMessengerRoomIsGloballyUsable(vm.snapshot.room) ? (
            <div className="rounded-[12px] border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-3 py-2.5 sam-text-helper leading-snug text-[color:var(--cm-room-text)]">
              {vm.snapshot.room.roomStatus === "blocked"
                ? vm.t("nav_messenger_room_blocked_notice")
                : vm.snapshot.room.roomStatus === "archived"
                  ? vm.t("nav_messenger_room_archived_notice")
                  : vm.t("nav_messenger_room_restricted_notice")}
              {vm.snapshot.room.isReadonly ? ` ${vm.t("nav_messenger_room_readonly_notice")}` : ""}
            </div>
          ) : null}
          {(vm.managedDirectCallError || (vm.call.errorMessage && !vm.call.panel) || vm.groupCallAutoAcceptNotice) ? (
            <div className="rounded-[12px] border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-primary-soft)] px-3 py-2.5 sam-text-helper text-[color:var(--cm-room-text)]">
              {vm.managedDirectCallError ?? vm.call.errorMessage ?? vm.groupCallAutoAcceptNotice}
            </div>
          ) : null}
          <p className="mx-auto max-w-[min(100%,22rem)] rounded-full bg-[color:var(--cm-room-primary-soft)] px-3 py-1 text-center sam-text-xxs leading-snug text-[color:var(--cm-room-text-muted)]">
            {vm.roomTypeLabel}
            {vm.roomJoinLabel ? ` · ${vm.roomJoinLabel}` : ""}
            {vm.roomIdentityLabel ? ` · ${vm.roomIdentityLabel}` : ""}
            {vm.snapshot.room.memberCount > 0 ? ` · ${vm.snapshot.room.memberCount}명` : ""}
            {vm.snapshot.room.myIdentityMode
              ? ` · ${vm.t("nav_messenger_my_identity", {
                  mode: vm.snapshot.room.myIdentityMode === "alias" ? vm.t("nav_messenger_identity_alias") : vm.t("nav_messenger_identity_real"),
                })}`
              : ""}
            {vm.isGroupRoom ? ` · ${vm.groupCallStatusLabel}` : ""}
          </p>
          {vm.snapshot.room.summary?.trim() && !vm.roomSummaryHoldsOnlyTradeOrDeliveryMeta ? (
            <button
              type="button"
              onClick={() => vm.setActiveSheet("info")}
              className="flex w-full items-center justify-between gap-2 rounded-[12px] border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-3 py-2 text-left active:bg-[color:var(--cm-room-primary-soft)]"
            >
              <div className="min-w-0">
                <p className="sam-text-xxs font-semibold uppercase tracking-wide text-[color:var(--cm-room-text-muted)]">공지</p>
                <p className="mt-0.5 line-clamp-2 sam-text-helper leading-snug text-[color:var(--cm-room-text)]">
                  {vm.snapshot.room.summary.trim()}
                </p>
              </div>
              <span className="shrink-0 sam-text-body text-[color:var(--cm-room-text-muted)]">›</span>
            </button>
          ) : null}
          {vm.hasMoreOlderMessages && vm.roomMessages.length > 0 ? (
            <div
              ref={vm.topOlderSentinelRef}
              className="flex min-h-[24px] flex-col items-center justify-center gap-1 py-2"
            >
              {vm.loadingOlderMessages ? (
                <span className="sam-text-helper text-ui-muted">이전 대화를 불러오는 중…</span>
              ) : (
                <span className="sam-text-xxs text-ui-muted">맨 위로 스크롤하면 이전 대화를 불러옵니다</span>
              )}
            </div>
          ) : null}
          {vm.displayRoomMessages.length ? (
            <div className="relative w-full" style={{ height: vm.chatVirtualizer.getTotalSize() }}>
              {vm.chatVirtualizer.getVirtualItems().map((virtualRow) => {
                const index = virtualRow.index;
                const item = vm.displayRoomMessages[index];
                if (!item) return null;
                const prev = index > 0 ? vm.displayRoomMessages[index - 1] : null;
              const gapMs =
                prev && prev.messageType !== "system" && item.messageType !== "system"
                  ? Math.max(0, messageRowPreamble.createdAtMs[index]! - messageRowPreamble.createdAtMs[index - 1]!)
                  : 0;
              const isNewClusterFromTime = gapMs > CM_CLUSTER_GAP_MS;
              const peerSenderChanged =
                vm.isGroupRoom &&
                !!prev &&
                prev.messageType !== "system" &&
                (prev.senderId ?? "") !== (item.senderId ?? "");
              const mySenderChanged =
                vm.isGroupRoom &&
                !!prev &&
                prev.messageType !== "system" &&
                (prev.senderId ?? "") !== (item.senderId ?? "");

              const showPeerAvatar =
                !item.isMine &&
                item.messageType !== "system" &&
                (!prev ||
                  prev.messageType === "system" ||
                  prev.isMine ||
                  peerSenderChanged ||
                  isNewClusterFromTime);
              const peerAvatar = !item.isMine ? messageRowPreamble.peerAvatarFor(item.senderId) : null;
              const showMyAvatar =
                item.isMine &&
                item.messageType !== "system" &&
                (!prev ||
                  prev.messageType === "system" ||
                  !prev.isMine ||
                  mySenderChanged ||
                  isNewClusterFromTime);
              const showBubbleTail = item.isMine ? showMyAvatar : showPeerAvatar;
              const myAvatar = item.isMine ? messageRowPreamble.myRowAvatar : null;

              const bindMessageInteraction =
                item.messageType === "system"
                  ? {}
                  : item.messageType === "call_stub"
                    ? {
                        onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
                          vm.messageLongPressItemRef.current = item;
                          const el = e.currentTarget;
                          vm.messageLongPressTimerRef.current = window.setTimeout(() => {
                            vm.messageLongPressTimerRef.current = null;
                            vm.setCallStubSheet({
                              item,
                              anchorRect: messengerMessageAnchorRectFromDomRect(el.getBoundingClientRect()),
                            });
                          }, 520);
                        },
                        onPointerUp: () => {
                          if (vm.messageLongPressTimerRef.current) {
                            clearTimeout(vm.messageLongPressTimerRef.current);
                            vm.messageLongPressTimerRef.current = null;
                          }
                          vm.messageLongPressItemRef.current = null;
                        },
                        onPointerCancel: () => {
                          if (vm.messageLongPressTimerRef.current) {
                            clearTimeout(vm.messageLongPressTimerRef.current);
                            vm.messageLongPressTimerRef.current = null;
                          }
                          vm.messageLongPressItemRef.current = null;
                        },
                        onContextMenu: (e: ReactMouseEvent<HTMLDivElement>) => {
                          e.preventDefault();
                          vm.setCallStubSheet({
                            item,
                            anchorRect: messengerMessageAnchorRectFromDomRect(e.currentTarget.getBoundingClientRect()),
                          });
                        },
                      }
                    : {
                        onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
                          vm.messageLongPressItemRef.current = item;
                          const el = e.currentTarget;
                          vm.messageLongPressTimerRef.current = window.setTimeout(() => {
                            vm.messageLongPressTimerRef.current = null;
                            vm.setMessageActionItem({
                              item,
                              anchorRect: messengerMessageAnchorRectFromDomRect(el.getBoundingClientRect()),
                            });
                          }, 520);
                        },
                        onPointerUp: () => {
                          if (vm.messageLongPressTimerRef.current) {
                            clearTimeout(vm.messageLongPressTimerRef.current);
                            vm.messageLongPressTimerRef.current = null;
                          }
                          vm.messageLongPressItemRef.current = null;
                        },
                        onPointerCancel: () => {
                          if (vm.messageLongPressTimerRef.current) {
                            clearTimeout(vm.messageLongPressTimerRef.current);
                            vm.messageLongPressTimerRef.current = null;
                          }
                          vm.messageLongPressItemRef.current = null;
                        },
                        onContextMenu: (e: ReactMouseEvent<HTMLDivElement>) => {
                          e.preventDefault();
                          vm.setMessageActionItem({
                            item,
                            anchorRect: messengerMessageAnchorRectFromDomRect(e.currentTarget.getBoundingClientRect()),
                          });
                        },
                      };

              const replyQuote =
                item.messageType !== "system" && item.messageType !== "call_stub"
                  ? formatReplyQuoteForMessage(item)
                  : null;

              const longPressMenuOpenOnBubble =
                (Boolean(vm.messageActionItem) && vm.messageActionItem?.item.id === item.id) ||
                (Boolean(vm.callStubSheet) && vm.callStubSheet?.item.id === item.id);

              const renderReplyQuoteInsideBubble = () => {
                if (!replyQuote) return null;
                const mine = item.isMine;
                return (
                  <button
                    type="button"
                    className={`w-full min-w-0 max-w-full shrink-0 border-b text-left transition active:opacity-90 ${
                      mine
                        ? "border-white/20 bg-black/15 px-3 py-2"
                        : "border-[color:var(--cm-room-divider)] bg-black/[0.04] px-3 py-2"
                    }`}
                    style={{
                      borderTopLeftRadius: "var(--cm-room-radius-bubble)",
                      borderTopRightRadius: "var(--cm-room-radius-bubble)",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      void vm.focusTimelineMessage(replyQuote.targetMessageId);
                    }}
                    aria-label={`원본 메시지로 이동: ${replyQuote.senderLabel}`}
                  >
                    <p
                      className={`sam-text-xxs font-bold leading-snug ${
                        mine ? "text-white" : "text-[color:var(--cm-room-primary)]"
                      }`}
                    >
                      {formatReplyQuoteKakaoHeader(vm.tt(replyQuote.senderLabel))}
                    </p>
                    <p
                      className={`mt-0.5 line-clamp-2 sam-text-xxs leading-snug ${
                        mine ? "text-white/85" : "text-[color:var(--cm-room-text-muted)]"
                      }`}
                    >
                      {replyQuote.previewText}
                    </p>
                  </button>
                );
              };

              const renderBubbleStack = (bubbleChild: ReactNode) => (
                <div
                  className={`inline-flex max-w-full flex-col ${item.isMine ? "items-end" : "items-start"} ${
                    longPressMenuOpenOnBubble ? "rounded-[14px] ring-2 ring-[color:var(--cm-room-primary)] ring-offset-2 ring-offset-[color:var(--cm-room-bg)]" : ""
                  }`}
                  {...bindMessageInteraction}
                >
                  {bubbleChild}
                  {(() => {
                    const hasRx = Boolean(item.reactions && item.reactions.length > 0);
                    if (!hasRx) return null;
                    return (
                      <div
                        className={`mt-1 flex max-w-full flex-wrap items-center gap-1.5 ${
                          item.isMine ? "justify-end" : "justify-start"
                        }`}
                      >
                        {(item.reactions ?? []).map((r) => (
                          <button
                            key={`${item.id}:${r.reactionKey}`}
                            type="button"
                            className={`inline-flex items-center gap-0.5 border-0 bg-transparent px-0.5 py-0 sam-text-xxs font-medium transition active:opacity-75 ${
                              item.isMine ? "text-white/95" : "text-[color:var(--cm-room-text)]"
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setReactionRoster({
                                messageId: item.id,
                                reactionKey: r.reactionKey,
                                anchor: messengerMessageAnchorRectFromDomRect(e.currentTarget.getBoundingClientRect()),
                              });
                            }}
                            aria-label={`${r.reactionKey} 반응 ${r.count}명, 누가 눌렀는지 보기`}
                          >
                            <span className="text-base leading-none">{r.reactionKey}</span>
                            {r.count >= 1 ? <span className="tabular-nums opacity-90">{r.count}</span> : null}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              );

              const systemBubbleClass =
                "rounded-[14px] border border-[color:var(--cm-room-divider)]/90 bg-[color:var(--cm-room-primary-soft)] px-3.5 py-1.5 text-center sam-text-xxs leading-snug text-[color:var(--cm-room-text-muted)] shadow-[0_1px_3px_rgba(115,96,242,0.08)]";

              const viberInnerBody: ReactNode = (() => {
                const mineLight = item.isMine;
                if (item.messageType === "image") {
                  return (
                    <MessengerChatImageBubble
                      item={item}
                      onOpenLightbox={(urls, originals, index) => setImageLightbox({ urls, originals, index })}
                    />
                  );
                }
                if (item.messageType === "sticker") {
                  const stickerSrc = item.content.trim();
                  return (
                    <div className="flex flex-col items-stretch p-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={stickerSrc}
                        alt=""
                        width={160}
                        height={160}
                        loading="lazy"
                        decoding="async"
                        className="h-36 w-36 max-h-[9.5rem] max-w-[9.5rem] object-contain sm:h-40 sm:w-40 sm:max-h-[10rem] sm:max-w-[10rem]"
                      />
                      {item.pending ? (
                        <span className={`mt-1 sam-text-xxs ${mineLight ? "text-white/85" : "text-sam-muted"}`}>전송 중…</span>
                      ) : null}
                    </div>
                  );
                }
                if (item.messageType === "voice") {
                  return (
                    <VoiceMessageBubble
                      src={communityMessengerVoiceAudioSrc(vm.streamRoomId, item)}
                      durationSeconds={item.voiceDurationSeconds ?? 0}
                      isMine={item.isMine}
                      pending={item.pending}
                      waveformPeaks={item.voiceWaveformPeaks ?? null}
                      sentTimeLabel={undefined}
                      mineBubbleStyle={item.isMine ? "viberLight" : "signature"}
                      fallbackSrc={
                        item.pending
                          ? null
                          : /^https?:\/\//i.test(item.content.trim())
                            ? item.content.trim()
                            : null
                      }
                      mediaType={item.voiceMimeType ?? null}
                    />
                  );
                }
                if (item.messageType === "file") {
                  return (
                    <div className="min-w-[200px]">
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${
                            item.isMine ? "bg-sam-surface/20 text-white" : "bg-sam-surface-muted text-sam-fg"
                          }`}
                        >
                          <FileIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate font-semibold ${item.isMine ? "text-white" : "text-[color:var(--cm-room-text)]"}`}>
                            {item.fileName?.trim() || "첨부 파일"}
                          </p>
                          <p
                            className={`mt-1 sam-text-helper ${item.isMine ? "text-white/80" : "text-[color:var(--cm-room-text-muted)]"}`}
                          >
                            {formatFileMeta(item.fileMimeType, item.fileSizeBytes)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3">
                        {item.pending ? (
                          <span className={`sam-text-helper ${item.isMine ? "text-sam-muted" : "text-sam-muted"}`}>
                            업로드 중…
                          </span>
                        ) : item.content.trim() ? (
                          <a
                            href={item.content.trim()}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={
                              vm.roomPreferences.mediaAutoSaveEnabled
                                ? item.fileName?.trim() || "community-messenger-file"
                                : undefined
                            }
                            className={`inline-flex rounded-[10px] border px-3 py-2 sam-text-helper font-semibold ${
                              item.isMine
                                ? "border-sam-surface/40 bg-sam-surface/15 text-white"
                                : "border-[color:var(--cm-room-divider)] bg-sam-surface text-[color:var(--cm-room-text)]"
                            }`}
                          >
                            {vm.roomPreferences.mediaAutoSaveEnabled ? "파일 저장" : "파일 열기"}
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                }
                if (item.messageType === "call_stub") {
                  const kind: "voice" | "video" = item.callKind === "video" ? "video" : "voice";
                  const stubBusy =
                    vm.roomUnavailable ||
                    (vm.busy != null && String(vm.busy).startsWith("managed-call:")) ||
                    vm.call.busy === "call-start" ||
                    vm.call.busy === "device-prepare" ||
                    vm.call.busy === "call-accept";
                  const CallGlyph = item.callKind === "video" ? VideoCallIcon : VoiceCallIcon;
                  return (
                    <button
                      type="button"
                      disabled={stubBusy}
                      onClick={(e) => {
                        e.stopPropagation();
                        vm.openCallStubOutgoingConfirm(kind);
                      }}
                      className="flex w-full max-w-full items-center gap-2.5 rounded-[12px] py-1 text-left transition active:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          item.isMine ? "bg-sam-surface/20 text-white" : "bg-[color:var(--cm-room-primary-soft)] text-[color:var(--cm-room-primary)]"
                        }`}
                        aria-hidden
                      >
                        <CallGlyph className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                          <span
                            className={`sam-text-body font-semibold leading-snug ${
                              item.isMine ? "text-white" : "text-[color:var(--cm-room-text)]"
                            }`}
                          >
                            {item.callKind === "video" ? vm.t("nav_video_call_label") : vm.t("nav_voice_call_label")}
                          </span>
                          <span
                            className={`sam-text-xxs font-medium leading-snug ${
                              item.isMine ? "text-white/75" : "text-[color:var(--cm-room-text-muted)]"
                            }`}
                          >
                            {vm.tt(formatRoomCallStatus(item.callStatus))}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                }
                return (
                  <div className="flex w-max max-w-full flex-col gap-2">
                    <div className="flex flex-wrap items-end gap-x-2 gap-y-0.5">
                      <p
                        className={`inline-block w-fit max-w-full sam-text-body leading-snug break-keep [overflow-wrap:break-word] ${
                          mineLight ? "text-white" : "text-[color:var(--cm-room-text)]"
                        }`}
                      >
                        {item.content}
                      </p>
                      {item.pending ? (
                        <span
                          className={`shrink-0 sam-text-xxs ${mineLight ? "text-white/70" : "text-[color:var(--cm-room-text-muted)]"}`}
                        >
                          {vm.t("common_sending")}
                        </span>
                      ) : null}
                    </div>
                    {vm.roomPreferences.linkPreviewEnabled && extractHttpUrls(item.content).length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {extractHttpUrls(item.content)
                          .slice(0, 2)
                          .map((url) => (
                            <a
                              key={`${item.id}:${url}`}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex max-w-[220px] truncate rounded-[10px] border px-2.5 py-1 sam-text-xxs ${
                                mineLight
                                  ? "border-sam-surface/35 bg-sam-surface/15 text-white"
                                  : "border-[color:var(--cm-room-divider)] bg-sam-surface text-[color:var(--cm-room-text-muted)]"
                              }`}
                            >
                              {url.replace(/^https?:\/\//i, "")}
                            </a>
                          ))}
                      </div>
                    ) : null}
                  </div>
                );
              })();

              const viberBubble = (
                <ViberChatBubble isMine={item.isMine} showTail={showBubbleTail}>
                  <div className="flex min-w-0 max-w-full flex-col">
                    {renderReplyQuoteInsideBubble()}
                    {item.messageType === "image" || item.messageType === "sticker" ? (
                      viberInnerBody
                    ) : (
                      <div className={replyQuote ? "px-3 pb-2.5 pt-2" : "px-3 py-2.5"}>{viberInnerBody}</div>
                    )}
                  </div>
                </ViberChatBubble>
              );

              return (
                <div
                  key={item.id}
                  data-index={virtualRow.index}
                  ref={vm.chatVirtualizer.measureElement}
                  id={`cm-room-msg-${item.id}`}
                  className={`absolute left-0 top-0 w-full pb-2.5 flex scroll-mt-24 ${
                    item.messageType === "system" ? "justify-center" : item.isMine ? "justify-end" : "justify-start"
                  } ${
                    vm.timelineHighlightMessageId === item.id
                      ? "relative z-[2] rounded-[16px] outline outline-2 -outline-offset-[3px] outline-[color:var(--cm-room-primary)]"
                      : ""
                  }`}
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {item.messageType === "system" ? (
                    <div className="max-w-[92%] px-2">
                      <div className={systemBubbleClass}>
                        <p className="text-center sam-text-helper leading-5">{item.content}</p>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`flex w-full min-w-0 max-w-full items-end gap-3 ${
                        item.isMine ? "justify-end" : "justify-start"
                      }`}
                    >
                      {!item.isMine ? (
                        <div className="relative z-[1] w-9 shrink-0 self-end pb-0.5">
                          {showPeerAvatar ? (
                            peerAvatar?.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={peerAvatar.avatarUrl}
                                alt=""
                                className="h-9 w-9 rounded-full border border-sam-fg/10 object-cover shadow-sm"
                              />
                            ) : (
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-sam-fg/10 bg-sam-surface text-center sam-text-body font-semibold leading-none text-sam-muted shadow-sm">
                                {peerAvatar?.initials?.slice(0, 1) ?? "?"}
                              </div>
                            )
                          ) : (
                            <div className="h-9 w-9" aria-hidden />
                          )}
                        </div>
                      ) : null}

                      <div
                        className={`flex min-h-0 min-w-0 flex-1 flex-col ${item.isMine ? "items-end" : "items-start"}`}
                      >
                        {vm.isGroupRoom && !item.isMine && showPeerAvatar ? (
                          <p className="mb-0.5 max-w-full pl-0.5 sam-text-helper font-semibold text-[color:var(--cm-room-primary)]">
                            {vm.tt(item.senderLabel)}
                          </p>
                        ) : null}

                        <div
                          className={`flex w-full min-w-0 max-w-[min(85vw,70%)] shrink-0 items-end gap-1.5 ${
                            item.isMine ? "flex-row justify-end" : "flex-row justify-start"
                          }`}
                        >
                          {item.isMine ? (
                            <>
                              <span className="shrink-0 self-end pb-1 sam-text-xxs tabular-nums leading-none text-[color:var(--cm-room-text-muted)]">
                                {formatTime(item.createdAt)}
                              </span>
                              {latestReadableMineMessageId === item.id ? (
                                <span className="shrink-0 self-end pb-1 sam-text-xxs leading-none text-[color:var(--cm-room-text-muted)]">
                                  {peerHasReadMyLatestMessage ? "읽음" : "안읽음"}
                                </span>
                              ) : null}
                              {renderBubbleStack(viberBubble)}
                            </>
                          ) : (
                            <>
                              {renderBubbleStack(viberBubble)}
                              <span className="shrink-0 self-end pb-1 sam-text-xxs tabular-nums leading-none text-[color:var(--cm-room-text-muted)]">
                                {formatTime(item.createdAt)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {item.isMine ? (
                        <div className="relative z-[1] w-9 shrink-0 self-end pb-0.5">
                          {showMyAvatar ? (
                            myAvatar?.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={myAvatar.avatarUrl}
                                alt=""
                                className="h-9 w-9 rounded-full border border-sam-fg/10 object-cover shadow-sm"
                              />
                            ) : (
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-sam-fg/10 bg-sam-surface text-center sam-text-body font-semibold leading-none text-sam-muted shadow-sm">
                                {myAvatar?.initials?.slice(0, 1) ?? "나"}
                              </div>
                            )
                          ) : (
                            <div className="h-9 w-9" aria-hidden />
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          ) : (
            <div className="px-4 py-12 text-center sam-text-body-secondary text-[color:var(--cm-room-text-muted)]">
              {(() => {
                const lastHint = Boolean(vm.snapshot.room.lastMessage?.trim());
                const snapshotHasMessages = vm.snapshot.messages.length > 0;
                const showLoadRecovery =
                  !vm.loading &&
                  (lastHint || snapshotHasMessages) &&
                  vm.roomMessages.length === 0;
                if (showLoadRecovery) {
                  return (
                    <>
                      <p className="sam-text-body font-medium text-[color:var(--cm-room-text)]">
                        대화 내용을 불러오지 못했습니다.
                      </p>
                      <p className="mx-auto mt-2 max-w-sm sam-text-helper leading-relaxed">
                        방 미리보기에는 최근 메시지가 있는데 목록이 비어 있으면, 로컬 DB 마이그레이션 누락이거나 동기화 오류일 수 있습니다. 다시 불러오기를 눌러 보세요.
                      </p>
                      <button
                        type="button"
                        className="mt-4 rounded-full border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-5 py-2.5 sam-text-body font-semibold text-[color:var(--cm-room-primary)] active:bg-[color:var(--cm-room-primary-soft)]"
                        onClick={() => void vm.refresh(false)}
                      >
                        다시 불러오기
                      </button>
                    </>
                  );
                }
                return (
                  <>
                    아직 메시지가 없습니다.
                    <br />
                    <span className="mt-1 inline-block sam-text-helper">첫 인사를 남겨보세요.</span>
                  </>
                );
              })()}
            </div>
          )}
          <div ref={vm.messageEndRef} />
        </main>
      </div>
      <MessengerRoomNewMessagesBelowChip roomId={vm.streamRoomId} onJumpToLatest={vm.scrollMessengerToBottom} />
      <MessengerImageLightbox
        open={imageLightbox != null}
        urls={imageLightbox?.urls ?? []}
        originals={imageLightbox?.originals ?? []}
        index={imageLightbox?.index ?? 0}
        onClose={() => setImageLightbox(null)}
        onChangeIndex={(next) =>
          setImageLightbox((cur) => {
            if (!cur) return cur;
            const clamped = Math.max(0, Math.min(cur.urls.length - 1, next));
            return { ...cur, index: clamped };
          })
        }
      />
      <MessageReactionRosterSheet
        open={reactionRoster}
        streamRoomId={vm.streamRoomId}
        onClose={() => setReactionRoster(null)}
      />
    </div>
  );
});
