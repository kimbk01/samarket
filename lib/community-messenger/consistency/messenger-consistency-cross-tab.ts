"use client";

/**
 * Cross-tab consistency propagation — read ack, mark-all-read, active room, snapshot version.
 */
import {
  bumpRoomTruthVersion,
  noteReconnectTruthPreserve,
  setSurfaceSnapshotVersionMs,
  versionMsFromIso,
  type MessengerConsistencySurface,
} from "@/lib/community-messenger/consistency/messenger-consistency-version";
import {
  onCommunityMessengerBusEvent,
  postCommunityMessengerBusEvent,
  type MessengerBusEvent,
} from "@/lib/community-messenger/multi-tab-bus";
import { setLocalReadGuard } from "@/lib/community-messenger/read/local-read-guard";
import { recordReconnectStressEvent } from "@/lib/ops/reconnect-stress-analysis";

export type MessengerConsistencyBusEvent =
  | {
      type: "cm.consistency.mark_all_read";
      viewerUserId: string;
      at: number;
      versionMs: number;
    }
  | {
      type: "cm.consistency.active_room";
      viewerUserId: string;
      roomId: string | null;
      at: number;
    }
  | {
      type: "cm.consistency.snapshot_version";
      viewerUserId: string;
      surface: MessengerConsistencySurface;
      versionMs: number;
      at: number;
    }
  | {
      type: "cm.consistency.reconnect_preserve";
      viewerUserId: string;
      versionMs: number;
      at: number;
    };

const CONSISTENCY_CHANNEL = "samarket:cm-consistency";

function getConsistencyChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  const BC = (globalThis as typeof globalThis & { BroadcastChannel?: typeof BroadcastChannel })
    .BroadcastChannel;
  if (!BC) return null;
  try {
    return new BC(CONSISTENCY_CHANNEL);
  } catch {
    return null;
  }
}

export function postMessengerConsistencyBusEvent(ev: MessengerConsistencyBusEvent): void {
  const ch = getConsistencyChannel();
  if (!ch) return;
  try {
    ch.postMessage(ev);
  } catch {
    /* ignore */
  } finally {
    ch.close();
  }
}

export function broadcastMessengerMarkAllReadCrossTab(viewerUserId: string): void {
  const uid = viewerUserId.trim();
  if (!uid) return;
  const versionMs = Date.now();
  setSurfaceSnapshotVersionMs("cross_tab", versionMs);
  postMessengerConsistencyBusEvent({
    type: "cm.consistency.mark_all_read",
    viewerUserId: uid,
    at: versionMs,
    versionMs,
  });
}

export function broadcastMessengerActiveRoomCrossTab(viewerUserId: string, roomId: string | null): void {
  const uid = viewerUserId.trim();
  if (!uid) return;
  postMessengerConsistencyBusEvent({
    type: "cm.consistency.active_room",
    viewerUserId: uid,
    roomId: roomId?.trim() || null,
    at: Date.now(),
  });
}

export function broadcastMessengerSnapshotVersionCrossTab(
  viewerUserId: string,
  surface: MessengerConsistencySurface,
  updatedAtIso: string
): void {
  const uid = viewerUserId.trim();
  const versionMs = versionMsFromIso(updatedAtIso);
  if (!uid || versionMs <= 0) return;
  setSurfaceSnapshotVersionMs(surface, versionMs);
  postMessengerConsistencyBusEvent({
    type: "cm.consistency.snapshot_version",
    viewerUserId: uid,
    surface,
    versionMs,
    at: Date.now(),
  });
}

export function broadcastMessengerReconnectPreserveCrossTab(viewerUserId: string): void {
  const uid = viewerUserId.trim();
  if (!uid) return;
  noteReconnectTruthPreserve();
  recordReconnectStressEvent("home", "reconnect");
  postMessengerConsistencyBusEvent({
    type: "cm.consistency.reconnect_preserve",
    viewerUserId: uid,
    versionMs: Date.now(),
    at: Date.now(),
  });
}

export function onMessengerConsistencyBusEvent(
  handler: (ev: MessengerConsistencyBusEvent) => void
): () => void {
  const ch = getConsistencyChannel();
  if (!ch) return () => {};
  const onMsg = (e: MessageEvent) => {
    const d = e.data as MessengerConsistencyBusEvent | null;
    if (!d || typeof d !== "object" || !d.type?.startsWith("cm.consistency.")) return;
    handler(d);
  };
  ch.addEventListener("message", onMsg);
  return () => {
    try {
      ch.removeEventListener("message", onMsg);
      ch.close();
    } catch {
      /* ignore */
    }
  };
}

/** Wire cross-tab read + consistency events into home list + truth versions. */
export function wireMessengerConsistencyCrossTabHandlers(args: {
  viewerUserId: string;
  onMarkAllRead: () => void;
  onSnapshotVersion?: (surface: MessengerConsistencySurface, versionMs: number) => void;
}): () => void {
  const uid = args.viewerUserId.trim();
  if (!uid) return () => {};

  const offConsistency = onMessengerConsistencyBusEvent((ev) => {
    if (ev.viewerUserId !== uid) return;
    if (ev.type === "cm.consistency.mark_all_read") {
      setSurfaceSnapshotVersionMs("cross_tab", ev.versionMs);
      args.onMarkAllRead();
      return;
    }
    if (ev.type === "cm.consistency.snapshot_version") {
      setSurfaceSnapshotVersionMs(ev.surface, ev.versionMs);
      args.onSnapshotVersion?.(ev.surface, ev.versionMs);
      return;
    }
    if (ev.type === "cm.consistency.reconnect_preserve") {
      noteReconnectTruthPreserve();
    }
  });

  const offMessenger = onCommunityMessengerBusEvent((ev: MessengerBusEvent) => {
    if (ev.type === "cm.room.read") {
      if (ev.viewerUserId !== uid) return;
      setLocalReadGuard({
        roomId: ev.roomId,
        referenceLastMessageAt: new Date(ev.at).toISOString(),
        source: "bus_sync",
      });
      bumpRoomTruthVersion(ev.roomId, ev.at, "cross_tab_read");
    }
  });

  return () => {
    offConsistency();
    offMessenger();
  };
}
