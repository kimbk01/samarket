"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  communityMessengerRoomIsGloballyUsable,
  type CommunityMessengerMessage,
  type CommunityMessengerMessageActionAnchorRect,
} from "@/lib/community-messenger/types";
import {
  CM_CLUSTER_GAP_MS,
} from "@/lib/community-messenger/room/messenger-room-ui-constants";
import {
  communityMessengerMemberAvatar,
  communityMessengerMessageSearchText,
  formatRoomCallStatus,
  formatTime,
} from "@/components/community-messenger/room/community-messenger-room-helpers";
import { GroupPinnedMessageBanner } from "@/components/community-messenger/group/GroupPinnedMessageBanner";
import { useGroupMessageReadCounts } from "@/lib/community-messenger/group/use-group-message-read-counts";
import { stripMentionTokensForPreview } from "@/lib/community-messenger/group/group-room-mention-parser";
import {
  getCallStubTimelineStatusLine,
  inferResolvedEventFromStoredCallStatus,
} from "@/lib/community-messenger/call-event-message";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
import { MessengerRoomMessageListHost } from "@/components/community-messenger/room/MessengerRoomMessageListHost";
import { MessengerTimelineVirtualRow } from "@/components/community-messenger/room/phase2/MessengerTimelineVirtualRow";
import { MessengerRoomNewMessagesBelowChip } from "@/components/community-messenger/room/MessengerRoomNewMessagesBelowChip";
import { StoreDeliveryBufferingSpinner } from "@/components/stores/StoreDeliveryBufferingSpinner";
import { shouldShowMessengerRoomTimelineHydrationSkeleton, shouldShowMessengerRoomTimelineEmptyState } from "@/lib/community-messenger/room/messenger-room-timeline-hydration";
import { snapshotMessengerRoomTimelineViewportProbe } from "@/lib/community-messenger/room/messenger-room-entry-scroll-ready";
import {
  buildMessengerRoomTimelinePaintModel,
  estimateMessengerRoomTimelineTotalHeight,
  selectMessengerRoomVirtualRows,
} from "@/lib/community-messenger/room/messenger-room-timeline-paint-model";
import { resolveMessengerRoomTimelineLoadUi } from "@/lib/community-messenger/room/messenger-room-timeline-load-ui";
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
import { MessengerOutgoingCallConfirmDialog } from "@/components/community-messenger/MessengerOutgoingCallConfirmDialog";
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
  shouldSkipCmRoomSubtreeSurfaceAttach,
} from "@/lib/community-messenger/room/cm-room-subtree-stability";
import { entryTimingT0 } from "@/lib/community-messenger/room/cm-room-entry-timing";
import { resolveMessengerTimelineRowPaddingTopClass } from "@/lib/community-messenger/room/messenger-room-timeline-row-spacing";

import { MESSENGER_TIMELINE_VIRTUAL_ESTIMATE_PX } from "@/lib/community-messenger/room/messenger-room-ui-constants";
import { roomHasStoreOrderTimelineMessages } from "@/lib/store-order-chat/collapse-duplicate-order-summaries";
import { estimateMessengerTimelineRowPx } from "@/lib/store-order-chat/messenger-timeline-row-estimate";
import {
  resolveUseDirectMessengerTimelineLayout,
  scheduleMessengerScrollToBottomAfterRowsPainted,
} from "@/lib/community-messenger/room/messenger-timeline-layout-mode";
import {
  logCmTimelineLayoutModeChanged,
  logCmVirtualizerUpgradeBegin,
  logCmVirtualizerUpgradeCommit,
  markMessengerRoomLayoutSettling,
} from "@/lib/community-messenger/room/messenger-room-entry-scroll-owner";
import { useDeliveryRoomMessageSenderLabel } from "@/lib/store-order-chat/use-delivery-room-message-sender-label";
import { useMessengerTypingStore } from "@/lib/community-messenger/stores/useMessengerTypingStore";
import {
  noteCmRoomR5TimelineComponentMount,
  noteCmRoomR5TimelineFirstRowDom,
} from "@/lib/community-messenger/room/cm-room-r5-timeline-mount-instrumentation";
import { recordCmRoomDomFirstMessageVisible } from "@/lib/community-messenger/room/cm-room-r6-display-ready-instrumentation";
import {
  noteCmRoomR7FirstRowCommitBegin,
  noteCmRoomR7FirstRowCommitEnd,
  noteCmRoomR7TimelineMountBegin,
  noteCmRoomR7TimelineRowsPrepare,
  resolveCmRoomRenderSource,
  sliceTimelineEntryPaintMessages,
} from "@/lib/community-messenger/room/cm-room-r7-first-row-commit-instrumentation";
import { noteTradeChatRoomFirstMessageReadyForShellBreakdown } from "@/lib/trade/trade-chat-room-shell-breakdown-perf";

const CM_ROOM_ENTRY_INITIAL_VIEWPORT_ROWS = 10;
/** R10 — direct tail 유지·upgrade 측정 상한(전체 measureElement 금지) */
const CM_R10_UPGRADE_TAIL_ROWS = 12;
const CM_R10_UPGRADE_MEASURE_CAP = 12;

type CmR9UpgradeBlockerReason =
  | "virtualizer_measure_batch"
  | "scroll_anchor_restore"
  | "row_component_render"
  | "avatar_profile_cluster"
  | "media_or_link_preview"
  | "rows_identity_replace"
  | "layout_effect_loop"
  | "unknown";

type CmR10UpgradeBlocker =
  | "row_map_cost"
  | "measurement_cost"
  | "scroll_anchor_cost"
  | "state_replace_cost"
  | "heavy_row_component_cost"
  | "layout_thrash"
  | "unknown";

type CmR10UpgradeStage = "idle" | "scheduled" | "metadata" | "virtualized" | "done";

type CmR9UpgradeState = {
  active: boolean;
  upgradeStage: CmR10UpgradeStage;
  virtualizerUpgradeScheduledMs: number | null;
  virtualizerUpgradeBeginMs: number | null;
  virtualizerUpgradeStartMs: number | null;
  virtualizerUpgradeCommitStartMs: number | null;
  virtualizerUpgradeCommitEndMs: number | null;
  virtualizerMeasureBeginMs: number | null;
  virtualizerMeasureEndMs: number | null;
  virtualizerRowMapStartMs: number | null;
  virtualizerRowMapEndMs: number | null;
  scrollAnchorRestoreBeginMs: number | null;
  scrollAnchorRestoreEndMs: number | null;
  virtualizerScrollAnchorStartMs: number | null;
  virtualizerScrollAnchorEndMs: number | null;
  rowsBeforeUpgradeCount: number;
  rowsAfterUpgradeCount: number;
  virtualItemsCount: number;
  rowMeasureCount: number;
  measureCapSkippedCount: number;
  avatarRenderCount: number;
  mediaDeferCount: number;
  linkPreviewDeferCount: number;
  rowsIdentityReplaceCount: number;
  layoutEffectCount: number;
  upgradeBlockerReason: CmR9UpgradeBlockerReason;
  virtualizerUpgradeBlocker: CmR10UpgradeBlocker;
  scrollAnchorDeferred: boolean;
  scrollAnchorAppliedOnce: boolean;
};

function createEmptyCmR9UpgradeState(): CmR9UpgradeState {
  return {
    active: false,
    upgradeStage: "idle",
    virtualizerUpgradeScheduledMs: null,
    virtualizerUpgradeBeginMs: null,
    virtualizerUpgradeStartMs: null,
    virtualizerUpgradeCommitStartMs: null,
    virtualizerUpgradeCommitEndMs: null,
    virtualizerMeasureBeginMs: null,
    virtualizerMeasureEndMs: null,
    virtualizerRowMapStartMs: null,
    virtualizerRowMapEndMs: null,
    scrollAnchorRestoreBeginMs: null,
    scrollAnchorRestoreEndMs: null,
    virtualizerScrollAnchorStartMs: null,
    virtualizerScrollAnchorEndMs: null,
    rowsBeforeUpgradeCount: 0,
    rowsAfterUpgradeCount: 0,
    virtualItemsCount: 0,
    rowMeasureCount: 0,
    measureCapSkippedCount: 0,
    avatarRenderCount: 0,
    mediaDeferCount: 0,
    linkPreviewDeferCount: 0,
    rowsIdentityReplaceCount: 0,
    layoutEffectCount: 0,
    upgradeBlockerReason: "unknown",
    virtualizerUpgradeBlocker: "unknown",
    scrollAnchorDeferred: true,
    scrollAnchorAppliedOnce: false,
  };
}

function syncCmR10ScrollAnchorFields(st: CmR9UpgradeState): void {
  if (st.scrollAnchorRestoreBeginMs != null && st.virtualizerScrollAnchorStartMs == null) {
    st.virtualizerScrollAnchorStartMs = st.scrollAnchorRestoreBeginMs;
  }
  if (st.scrollAnchorRestoreEndMs != null && st.virtualizerScrollAnchorEndMs == null) {
    st.virtualizerScrollAnchorEndMs = st.scrollAnchorRestoreEndMs;
  }
}

function classifyCmR10UpgradeBlocker(st: CmR9UpgradeState): CmR10UpgradeBlocker {
  syncCmR10ScrollAnchorFields(st);
  const rowMapSpanMs =
    st.virtualizerRowMapStartMs != null && st.virtualizerRowMapEndMs != null
      ? Math.max(0, st.virtualizerRowMapEndMs - st.virtualizerRowMapStartMs)
      : 0;
  const measureSpanMs =
    st.virtualizerMeasureBeginMs != null && st.virtualizerMeasureEndMs != null
      ? Math.max(0, st.virtualizerMeasureEndMs - st.virtualizerMeasureBeginMs)
      : 0;
  const scrollSpanMs =
    st.virtualizerScrollAnchorStartMs != null && st.virtualizerScrollAnchorEndMs != null
      ? Math.max(0, st.virtualizerScrollAnchorEndMs - st.virtualizerScrollAnchorStartMs)
      : 0;
  if (rowMapSpanMs >= 80) return "row_map_cost";
  if (measureSpanMs >= 120 || st.rowMeasureCount >= CM_R10_UPGRADE_MEASURE_CAP) return "measurement_cost";
  if (scrollSpanMs >= 120) return "scroll_anchor_cost";
  if (st.rowsIdentityReplaceCount > 1) return "state_replace_cost";
  if (st.avatarRenderCount >= 8 || st.mediaDeferCount > 0 || st.linkPreviewDeferCount > 0) {
    return "heavy_row_component_cost";
  }
  if (st.layoutEffectCount >= 10) return "layout_thrash";
  if (st.rowMeasureCount > 0) return "measurement_cost";
  return "unknown";
}

function scheduleCmR10IdleWork(cb: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(cb, { timeout: 48 });
    return () => cancelIdleCallback(id);
  }
  const id = requestAnimationFrame(cb);
  return () => cancelAnimationFrame(id);
}

function pushCmR8PerfEvent(roomId: string, event: string, payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const id = roomId.trim();
  if (!id) return;
  const t0 = entryTimingT0();
  const tMs = t0 > 0 && typeof performance !== "undefined" ? Math.round(performance.now() - t0) : null;
  const row = {
    event,
    room_id_suffix: id.length <= 8 ? id : id.slice(-8),
    t_ms: tMs,
    ...payload,
  };
  const bag = window.__cmPerfEvents ?? [];
  bag.push(row);
  window.__cmPerfEvents = bag;
  // eslint-disable-next-line no-console -- R8 timeline rows lifecycle trace
  console.log("[cm-room-r8-timeline-rows]", JSON.stringify(row));
}

declare global {
  interface Window {
    __cmR9UpgradeStateByRoom?: Record<string, CmR9UpgradeState>;
  }
}

function nowFromT0Ms(): number | null {
  const t0 = entryTimingT0();
  if (t0 <= 0 || typeof performance === "undefined") return null;
  return Math.round(performance.now() - t0);
}

function getCmR9State(roomId: string): CmR9UpgradeState {
  if (typeof window === "undefined") {
    return createEmptyCmR9UpgradeState();
  }
  const id = roomId.trim();
  const bag = (window.__cmR9UpgradeStateByRoom ??= {});
  if (!bag[id]) {
    bag[id] = createEmptyCmR9UpgradeState();
  }
  return bag[id]!;
}

export function isCmR10VirtualizerUpgradeActive(roomId: string): boolean {
  if (typeof window === "undefined") return false;
  const st = window.__cmR9UpgradeStateByRoom?.[roomId.trim()];
  return Boolean(st?.active);
}

type CmR11FirstRowBlocker =
  | "rows_prepare_cost"
  | "row_map_cost"
  | "first_row_component_cost"
  | "ref_attach_delay"
  | "layout_effect_delay"
  | "dom_query_delay"
  | "none_ref_path"
  | "none_intersection_path"
  | "row_not_found_no_rows"
  | "row_not_found_parent_hidden"
  | "row_not_found_query_too_early"
  | "row_not_found_selector_mismatch"
  | "row_not_found_unknown"
  | "parent_hidden_gate"
  | "scheduler_delay"
  | "unknown";

type CmR11FirstRowVisibleSource =
  | "ref_callback"
  | "intersection_observer"
  | "layout_effect"
  | "dom_query"
  | "direct_probe";

type CmR11FirstRowQueryResult = "found" | "not_found" | "skipped";
type CmR16ForcedCase = "parent_hidden" | "query_too_early" | "selector_mismatch" | null;

type CmR11FirstRowTrace = {
  rowsPrepareStartMs: number | null;
  rowsPrepareEndMs: number | null;
  rowsPrepareSource: string | null;
  rowMapStartMs: number | null;
  rowMapEndMs: number | null;
  firstRowRenderStartMs: number | null;
  firstRowRenderEndMs: number | null;
  firstRowRefAttachMs: number | null;
  firstRowLayoutEffectMs: number | null;
  firstRowDomQueryStartMs: number | null;
  firstRowDomQueryEndMs: number | null;
  firstRowCommitSpanSource: "direct_row" | "layout_effect_fallback" | "query_fallback" | "no_row_fallback" | null;
  firstRowVisibleSource: CmR11FirstRowVisibleSource | null;
  firstRowVisibleMs: number | null;
  firstRowQueryAttempted: boolean;
  firstRowQueryAttemptCount: number;
  firstRowQuerySelector: string | null;
  forcedCase: CmR16ForcedCase;
  firstRowQueryResult: CmR11FirstRowQueryResult;
  firstRowContainerFound: boolean;
  firstRowParentHidden: boolean;
  firstRowRowsCountAtQuery: number;
  firstRowRowsCountAtLayoutEffect: number;
  firstRowCommitSpanMs: number | null;
  firstRowBlocker: CmR11FirstRowBlocker;
  firstRowBlockerReason: string;
  parentHiddenGate: boolean;
};

function createEmptyCmR11FirstRowTrace(): CmR11FirstRowTrace {
  return {
    rowsPrepareStartMs: null,
    rowsPrepareEndMs: null,
    rowsPrepareSource: null,
    rowMapStartMs: null,
    rowMapEndMs: null,
    firstRowRenderStartMs: null,
    firstRowRenderEndMs: null,
    firstRowRefAttachMs: null,
    firstRowLayoutEffectMs: null,
    firstRowDomQueryStartMs: null,
    firstRowDomQueryEndMs: null,
    firstRowCommitSpanSource: null,
    firstRowVisibleSource: null,
    firstRowVisibleMs: null,
    firstRowQueryAttempted: false,
    firstRowQueryAttemptCount: 0,
    firstRowQuerySelector: null,
    forcedCase: null,
    firstRowQueryResult: "skipped",
    firstRowContainerFound: false,
    firstRowParentHidden: false,
    firstRowRowsCountAtQuery: 0,
    firstRowRowsCountAtLayoutEffect: 0,
    firstRowCommitSpanMs: null,
    firstRowBlocker: "unknown",
    firstRowBlockerReason: "unclassified",
    parentHiddenGate: false,
  };
}

function classifyCmR11FirstRowBlocker(trace: CmR11FirstRowTrace): CmR11FirstRowBlocker {
  const rowsPrepareCost =
    trace.rowsPrepareStartMs != null && trace.rowsPrepareEndMs != null
      ? Math.max(0, trace.rowsPrepareEndMs - trace.rowsPrepareStartMs)
      : 0;
  const rowMapCost =
    trace.rowMapStartMs != null && trace.rowMapEndMs != null
      ? Math.max(0, trace.rowMapEndMs - trace.rowMapStartMs)
      : 0;
  const componentCost =
    trace.firstRowRenderStartMs != null && trace.firstRowRenderEndMs != null
      ? Math.max(0, trace.firstRowRenderEndMs - trace.firstRowRenderStartMs)
      : 0;
  const refAttachDelay =
    trace.firstRowRenderEndMs != null && trace.firstRowRefAttachMs != null
      ? Math.max(0, trace.firstRowRefAttachMs - trace.firstRowRenderEndMs)
      : 0;
  const layoutEffectDelay =
    trace.firstRowRefAttachMs != null && trace.firstRowLayoutEffectMs != null
      ? Math.max(0, trace.firstRowLayoutEffectMs - trace.firstRowRefAttachMs)
      : 0;
  const domQueryDelay =
    trace.firstRowDomQueryStartMs != null && trace.firstRowDomQueryEndMs != null
      ? Math.max(0, trace.firstRowDomQueryEndMs - trace.firstRowDomQueryStartMs)
      : 0;
  const schedulerDelay =
    trace.rowsPrepareEndMs != null && trace.firstRowRenderStartMs != null
      ? Math.max(0, trace.firstRowRenderStartMs - trace.rowsPrepareEndMs)
      : 0;

  if (trace.firstRowQueryResult === "not_found") {
    if (trace.forcedCase === "parent_hidden") return "row_not_found_parent_hidden";
    if (trace.forcedCase === "query_too_early") return "row_not_found_query_too_early";
    if (trace.forcedCase === "selector_mismatch") return "row_not_found_selector_mismatch";
    if (trace.firstRowRowsCountAtQuery <= 0 && trace.firstRowRowsCountAtLayoutEffect <= 0) {
      return "row_not_found_no_rows";
    }
    if (trace.firstRowParentHidden) return "row_not_found_parent_hidden";
    if (trace.firstRowQueryAttempted && trace.firstRowRowsCountAtLayoutEffect > 0 && trace.firstRowRowsCountAtQuery === 0) {
      return "row_not_found_query_too_early";
    }
    if (
      trace.firstRowQuerySelector != null &&
      trace.firstRowQuerySelector !== "[data-cm-timeline-message-row]"
    ) {
      return "row_not_found_selector_mismatch";
    }
    return "row_not_found_unknown";
  }
  if (trace.parentHiddenGate || trace.firstRowParentHidden) return "parent_hidden_gate";
  if (rowsPrepareCost >= 80) return "rows_prepare_cost";
  if (rowMapCost >= 80) return "row_map_cost";
  if (componentCost >= 80) return "first_row_component_cost";
  if (refAttachDelay >= 80) return "ref_attach_delay";
  if (layoutEffectDelay >= 80) return "layout_effect_delay";
  if (domQueryDelay >= 80) return "dom_query_delay";
  if (schedulerDelay >= 80) return "scheduler_delay";
  if (
    (trace.firstRowVisibleSource === "ref_callback" || trace.firstRowVisibleSource === "direct_probe") &&
    trace.firstRowQueryResult === "skipped"
  ) {
    return "none_ref_path";
  }
  if (trace.firstRowVisibleSource === "intersection_observer") return "none_intersection_path";
  return "unknown";
}

function resolveCmR16ForcedCase(): CmR16ForcedCase {
  if (typeof window === "undefined") return null;
  const fromStorage = (() => {
    try {
      return window.localStorage.getItem("cm.r16.forceRowNotFoundCase");
    } catch {
      return null;
    }
  })();
  const fromQuery = (() => {
    try {
      return new URLSearchParams(window.location.search).get("cmR16ForceRowNotFoundCase");
    } catch {
      return null;
    }
  })();
  const raw = (fromStorage ?? fromQuery ?? "").trim().toLowerCase();
  if (raw === "parent_hidden" || raw === "query_too_early" || raw === "selector_mismatch") return raw;
  return null;
}

function selectTimelineVirtualRows<T extends { index: number }>(items: T[], hydrationPass: number): T[] {
  if (items.length === 0 || hydrationPass < 2) return items;
  if (hydrationPass >= 3) return items;
  const cap = CM_ROOM_ENTRY_INITIAL_VIEWPORT_ROWS;
  if (items.length <= cap) return items;
  return items.slice(-cap);
}

/** virtualizer scroll root 미부착 시 tail 행 — DO NOT: 주문·배달 방 단독 렌더 경로로 쓰지 말 것(resolveUseDirectMessengerTimelineLayout 우선). */
function buildTimelineFallbackVirtualRows(
  messages: ReadonlyArray<{ messageType: CommunityMessengerMessage["messageType"]; content: string; metadata?: CommunityMessengerMessage["metadata"] }>,
  hydrationPass: number
): Array<{ index: number; start: number }> {
  const messageCount = messages.length;
  if (messageCount <= 0) return [];
  if (hydrationPass < 2) return [];
  const cap = hydrationPass >= 3 ? messageCount : Math.min(messageCount, CM_ROOM_ENTRY_INITIAL_VIEWPORT_ROWS);
  const startIndex = Math.max(0, messageCount - cap);
  const rows: Array<{ index: number; start: number }> = [];
  let offset = 0;
  for (let i = startIndex; i < messageCount; i += 1) {
    rows.push({ index: i, start: offset });
    offset += estimateMessengerTimelineRowPx(messages[i]);
  }
  return rows;
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
  const resolveMessageSenderLabel = useDeliveryRoomMessageSenderLabel(vm);
  const hydrationPass = useCmRoomPhase2HydrationPass();
  const viewportPaintRecordedRef = useRef(false);
  const pass2FirstRowProbeAttachedRef = useRef(false);
  const viewportIoRef = useRef<IntersectionObserver | null>(null);
  const firstNonZeroRowsRecordedRef = useRef(false);
  const rowsReplaceCountRef = useRef(0);
  const rowsPrevRef = useRef<{
    rowsRef: unknown[] | null;
    rowsLen: number;
    source: string;
    directLayout: boolean;
  } | null>(null);
  const stableFirstCommitRowsRef = useRef<Array<(typeof vm.displayRoomMessages)[number]> | null>(null);
  const firstRowTraceRef = useRef<CmR11FirstRowTrace>(createEmptyCmR11FirstRowTrace());
  const firstRowTraceCommittedRef = useRef(false);
  const upgradeScheduleStartedRef = useRef(false);
  const upgradeIdleCancelRef = useRef<(() => void) | null>(null);
  const hasTradeDock = Boolean(vm.showMessengerTradeProcessDock);
  const hasStoreOrderDock = Boolean(vm.showMessengerStoreOrderDock);
  const hasStoreOrderTimeline = useMemo(
    () => roomHasStoreOrderTimelineMessages(vm.displayRoomMessages),
    [vm.displayRoomMessages]
  );
  const pinnedMessageId = vm.isPrivateGroupRoom ? vm.snapshot.room.pinnedMessageId ?? null : null;
  const pinnedMessage = useMemo(() => {
    if (!pinnedMessageId) return null;
    return vm.displayRoomMessages.find((m) => m.id === pinnedMessageId) ?? null;
  }, [pinnedMessageId, vm.displayRoomMessages]);
  const pinnedPreviewText = useMemo(() => {
    if (!pinnedMessageId) return "";
    if (pinnedMessage) {
      const raw = communityMessengerMessageSearchText(pinnedMessage);
      return stripMentionTokensForPreview(raw) || raw.slice(0, 120);
    }
    return "…";
  }, [pinnedMessage, pinnedMessageId]);
  const groupMineMessageIds = useMemo(() => {
    if (!vm.isPrivateGroupRoom) return [] as string[];
    return vm.displayRoomMessages
      .filter((m) => m.isMine && m.messageType !== "system" && !m.pending)
      .slice(-24)
      .map((m) => m.id);
  }, [vm.displayRoomMessages, vm.isPrivateGroupRoom]);
  const { counts: groupReadCounts } = useGroupMessageReadCounts(vm.streamRoomId, groupMineMessageIds);
  /** 거래 도크는 타임라인 안; 배달 주문 chrome·composer는 스크롤 밖 — tail class 분기 */
  const timelineInnerTailClass = hasTradeDock
    ? "chat-timeline-inner--trade"
    : hasStoreOrderDock || hasStoreOrderTimeline
      ? "chat-timeline-inner--store-order"
      : "chat-timeline-inner--messenger";
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
    firstNonZeroRowsRecordedRef.current = false;
    rowsReplaceCountRef.current = 0;
    rowsPrevRef.current = null;
    stableFirstCommitRowsRef.current = null;
    firstRowTraceRef.current = createEmptyCmR11FirstRowTrace();
    firstRowTraceCommittedRef.current = false;
    upgradeScheduleStartedRef.current = false;
    upgradeIdleCancelRef.current?.();
    upgradeIdleCancelRef.current = null;
    if (typeof window !== "undefined" && window.__cmR9UpgradeStateByRoom) {
      delete window.__cmR9UpgradeStateByRoom[vm.streamRoomId];
    }
    viewportIoRef.current?.disconnect();
    viewportIoRef.current = null;
  }, [vm.streamRoomId]);

  useLayoutEffect(() => {
    if (hydrationPass < 2) return;
    noteCmRoomR7TimelineMountBegin(vm.streamRoomId);
    noteCmRoomR5TimelineComponentMount(vm.streamRoomId);
    if (
      !shouldSkipCmRoomSubtreeSurfaceAttach(vm.streamRoomId, "viewport") &&
      !shouldBlockCmRoomStrictEffectReRun(vm.streamRoomId, "viewport_attach")
    ) {
      noteCmRoomSubtreeAttach(vm.streamRoomId, "viewport");
    }
    if (!shouldBlockCmRoomStrictEffectReRun(vm.streamRoomId, "viewport_pass2_measure")) {
      measureCmPassRenderCommit(2, timelineRenderStartRef.current);
    }
  }, [hydrationPass, vm.streamRoomId]);

  const effectiveTimelineMessageCount = Math.max(
    vm.displayRoomMessages.length,
    vm.roomMessages.length
  );

  const recordDomFirstPaintIfNeeded = useCallback(
    (gateReason: "direct_layout_dom_row" | "dom_intersection" | "fallback_visible_rows") => {
      const seedRows = effectiveTimelineMessageCount;
      if (seedRows <= 0) return;
      const recorded = recordCmRoomDomFirstMessageVisible({
        roomId: vm.streamRoomId,
        seedRowsCount: seedRows,
        fmrGateReason: gateReason,
        directLayout: gateReason === "direct_layout_dom_row",
      });
      if (recorded) {
        noteTradeChatRoomFirstMessageReadyForShellBreakdown(vm.displayRoomMessages.length || seedRows);
      }
    },
    [effectiveTimelineMessageCount, vm.displayRoomMessages.length, vm.streamRoomId]
  );

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
      if (payload.first_row_rendered && !payload.empty_room) {
        recordDomFirstPaintIfNeeded("fallback_visible_rows");
      }
      finalizeFirstRowVisibilityTrace(
        "layout_effect",
        payload.first_row_rendered ? "skipped" : "not_found"
      );
      const totalRows = effectiveTimelineMessageCount;
      const capped =
        hydrationPass < 3 && totalRows > CM_ROOM_ENTRY_INITIAL_VIEWPORT_ROWS
          ? CM_ROOM_ENTRY_INITIAL_VIEWPORT_ROWS
          : totalRows;
      const viewportProbe = snapshotMessengerRoomTimelineViewportProbe(
        vm.messagesViewportRef.current,
        vm.chatVirtualizer
      );
      emitCmRoomPass2ViewportLog({
        visible_rows: payload.visible_rows,
        empty_room: payload.empty_room,
        virtualized: totalRows > capped,
        first_row_rendered: payload.first_row_rendered,
        idle_remaining_rows: Math.max(0, totalRows - payload.visible_rows),
        network_waited: false,
        timeline_client_height: viewportProbe.timelineClientHeight,
        timeline_scroll_height: viewportProbe.timelineScrollHeight,
        timeline_row_count: viewportProbe.timelineRowCount,
        offset_parent_null: viewportProbe.offsetParentNull,
        parent_hidden: viewportProbe.parentHidden,
        virtualizer_total_size: viewportProbe.virtualizerTotalSize,
        scroll_top: viewportProbe.scrollTop,
      });
    },
    [
      effectiveTimelineMessageCount,
      finalizeFirstRowVisibilityTrace,
      hydrationPass,
      recordDomFirstPaintIfNeeded,
      vm.streamRoomId,
    ]
  );

  function finalizeFirstRowVisibilityTrace(
    source: CmR11FirstRowVisibleSource,
    queryResult?: CmR11FirstRowQueryResult
  ): void {
    if (firstRowTraceCommittedRef.current) return;
    const trace = firstRowTraceRef.current;
    trace.firstRowVisibleSource = source;
    trace.firstRowVisibleMs = nowFromT0Ms();
    if (queryResult) {
      trace.firstRowQueryResult = queryResult;
    } else if (!trace.firstRowQueryAttempted) {
      trace.firstRowQueryResult = "skipped";
    }
    if (trace.rowsPrepareStartMs == null) {
      trace.rowsPrepareStartMs = trace.rowMapStartMs ?? trace.firstRowLayoutEffectMs ?? nowFromT0Ms();
      if (trace.rowsPrepareSource == null) trace.rowsPrepareSource = "finalize_fallback";
    }
    if (trace.rowsPrepareEndMs == null) {
      trace.rowsPrepareEndMs =
        trace.rowMapEndMs ??
        trace.firstRowLayoutEffectMs ??
        trace.firstRowDomQueryEndMs ??
        trace.firstRowVisibleMs ??
        trace.rowsPrepareStartMs;
    }
    const commitBeginMs = trace.rowsPrepareStartMs ?? trace.rowMapStartMs ?? trace.firstRowLayoutEffectMs ?? nowFromT0Ms();
    const commitEndMs = trace.firstRowVisibleMs ?? trace.firstRowDomQueryEndMs ?? trace.firstRowLayoutEffectMs ?? commitBeginMs;
    trace.firstRowCommitSpanMs =
      commitBeginMs != null && commitEndMs != null ? Math.max(0, commitEndMs - commitBeginMs) : 0;
    trace.firstRowCommitSpanSource =
      source === "intersection_observer" || source === "ref_callback" || source === "direct_probe"
        ? "direct_row"
        : queryResult === "not_found" && trace.firstRowDomQueryEndMs != null
          ? "query_fallback"
          : source === "layout_effect"
            ? "layout_effect_fallback"
            : "no_row_fallback";
    trace.firstRowBlocker = classifyCmR11FirstRowBlocker(trace);
    trace.firstRowBlockerReason = `forced_case=${trace.forcedCase ?? "none"} source=${trace.firstRowVisibleSource ?? "unknown"} query=${trace.firstRowQueryResult}`;
    firstRowTraceCommittedRef.current = true;
    pushCmR8PerfEvent(vm.streamRoomId, "first_row_visible_normalized", {
      forced_case: trace.forcedCase,
      first_row_visible_source: trace.firstRowVisibleSource,
      first_row_visible_ms: trace.firstRowVisibleMs,
      first_row_query_attempted: trace.firstRowQueryAttempted,
      first_row_query_attempt_count: trace.firstRowQueryAttemptCount,
      first_row_query_selector: trace.firstRowQuerySelector,
      first_row_query_result: trace.firstRowQueryResult,
      first_row_container_found: trace.firstRowContainerFound,
      first_row_parent_hidden: trace.firstRowParentHidden,
      first_row_rows_count_at_query: trace.firstRowRowsCountAtQuery,
      first_row_rows_count_at_layout_effect: trace.firstRowRowsCountAtLayoutEffect,
      first_row_blocker: trace.firstRowBlocker,
      first_row_blocker_reason: trace.firstRowBlockerReason,
    });
    pushCmR8PerfEvent(vm.streamRoomId, "first_row_commit_path", {
      forced_case: trace.forcedCase,
      rows_prepare_start_ms: trace.rowsPrepareStartMs,
      rows_prepare_end_ms: trace.rowsPrepareEndMs,
      rows_prepare_source: trace.rowsPrepareSource,
      row_map_start_ms: trace.rowMapStartMs,
      row_map_end_ms: trace.rowMapEndMs,
      first_row_render_start_ms: trace.firstRowRenderStartMs,
      first_row_render_end_ms: trace.firstRowRenderEndMs,
      first_row_ref_attach_ms: trace.firstRowRefAttachMs,
      first_row_layout_effect_ms: trace.firstRowLayoutEffectMs,
      first_row_dom_query_start_ms: trace.firstRowDomQueryStartMs,
      first_row_dom_query_end_ms: trace.firstRowDomQueryEndMs,
      first_row_commit_span_ms: trace.firstRowCommitSpanMs,
      first_row_commit_span_source: trace.firstRowCommitSpanSource,
      first_row_blocker: trace.firstRowBlocker,
      first_row_blocker_reason: trace.firstRowBlockerReason,
    });
  }

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
  const [stubRedialConfirmKind, setStubRedialConfirmKind] = useState<null | "voice" | "video">(null);

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

  const timelineLoadUi = useMemo(
    () =>
      resolveMessengerRoomTimelineLoadUi({
        loading: vm.loading,
        displayMessageCount: vm.displayRoomMessages.length,
        timelineLoadFailed: vm.timelineLoadFailed,
        timelineInitialLoadComplete: vm.timelineInitialLoadComplete,
        roomMessagesLength: vm.roomMessages.length,
        snapshotMessagesLength: vm.snapshot.messages.length,
        lastMessage: vm.snapshot.room.lastMessage,
      }),
    [
      vm.displayRoomMessages.length,
      vm.loading,
      vm.timelineLoadFailed,
      vm.timelineInitialLoadComplete,
      vm.roomMessages.length,
      vm.snapshot.messages.length,
      vm.snapshot.room.lastMessage,
    ]
  );

  const showTimelineHydrationSkeleton = useMemo(
    () =>
      shouldShowMessengerRoomTimelineHydrationSkeleton({
        displayRoomMessagesLength: vm.displayRoomMessages.length,
        roomMessagesLength: vm.roomMessages.length,
        hydrationPass,
        clientShellPlaceholder: Boolean(vm.snapshot.clientShellPlaceholder),
        loading: vm.loading,
        snapshotMessagesLength: vm.snapshot.messages.length,
        lastMessage: vm.snapshot.room.lastMessage,
        timelineInitialLoadComplete: vm.timelineInitialLoadComplete,
      }),
    [
      hydrationPass,
      vm.displayRoomMessages.length,
      vm.roomMessages.length,
      vm.loading,
      vm.snapshot.clientShellPlaceholder,
      vm.snapshot.messages.length,
      vm.snapshot.room.lastMessage,
      vm.timelineInitialLoadComplete,
    ]
  );

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
  /**
   * 롱프레스 팝오버 오픈 직후 레이아웃 변화(ring-offset)가 virtualizer 스크롤 이벤트를 유발해
   * 팝오버가 즉시 닫히는 현상을 방지하기 위한 grace window.
   * setMessageActionItem 호출 시 이 값을 갱신한다.
   * DO NOT: 이 ref를 제거하면 롱프레스 직후 스크롤 이벤트가 시트를 즉시 닫음.
   */
  const actionSheetOpenedAtRef = useRef<number>(0);
  const onScrollDeferred = useCallback(() => {
    const v = vmRef.current;
    const gracePeriod = 500;
    const now = Date.now();
    if (now - actionSheetOpenedAtRef.current < gracePeriod) return;
    if (v.messageActionItem) v.setMessageActionItem(null);
  }, []);

  const scheduleScroll = useCallback(() => {
    vmRef.current.updateStickToBottomFromScroll();
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      onScrollDeferred();
      sampleMessengerScrollFrameBudget(vmRef.current.streamRoomId);
    });
  }, [onScrollDeferred]);

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

  /** Cap trim is Message Authority store policy — UI must not slice+setRoomMessages. */

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

  /**
   * grace window 용 래퍼: setMessageActionItem 호출 시 타임스탬프를 기록해
   * 직후 virtualizer 레이아웃 스크롤 이벤트가 팝오버를 즉시 닫지 않도록 한다.
   * DO NOT: 이 래퍼를 제거하고 vm.setMessageActionItem 을 직접 전달하면
   *          ring-offset 레이아웃 변화로 발생하는 스크롤이 팝오버를 즉시 닫음.
   */
  const setMessageActionItemWithGrace = useCallback(
    (v: Parameters<typeof vm.setMessageActionItem>[0]) => {
      if (v !== null) actionSheetOpenedAtRef.current = Date.now();
      vm.setMessageActionItem(v);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vm.setMessageActionItem]
  );
  const startCallStubRedial = useCallback(
    (kind: "voice" | "video") => {
      if (vm.roomUnavailable) return;
      setStubRedialConfirmKind(kind);
    },
    [vm.roomUnavailable]
  );
  const virtualItemsForLayout = vm.chatVirtualizer.getVirtualItems();
  const virtualizerMeasuredReadyForLayout =
    virtualItemsForLayout.length > 0 && vm.chatVirtualizer.getTotalSize() > 0;

  const paintModel = useMemo(
    () =>
      buildMessengerRoomTimelinePaintModel({
        displayRoomMessages: vm.displayRoomMessages,
        roomMessages: vm.roomMessages,
        loading: vm.loading,
        timelineInitialLoadComplete: vm.timelineInitialLoadComplete,
        snapshot: vm.snapshot,
        hasStoreOrderDock,
        hasStoreOrderTimeline,
        virtualizerMeasuredReady: virtualizerMeasuredReadyForLayout,
      }),
    [
      vm.displayRoomMessages,
      vm.roomMessages,
      vm.loading,
      vm.timelineInitialLoadComplete,
      vm.snapshot,
      hasStoreOrderDock,
      hasStoreOrderTimeline,
      virtualizerMeasuredReadyForLayout,
    ]
  );

  const useDirectTimelineLayout = useMemo(
    () =>
      resolveUseDirectMessengerTimelineLayout({
        hydrationPass,
        displayMessageCount: paintModel.paintMessages.length,
        seedMessageCount: vm.roomMessages.length,
        hasStoreOrderDock,
        hasStoreOrderTimeline,
        virtualizerHasMeasuredRange: virtualizerMeasuredReadyForLayout,
        entryReadyForVirtual: paintModel.layoutMode === "virtual",
      }),
    [
      hydrationPass,
      paintModel.layoutMode,
      paintModel.paintMessages.length,
      vm.roomMessages.length,
      hasStoreOrderDock,
      hasStoreOrderTimeline,
      virtualizerMeasuredReadyForLayout,
    ]
  );
  const finalTimelinePaintMessages = paintModel.paintMessages;
  const seedRowsRenderedCount = finalTimelinePaintMessages.length;

  const showTimelineEmptyState = useMemo(
    () =>
      shouldShowMessengerRoomTimelineEmptyState({
        paintMessageCount: finalTimelinePaintMessages.length,
        timelineInitialLoadComplete: vm.timelineInitialLoadComplete,
        timelineLoadFailed: vm.timelineLoadFailed,
      }),
    [
      finalTimelinePaintMessages.length,
      vm.timelineInitialLoadComplete,
      vm.timelineLoadFailed,
    ]
  );

  const entrySliceActive = false;

  const timelineRowsStackClass =
    useDirectTimelineLayout && (hasStoreOrderDock || hasStoreOrderTimeline) ? "flex flex-col gap-3" : "";

  const virtualizerUpgradeDeferHeavy = false;

  /** Telegram: measured virtualItems 만 — estimate fallback absolute paint 금지 */
  const cappedVirtualRows = useMemo(() => {
    if (useDirectTimelineLayout) return [];
    const virtualItems = vm.chatVirtualizer.getVirtualItems();
    return selectMessengerRoomVirtualRows(virtualItems);
  }, [useDirectTimelineLayout, vm.chatVirtualizer]);

  const virtualizerHasMeasuredRangeForLayout = virtualizerMeasuredReadyForLayout && !useDirectTimelineLayout;

  const timelineContentHeight = useMemo(() => {
    if (useDirectTimelineLayout) return 0;
    const total = vm.chatVirtualizer.getTotalSize();
    if (total > 0) return total;
    if (vm.displayRoomMessages.length <= 0) return 0;
    return estimateMessengerRoomTimelineTotalHeight(vm.displayRoomMessages);
  }, [useDirectTimelineLayout, vm.chatVirtualizer, vm.displayRoomMessages]);

  useLayoutEffect(() => {
    if (hydrationPass < 2) return;
    const trace = firstRowTraceRef.current;
    if (trace.rowsPrepareStartMs == null) {
      trace.rowsPrepareStartMs = nowFromT0Ms();
      trace.rowsPrepareSource = "timeline_rows_prepare_effect";
    }
    if (finalTimelinePaintMessages.length > 0) {
      noteCmRoomR7TimelineRowsPrepare(vm.streamRoomId, {
        seedRowsRenderedCount,
        directLayoutUsed: useDirectTimelineLayout,
        renderSource: resolveCmRoomRenderSource({
          displayMessageCount: vm.displayRoomMessages.length,
          roomMessageCount: vm.roomMessages.length,
          virtualizerHasMeasuredRange: virtualizerHasMeasuredRangeForLayout,
        }),
      });
    }
    trace.rowsPrepareEndMs = nowFromT0Ms();
    pushCmR8PerfEvent(vm.streamRoomId, "first_row_rows_prepare", {
      rows_prepare_start_ms: trace.rowsPrepareStartMs,
      rows_prepare_end_ms: trace.rowsPrepareEndMs,
      rows_prepare_source: trace.rowsPrepareSource,
      rows_prepare_rows_count: finalTimelinePaintMessages.length,
    });
  }, [
    hydrationPass,
    finalTimelinePaintMessages.length,
    seedRowsRenderedCount,
    useDirectTimelineLayout,
    virtualizerHasMeasuredRangeForLayout,
    vm.displayRoomMessages.length,
    vm.roomMessages.length,
    vm.streamRoomId,
  ]);

  const timelineRows = useMemo(() => {
    const trace = firstRowTraceRef.current;
    if (trace.rowMapStartMs == null) {
      trace.rowMapStartMs = nowFromT0Ms();
    }
    const rows = useDirectTimelineLayout
      ? finalTimelinePaintMessages.map((_, index) => ({ index, start: 0 }))
      : cappedVirtualRows;
    trace.rowMapEndMs = nowFromT0Ms();
    if (!firstRowTraceCommittedRef.current) {
      pushCmR8PerfEvent(vm.streamRoomId, "first_row_row_map", {
        row_map_start_ms: trace.rowMapStartMs,
        row_map_end_ms: trace.rowMapEndMs,
        row_count: rows.length,
      });
    }
    return rows;
  }, [cappedVirtualRows, finalTimelinePaintMessages, useDirectTimelineLayout, vm.streamRoomId]);

  useLayoutEffect(() => {
    logCmTimelineLayoutModeChanged(vm.streamRoomId, {
      directLayout: useDirectTimelineLayout,
      hydrationPass,
      holdDirectDom: false,
      measuredRange: virtualizerHasMeasuredRangeForLayout,
      rowCount: finalTimelinePaintMessages.length,
    });
  }, [
    finalTimelinePaintMessages.length,
    hydrationPass,
    useDirectTimelineLayout,
    virtualizerHasMeasuredRangeForLayout,
    vm.streamRoomId,
  ]);

  useEffect(() => {
    const renderSource = resolveCmRoomRenderSource({
      displayMessageCount: vm.displayRoomMessages.length,
      roomMessageCount: vm.roomMessages.length,
      virtualizerHasMeasuredRange: virtualizerHasMeasuredRangeForLayout,
    });
    const finalCount = finalTimelinePaintMessages.length;
    const didMountWithZeroRows =
      hydrationPass >= 2 &&
      finalCount === 0 &&
      (vm.roomMessages.length > 0 || vm.snapshot.messages.length > 0);
    const didCommitZeroRows = hydrationPass >= 2 && finalCount === 0;

    if (!firstNonZeroRowsRecordedRef.current && finalCount > 0) {
      firstNonZeroRowsRecordedRef.current = true;
      const t0 = entryTimingT0();
      const firstNonzeroRowsMs =
        t0 > 0 && typeof performance !== "undefined" ? Math.round(performance.now() - t0) : null;
      pushCmR8PerfEvent(vm.streamRoomId, "timeline_first_nonzero_rows", {
        first_nonzero_rows_ms: firstNonzeroRowsMs,
        final_message_rows_count: finalCount,
      });
    }

    const prev = rowsPrevRef.current;
    let rowsIdentityChanged = false;
    let rowsReferenceChanged = false;
    let rowsReplaceReason = "none";
    if (prev) {
      rowsIdentityChanged = prev.rowsRef !== finalTimelinePaintMessages;
      rowsReferenceChanged = prev.rowsRef !== finalTimelinePaintMessages;
      if (rowsReferenceChanged) {
        rowsReplaceCountRef.current += 1;
        if (prev.source !== renderSource) rowsReplaceReason = "render_source_changed";
        else if (prev.directLayout !== useDirectTimelineLayout) rowsReplaceReason = "layout_mode_changed";
        else if (prev.rowsLen !== finalCount) rowsReplaceReason = "rows_count_changed";
        else rowsReplaceReason = "rows_reference_changed";
      }
    }
    rowsPrevRef.current = {
      rowsRef: finalTimelinePaintMessages,
      rowsLen: finalCount,
      source: renderSource,
      directLayout: useDirectTimelineLayout,
    };

    pushCmR8PerfEvent(vm.streamRoomId, "timeline_rows_lifecycle", {
      phase1_seed_message_count: vm.roomMessages.length,
      bootstrap_message_count: vm.snapshot.messages.length,
      display_message_count: vm.displayRoomMessages.length,
      final_message_rows_count: finalCount,
      did_mount_with_zero_rows: didMountWithZeroRows,
      did_commit_zero_rows: didCommitZeroRows,
      rows_replace_count: rowsReplaceCountRef.current,
      rows_replace_reason: rowsReplaceReason,
      direct_layout_rows_source: `${useDirectTimelineLayout ? "direct" : "virtualized"}:${renderSource}`,
      rows_identity_changed: rowsIdentityChanged,
      rows_reference_changed: rowsReferenceChanged,
    });
  }, [
    finalTimelinePaintMessages,
    hydrationPass,
    useDirectTimelineLayout,
    virtualizerHasMeasuredRangeForLayout,
    vm.displayRoomMessages.length,
    vm.roomMessages.length,
    vm.snapshot.messages.length,
    vm.streamRoomId,
  ]);

  const lastDisplayMessageId =
    vm.displayRoomMessages[vm.displayRoomMessages.length - 1]?.id ?? "";

  /** 배달·주문 direct 진입 스크롤 — 방·hydration pass 당 1회만 (append 마다 재스케줄 금지). */
  const deliveryDirectEntryScrollDoneRef = useRef(false);

  useEffect(() => {
    deliveryDirectEntryScrollDoneRef.current = false;
  }, [vm.streamRoomId]);

  /** 배달·주문 direct: 진입 스크롤 단일 소유( reader room_entry_initial 과 중복 금지 — phase1 defer 플래그). */
  useLayoutEffect(() => {
    if (!useDirectTimelineLayout || !hasStoreOrderDock || hydrationPass < 2) return;
    if (deliveryDirectEntryScrollDoneRef.current) return;
    deliveryDirectEntryScrollDoneRef.current = true;
    return scheduleMessengerScrollToBottomAfterRowsPainted({
      roomId: vm.streamRoomId,
      messagesViewportRef: vm.messagesViewportRef,
      scroll: vm.scrollMessengerToBottom,
      reason: "timeline_delivery_direct_paint",
      stickToBottomRef: vm.stickToBottomRef,
    });
  }, [
    hasStoreOrderDock,
    hydrationPass,
    useDirectTimelineLayout,
    vm.messagesViewportRef,
    vm.scrollMessengerToBottom,
    vm.stickToBottomRef,
    vm.streamRoomId,
  ]);

  const attachMessagesViewportRef = useCallback(
    (node: HTMLDivElement | null) => {
      vm.messagesViewportRef.current = node;
      vm.notifyTimelineViewportMounted(Boolean(node));
    },
    [vm.messagesViewportRef, vm.notifyTimelineViewportMounted]
  );

  const attachPass2FirstRowProbe = useCallback(
    (rowEl: HTMLElement | null) => {
      if (!rowEl || hydrationPass < 2) return;
      const trace = firstRowTraceRef.current;
      const activeForcedCase = trace.forcedCase ?? resolveCmR16ForcedCase();
      trace.forcedCase = activeForcedCase;
      if (activeForcedCase != null) {
        /**
         * R16 harness: forced_case는 DOM query 경로에서 row_not_found 분기를 검증해야 하므로
         * ref/intersection 단축 경로를 비활성화한다.
         */
        return;
      }
      if (trace.firstRowRefAttachMs == null) {
        trace.firstRowRefAttachMs = nowFromT0Ms();
        pushCmR8PerfEvent(vm.streamRoomId, "first_row_ref_attach", {
          first_row_ref_attach_ms: trace.firstRowRefAttachMs,
        });
      }
      noteCmRoomR7FirstRowCommitBegin(vm.streamRoomId);
      if (viewportPaintRecordedRef.current) {
        noteCmRoomR7FirstRowCommitEnd(vm.streamRoomId);
        return;
      }
      if (pass2FirstRowProbeAttachedRef.current) return;
      pass2FirstRowProbeAttachedRef.current = true;
      const root = vm.messagesViewportRef.current;
      if (!root) return;

      const emitFromRow = (source: CmR11FirstRowVisibleSource) => {
        if (viewportPaintRecordedRef.current) return;
        noteCmRoomR5TimelineFirstRowDom(vm.streamRoomId);
        const rootRect = root.getBoundingClientRect();
        const rowRect = rowEl.getBoundingClientRect();
        const intersects =
          rowRect.height > 0 && rowRect.bottom > rootRect.top && rowRect.top < rootRect.bottom;
        if (!intersects) return;
        noteCmRoomR7FirstRowCommitEnd(vm.streamRoomId);
        finalizeFirstRowVisibilityTrace(source, "skipped");
        recordDomFirstPaintIfNeeded(
          useDirectTimelineLayout ? "direct_layout_dom_row" : "dom_intersection"
        );
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
        emitFromRow(useDirectTimelineLayout ? "direct_probe" : "ref_callback");
        return;
      }
      viewportIoRef.current?.disconnect();
      const obs = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            emitFromRow("intersection_observer");
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
    [
      hydrationPass,
      noteViewportVisible,
      recordDomFirstPaintIfNeeded,
      finalizeFirstRowVisibilityTrace,
      useDirectTimelineLayout,
      vm.chatVirtualizer,
      vm.messagesViewportRef,
      vm.streamRoomId,
    ]
  );

  useLayoutEffect(() => {
    const trace = firstRowTraceRef.current;
    trace.forcedCase = resolveCmR16ForcedCase();
    if (trace.firstRowLayoutEffectMs == null) {
      trace.firstRowLayoutEffectMs = nowFromT0Ms();
      pushCmR8PerfEvent(vm.streamRoomId, "first_row_layout_effect", {
        first_row_layout_effect_ms: trace.firstRowLayoutEffectMs,
        forced_case: trace.forcedCase,
      });
    }
    trace.firstRowRowsCountAtLayoutEffect = effectiveTimelineMessageCount;
    if (hydrationPass < 2 || viewportPaintRecordedRef.current) return;
    if (!hasCmRoomEntryTimingSession(vm.streamRoomId)) return;
    const root = vm.messagesViewportRef.current;
    trace.firstRowContainerFound = Boolean(root);
    if (!root) {
      finalizeFirstRowVisibilityTrace("layout_effect", "not_found");
      return;
    }
    trace.parentHiddenGate = root.offsetParent === null;
    trace.firstRowParentHidden = trace.parentHiddenGate;
    if (trace.forcedCase === "parent_hidden") {
      trace.firstRowParentHidden = true;
    }

    if (effectiveTimelineMessageCount === 0) {
      noteViewportVisible({ visible_rows: 0, empty_room: true, first_row_rendered: false });
      return;
    }

    if (cappedVirtualRows.length <= 0) return;

    let raf = 0;
    raf = window.requestAnimationFrame(() => {
      if (viewportPaintRecordedRef.current || !hasCmRoomEntryTimingSession(vm.streamRoomId)) return;
      const count = cappedVirtualRows.length;
      if (count <= 0) return;
      trace.firstRowQueryAttempted = true;
      trace.firstRowQueryAttemptCount += 1;
      const defaultSelector = "[data-cm-timeline-message-row]";
      const selector =
        trace.forcedCase === "selector_mismatch"
          ? "[data-cm-timeline-message-row-r16-mismatch]"
          : defaultSelector;
      trace.firstRowQuerySelector = selector;
      trace.firstRowRowsCountAtQuery = trace.forcedCase === "query_too_early" ? 0 : count;
      trace.firstRowDomQueryStartMs = nowFromT0Ms();
      const firstRow = root.querySelector(selector);
      trace.firstRowDomQueryEndMs = nowFromT0Ms();
      trace.firstRowQueryResult =
        trace.forcedCase === "parent_hidden" || trace.forcedCase === "query_too_early"
          ? "not_found"
          : firstRow instanceof HTMLElement
            ? "found"
            : "not_found";
      pushCmR8PerfEvent(vm.streamRoomId, "first_row_dom_query", {
        forced_case: trace.forcedCase,
        first_row_dom_query_start_ms: trace.firstRowDomQueryStartMs,
        first_row_dom_query_end_ms: trace.firstRowDomQueryEndMs,
        first_row_query_attempted: trace.firstRowQueryAttempted,
        first_row_query_attempt_count: trace.firstRowQueryAttemptCount,
        first_row_query_selector: trace.firstRowQuerySelector,
        first_row_query_result: trace.firstRowQueryResult,
        first_row_container_found: trace.firstRowContainerFound,
        first_row_parent_hidden: trace.firstRowParentHidden,
        first_row_rows_count_at_query: trace.firstRowRowsCountAtQuery,
        first_row_rows_count_at_layout_effect: trace.firstRowRowsCountAtLayoutEffect,
      });
      if (
        firstRow instanceof HTMLElement &&
        trace.forcedCase !== "parent_hidden" &&
        trace.forcedCase !== "query_too_early"
      ) {
        attachPass2FirstRowProbe(firstRow);
        return;
      }
      finalizeFirstRowVisibilityTrace("dom_query", "not_found");
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
    effectiveTimelineMessageCount,
    finalizeFirstRowVisibilityTrace,
    vm.messagesViewportRef,
    vm.streamRoomId,
  ]);

  useEffect(() => {
    if (hydrationPass < 2 || viewportPaintRecordedRef.current) return;
    if (effectiveTimelineMessageCount === 0) return;
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

  const typingByRoomId = useMessengerTypingStore((state) => state.byRoomId);
  const typingPeerUserIds = useMemo(() => {
    const roomId = vm.streamRoomId.trim().toLowerCase();
    const viewerId = (vm.snapshot.viewerUserId ?? "").trim();
    const now = Date.now();
    if (!roomId || !viewerId) return [];
    if (vm.snapshot.room.roomType === "direct") {
      const peerUserId = (vm.snapshot.room.peerUserId ?? "").trim();
      const entry = peerUserId ? typingByRoomId[roomId]?.[peerUserId] : null;
      return entry && entry.expiresAt > now ? [peerUserId] : [];
    }
    const bucket = typingByRoomId[roomId] ?? {};
    const ids: string[] = [];
    for (const [userId, entry] of Object.entries(bucket)) {
      if (userId === viewerId) continue;
      if (entry.expiresAt > now) ids.push(userId);
    }
    return ids;
  }, [
    typingByRoomId,
    vm.snapshot.room.peerUserId,
    vm.snapshot.room.roomType,
    vm.snapshot.viewerUserId,
    vm.streamRoomId,
  ]);
  const typingPeerAvatar = typingPeerUserIds[0] ? messageRowPreamble.peerAvatarFor(typingPeerUserIds[0]) : null;
  const typingIndicatorLabel =
    typingPeerUserIds.length >= 2
      ? vm.t("cm_ui_typing_multiple", { count: typingPeerUserIds.length })
      : vm.t("chats_peer_typing");

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

  const shouldMeasureVirtualRowDuringUpgrade = useCallback(
    (virtualIndex: number) => {
      const st = getCmR9State(vm.streamRoomId);
      if (!st.active) return true;
      const total = finalTimelinePaintMessages.length;
      if (total <= 0) return true;
      const tailStart = Math.max(0, total - CM_R10_UPGRADE_TAIL_ROWS);
      return virtualIndex >= tailStart && st.rowMeasureCount < CM_R10_UPGRADE_MEASURE_CAP;
    },
    [finalTimelinePaintMessages.length, vm.streamRoomId]
  );

  const measureWithScrollTrace = useCallback(
    (el: HTMLElement | null, virtualIndex?: number) => {
      const st = getCmR9State(vm.streamRoomId);
      if (
        st.active &&
        virtualIndex != null &&
        !shouldMeasureVirtualRowDuringUpgrade(virtualIndex)
      ) {
        st.measureCapSkippedCount += 1;
        return;
      }
      if (st.active) {
        st.rowMeasureCount += 1;
        if (st.virtualizerMeasureBeginMs == null) {
          st.virtualizerMeasureBeginMs = nowFromT0Ms();
        }
      }
      if (!cmScrollAnalysisEnabled()) {
        vm.chatVirtualizer.measureElement(el);
        if (st.active) {
          st.virtualizerMeasureEndMs = nowFromT0Ms();
        }
        return;
      }
      const t0 = performance.now();
      vm.chatVirtualizer.measureElement(el);
      recordCmScrollVirtualizerMeasure(performance.now() - t0);
      scheduleVirtualizerScrollTraceDrain();
      if (st.active) {
        st.virtualizerMeasureEndMs = nowFromT0Ms();
      }
    },
    [
      finalTimelinePaintMessages.length,
      shouldMeasureVirtualRowDuringUpgrade,
      vm.chatVirtualizer,
      scheduleVirtualizerScrollTraceDrain,
      vm.streamRoomId,
    ]
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={attachMessagesViewportRef}
        data-cm-line-timeline
        data-cm-message-viewport=""
        className="chat-timeline-scroll relative min-h-0 flex-1 bg-[color:var(--cm-room-chat-bg)]"
        onScroll={scheduleScroll}
      >
        <div className="chat-timeline-sheet mx-auto w-full max-w-[760px]">
          <div className="chat-timeline-chrome space-y-2.5 px-3 py-3 sm:px-4">
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
            {vm.snapshot.room.memberCount > 0
              ? vm.t("cm_ui_member_count_suffix", { count: vm.snapshot.room.memberCount })
              : ""}
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
                <p className="sam-text-xxs font-semibold uppercase tracking-wide text-[color:var(--cm-room-text-muted)]">{vm.t("cm_ui_notice")}</p>
                <p className="mt-0.5 line-clamp-2 sam-text-helper leading-snug text-[color:var(--cm-room-text)]">
                  {vm.snapshot.room.summary.trim()}
                </p>
              </div>
              <span className="shrink-0 sam-text-body text-[color:var(--cm-room-text-muted)]">›</span>
            </button>
          ) : null}
          </div>
          <div className={`chat-timeline-inner px-3 sm:px-4 ${timelineInnerTailClass}`}>
            {vm.isPrivateGroupRoom && pinnedMessageId && pinnedPreviewText ? (
              <div className="sticky top-0 z-[5] -mx-3 bg-[color:var(--cm-room-chat-bg)] pb-1 pt-0 sm:-mx-4">
                <GroupPinnedMessageBanner
                  previewText={pinnedPreviewText}
                  senderLabel={pinnedMessage?.senderLabel}
                  onClick={() => void vm.focusTimelineMessage(pinnedMessageId)}
                />
              </div>
            ) : null}
            <div className="chat-message-stack">
          {vm.hasMoreOlderMessages && vm.roomMessages.length > 0 ? (
            <div
              ref={vm.topOlderSentinelRef}
              className="flex min-h-[24px] flex-col items-center justify-center gap-1 py-2"
            >
              {vm.loadingOlderMessages ? (
                <span className="sam-text-helper text-ui-muted">{vm.t("cm_ui_loading_previous_conversations")}</span>
              ) : (
                <span className="sam-text-xxs text-ui-muted">{vm.t("cm_ui_scroll_top_to_load_previous")}</span>
              )}
            </div>
          ) : null}
          {finalTimelinePaintMessages.length ? (
            <MessengerRoomMessageListHost
              useDirectLayout={useDirectTimelineLayout}
              contentHeight={timelineContentHeight}
              stackClassName={timelineRowsStackClass}
            >
              {timelineRows.map((virtualRow, cappedMapIndex) => {
                const index = virtualRow.index;
                const isFirstMappedRow = cappedMapIndex === 0;
                const trace = firstRowTraceRef.current;
                if (isFirstMappedRow && trace.firstRowRenderStartMs == null) {
                  trace.firstRowRenderStartMs = nowFromT0Ms();
                }
                const item = finalTimelinePaintMessages[index];
                if (!item) return null;
                const prev = index > 0 ? finalTimelinePaintMessages[index - 1] : null;
                const next =
                  index < finalTimelinePaintMessages.length - 1 ? finalTimelinePaintMessages[index + 1] : null;
                const isCallStub = item.messageType === "call_stub";
                const gapMs =
                  prev && prev.messageType !== "system" && prev.messageType !== "call_stub" && item.messageType !== "system" && !isCallStub
                    ? Math.max(0, new Date(item.createdAt).getTime() - new Date(prev.createdAt).getTime())
                    : 0;
                const isNewClusterFromTime = gapMs > CM_CLUSTER_GAP_MS;
                const peerSenderChanged =
                  vm.isGroupRoom &&
                  !!prev &&
                  prev.messageType !== "system" &&
                  prev.messageType !== "call_stub" &&
                  !isCallStub &&
                  (prev.senderId ?? "") !== (item.senderId ?? "");
                const showPeerName =
                  !item.isMine &&
                  item.messageType !== "system" &&
                  !isCallStub &&
                  (!prev ||
                    prev.messageType === "system" ||
                    prev.messageType === "call_stub" ||
                    prev.isMine ||
                    peerSenderChanged ||
                    isNewClusterFromTime);
                const nextGapMs =
                  next && next.messageType !== "system" && next.messageType !== "call_stub" && item.messageType !== "system" && !isCallStub
                    ? Math.max(0, new Date(next.createdAt).getTime() - new Date(item.createdAt).getTime())
                    : 0;
                const isClusterEndFromTime = nextGapMs > CM_CLUSTER_GAP_MS;
                const nextSenderChanged =
                  !!next &&
                  next.messageType !== "system" &&
                  next.messageType !== "call_stub" &&
                  item.messageType !== "system" &&
                  !isCallStub &&
                  (next.isMine !== item.isMine ||
                    (vm.isGroupRoom && (next.senderId ?? "") !== (item.senderId ?? "")));
                const showPeerAvatar =
                  !item.isMine &&
                  item.messageType !== "system" &&
                  !isCallStub &&
                  showPeerName;
                const peerAvatar = !item.isMine ? messageRowPreamble.peerAvatarFor(item.senderId) : null;
                const mineUnreadBadgeVisible =
                  !vm.isPrivateGroupRoom &&
                  item.isMine &&
                  item.messageType !== "system" &&
                  !isCallStub &&
                  latestReadableMineMessageId === item.id &&
                  !peerHasReadMyLatestMessage;
                const groupReadReceiptLabel =
                  vm.isPrivateGroupRoom &&
                  item.isMine &&
                  item.messageType !== "system" &&
                  !isCallStub &&
                  groupReadCounts[item.id]?.label
                    ? groupReadCounts[item.id]!.label
                    : undefined;
                const showMineClusterStart =
                  item.isMine &&
                  item.messageType !== "system" &&
                  !isCallStub &&
                  (!prev ||
                    prev.messageType === "system" ||
                    prev.messageType === "call_stub" ||
                    !prev.isMine ||
                    isNewClusterFromTime ||
                    (vm.isGroupRoom && (prev.senderId ?? "") !== (item.senderId ?? "")));
                const showMineClusterEnd =
                  item.isMine &&
                  item.messageType !== "system" &&
                  !isCallStub &&
                  (!next || next.messageType === "system" || next.messageType === "call_stub" || nextSenderChanged || isClusterEndFromTime);
                const showBubbleTail = item.isMine ? showMineClusterStart : showPeerName;
                const isDayBoundary =
                  !prev ||
                  messengerTimelineCalendarDayKey(prev.createdAt) !== messengerTimelineCalendarDayKey(item.createdAt);
                const dayDividerLabel = isDayBoundary ? messengerTimelineDayDividerLabel(item.createdAt) : null;
                const rowPaddingTopClass = resolveMessengerTimelineRowPaddingTopClass({
                  item,
                  prev,
                  isDayBoundary,
                  showPeerName,
                  isGroupRoom: vm.isGroupRoom,
                });
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
                if (isFirstMappedRow && trace.firstRowRenderEndMs == null) {
                  trace.firstRowRenderEndMs = nowFromT0Ms();
                  pushCmR8PerfEvent(vm.streamRoomId, "first_row_render", {
                    first_row_render_start_ms: trace.firstRowRenderStartMs,
                    first_row_render_end_ms: trace.firstRowRenderEndMs,
                  });
                }

                return (
                  <MessengerTimelineVirtualRow
                    key={item.id}
                    item={item}
                    virtualStart={virtualRow.start}
                    virtualIndex={virtualRow.index}
                    directLayout={useDirectTimelineLayout}
                    entryLightRow={entrySliceActive || virtualizerUpgradeDeferHeavy}
                    measureElement={
                      useDirectTimelineLayout
                        ? cappedMapIndex === 0
                          ? attachPass2FirstRowProbe
                          : () => undefined
                        : cappedMapIndex === 0
                          ? (el) => {
                              measureWithScrollTrace(el, index);
                              attachPass2FirstRowProbe(el);
                            }
                          : (el) => measureWithScrollTrace(el, index)
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
                    groupReadReceiptLabel={groupReadReceiptLabel}
                    highlightMentions={vm.isPrivateGroupRoom}
                    timelineHighlightMessageId={vm.timelineHighlightMessageId}
                    messageActionItemId={vm.messageActionItem?.item.id ?? null}
                    linkPreviewEnabled={
                      entrySliceActive || virtualizerUpgradeDeferHeavy
                        ? false
                        : vm.roomPreferences.linkPreviewEnabled
                    }
                    mediaAutoSaveEnabled={
                      entrySliceActive || virtualizerUpgradeDeferHeavy
                        ? false
                        : vm.roomPreferences.mediaAutoSaveEnabled
                    }
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
                    senderLabelDisplay={resolveMessageSenderLabel(item)}
                    onOpenImageLightbox={onOpenImageLightbox}
                    onReactionRosterOpen={onReactionRosterOpen}
                    setMessageActionItem={setMessageActionItemWithGrace}
                    onCallStubRedial={startCallStubRedial}
                    messageLongPressTimerRef={vm.messageLongPressTimerRef}
                    messageLongPressItemRef={vm.messageLongPressItemRef}
                    focusTimelineMessage={vm.focusTimelineMessage}
                    tt={vm.tt}
                    t={vm.t}
                  />
                );
              })}
            </MessengerRoomMessageListHost>
          ) : showTimelineHydrationSkeleton || timelineLoadUi === "loading" ? (
            <div
              className="flex min-h-[40vh] flex-col items-center justify-center py-16"
              aria-busy="true"
              aria-label={vm.t("chats_spinner_loading_aria")}
            >
              <StoreDeliveryBufferingSpinner />
            </div>
          ) : timelineLoadUi === "retry" ? (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <p className="sam-text-body text-[color:var(--cm-room-text-muted)]">
                {vm.t("cm_ui_timeline_load_failed")}
              </p>
              <button
                type="button"
                onClick={() => vm.retryTimelineLoad()}
                className="rounded-full border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-4 py-2 sam-text-helper font-semibold text-[color:var(--cm-room-text)] active:opacity-90"
              >
                {vm.t("cm_ui_timeline_retry")}
              </button>
            </div>
          ) : showTimelineEmptyState ? (
            <div className="px-4 py-12 text-center sam-text-body-secondary text-[color:var(--cm-room-text-muted)]">
              {vm.t("cm_ui_no_messages_yet")}
              <br />
              <span className="mt-1 inline-block sam-text-helper">{vm.t("cm_ui_leave_first_greeting")}</span>
            </div>
          ) : (
            <div
              className="flex min-h-[40vh] flex-col items-center justify-center py-16"
              aria-busy="true"
              aria-label={vm.t("chats_spinner_loading_aria")}
            >
              <StoreDeliveryBufferingSpinner />
            </div>
          )}
          {typingPeerUserIds.length > 0 ? (
            <div className="flex w-full items-end justify-start gap-2 px-2 pt-1" aria-live="polite">
              <div className="flex h-[30px] w-[34px] shrink-0 items-center justify-center">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--cm-room-bubble-incoming)] text-[11px] font-bold text-[color:var(--cm-room-bubble-incoming-fg)] ring-1 ring-black/5">
                  {typingPeerAvatar?.initials ?? "?"}
                </span>
              </div>
              <div className="inline-flex max-w-[min(76vw,360px)] items-center gap-2 rounded-[18px] bg-[color:var(--cm-room-bubble-incoming)] px-3 py-2 text-[color:var(--cm-room-bubble-incoming-fg)] ring-1 ring-black/5">
                <span className="sam-text-helper font-semibold leading-none">{typingIndicatorLabel}</span>
                <span className="inline-flex items-center gap-0.5" aria-hidden>
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-70"
                      style={{ animationDelay: `${dot * 140}ms` }}
                    />
                  ))}
                </span>
              </div>
            </div>
          ) : null}
          <div ref={vm.messageEndRef} />
            </div>
          </div>
        </div>
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
      {stubRedialConfirmKind ? (
        <MessengerOutgoingCallConfirmDialog
          open
          peerLabel={vm.snapshot.room.title?.trim() || ""}
          kind={stubRedialConfirmKind}
          busy={vm.outgoingDialLocked}
          onCancel={() => setStubRedialConfirmKind(null)}
          onConfirm={() => {
            const kind = stubRedialConfirmKind;
            setStubRedialConfirmKind(null);
            if (vm.isGroupRoom) void vm.startGroupCall(kind);
            else void vm.startManagedDirectCall(kind);
          }}
        />
      ) : null}
    </div>
  );
});
