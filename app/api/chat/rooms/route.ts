/**
 * GET /api/chat/rooms — trade + store_order chat list (CR1 snapshot-first).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type { EffectiveListSegment } from "@/lib/chats/chat-rooms-list-core";
import { tryLoadChatRoomsFromSnapshot } from "@/lib/chats/chat-rooms-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatRoomsListCacheEntry = { at: number; payload: unknown };
const CHAT_ROOMS_LIST_CACHE_TTL_MS = 5000;
const chatRoomsListCache = new Map<string, ChatRoomsListCacheEntry>();

const DEPRECATED_CHAT_LIST_SEGMENTS = new Set([
  "philife",
  "philife_open",
  "philife_inbox",
  "community",
]);

function snapshotResponseHeaders(snapshotVia?: string): Record<string, string> {
  if (!snapshotVia) return {};
  return {
    "x-samarket-chat-rooms-snapshot-path": "1",
    "x-samarket-chat-rooms-snapshot-via": snapshotVia,
    "x-samarket-chat-rooms-query-wave-2-ms": "0",
    "x-samarket-chat-rooms-rpc-removed": "1",
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const rawSeg = req.nextUrl.searchParams.get("segment")?.trim().toLowerCase() ?? null;
  if (rawSeg && DEPRECATED_CHAT_LIST_SEGMENTS.has(rawSeg)) {
    return NextResponse.json(
      { rooms: [] },
      { headers: { "Cache-Control": "no-store", "X-Chat-Rooms-Segment": "deprecated" } }
    );
  }
  const segment: EffectiveListSegment =
    rawSeg === "trade" ? "trade" : rawSeg === "order" ? "order" : "all";
  const hubReconcile = req.nextUrl.searchParams.get("hubReconcile") === "1";
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  const chatRoomsBypass =
    req.nextUrl.searchParams.get("chatRoomsBypass") === "1" &&
    process.env.NODE_ENV === "development";
  const cacheKey = `${userId}:${segment}`;
  const cached = !hubReconcile && !fresh && !chatRoomsBypass ? chatRoomsListCache.get(cacheKey) : undefined;
  if (cached && Date.now() - cached.at < CHAT_ROOMS_LIST_CACHE_TTL_MS) {
    return NextResponse.json(cached.payload, {
      headers: {
        "X-Chat-Rooms-Cache": "HIT",
        ...snapshotResponseHeaders("route_memory_ttl"),
      },
    });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  let snapshotVia: string | undefined;
  let rooms: import("@/lib/types/chat").ChatRoom[] | undefined;

  const snap = await tryLoadChatRoomsFromSnapshot(sbAny, userId, segment, {
    bypassCounter: fresh || hubReconcile || chatRoomsBypass,
  });
  if (snap) {
    rooms = snap.rooms;
    snapshotVia = snap.snapshotVia;
  }

  if (!rooms) {
    return NextResponse.json(
      { ok: false, rooms: [], error: "snapshot_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const payload = { rooms };
  chatRoomsListCache.set(cacheKey, { at: Date.now(), payload });
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
      "X-Chat-Rooms-Cache": hubReconcile || fresh ? "bypass" : "miss",
      ...snapshotResponseHeaders(snapshotVia),
    },
  });
}
