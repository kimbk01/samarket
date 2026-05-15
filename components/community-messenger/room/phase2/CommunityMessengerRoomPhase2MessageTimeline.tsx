"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  communityMessengerRoomIsGloballyUsable,
  type CommunityMessengerMessageActionAnchorRect,
} from "@/lib/community-messenger/types";
import {
  CM_CLUSTER_GAP_MS,
  MESSENGER_TIMELINE_MESSAGES_CAP,
} from "@/lib/community-messenger/room/messenger-room-ui-constants";
import {
  communityMessengerMemberAvatar,
  formatRoomCallStatus,
  formatTime,
} from "@/components/community-messenger/room/community-messenger-room-helpers";
import {
  getCallStubTimelineStatusLine,
  inferResolvedEventFromStoredCallStatus,
} from "@/lib/community-messenger/call-event-message";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
import { MessengerTimelineVirtualRow } from "@/components/community-messenger/room/phase2/MessengerTimelineVirtualRow";
import { MessengerRoomNewMessagesBelowChip } from "@/components/community-messenger/room/MessengerRoomNewMessagesBelowChip";
import { MessengerImageLightbox } from "@/components/community-messenger/room/MessengerImageLightbox";
import {
  messengerRoomReadBlockKeyImageLightbox,
  setMessengerRoomReadBlock,
} from "@/lib/community-messenger/room/messenger-room-read-gate";
import {
  runMessengerRoomOpenFrameBudgetTrace,
  sampleMessengerScrollFrameBudget,
} from "@/lib/community-messenger/monitoring/messenger-frame-budget-trace";
import { MessageReactionRosterSheet } from "@/components/community-messenger/room/message/MessageReactionRosterSheet";
import {
  beginCmRenderTimelineFrame,
  cmRenderAnalysisEnsureSession,
  cmRenderAnalysisEnabled,
  deriveCmRoomRenderReason,
  logCmRenderAnalysis,
  recordCmRenderAnalysisReason,
  recordCmRenderVisibleMessageCount,
} from "@/lib/community-messenger/monitoring/cm-render-analysis";
import {
  cmPolishAnalysisEnabled,
  getCmPolishImageLayoutShiftCount,
  logCmPolishAnalysis,
  takeCmPolishIncomingBubbleVisibleMs,
} from "@/lib/community-messenger/monitoring/cm-polish-analysis";
import {
  cmScrollAnalysisEnabled,
  drainCmScrollVirtualizerRecalcMs,
  logCmScrollAnalysis,
  recordCmScrollVirtualizerMeasure,
} from "@/lib/community-messenger/monitoring/cm-scroll-analysis";
import { useCmRoomPhase2HydrationPass } from "@/lib/community-messenger/room/cm-room-phase2-hydration-context";
import {
  emitCmRoomPass2ViewportLog,
  measureCmPassRenderCommit,
} from "@/lib/community-messenger/room/cm-room-pass-instrumentation";
import {
  hasCmRoomEntryTimingSession,
  registerCmRoomTimingPendingCleanup,
} from "@/lib/community-messenger/room/cm-room-entry-timing-session";
import {
  noteCmRoomSubtreeAttach,
  shouldBlockCmRoomStrictEffectReRun,
} from "@/lib/community-messenger/room/cm-room-subtree-stability";

const CM_ROOM_ENTRY_INITIAL_VIEWPORT_ROWS = 10;

function selectTimelineVirtualRows<T extends { index: number }>(items: T[], hydrationPass: number): T[] {
  if (items.length === 0 || hydrationPass < 2) return items;
  if (hydrationPass >= 3) return items;
  const cap = CM_ROOM_ENTRY_INITIAL_VIEWPORT_ROWS;
  if (items.length <= cap) return items;
  return items.slice(-cap);
}

function messengerTimelineCalendarDayKey(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function messengerTimelineDayDividerLabel(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

export const CommunityMessengerRoomPhase2MessageTimeline = memo(function CommunityMessengerRoomPhase2MessageTimeline() {
  const vm = useMessengerRoomPhase2View();
  const hydrationPass = useCmRoomPhase2HydrationPass();
  const viewportPaintRecordedRef = useRef(false);
  const pass2FirstRowProbeAttachedRef = useRef(false);
  const viewportIoRef = useRef<IntersectionObserver | null>(null);
  const hasTradeDock = Boolean(vm.showMessengerTradeProcessDock);
  const timelineRenderStartRef = useRef(typeof performance !== "undefined" ? performance.now() : 0);
  timelineRenderStartRef.current = typeof performance !== "undefined" ? performance.now() : 0;
  const prevListSigRef = useRef<{ msgLen: number; unread: number; readId: string } | null>(null);
  const prevTimelineMsgLenRef = useRef<number | null>(null);
  const vmRef = useRef(vm);
  vmRef.current = vm;

  if (cmRenderAnalysisEnabled()) {
    cmRenderAnalysisEnsureSession(vm.streamRoomId);
    beginCmRenderTimelineFrame();
  }
  useEffect(() => {
    if (shouldBlockCmRoomStrictEffectReRun(vm.streamRoomId, "timeline_room_reset")) return;
    prevTimelineMsgLenRef.current = null;
    prevListSigRef.current = null;
    viewportPaintRecordedRef.current = false;
    pass2FirstRowProbeAttachedRef.current = false;
    viewportIoRef.current?.disconnect();
    viewportIoRef.current = null;
  }, [vm.streamRoomId]);

  useLayoutEffect(() => {
    if (hydrationPass < 2) return;
    noteCmRoomSubtreeAttach(vm.streamRoomId, "viewport");
    measureCmPassRenderCommit(2, timelineRenderStartRef.current);
  }, [hydrationPass, vm.streamRoomId]);

  const noteViewportVisible = useCallback(
    (payload: {
      visible_rows: number;
      empty_room: boolean;
      first_row_rendered: boolean;
    }) => {
      if (viewportPaintRecordedRef.current) return;
      if (!hasCmRoomEntryTimingSession(vm.streamRoomId)) return;
      viewportPaintRecordedRef.current = true;
      viewportIoRef.current?.disconnect();
      viewportIoRef.current = null;
      const totalRows = vm.displayRoomMessages.length;
      const capped =
        hydrationPass < 3 && totalRows > CM_ROOM_ENTRY_INITIAL_VIEWPORT_ROWS
          ? CM_ROOM_ENTRY_INITIAL_VIEWPORT_ROWS
          : totalRows;
      emitCmRoomPass2ViewportLog({
        visible_rows: payload.visible_rows,
        empty_room: payload.empty_room,
        virtualized: totalRows > capped,
        first_row_rendered: payload.first_row_rendered,
        idle_remaining_rows: Math.max(0, totalRows - payload.visible_rows),
        network_waited: false,
      });
    },
    [hydrationPass, vm.displayRoomMessages.length, vm.streamRoomId]
  );

  const emptyTimelineRecoverTriedRef = useRef(false);
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

  const onOpenImageLightbox = useCallback((urls: string[], originals: string[], index: number) => {
    setImageLightbox({ urls, originals, index });
  }, []);

  const onReactionRosterOpen = useCallback(
    (payload: {
      messageId: string;
      reactionKey: string;
      anchor: CommunityMessengerMessageActionAnchorRect;
    }) => {
      setReactionRoster(payload);
    },
    []
  );

  const shouldRecoverEmptyTimeline = useMemo(() => {
    const hasLastMessageHint = Boolean(vm.snapshot.room.lastMessage?.trim());
    const snapshotHasMessages = vm.snapshot.messages.length > 0;
    return !vm.loading && (hasLastMessageHint || snapshotHasMessages) && vm.roomMessages.length === 0;
  }, [vm.loading, vm.roomMessages.length, vm.snapshot.messages.length, vm.snapshot.room.lastMessage]);

  useEffect(() => {
    if (!shouldRecoverEmptyTimeline) {
      emptyTimelineRecoverTriedRef.current = false;
      return;
    }
    if (emptyTimelineRecoverTriedRef.current) return;
    emptyTimelineRecoverTriedRef.current = true;
    void vm.refresh(true, { triggerReason: "empty_timeline_recover" });
  }, [shouldRecoverEmptyTimeline, vm]);

  /**
   * 내 최신 확정 발화 id + 상대 읽음 커서 비교 — 기존에는 역순 스캔 2회 + `filter(!pending)` 전체 1회가 겹쳤다.
   * 역순 1회로 mine id 확정 후, 읽음 판별에 필요한 두 id만 단일 순방향 스캔으로 찾는다.
   *
   * `readReceipt.lastReadMessageId`(및 created_at 비교)는 Postgres participant 행 외에
   * 서버 broadcast `read_ack` → 부모 스냅샷 패치로도 갱신된다 — 동일 커서로 「안읽음/1」 제거.
   */
  const { latestReadableMineMessageId, peerHasReadMyLatestMessage } = useMemo(() => {
    /** 1:1만 말풍선 옆 읽음/안읽음 — 그룹은 커서 스냅샷이 없어 오표시 방지 */
    if (vm.snapshot.room.roomType !== "direct") {
      return { latestReadableMineMessageId: null, peerHasReadMyLatestMessage: false };
    }

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
    const cursorCreatedAtServer = vm.snapshot.readReceipt?.lastReadMessageCreatedAt?.trim() ?? "";

    if (!readCursor) {
      return { latestReadableMineMessageId: latestMineId, peerHasReadMyLatestMessage: false };
    }
    if (!latestMineId) {
      return { latestReadableMineMessageId: null, peerHasReadMyLatestMessage: false };
    }
    if (readCursor === latestMineId) {
      return { latestReadableMineMessageId: latestMineId, peerHasReadMyLatestMessage: true };
    }

    const firstRowById = new Map<string, (typeof msgs)[number]>();
    for (let i = 0; i < msgs.length; i += 1) {
      const m = msgs[i];
      if (m.pending) continue;
      if (!firstRowById.has(m.id)) {
        firstRowById.set(m.id, m);
      }
      if (firstRowById.has(readCursor) && firstRowById.has(latestMineId)) {
        break;
      }
    }
    const cursorMsg = firstRowById.get(readCursor);
    const mineLatestMsg = firstRowById.get(latestMineId);

    type SnapRow = (typeof vm.snapshot.messages)[number];
    let cMsg: (typeof msgs)[number] | SnapRow | undefined = cursorMsg;
    let mMsg: (typeof msgs)[number] | SnapRow | undefined = mineLatestMsg;
    if (!cMsg || !mMsg) {
      const byId = new Map<string, SnapRow>();
      for (let s = 0; s < vm.snapshot.messages.length; s += 1) {
        const row = vm.snapshot.messages[s]!;
        byId.set(row.id, row);
      }
      cMsg = cMsg ?? byId.get(readCursor);
      mMsg = mMsg ?? byId.get(latestMineId);
    }

    /** 부트스트랩 메시지 창에 상대 읽음 커서 id 가 없을 때 — 서버가 내려준 커서 created_at 으로만 타임라인 비교 */
    if (!cMsg && mMsg && cursorCreatedAtServer) {
      const tb = new Date(mMsg.createdAt).getTime();
      const tc = new Date(cursorCreatedAtServer).getTime();
      if (tc > tb) {
        return { latestReadableMineMessageId: latestMineId, peerHasReadMyLatestMessage: true };
      }
      if (tc < tb) {
        return { latestReadableMineMessageId: latestMineId, peerHasReadMyLatestMessage: false };
      }
      return {
        latestReadableMineMessageId: latestMineId,
        peerHasReadMyLatestMessage: readCursor.localeCompare(latestMineId) >= 0,
      };
    }

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
  }, [
    vm.displayRoomMessages,
    vm.snapshot.messages,
    vm.snapshot.room.roomType,
    vm.snapshot.readReceipt?.lastReadMessageId,
    vm.snapshot.readReceipt?.lastReadMessageCreatedAt,
  ]);

  useLayoutEffect(() => {
    if (!cmRenderAnalysisEnabled()) return;
    const msgLen = vm.displayRoomMessages.length;
    const unread = vm.snapshot.room.unreadCount ?? 0;
    const readId = vm.snapshot.readReceipt?.lastReadMessageId?.trim() ?? "";
    const nextSig = { msgLen, unread, readId };
    const reason = deriveCmRoomRenderReason(prevListSigRef.current, nextSig);
    prevListSigRef.current = nextSig;
    recordCmRenderAnalysisReason(reason);
    const visibleCount = vm.chatVirtualizer.getVirtualItems().length;
    recordCmRenderVisibleMessageCount(visibleCount);
    const prevLen = prevTimelineMsgLenRef.current;
    prevTimelineMsgLenRef.current = msgLen;
    let appended = false;
    if (prevLen !== null && msgLen > prevLen) {
      appended = true;
    }
    const listMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : 0) - timelineRenderStartRef.current
    );
    logCmRenderAnalysis({
      message_list_render_ms: listMs,
      append_message_render_ms: appended ? listMs : null,
      rerender_reason: reason,
      visible_message_count: visibleCount,
    });
  }, [vm.displayRoomMessages.length, vm.snapshot.room.unreadCount, vm.snapshot.readReceipt?.lastReadMessageId, vm.streamRoomId]);

  /**
   * 스크롤은 초당 수십~수백 번 이벤트가 발생할 수 있어, state set 을 그대로 두면
   * 장시간 사용 시 렌더/GC 부담이 누적된다. rAF 로 1프레임 1회만 처리한다.
   * vm 전체를 deps 에 두면 매 렌더마다 onScroll 이 바뀌어 스케줄러가 불안정해지므로 ref 로 최신만 참조.
   */
  const scrollRafRef = useRef<number | null>(null);
  const onScroll = useCallback(() => {
    const v = vmRef.current;
    v.updateStickToBottomFromScroll();
    if (v.messageActionItem) v.setMessageActionItem(null);
    if (v.callStubSheet) v.setCallStubSheet(null);
  }, []);

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

  /** opt-in 프레임 예산 — env 미설정 시 즉시 반환으로 추가 rAF 없음 */
  useLayoutEffect(() => {
    runMessengerRoomOpenFrameBudgetTrace(vm.streamRoomId);
  }, [vm.streamRoomId]);

  const timelineTailLen = vm.displayRoomMessages.length;
  const timelineTailId =
    timelineTailLen > 0 ? String(vm.displayRoomMessages[timelineTailLen - 1]?.id ?? "") : "";

  /** realtime ingest flush 시작 → 타임라인 tail 레이아웃 커밋(상대 메시지일 때만 pending 매칭) */
  useLayoutEffect(() => {
    if (!cmPolishAnalysisEnabled()) return;
    if (!timelineTailId) return;
    const ms = takeCmPolishIncomingBubbleVisibleMs(timelineTailId);
    if (ms == null) return;
    logCmPolishAnalysis({
      incoming_event_to_bubble_visible_ms: ms,
      image_layout_shift_count: getCmPolishImageLayoutShiftCount(),
      room_id_suffix: vm.streamRoomId.length > 8 ? vm.streamRoomId.slice(-8) : vm.streamRoomId,
    });
  }, [timelineTailLen, timelineTailId, vm.streamRoomId]);

  /** 방 전환 직후 짧은 구간의 rAF 지터(전환 프레임 드랍 추정) */
  useEffect(() => {
    if (!cmPolishAnalysisEnabled()) return;
    let frames = 0;
    let drops = 0;
    let last = performance.now();
    let rid = 0;
    const tick = () => {
      const now = performance.now();
      if (now - last > 22) drops += 1;
      last = now;
      frames += 1;
      if (frames < 48) {
        rid = requestAnimationFrame(tick);
      } else {
        logCmPolishAnalysis({
          transition_frame_drop_count: drops,
          room_id_suffix: vm.streamRoomId.length > 8 ? vm.streamRoomId.slice(-8) : vm.streamRoomId,
        });
      }
    };
    rid = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rid);
  }, [vm.streamRoomId]);

  const scheduleScroll = useCallback(() => {
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      onScroll();
      sampleMessengerScrollFrameBudget(vmRef.current.streamRoomId);
    });
  }, [onScroll]);

  /** 가상 행 map 직전: 동일 sender `members.find` 반복을 줄이기 위한 아바타 캐시. cluster 간격 ms 는 가시 행에서만 `item`/`prev`로 계산한다. */
  const cappedVirtualRows = useMemo(
    () => selectTimelineVirtualRows(vm.chatVirtualizer.getVirtualItems(), hydrationPass),
    [vm.chatVirtualizer, hydrationPass, vm.displayRoomMessages.length]
  );

  const attachPass2FirstRowProbe = useCallback(
    (rowEl: HTMLElement | null) => {
      if (!rowEl || hydrationPass < 2 || viewportPaintRecordedRef.current) return;
      if (pass2FirstRowProbeAttachedRef.current) return;
      pass2FirstRowProbeAttachedRef.current = true;
      const root = vm.messagesViewportRef.current;
      if (!root) return;

      const emitFromRow = () => {
        if (viewportPaintRecordedRef.current) return;
        const rootRect = root.getBoundingClientRect();
        const rowRect = rowEl.getBoundingClientRect();
        const intersects =
          rowRect.height > 0 && rowRect.bottom > rootRect.top && rowRect.top < rootRect.bottom;
        if (!intersects) return;
        const visibleCount = selectTimelineVirtualRows(
          vm.chatVirtualizer.getVirtualItems(),
          hydrationPass
        ).length;
        noteViewportVisible({
          visible_rows: Math.max(1, visibleCount),
          empty_room: false,
          first_row_rendered: true,
        });
      };

      if (typeof IntersectionObserver === "undefined") {
        emitFromRow();
        return;
      }
      viewportIoRef.current?.disconnect();
      const obs = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            emitFromRow();
            obs.disconnect();
            if (viewportIoRef.current === obs) viewportIoRef.current = null;
            break;
          }
        },
        { root, threshold: 0.01 }
      );
      viewportIoRef.current = obs;
      obs.observe(rowEl);
    },
    [hydrationPass, noteViewportVisible, vm.chatVirtualizer, vm.messagesViewportRef]
  );

  useLayoutEffect(() => {
    if (hydrationPass < 2 || viewportPaintRecordedRef.current) return;
    if (!hasCmRoomEntryTimingSession(vm.streamRoomId)) return;
    const root = vm.messagesViewportRef.current;
    if (!root) return;

    if (vm.displayRoomMessages.length === 0) {
      noteViewportVisible({ visible_rows: 0, empty_room: true, first_row_rendered: false });
      return;
    }

    if (cappedVirtualRows.length <= 0) return;

    let raf = 0;
    raf = window.requestAnimationFrame(() => {
      if (viewportPaintRecordedRef.current || !hasCmRoomEntryTimingSession(vm.streamRoomId)) return;
      const count = cappedVirtualRows.length;
      if (count <= 0) return;
      const firstRow = root.querySelector("[data-cm-timeline-message-row]");
      if (firstRow instanceof HTMLElement) {
        attachPass2FirstRowProbe(firstRow);
        return;
      }
      noteViewportVisible({
        visible_rows: count,
        empty_room: false,
        first_row_rendered: count > 0,
      });
    });
    const unregister = registerCmRoomTimingPendingCleanup(() => {
      if (raf) window.cancelAnimationFrame(raf);
      viewportIoRef.current?.disconnect();
      viewportIoRef.current = null;
    });
    return () => {
      unregister();
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [
    attachPass2FirstRowProbe,
    cappedVirtualRows.length,
    hydrationPass,
    noteViewportVisible,
    vm.displayRoomMessages.length,
    vm.messagesViewportRef,
    vm.streamRoomId,
  ]);

  useEffect(() => {
    if (hydrationPass < 2 || viewportPaintRecordedRef.current) return;
    if (vm.displayRoomMessages.length === 0) return;
    if (!hasCmRoomEntryTimingSession(vm.streamRoomId)) return;
    let timeout = 0;
    timeout = window.setTimeout(() => {
      if (viewportPaintRecordedRef.current || !hasCmRoomEntryTimingSession(vm.streamRoomId)) return;
      const items = selectTimelineVirtualRows(vm.chatVirtualizer.getVirtualItems(), hydrationPass);
      if (items.length <= 0) return;
      noteViewportVisible({
        visible_rows: items.length,
        empty_room: false,
        first_row_rendered: false,
      });
    }, 480);
    const unregister = registerCmRoomTimingPendingCleanup(() => {
      if (timeout) window.clearTimeout(timeout);
    });
    return () => {
      unregister();
      if (timeout) window.clearTimeout(timeout);
    };
  }, [hydrationPass, noteViewportVisible, vm.chatVirtualizer, vm.displayRoomMessages.length, vm.streamRoomId]);

  const messageRowPreamble = useMemo(() => {
    const avatarBySenderId = new Map<string, ReturnType<typeof communityMessengerMemberAvatar>>();
    const peerAvatarFor = (senderId: string | null | undefined) => {
      if (!senderId) return null;
      if (avatarBySenderId.has(senderId)) return avatarBySenderId.get(senderId) ?? null;
      const v = communityMessengerMemberAvatar(vm.roomMembersDisplay, senderId);
      avatarBySenderId.set(senderId, v);
      return v;
    };
    return { peerAvatarFor };
  }, [vm.roomMembersDisplay]);

  const virtualizerScrollTraceRafRef = useRef<number | null>(null);
  const scheduleVirtualizerScrollTraceDrain = useCallback(() => {
    if (!cmScrollAnalysisEnabled()) return;
    if (virtualizerScrollTraceRafRef.current != null) return;
    virtualizerScrollTraceRafRef.current = window.requestAnimationFrame(() => {
      virtualizerScrollTraceRafRef.current = null;
      const { virtualizer_recalc_ms, measure_calls } = drainCmScrollVirtualizerRecalcMs();
      if (measure_calls <= 0 || virtualizer_recalc_ms == null) return;
      logCmScrollAnalysis({
        virtualizer_recalc_ms,
        auto_scroll_triggered: false,
        auto_scroll_reason: "virtualizer_measure_batch",
        room_id_suffix: vm.streamRoomId.length > 8 ? vm.streamRoomId.slice(-8) : vm.streamRoomId,
      });
    });
  }, [vm.streamRoomId]);

  useEffect(() => {
    return () => {
      if (virtualizerScrollTraceRafRef.current != null) {
        cancelAnimationFrame(virtualizerScrollTraceRafRef.current);
        virtualizerScrollTraceRafRef.current = null;
      }
    };
  }, []);

  const measureWithScrollTrace = useCallback(
    (el: HTMLElement | null) => {
      if (!cmScrollAnalysisEnabled()) {
        vm.chatVirtualizer.measureElement(el);
        return;
      }
      const t0 = performance.now();
      vm.chatVirtualizer.measureElement(el);
      recordCmScrollVirtualizerMeasure(performance.now() - t0);
      scheduleVirtualizerScrollTraceDrain();
    },
    [vm.chatVirtualizer, scheduleVirtualizerScrollTraceDrain]
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={vm.messagesViewportRef}
        data-cm-line-timeline
        data-cm-message-viewport=""
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-[color:var(--cm-room-chat-bg)]"
        style={{
          scrollPaddingBottom: hasTradeDock
            ? "var(--cm-timeline-trade-anchor-padding, 6px)"
            : "var(--chat-composer-height, 0px)",
        }}
        onScroll={scheduleScroll}
      >
        <main
          className={`mx-auto w-full max-w-[760px] space-y-2.5 px-3 py-3 sm:px-4 ${
            hasTradeDock ? "pb-1.5" : "pb-[76px]"
          }`}
        >
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
              {cappedVirtualRows.map((virtualRow, cappedMapIndex) => {
                const index = virtualRow.index;
                const item = vm.displayRoomMessages[index];
                if (!item) return null;
                const prev = index > 0 ? vm.displayRoomMessages[index - 1] : null;
                const next = index < vm.displayRoomMessages.length - 1 ? vm.displayRoomMessages[index + 1] : null;
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
                const showPeerName =
                  !item.isMine &&
                  item.messageType !== "system" &&
                  (!prev ||
                    prev.messageType === "system" ||
                    prev.isMine ||
                    peerSenderChanged ||
                    isNewClusterFromTime);
                const nextGapMs =
                  next && next.messageType !== "system" && item.messageType !== "system"
                    ? Math.max(0, new Date(next.createdAt).getTime() - new Date(item.createdAt).getTime())
                    : 0;
                const isClusterEndFromTime = nextGapMs > CM_CLUSTER_GAP_MS;
                const nextSenderChanged =
                  !!next &&
                  next.messageType !== "system" &&
                  item.messageType !== "system" &&
                  (next.isMine !== item.isMine ||
                    (vm.isGroupRoom && (next.senderId ?? "") !== (item.senderId ?? "")));
                const showPeerAvatar =
                  !item.isMine &&
                  item.messageType !== "system" &&
                  showPeerName;
                const peerAvatar = !item.isMine ? messageRowPreamble.peerAvatarFor(item.senderId) : null;
                const mineUnreadBadgeVisible =
                  item.isMine &&
                  item.messageType !== "system" &&
                  latestReadableMineMessageId === item.id &&
                  !peerHasReadMyLatestMessage;
                const showMineClusterStart =
                  item.isMine &&
                  item.messageType !== "system" &&
                  (!prev ||
                    prev.messageType === "system" ||
                    !prev.isMine ||
                    isNewClusterFromTime ||
                    (vm.isGroupRoom && (prev.senderId ?? "") !== (item.senderId ?? "")));
                const showMineClusterEnd =
                  item.isMine &&
                  item.messageType !== "system" &&
                  (!next || next.messageType === "system" || nextSenderChanged || isClusterEndFromTime);
                const showBubbleTail = item.isMine ? showMineClusterStart : showPeerName;
                const isDayBoundary =
                  !prev ||
                  messengerTimelineCalendarDayKey(prev.createdAt) !== messengerTimelineCalendarDayKey(item.createdAt);
                const dayDividerLabel = isDayBoundary ? messengerTimelineDayDividerLabel(item.createdAt) : null;
                const sameSenderCluster =
                  !!prev &&
                  prev.messageType !== "system" &&
                  item.messageType !== "system" &&
                  prev.isMine === item.isMine &&
                  (!vm.isGroupRoom || (prev.senderId ?? "") === (item.senderId ?? ""));
                const rowPaddingTopClass = isDayBoundary
                  ? "pt-4"
                  : showPeerName
                    ? "pt-3.5"
                    : prev
                      ? sameSenderCluster
                        ? "pt-1"
                        : "pt-3"
                      : "";
                const showMessageTime =
                  item.messageType !== "system" &&
                  (!next ||
                    next.messageType === "system" ||
                    next.isMine !== item.isMine ||
                    (vm.isGroupRoom && (next.senderId ?? "") !== (item.senderId ?? "")) ||
                    formatTime(next.createdAt) !== formatTime(item.createdAt));

                const stubBusy =
                  item.messageType === "call_stub" &&
                  (vm.roomUnavailable ||
                    (vm.busy != null && String(vm.busy).startsWith("managed-call:")) ||
                    vm.call.busy === "call-start" ||
                    vm.call.busy === "device-prepare" ||
                    vm.call.busy === "call-accept");

                return (
                  <MessengerTimelineVirtualRow
                    key={item.id}
                    item={item}
                    virtualStart={virtualRow.start}
                    virtualIndex={virtualRow.index}
                    measureElement={
                      cappedMapIndex === 0
                        ? (el) => {
                            measureWithScrollTrace(el);
                            attachPass2FirstRowProbe(el);
                          }
                        : measureWithScrollTrace
                    }
                    rowPaddingTopClass={rowPaddingTopClass}
                    showPeerName={showPeerName}
                    showPeerAvatar={showPeerAvatar}
                    showBubbleTail={showBubbleTail}
                    showMessageTime={showMessageTime}
                    dayDividerLabel={dayDividerLabel}
                    peerAvatar={peerAvatar}
                    streamRoomId={vm.streamRoomId}
                    mineUnreadBadgeVisible={mineUnreadBadgeVisible}
                    timelineHighlightMessageId={vm.timelineHighlightMessageId}
                    messageActionItemId={vm.messageActionItem?.item.id ?? null}
                    callStubSheetItemId={vm.callStubSheet?.item.id ?? null}
                    linkPreviewEnabled={vm.roomPreferences.linkPreviewEnabled}
                    mediaAutoSaveEnabled={vm.roomPreferences.mediaAutoSaveEnabled}
                    sendingLabel={vm.t("common_sending")}
                    voiceCallLabel={vm.t("nav_voice_call_label")}
                    videoCallLabel={vm.t("nav_video_call_label")}
                    callStatusLabel={
                      item.messageType === "call_stub"
                        ? getCallStubTimelineStatusLine({
                            callKind: item.callKind ?? "voice",
                            resolvedEvent: inferResolvedEventFromStoredCallStatus(item.callStatus),
                            callStatusFallback: item.callStatus,
                            viewerUserId: vm.snapshot.viewerUserId ?? "",
                            senderUserId: item.senderId,
                          })
                        : vm.tt(formatRoomCallStatus(item.callStatus))
                    }
                    stubBusy={stubBusy}
                    senderLabelDisplay={vm.tt(item.senderLabel)}
                    onOpenImageLightbox={onOpenImageLightbox}
                    onReactionRosterOpen={onReactionRosterOpen}
                    setMessageActionItem={vm.setMessageActionItem}
                    setCallStubSheet={vm.setCallStubSheet}
                    messageLongPressTimerRef={vm.messageLongPressTimerRef}
                    messageLongPressItemRef={vm.messageLongPressItemRef}
                    focusTimelineMessage={vm.focusTimelineMessage}
                    openCallStubOutgoingConfirm={vm.openCallStubOutgoingConfirm}
                    tt={vm.tt}
                  />
                );
              })}
            </div>
          ) : vm.snapshot.clientShellPlaceholder ? (
            <div className="space-y-3 px-6 py-10" aria-busy="true" aria-label="대화 불러오는 중">
              <div className="h-3 w-[72%] max-w-sm animate-pulse rounded-full bg-[color:var(--cm-room-divider)]" />
              <div className="h-3 w-[88%] max-w-md animate-pulse rounded-full bg-[color:var(--cm-room-divider)]" />
              <div className="h-3 w-[56%] max-w-xs animate-pulse rounded-full bg-[color:var(--cm-room-divider)]" />
            </div>
          ) : (
            <div className="px-4 py-12 text-center sam-text-body-secondary text-[color:var(--cm-room-text-muted)]">
              {shouldRecoverEmptyTimeline ? (
                <>
                  대화 내용을 동기화하는 중입니다.
                  <br />
                  <span className="mt-1 inline-block sam-text-helper">잠시만 기다려 주세요.</span>
                </>
              ) : (
                <>
                  아직 메시지가 없습니다.
                  <br />
                  <span className="mt-1 inline-block sam-text-helper">첫 인사를 남겨보세요.</span>
                </>
              )}
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
        onClose={() => setImageLightbox((prev) => (prev === null ? prev : null))}
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
        onClose={() => setReactionRoster((prev) => (prev === null ? prev : null))}
      />
    </div>
  );
});
