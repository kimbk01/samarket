"use client";

/**
 * CONTRACT — 주문 채팅( store_order ) 메신저 방 진입
 * - 매장·구매자 모두 `ensure-chat` 응답 `roomSnapshot`(full history) 으로 `initialServerSnapshot` 시드.
 * - `pickAuthoritativeMessengerRoomSnapshot` — 빈 peek 캐시보다 진입 게이트 시드 우선.
 * - DO NOT: 오너 슬라이드 effect deps 에 `order.community_messenger_room_id` (목록 보강 시 RoomClient 리셋).
 * - DO NOT: ensure 응답 파싱에 `ok:true` 래퍼만 의존 — `parseEmbeddedRoomSnapshot` 사용.
 * - `?cm_ctx=`(storeOrderId) 있으면 bootstrap 생략·ensure 1왕복 우선.
 */

import type {
  CommunityMessengerRoomContextMetaV1,
  CommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/types";
import { resolveInstantStoreOrderMessengerEntrySnapshot } from "@/lib/store-order-chat/store-order-messenger-entry-shell-snapshot";

import { parseCommunityMessengerRoomSnapshotResponse } from "@/lib/community-messenger/messenger-room-bootstrap";

import { fetchCommunityMessengerRoomBootstrapClient } from "@/lib/community-messenger/room/fetch-community-messenger-room-bootstrap-client";

import {

  assertStoreOrderRoomBootstrapHasTimelineSeed,

} from "@/lib/community-messenger/room/messenger-room-initial-snapshot-authority";

import { invalidateRoomSnapshot, peekRoomSnapshot, primeRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";



export type StoreOrderMessengerRoomEntryResult =

  | { ok: true; roomId: string; snapshot: CommunityMessengerRoomSnapshot }

  | { ok: false; error: string };



function storeOrderIdFromSnapshot(snapshot: CommunityMessengerRoomSnapshot): string {

  const meta = snapshot.room.contextMeta;

  if (meta?.kind !== "delivery") return "";

  return typeof meta.storeOrderId === "string" ? meta.storeOrderId.trim() : "";

}



function storeIdFromSnapshot(snapshot: CommunityMessengerRoomSnapshot): string {

  const meta = snapshot.room.contextMeta;

  if (meta?.kind !== "delivery") return "";

  return typeof meta.storeId === "string" ? meta.storeId.trim() : "";

}



function parseEmbeddedRoomSnapshot(raw: unknown): CommunityMessengerRoomSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.viewerUserId === "string" && o.viewerUserId.trim() && Array.isArray(o.messages)) {
    return o as CommunityMessengerRoomSnapshot;
  }
  return parseCommunityMessengerRoomSnapshotResponse({ ok: true, ...o });
}

function parseEnsureChatRoomSnapshot(json: Record<string, unknown>): CommunityMessengerRoomSnapshot | null {
  const embedded = json.roomSnapshot;
  if (embedded && typeof embedded === "object") {
    return parseEmbeddedRoomSnapshot(embedded);
  }
  return null;
}



function primeAuthoritativeSnapshot(roomId: string, snapshot: CommunityMessengerRoomSnapshot): void {

  invalidateRoomSnapshot(roomId);

  primeRoomSnapshot(roomId, snapshot);

}



/** 스냅샷·참가자 role 로 buyer/owner ensure API 를 고른다. */

async function ensureStoreOrderChatFromSnapshot(

  snapshot: CommunityMessengerRoomSnapshot

): Promise<{ ok: true; roomId: string; snapshot: CommunityMessengerRoomSnapshot } | { ok: false; error: string }> {

  const orderId = storeOrderIdFromSnapshot(snapshot);

  if (!orderId) return { ok: false, error: "missing_store_order_id" };



  const isOwner = snapshot.myRole === "owner";

  const storeId = storeIdFromSnapshot(snapshot);



  const url =

    isOwner && storeId

      ? `/api/me/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderId)}/ensure-chat`

      : `/api/me/store-orders/${encodeURIComponent(orderId)}/ensure-chat`;



  const res = await fetch(url, { method: "POST", credentials: "include", cache: "no-store" });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {

    ok?: boolean;

    error?: string;

    community_messenger_room_id?: string | null;

  };

  if (!res.ok || !json?.ok) {

    return { ok: false, error: typeof json?.error === "string" ? json.error : "ensure_failed" };

  }

  const roomId = String(json.community_messenger_room_id ?? snapshot.room.id ?? "").trim();

  if (!roomId) return { ok: false, error: "missing_room_id" };



  let nextSnapshot = parseEnsureChatRoomSnapshot(json);

  if (!nextSnapshot) {

    invalidateRoomSnapshot(roomId);

    nextSnapshot = await fetchCommunityMessengerRoomBootstrapClient(roomId, { bustCache: true });

  }

  if (!nextSnapshot) return { ok: false, error: "bootstrap_failed" };



  const seedCheck = assertStoreOrderRoomBootstrapHasTimelineSeed(nextSnapshot);

  if (!seedCheck.ok) return { ok: false, error: seedCheck.reason };



  primeAuthoritativeSnapshot(roomId, nextSnapshot);

  return { ok: true, roomId, snapshot: nextSnapshot };

}



/**

 * 주문 id 기준 — ensure+bootstrap(full history) 1왕복 후 RoomClient 시드.

 * 오너 슬라이드·주문 상세 CTA 등 orderId 를 아는 진입점.

 */

export type PrepareStoreOrderMessengerRoomEntryByOrderParams = {
  orderId: string;
  storeId?: string;
  role: "owner" | "buyer";
  /** ensure 응답 직후 instant shell — delivery 헤더·크롬 시드 */
  instantContextMeta?: CommunityMessengerRoomContextMetaV1 | null;
  myRole?: "owner" | "member";
  viewerUserId?: string;
  /** roomId 확정 직후(부트스트랩 fetch 전) RoomClient 즉시 마운트용 */
  onShellReady?: (roomId: string, shell: CommunityMessengerRoomSnapshot) => void;
};

export async function prepareStoreOrderMessengerRoomEntryByOrder(
  params: PrepareStoreOrderMessengerRoomEntryByOrderParams
): Promise<StoreOrderMessengerRoomEntryResult> {

  const orderId = params.orderId.trim();

  if (!orderId) return { ok: false, error: "missing_order_id" };



  const ensureUrl =

    params.role === "owner" && params.storeId?.trim()

      ? `/api/me/stores/${encodeURIComponent(params.storeId.trim())}/orders/${encodeURIComponent(orderId)}/ensure-chat`

      : `/api/me/store-orders/${encodeURIComponent(orderId)}/ensure-chat`;



  const ensureRes = await fetch(ensureUrl, { method: "POST", credentials: "include", cache: "no-store" });

  const ensureJson = (await ensureRes.json().catch(() => ({}))) as Record<string, unknown> & {

    ok?: boolean;

    error?: string;

    community_messenger_room_id?: string | null;

  };

  if (!ensureRes.ok || !ensureJson?.ok) {

    return {

      ok: false,

      error: typeof ensureJson?.error === "string" ? ensureJson.error : "ensure_failed",

    };

  }



  const roomId = String(ensureJson.community_messenger_room_id ?? "").trim();

  if (!roomId) return { ok: false, error: "missing_room_id" };

  params.onShellReady?.(
    roomId,
    resolveInstantStoreOrderMessengerEntrySnapshot({
      roomId,
      viewerUserId: params.viewerUserId,
      contextMeta: params.instantContextMeta,
      myRole: params.myRole ?? (params.role === "owner" ? "owner" : "member"),
    })
  );

  let snapshot = parseEnsureChatRoomSnapshot(ensureJson);

  if (!snapshot) {

    invalidateRoomSnapshot(roomId);

    snapshot = await fetchCommunityMessengerRoomBootstrapClient(roomId, { bustCache: true });

  }

  if (!snapshot) return { ok: false, error: "bootstrap_failed" };



  const seedCheck = assertStoreOrderRoomBootstrapHasTimelineSeed(snapshot);

  if (!seedCheck.ok) return { ok: false, error: seedCheck.reason };



  primeAuthoritativeSnapshot(roomId, snapshot);

  return { ok: true, roomId, snapshot };

}



/**

 * roomId 기준 — bootstrap → (주문 방이면) ensure+bootstrap 재조회.

 */

export type PrepareStoreOrderMessengerRoomEntryByRoomIdOptions = {
  /** `?cm_ctx=` 등 — bootstrap 없이 ensure 1왕복으로 히스토리 정합 */
  instantContextMeta?: CommunityMessengerRoomContextMetaV1 | null;
  myRole?: "owner" | "member";
  viewerUserId?: string;
};

export async function prepareStoreOrderMessengerRoomEntryByRoomId(
  roomId: string,
  opts?: PrepareStoreOrderMessengerRoomEntryByRoomIdOptions
): Promise<StoreOrderMessengerRoomEntryResult> {
  const rid = roomId.trim();
  if (!rid) return { ok: false, error: "missing_room_id" };

  const orderIdFromCtx =
    opts?.instantContextMeta?.kind === "delivery" ?
      (typeof opts.instantContextMeta.storeOrderId === "string" ?
        opts.instantContextMeta.storeOrderId.trim()
      : "")
    : "";

  /** 목록·prefetch 캐시에 주문 메타가 있으면 bootstrap 생략 → ensure 1왕복(full history) */
  const viewerId = (opts?.viewerUserId ?? "").trim();
  const cachedPeek = viewerId ? peekRoomSnapshot(rid, viewerId) : null;
  const cachedOrderId = cachedPeek ? storeOrderIdFromSnapshot(cachedPeek) : "";
  if (cachedOrderId && cachedPeek) {
    const ensuredFromCache = await ensureStoreOrderChatFromSnapshot(cachedPeek);
    if (ensuredFromCache.ok) {
      primeAuthoritativeSnapshot(ensuredFromCache.roomId, ensuredFromCache.snapshot);
      return { ok: true, roomId: ensuredFromCache.roomId, snapshot: ensuredFromCache.snapshot };
    }
  }

  if (orderIdFromCtx && opts?.instantContextMeta) {
    const shellSeed = resolveInstantStoreOrderMessengerEntrySnapshot({
      roomId: rid,
      viewerUserId: opts.viewerUserId,
      contextMeta: opts.instantContextMeta,
      myRole: opts.myRole,
    });
    const ensuredFromCtx = await ensureStoreOrderChatFromSnapshot(shellSeed);
    if (ensuredFromCtx.ok) {
      primeAuthoritativeSnapshot(ensuredFromCtx.roomId, ensuredFromCtx.snapshot);
      return { ok: true, roomId: ensuredFromCtx.roomId, snapshot: ensuredFromCtx.snapshot };
    }
  }

  let snapshot = await fetchCommunityMessengerRoomBootstrapClient(rid);
  if (!snapshot) return { ok: false, error: "bootstrap_failed" };

  const orderId = storeOrderIdFromSnapshot(snapshot);
  if (orderId) {
    const ensured = await ensureStoreOrderChatFromSnapshot(snapshot);
    if (!ensured.ok) return { ok: false, error: ensured.error };
    snapshot = ensured.snapshot;
  }

  const canonicalRoomId = snapshot.room.id.trim() || rid;
  const seedCheck = assertStoreOrderRoomBootstrapHasTimelineSeed(snapshot);
  if (!seedCheck.ok) return { ok: false, error: seedCheck.reason };

  primeAuthoritativeSnapshot(canonicalRoomId, snapshot);
  return { ok: true, roomId: canonicalRoomId, snapshot };
}

