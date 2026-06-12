"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo } from "react";
import {
  getActiveCmRoomEntrySessionId,
  noteCmRoomTimingSubtreeMount,
  scheduleCmRoomEntryTimingSessionCleanup,
} from "@/lib/community-messenger/room/cm-room-entry-timing-session";
import {
  noteCmRoomSubtreeClientMount,
  registerCmRoomSubtreeReactLifecycle,
  shouldBlockCmRoomStrictEffectReRun,
} from "@/lib/community-messenger/room/cm-room-subtree-stability";
import { useCmRoomOpeningOverlayStore } from "@/lib/community-messenger/room/cm-room-opening-overlay-store";
import { MessengerRoomGroupCallShell } from "@/lib/community-messenger/room/MessengerRoomGroupCallShell";
import { MessengerRoomClientPhase1Context } from "@/lib/community-messenger/room/messenger-room-client-phase1-context";
import { useMessengerRoomClientPhase1 } from "@/lib/community-messenger/room/use-messenger-room-client-phase1";
import { recordRouteEntryElapsedMetricOnce } from "@/lib/runtime/samarket-runtime-debug";
import type { CommunityMessengerCallSession, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { MessengerRoomPhase1TimelineHeavyHost } from "@/components/community-messenger/room/MessengerRoomPhase1TimelineHeavyHost";

const CommunityMessengerRoomClientPhase2 = dynamic(
  () =>
    import("@/components/community-messenger/room/CommunityMessengerRoomPhase2").then(
      (m) => m.CommunityMessengerRoomClientPhase2
    ),
  { ssr: false, loading: () => null }
);
import { MessengerRoomSwipeBackShell } from "@/components/community-messenger/room/MessengerRoomSwipeBackShell";
import { noteR2M9Stage } from "@/lib/community-messenger/room/cm-room-r2-m9-entry-profile";
import { noteTradeChatRoomInnerChunkEval } from "@/lib/trade/trade-chat-room-shell-breakdown-perf";
import {
  noteR2M11FirstClientBoundary,
  noteR2M11Phase1Visible,
  noteR2M11ProviderCommit,
} from "@/lib/community-messenger/room/cm-room-r2-m11-suspense-release";
import {
  noteR2M11BClientCommitDone,
  noteR2M11BPhase1BoundaryMount,
  noteR2M11BPhase1Visible,
  noteR2M11BProviderCommitDone,
  noteR2M11BProviderCommitStart,
} from "@/lib/community-messenger/room/cm-room-r2-m11b-breakdown";
import { tryEmitR2M11CAfterM11BPhase } from "@/lib/community-messenger/room/cm-room-r2-m11c-breakdown";
import { shouldRunMessengerListRoutePrefetch } from "@/lib/runtime/next-js-dev-client";
import { SAMARKET_ROUTES } from "@/lib/app/samarket-route-map";
import { beginCmRoomEntryShellFirstPass } from "@/lib/community-messenger/room/cm-room-entry-shell-first-pass";

let communityMessengerListRoutesPrefetched = false;

if (typeof window !== "undefined") {
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "client_component_module_eval_start_ms");
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "client_component_module_eval_end_ms");
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "CommunityMessengerRoomClient_first_import_ready_ms");
}

export function CommunityMessengerRoomClientInner(props: {
  roomId: string;
  initialCallAction?: string;
  initialCallSessionId?: string;
  initialServerSnapshot?: CommunityMessengerRoomSnapshot | null;
  initialViewerUserId?: string | null;
}) {
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "first_client_component_mount_ms");
  const phase1BoundaryRoomId = props.roomId?.trim() ?? "";
  if (phase1BoundaryRoomId) {
    beginCmRoomEntryShellFirstPass(phase1BoundaryRoomId);
  }
  noteR2M9Stage("inner_first_render");
  noteR2M9Stage("phase1_hook_start");
  if (phase1BoundaryRoomId) {
    noteR2M11BPhase1BoundaryMount(phase1BoundaryRoomId);
  }
  const phase1 = useMessengerRoomClientPhase1(props);
  const router = useRouter();
  useLayoutEffect(() => {
    const rid = props.roomId?.trim() ?? "";
    if (!rid) return;
    useCmRoomOpeningOverlayStore.getState().noteRouteMounted(rid);
  }, [props.roomId]);
  useLayoutEffect(() => {
    const rid = props.roomId?.trim() ?? "";
    if (!rid) return;
    const unregisterSubtree = registerCmRoomSubtreeReactLifecycle(rid);
    if (!shouldBlockCmRoomStrictEffectReRun(rid, "room_client_subtree_mount")) {
      noteCmRoomSubtreeClientMount(rid, getActiveCmRoomEntrySessionId());
      noteCmRoomTimingSubtreeMount(rid);
    }
    return () => {
      unregisterSubtree();
      scheduleCmRoomEntryTimingSessionCleanup(rid, "room_client_unmount");
    };
  }, [props.roomId]);
  useEffect(() => {
    const rid = phase1.roomId?.trim() ?? "";
    if (!rid) return;
    if (phase1.snapshot?.room?.roomType !== "open_group" && props.initialServerSnapshot?.room?.roomType !== "open_group") {
      return;
    }
    const ac = new AbortController();
    void (async () => {
      try {
        await fetch(`/api/community-messenger/rooms/${encodeURIComponent(rid)}/meeting-ensure-participant`, {
          method: "POST",
          credentials: "include",
          signal: ac.signal,
        });
      } catch {
        /* idempotent */
      }
    })();
    return () => ac.abort();
  }, [phase1.roomId, phase1.snapshot?.room?.roomType, props.initialServerSnapshot?.room?.roomType]);
  useEffect(() => {
    if (!shouldRunMessengerListRoutePrefetch()) return;
    if (communityMessengerListRoutesPrefetched) return;
    communityMessengerListRoutesPrefetched = true;
    try {
      void router.prefetch?.(SAMARKET_ROUTES.chat.messengerHub);
      void router.prefetch?.(`${SAMARKET_ROUTES.chat.messengerHub}&filter=private_group`);
      void router.prefetch?.(SAMARKET_ROUTES.chat.messengerMeetingsHub);
    } catch {
      /* ignore */
    }
  }, [router]);
  const isGroupRoomForShell = Boolean(
    phase1.snapshot?.room.roomType && phase1.snapshot.room.roomType !== "direct"
  );
  const initialServerIsGroupRoom = Boolean(
    props.initialServerSnapshot?.room.roomType &&
      props.initialServerSnapshot.room.roomType !== "direct"
  );

  useEffect(() => {
    if (!initialServerIsGroupRoom) return;
    void import(
      /* webpackChunkName: "messenger-group-call-bridge" */
      "@/lib/community-messenger/room/CommunityMessengerGroupCallProviderBridge"
    );
  }, [initialServerIsGroupRoom]);

  const ac = phase1.snapshot?.activeCall;
  const groupCallParticipantSig =
    ac?.participants?.map((p) => `${p.userId}:${p.status}`).join("|") ?? "";

  const activeCallForGroupBridge: CommunityMessengerCallSession | null = useMemo(() => {
    const cur = phase1.snapshot?.activeCall;
    if (!cur || cur.sessionMode !== "group") return null;
    return cur;
  }, [
    ac?.id,
    ac?.sessionMode,
    ac?.status,
    ac?.startedAt,
    ac?.answeredAt,
    ac?.endedAt,
    groupCallParticipantSig,
  ]);

  const groupCallBridgeDeps = useMemo(
    () => ({
      enabled: isGroupRoomForShell,
      roomId: phase1.roomId,
      viewerUserId: phase1.snapshot?.viewerUserId ?? "",
      roomLabel: phase1.snapshot?.room.title ?? phase1.t("nav_messenger_group_call"),
      activeCall: activeCallForGroupBridge,
      onRefresh: () => {
        void phase1.refresh(true);
      },
    }),
    [
      isGroupRoomForShell,
      phase1.roomId,
      phase1.snapshot?.viewerUserId,
      phase1.snapshot?.room.title,
      activeCallForGroupBridge,
      phase1.refresh,
      phase1.t,
    ]
  );
  useLayoutEffect(() => {
    noteR2M9Stage("phase1_provider_render");
    const rid = phase1.roomId?.trim() ?? "";
    if (!rid) return;
    noteR2M11BProviderCommitStart(rid);
    noteR2M11FirstClientBoundary(rid);
    noteR2M11ProviderCommit(rid);
    noteR2M11BProviderCommitDone(rid);
    noteR2M11Phase1Visible(rid);
    noteR2M11BPhase1Visible(rid);
    noteR2M11BClientCommitDone(rid);
    tryEmitR2M11CAfterM11BPhase(rid);
  }, [phase1.roomId]);

  return (
    <MessengerRoomClientPhase1Context.Provider value={phase1}>
      {phase1.timelineHeavyLive ? (
        <MessengerRoomPhase1TimelineHeavyHost
          key={`${phase1.roomId}:${phase1.timelineVirtualizerGeneration}`}
          {...phase1.timelineHeavyHostInput}
          onReady={phase1.onTimelineHeavyReady}
        />
      ) : null}
      <MessengerRoomGroupCallShell isGroupRoom={isGroupRoomForShell} bridgeDeps={groupCallBridgeDeps}>
        <MessengerRoomSwipeBackShell roomId={phase1.roomId} roomType={phase1.snapshot?.room.roomType}>
          <CommunityMessengerRoomClientPhase2 />
        </MessengerRoomSwipeBackShell>
      </MessengerRoomGroupCallShell>
    </MessengerRoomClientPhase1Context.Provider>
  );
}
