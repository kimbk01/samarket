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
import { communityMessengerRoomIsGloballyUsable } from "@/lib/community-messenger/types";
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
  CommunityMessengerMessageActionSheet,
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

export const CommunityMessengerRoomPhase2MessageTimeline = memo(function CommunityMessengerRoomPhase2MessageTimeline() {
  const vm = useMessengerRoomPhase2View();
  const [imageLightbox, setImageLightbox] = useState<{
    urls: string[];
    originals: string[];
    index: number;
  } | null>(null);
  const latestReadableMineMessageId = useMemo(() => {
    for (let i = vm.displayRoomMessages.length - 1; i >= 0; i -= 1) {
      const item = vm.displayRoomMessages[i];
      if (item.pending) continue;
      if (!item.isMine) continue;
      if (item.messageType === "system") continue;
      return item.id;
    }
    return null;
  }, [vm.displayRoomMessages]);
  /**
   * 상대 `last_read_message_id` 는 「마지막으로 본 메시지」이므로, 내 최신 발화 id 와 **일치할 때만** 읽음이면
   * 상대가 그 이후(예: 본인 답장)까지 읽어도 항상 「안읽음」으로 남는다. 타임라인 순서로 cursor 가 내 최신 이후면 읽음.
   */
  const peerHasReadMyLatestMessage = useMemo(() => {
    const readCursor = vm.snapshot.readReceipt?.lastReadMessageId?.trim() ?? "";
    if (!readCursor) return false;
    const mineLatestId = (() => {
      for (let i = vm.displayRoomMessages.length - 1; i >= 0; i -= 1) {
        const item = vm.displayRoomMessages[i];
        if (item.pending) continue;
        if (!item.isMine) continue;
        if (item.messageType === "system") continue;
        return item.id;
      }
      return null;
    })();
    if (!mineLatestId) return false;
    if (readCursor === mineLatestId) return true;

    const confirmed = vm.displayRoomMessages.filter((m) => !m.pending);
    const fromList = (id: string) => confirmed.find((m) => m.id === id);
    const fromSnap = (id: string) => vm.snapshot.messages.find((m) => m.id === id);
    const cursorMsg = fromList(readCursor) ?? fromSnap(readCursor);
    const mineLatestMsg = fromList(mineLatestId) ?? fromSnap(mineLatestId);
    if (!cursorMsg || !mineLatestMsg) return false;

    const ta = new Date(cursorMsg.createdAt).getTime();
    const tb = new Date(mineLatestMsg.createdAt).getTime();
    if (ta > tb) return true;
    if (ta < tb) return false;
    return readCursor.localeCompare(mineLatestId) >= 0;
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

  const scheduleScroll = useCallback(() => {
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      onScroll();
    });
  }, [onScroll]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={vm.messagesViewportRef}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-[color:var(--cm-room-chat-bg)]"
        onScroll={scheduleScroll}
      >
        <main className="space-y-2.5 px-3 py-3 pb-3 sm:px-3.5">
          {!communityMessengerRoomIsGloballyUsable(vm.snapshot.room) ? (
            <div className="rounded-[12px] border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-3 py-2.5 text-[12px] leading-snug text-[color:var(--cm-room-text)]">
              {vm.snapshot.room.roomStatus === "blocked"
                ? vm.t("nav_messenger_room_blocked_notice")
                : vm.snapshot.room.roomStatus === "archived"
                  ? vm.t("nav_messenger_room_archived_notice")
                  : vm.t("nav_messenger_room_restricted_notice")}
              {vm.snapshot.room.isReadonly ? ` ${vm.t("nav_messenger_room_readonly_notice")}` : ""}
            </div>
          ) : null}
          {(vm.managedDirectCallError || (vm.call.errorMessage && !vm.call.panel) || vm.groupCallAutoAcceptNotice) ? (
            <div className="rounded-[12px] border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-primary-soft)] px-3 py-2.5 text-[12px] text-[color:var(--cm-room-text)]">
              {vm.managedDirectCallError ?? vm.call.errorMessage ?? vm.groupCallAutoAcceptNotice}
            </div>
          ) : null}
          <p className="mx-auto max-w-[min(100%,22rem)] rounded-full bg-[color:var(--cm-room-primary-soft)] px-3 py-1 text-center text-[10px] leading-snug text-[color:var(--cm-room-text-muted)]">
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
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--cm-room-text-muted)]">공지</p>
                <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[color:var(--cm-room-text)]">
                  {vm.snapshot.room.summary.trim()}
                </p>
              </div>
              <span className="shrink-0 text-[14px] text-[color:var(--cm-room-text-muted)]">›</span>
            </button>
          ) : null}
          {vm.hasMoreOlderMessages && vm.roomMessages.length > 0 ? (
            <div
              ref={vm.topOlderSentinelRef}
              className="flex min-h-[24px] flex-col items-center justify-center gap-1 py-2"
            >
              {vm.loadingOlderMessages ? (
                <span className="text-[12px] text-ui-muted">이전 대화를 불러오는 중…</span>
              ) : (
                <span className="text-[11px] text-ui-muted">맨 위로 스크롤하면 이전 대화를 불러옵니다</span>
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
                  ? Math.max(0, new Date(item.createdAt).getTime() - new Date(prev.createdAt).getTime())
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
              const peerAvatar = !item.isMine ? communityMessengerMemberAvatar(vm.roomMembersDisplay, item.senderId) : null;
              const showMyAvatar =
                item.isMine &&
                item.messageType !== "system" &&
                (!prev ||
                  prev.messageType === "system" ||
                  !prev.isMine ||
                  mySenderChanged ||
                  isNewClusterFromTime);
              const showBubbleTail = item.isMine ? showMyAvatar : showPeerAvatar;
              const myAvatar = item.isMine
                ? communityMessengerMemberAvatar(vm.roomMembersDisplay, vm.snapshot.viewerUserId)
                : null;

              const bindMessageInteraction =
                item.messageType === "system"
                  ? {}
                  : item.messageType === "call_stub"
                    ? {
                        onPointerDown: (_e: ReactPointerEvent<HTMLDivElement>) => {
                          vm.messageLongPressItemRef.current = item;
                          vm.messageLongPressTimerRef.current = window.setTimeout(() => {
                            vm.messageLongPressTimerRef.current = null;
                            vm.setCallStubSheet(item);
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
                          vm.setCallStubSheet(item);
                        },
                      }
                    : {
                        onPointerDown: (_e: ReactPointerEvent<HTMLDivElement>) => {
                          vm.messageLongPressItemRef.current = item;
                          vm.messageLongPressTimerRef.current = window.setTimeout(() => {
                            vm.messageLongPressTimerRef.current = null;
                            vm.setMessageActionItem(item);
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
                          vm.setMessageActionItem(item);
                        },
                      };

              const systemBubbleClass =
                "rounded-[14px] border border-[color:var(--cm-room-divider)]/90 bg-[color:var(--cm-room-primary-soft)] px-3.5 py-1.5 text-center text-[11px] leading-snug text-[color:var(--cm-room-text-muted)] shadow-[0_1px_3px_rgba(115,96,242,0.08)]";

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
                        <span className={`mt-1 text-[11px] ${mineLight ? "text-white/85" : "text-sam-muted"}`}>전송 중…</span>
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
                            className={`mt-1 text-[12px] ${item.isMine ? "text-white/80" : "text-[color:var(--cm-room-text-muted)]"}`}
                          >
                            {formatFileMeta(item.fileMimeType, item.fileSizeBytes)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3">
                        {item.pending ? (
                          <span className={`text-[12px] ${item.isMine ? "text-sam-muted" : "text-sam-muted"}`}>
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
                            className={`inline-flex rounded-[10px] border px-3 py-2 text-[12px] font-semibold ${
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
                        void vm.requestOutgoingCallFromStub(kind);
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
                            className={`text-[14px] font-semibold leading-snug ${
                              item.isMine ? "text-white" : "text-[color:var(--cm-room-text)]"
                            }`}
                          >
                            {item.callKind === "video" ? vm.t("nav_video_call_label") : vm.t("nav_voice_call_label")}
                          </span>
                          <span
                            className={`text-[11px] font-medium leading-snug ${
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
                        className={`inline-block w-fit max-w-full text-[14px] leading-snug break-keep [overflow-wrap:break-word] ${
                          mineLight ? "text-white" : "text-[color:var(--cm-room-text)]"
                        }`}
                      >
                        {item.content}
                      </p>
                      {item.pending ? (
                        <span
                          className={`shrink-0 text-[11px] ${mineLight ? "text-white/70" : "text-[color:var(--cm-room-text-muted)]"}`}
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
                              className={`inline-flex max-w-[220px] truncate rounded-[10px] border px-2.5 py-1 text-[11px] ${
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

              return (
                <div
                  key={item.id}
                  data-index={virtualRow.index}
                  ref={vm.chatVirtualizer.measureElement}
                  id={`cm-room-msg-${item.id}`}
                  className={`absolute left-0 top-0 w-full pb-2.5 flex scroll-mt-24 ${
                    item.messageType === "system" ? "justify-center" : item.isMine ? "justify-end" : "justify-start"
                  }`}
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {item.messageType === "system" ? (
                    <div className="max-w-[92%] px-2">
                      <div className={systemBubbleClass}>
                        <p className="text-center text-[12px] leading-5">{item.content}</p>
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
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-sam-fg/10 bg-sam-surface text-center text-[14px] font-semibold leading-none text-sam-muted shadow-sm">
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
                          <p className="mb-0.5 max-w-full pl-0.5 text-[12px] font-semibold text-[color:var(--cm-room-primary)]">
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
                              <span className="shrink-0 self-end pb-1 text-[10px] tabular-nums leading-none text-[color:var(--cm-room-text-muted)]">
                                {formatTime(item.createdAt)}
                              </span>
                              {latestReadableMineMessageId === item.id ? (
                                <span className="shrink-0 self-end pb-1 text-[10px] leading-none text-[color:var(--cm-room-text-muted)]">
                                  {peerHasReadMyLatestMessage ? "읽음" : "안읽음"}
                                </span>
                              ) : null}
                              <div
                                className="inline-block w-max max-w-full shrink-0 align-bottom"
                                {...bindMessageInteraction}
                              >
                                <ViberChatBubble isMine={item.isMine} showTail={showBubbleTail}>
                                  {item.messageType === "image" || item.messageType === "sticker" ? (
                                    viberInnerBody
                                  ) : (
                                    <div className="px-3 py-2.5">{viberInnerBody}</div>
                                  )}
                                </ViberChatBubble>
                              </div>
                            </>
                          ) : (
                            <>
                              <div
                                className="inline-block w-max max-w-full shrink-0 align-bottom"
                                {...bindMessageInteraction}
                              >
                                <ViberChatBubble isMine={item.isMine} showTail={showBubbleTail}>
                                  {item.messageType === "image" || item.messageType === "sticker" ? (
                                    viberInnerBody
                                  ) : (
                                    <div className="px-3 py-2.5">{viberInnerBody}</div>
                                  )}
                                </ViberChatBubble>
                              </div>
                              <span className="shrink-0 self-end pb-1 text-[10px] tabular-nums leading-none text-[color:var(--cm-room-text-muted)]">
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
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-sam-fg/10 bg-sam-surface text-center text-[14px] font-semibold leading-none text-sam-muted shadow-sm">
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
            <div className="px-4 py-12 text-center text-[13px] text-[color:var(--cm-room-text-muted)]">
              아직 메시지가 없습니다.
              <br />
              <span className="mt-1 inline-block text-[12px]">첫 인사를 남겨보세요.</span>
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
    </div>
  );
});
