/**
 * 방 사진·음성 모음 — 서버 조회 1경로 (설계 M4 · Owner 2026-11-16 「3건 수정」 M1).
 * 2026-11-15 실기: 1:1 방 모음이 화면에 불러온 메시지만 세어 서버에 사진 5건이 있는데 「사진 0 · 미디어 없음」.
 *
 * 보이는 규칙(타임라인과 같음): 삭제·모두에게서 삭제·관리자 숨김 제외 · 나에게서만 삭제 제외 · 기록 하한(cleared_at) 이후만.
 */
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  encodeGroupMediaCursor,
  parseGroupMediaCursor,
} from "@/lib/community-messenger/group/group-room-media-index";
import { messengerImageClientFieldsFromMetadata } from "@/lib/community-messenger/messenger-image-message-map";
import { participantHistoryFloorIso } from "@/lib/community-messenger/room/message-history-floor";

export const ROOM_MEDIA_GALLERY_TYPES = ["image", "voice"] as const;
export type RoomMediaGalleryType = (typeof ROOM_MEDIA_GALLERY_TYPES)[number];

export type RoomMediaGalleryItem = {
  id: string;
  roomId: string;
  messageType: RoomMediaGalleryType;
  createdAt: string;
  /** 사진: 첫 장 저장 주소(썸네일). 첨부 조회 라우트로 바꿔 그린다. */
  thumbSrc: string | null;
  /** 사진 묶음 장수 */
  imageCount: number;
  voiceDurationSeconds: number | null;
};

export type RoomMediaGalleryCounts = { image: number; voice: number; file: number; link: number };

export type RoomMediaGalleryPage = {
  items: RoomMediaGalleryItem[];
  nextCursor: string | null;
  /** 첫 페이지에서만 — 이 사람에게 보이는 서버 개수(사진·음성·파일·링크, 메뉴·정보 시트 공용) */
  counts?: RoomMediaGalleryCounts;
};

/**
 * D2(2026-11-16): 파일·링크 모음도 서버 조회. 링크 = 본문에 http(s) 주소가 있는 글 메시지
 * (화면 `extractHttpUrls` 와 같은 기준: `https?://`). 사진 본문(저장 주소)은 링크로 세지 않는다.
 */
export const ROOM_LINK_CONTENT_PATTERN = "https?://";

export type RoomCollectionKind = "file" | "link";

export type RoomCollectionItem = {
  id: string;
  roomId: string;
  kind: RoomCollectionKind;
  createdAt: string;
  senderId: string | null;
  /** 파일: 저장 주소(첨부 조회 라우트로 연다) · 링크: 글 본문 */
  content: string;
  fileName: string | null;
  fileMimeType: string | null;
  fileSizeBytes: number | null;
};

export type RoomCollectionPage = { items: RoomCollectionItem[]; nextCursor: string | null };

type CountScope = RoomMediaGalleryType | RoomCollectionKind;

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 80;
const HIDES_CHUNK = 500;

type Sb = ReturnType<typeof getSupabaseServer>;

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function visibleBase(sb: Sb, roomId: string, floor: string | null, select: string, head = false) {
  let q = (sb as any)
    .from("community_messenger_messages")
    .select(select, head ? { count: "exact", head: true } : undefined)
    .eq("room_id", roomId)
    .is("deleted_at", null)
    .is("deleted_for_everyone_at", null)
    .or("is_hidden_by_admin.is.null,is_hidden_by_admin.eq.false");
  if (floor) q = q.gte("created_at", floor);
  return q;
}

async function userHiddenIds(sb: Sb, userId: string): Promise<string[]> {
  const { data, error } = await (sb as any)
    .from("community_messenger_message_user_hides")
    .select("message_id")
    .eq("user_id", userId);
  if (error) return [];
  return ((data ?? []) as Array<{ message_id?: string }>).map((r) => trimText(r.message_id)).filter(Boolean);
}

function scoped(q: any, scope: CountScope) {
  if (scope === "link") return q.eq("message_type", "text").filter("content", "imatch", ROOM_LINK_CONTENT_PATTERN);
  return q.eq("message_type", scope);
}

async function countVisible(
  sb: Sb,
  roomId: string,
  floor: string | null,
  scope: CountScope,
  hidden: string[]
): Promise<number> {
  const { count } = await scoped(visibleBase(sb, roomId, floor, "id", true), scope);
  let total = typeof count === "number" ? count : 0;
  for (let i = 0; i < hidden.length && total > 0; i += HIDES_CHUNK) {
    const { count: hiddenHere } = await scoped(visibleBase(sb, roomId, floor, "id", true), scope)
      .in("id", hidden.slice(i, i + HIDES_CHUNK));
    total -= typeof hiddenHere === "number" ? hiddenHere : 0;
  }
  return Math.max(0, total);
}

export function mapRoomMediaGalleryRow(row: Record<string, unknown>): RoomMediaGalleryItem | null {
  const id = trimText(row.id);
  const roomId = trimText(row.room_id);
  const createdAt = trimText(row.created_at);
  const type = trimText(row.message_type);
  if (!id || !roomId || !createdAt || (type !== "image" && type !== "voice")) return null;
  const metadata = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
  const content = trimText(row.content);
  if (type === "image") {
    const f = messengerImageClientFieldsFromMetadata("image", metadata, content);
    const album = f.imageAlbumUrls ?? [];
    return {
      id,
      roomId,
      messageType: "image",
      createdAt,
      thumbSrc: album[0] ?? (content || null),
      imageCount: Math.max(1, album.length),
      voiceDurationSeconds: null,
    };
  }
  const dur = Math.floor(Number(metadata.durationSeconds ?? 0));
  return {
    id,
    roomId,
    messageType: "voice",
    createdAt,
    thumbSrc: null,
    imageCount: 0,
    voiceDurationSeconds: Number.isFinite(dur) && dur > 0 ? dur : null,
  };
}

export async function listRoomMediaGallery(input: {
  userId: string;
  roomId: string;
  cursor?: string | null;
  limit?: number;
  sb?: Sb;
}): Promise<{ ok: true; page: RoomMediaGalleryPage } | { ok: false; error: "forbidden" | "load_failed" }> {
  const sb = input.sb ?? getSupabaseServer();
  const roomId = trimText(input.roomId);
  const userId = trimText(input.userId);
  const { data: part } = await (sb as any)
    .from("community_messenger_participants")
    .select("id, cleared_at, left_at")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!part || trimText((part as { left_at?: unknown }).left_at)) return { ok: false, error: "forbidden" };
  const floor = participantHistoryFloorIso(part);
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  const cursor = parseGroupMediaCursor(input.cursor);

  let q = visibleBase(sb, roomId, floor, "id, room_id, message_type, content, created_at, metadata")
    .in("message_type", [...ROOM_MEDIA_GALLERY_TYPES])
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (cursor) {
    q = q.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.messageId})`);
  }
  const { data, error } = await q;
  if (error) return { ok: false, error: "load_failed" };
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const tail = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && tail ? encodeGroupMediaCursor(trimText(tail.created_at), trimText(tail.id)) : null;

  const hidden = await userHiddenIds(sb, userId);
  const hiddenSet = new Set(hidden);
  const items = pageRows
    .filter((r) => !hiddenSet.has(trimText(r.id)))
    .map(mapRoomMediaGalleryRow)
    .filter((x): x is RoomMediaGalleryItem => x != null);

  const page: RoomMediaGalleryPage = { items, nextCursor };
  if (!cursor) {
    const [image, voice, file, link] = await Promise.all([
      countVisible(sb, roomId, floor, "image", hidden),
      countVisible(sb, roomId, floor, "voice", hidden),
      countVisible(sb, roomId, floor, "file", hidden),
      countVisible(sb, roomId, floor, "link", hidden),
    ]);
    page.counts = { image, voice, file, link };
  }
  return { ok: true, page };
}

export function mapRoomCollectionRow(row: Record<string, unknown>, kind: RoomCollectionKind): RoomCollectionItem | null {
  const id = trimText(row.id);
  const roomId = trimText(row.room_id);
  const createdAt = trimText(row.created_at);
  if (!id || !roomId || !createdAt) return null;
  const metadata = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
  const size = Math.floor(Number(metadata.fileSizeBytes ?? 0));
  return {
    id,
    roomId,
    kind,
    createdAt,
    senderId: trimText(row.sender_id) || null,
    content: trimText(row.content),
    fileName: kind === "file" ? trimText(metadata.fileName) || null : null,
    fileMimeType: kind === "file" ? trimText(metadata.mimeType) || null : null,
    fileSizeBytes: kind === "file" && Number.isFinite(size) && size > 0 ? size : null,
  };
}

/** 파일·링크 모음 페이지 — 보이는 규칙은 사진·음성 모음과 같다 */
export async function listRoomMessageCollection(input: {
  userId: string;
  roomId: string;
  kind: RoomCollectionKind;
  cursor?: string | null;
  limit?: number;
  sb?: Sb;
}): Promise<{ ok: true; page: RoomCollectionPage } | { ok: false; error: "forbidden" | "load_failed" }> {
  const sb = input.sb ?? getSupabaseServer();
  const roomId = trimText(input.roomId);
  const userId = trimText(input.userId);
  const { data: part } = await (sb as any)
    .from("community_messenger_participants")
    .select("id, cleared_at, left_at")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!part || trimText((part as { left_at?: unknown }).left_at)) return { ok: false, error: "forbidden" };
  const floor = participantHistoryFloorIso(part);
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  const cursor = parseGroupMediaCursor(input.cursor);
  let q = scoped(visibleBase(sb, roomId, floor, "id, room_id, sender_id, message_type, content, created_at, metadata"), input.kind)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (cursor) {
    q = q.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.messageId})`);
  }
  const { data, error } = await q;
  if (error) return { ok: false, error: "load_failed" };
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const tail = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && tail ? encodeGroupMediaCursor(trimText(tail.created_at), trimText(tail.id)) : null;
  const hiddenSet = new Set(await userHiddenIds(sb, userId));
  const items = pageRows
    .filter((r) => !hiddenSet.has(trimText(r.id)))
    .map((r) => mapRoomCollectionRow(r, input.kind))
    .filter((x): x is RoomCollectionItem => x != null);
  return { ok: true, page: { items, nextCursor } };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
