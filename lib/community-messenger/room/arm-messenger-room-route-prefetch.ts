"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { enqueueRoomPrefetch } from "@/lib/community-messenger/room-prefetch-queue";
import { prefetchCommunityMessengerRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import { primeMessengerRoomEntrySnapshot } from "@/lib/community-messenger/stores/messenger-realtime-store";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import {
  noteMessengerRoomRoutePrefetchArmed,
  noteR2M10RoomPageChunkLoaded,
} from "@/lib/community-messenger/room/cm-room-r2-m10-route-transition";
import {
  mapArmPrefetchSourceToChunkWarm,
  warmCommunityMessengerRoomRouteChunks,
} from "@/lib/community-messenger/room/cm-room-route-chunk-warm";
import {
  noteR2M11DChunkImportDone,
  noteR2M11DRoomPrefetchStart,
  noteR2M11DRouterPrefetchCalled,
  type R2M11DPrefetchSource,
} from "@/lib/community-messenger/room/cm-room-r2-m11d-prefetch-flight";

export type ArmMessengerRoomRoutePrefetchArgs = {
  roomId: string;
  href: string;
  router: Pick<AppRouterInstance, "prefetch">;
  source: R2M11DPrefetchSource;
  priorityScore?: number;
  viewerUserId?: string | null;
  roomForPrime?: CommunityMessengerRoomSummary | null;
};

/**
 * BN13-room-rsc — room route RSC + client chunk + snapshot prefetch (pointerdown·IO·hover 공용).
 */
export function armMessengerRoomRoutePrefetch(args: ArmMessengerRoomRoutePrefetchArgs): void {
  const id = String(args.roomId ?? "").trim();
  const href = String(args.href ?? "").trim();
  if (!id || !href) return;

  noteR2M11DRoomPrefetchStart(id, href, args.source);
  if (args.source === "pointerdown" || args.source === "intersection" || args.source === "pointerenter") {
    warmCommunityMessengerRoomRouteChunks(mapArmPrefetchSourceToChunkWarm(args.source));
  }

  if (args.source === "pointerdown") {
    if (args.roomForPrime) {
      primeMessengerRoomEntrySnapshot({ viewerUserId: args.viewerUserId, room: args.roomForPrime });
    }
  }

  enqueueRoomPrefetch(id, args.priorityScore ?? 0);
  void prefetchCommunityMessengerRoomSnapshot(id);
  noteMessengerRoomRoutePrefetchArmed(href);
  void args.router.prefetch?.(href);
  noteR2M11DRouterPrefetchCalled(id, href);
  void import("@/components/community-messenger/CommunityMessengerRoomClient").then(() => {
    noteR2M10RoomPageChunkLoaded();
    noteR2M11DChunkImportDone(id);
  });
}
