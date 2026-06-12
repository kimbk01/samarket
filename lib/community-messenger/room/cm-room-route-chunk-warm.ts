"use client";

import { noteR2M10RoomPageChunkLoaded } from "@/lib/community-messenger/room/cm-room-r2-m10-route-transition";
import { samarketRuntimeDebugEnabled, samarketRuntimeDebugLog } from "@/lib/runtime/samarket-runtime-debug";

/** BN13-rsc 5차 — CM 세그먼트 한정 room route chunk warm (앱 셸 전역 아님) */
export type CmRoomRouteChunkWarmSource =
  | "cm_layout_idle"
  | "cm_hub_visible"
  | "list_io"
  | "pointerenter"
  | "pointerdown";

export type CmRoomRouteChunkWarmSession = {
  sources: CmRoomRouteChunkWarmSource[];
  layout_chunk_start_ms: number | null;
  layout_chunk_end_ms: number | null;
  page_entry_chunk_start_ms: number | null;
  page_entry_chunk_end_ms: number | null;
  room_client_chunk_start_ms: number | null;
  room_client_chunk_end_ms: number | null;
  route_entry_shell_paint_ms: number | null;
};

const K_WARM_SESSION = "samarket:cm:r2m13:route_chunk_warm";

let layoutChunkInflight: Promise<void> | null = null;
let pageEntryChunkInflight: Promise<void> | null = null;
let roomClientChunkInflight: Promise<void> | null = null;

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function readWarmSession(): CmRoomRouteChunkWarmSession {
  if (typeof sessionStorage === "undefined") {
    return emptyWarmSession();
  }
  try {
    const raw = sessionStorage.getItem(K_WARM_SESSION);
    if (!raw) return emptyWarmSession();
    return { ...emptyWarmSession(), ...(JSON.parse(raw) as Partial<CmRoomRouteChunkWarmSession>) };
  } catch {
    return emptyWarmSession();
  }
}

function emptyWarmSession(): CmRoomRouteChunkWarmSession {
  return {
    sources: [],
    layout_chunk_start_ms: null,
    layout_chunk_end_ms: null,
    page_entry_chunk_start_ms: null,
    page_entry_chunk_end_ms: null,
    room_client_chunk_start_ms: null,
    room_client_chunk_end_ms: null,
    route_entry_shell_paint_ms: null,
  };
}

function writeWarmSession(session: CmRoomRouteChunkWarmSession): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(K_WARM_SESSION, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export function resetCmRoomRouteChunkWarmForTests(): void {
  layoutChunkInflight = null;
  pageEntryChunkInflight = null;
  roomClientChunkInflight = null;
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(K_WARM_SESSION);
  } catch {
    /* ignore */
  }
}

export function getCmRoomRouteChunkWarmSession(): CmRoomRouteChunkWarmSession {
  return readWarmSession();
}

export function noteCmRoomRouteChunkWarmRouteEntryShellPainted(at?: number): void {
  const session = readWarmSession();
  if (session.route_entry_shell_paint_ms != null) return;
  session.route_entry_shell_paint_ms = at ?? perfNow();
  writeWarmSession(session);
  if (samarketRuntimeDebugEnabled()) {
    samarketRuntimeDebugLog("r2-m13", "route_entry_shell_paint", {
      at: session.route_entry_shell_paint_ms,
      layout_end_ms: session.layout_chunk_end_ms,
      page_entry_end_ms: session.page_entry_chunk_end_ms,
      room_client_end_ms: session.room_client_chunk_end_ms,
      sources: session.sources,
    });
  }
}

function appendWarmSource(source: CmRoomRouteChunkWarmSource): void {
  const session = readWarmSession();
  if (!session.sources.includes(source)) {
    session.sources.push(source);
  }
  writeWarmSession(session);
}

function startLayoutChunkWarm(): void {
  const session = readWarmSession();
  if (session.layout_chunk_start_ms == null) {
    session.layout_chunk_start_ms = perfNow();
    writeWarmSession(session);
  }
  if (layoutChunkInflight) return;
  layoutChunkInflight = import(
    "@/components/community-messenger/room/CommunityMessengerRoomLayoutShellClientBridge"
  )
    .then(() => {
      const s = readWarmSession();
      if (s.layout_chunk_end_ms == null) {
        s.layout_chunk_end_ms = perfNow();
        writeWarmSession(s);
      }
    })
    .finally(() => {
      layoutChunkInflight = null;
    });
}

function startPageEntryChunkWarm(): void {
  const session = readWarmSession();
  if (session.page_entry_chunk_start_ms == null) {
    session.page_entry_chunk_start_ms = perfNow();
    writeWarmSession(session);
  }
  if (pageEntryChunkInflight) return;
  pageEntryChunkInflight = import("@/components/community-messenger/room/CommunityMessengerRoomPageClientEntry")
    .then(() => {
      const s = readWarmSession();
      if (s.page_entry_chunk_end_ms == null) {
        s.page_entry_chunk_end_ms = perfNow();
        writeWarmSession(s);
      }
    })
    .finally(() => {
      pageEntryChunkInflight = null;
    });
}

function startRoomClientChunkWarm(): void {
  const session = readWarmSession();
  if (session.room_client_chunk_start_ms == null) {
    session.room_client_chunk_start_ms = perfNow();
    writeWarmSession(session);
  }
  if (roomClientChunkInflight) return;
  roomClientChunkInflight = import("@/components/community-messenger/CommunityMessengerRoomClient")
    .then(() => {
      noteR2M10RoomPageChunkLoaded();
      const s = readWarmSession();
      if (s.room_client_chunk_end_ms == null) {
        s.room_client_chunk_end_ms = perfNow();
        writeWarmSession(s);
      }
    })
    .finally(() => {
      roomClientChunkInflight = null;
    });
}

/** CM hub/list·layout idle·list IO·hover·tap — room route chunk 선행 warm */
export function warmCommunityMessengerRoomRouteChunks(
  source: CmRoomRouteChunkWarmSource,
  options?: { layoutOnly?: boolean }
): void {
  if (typeof window === "undefined") return;
  appendWarmSource(source);
  startLayoutChunkWarm();
  if (options?.layoutOnly) return;
  startPageEntryChunkWarm();
  startRoomClientChunkWarm();
  if (samarketRuntimeDebugEnabled()) {
    samarketRuntimeDebugLog("r2-m13", "chunk_warm_arm", { source, layoutOnly: Boolean(options?.layoutOnly) });
  }
}

export function mapArmPrefetchSourceToChunkWarm(
  source: "pointerdown" | "intersection" | "pointerenter"
): CmRoomRouteChunkWarmSource {
  if (source === "intersection") return "list_io";
  return source;
}
