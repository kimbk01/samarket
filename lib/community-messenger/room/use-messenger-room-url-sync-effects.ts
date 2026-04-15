"use client";

import { useEffect, type MutableRefObject } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { decodeCommunityMessengerRoomCmCtx } from "@/lib/community-messenger/cm-ctx-url";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";

type RouterReplace = (href: string, options?: { scroll?: boolean }) => void;

type Args = {
  roomId: string;
  pathname: string;
  routerReplace: RouterReplace;
  searchParams: ReadonlyURLSearchParams;
  snapshot: CommunityMessengerRoomSnapshot | null;
  loading: boolean;
  refresh: (silent?: boolean) => Promise<void>;
  contextMetaFromUrlHandledRef: MutableRefObject<boolean>;
  sheetInfoFromUrlHandledRef: MutableRefObject<boolean>;
  openInfoSheetFromUrl: () => void;
};

/**
 * 메신저 방 URL ↔ 스냅샷 정규화·딥링크(`cm_ctx`)·`?sheet=info` 처리.
 * `useMessengerRoomClientPhase1` 에서 effect 덩어리·책임 경계 분리.
 */
export function useMessengerRoomUrlSyncEffects({
  roomId,
  pathname,
  routerReplace,
  searchParams,
  snapshot,
  loading,
  refresh,
  contextMetaFromUrlHandledRef,
  sheetInfoFromUrlHandledRef,
  openInfoSheetFromUrl,
}: Args): void {
  const qs = searchParams.toString();

  /** 거래 채팅 딥링크는 `product_chats` ID 로 들어올 수 있음 — 부트스트랩 후 실제 CM `room.id` 로 URL 정규화 */
  useEffect(() => {
    if (!snapshot?.room?.id || !roomId?.trim()) return;
    const canonical = snapshot.room.id.trim();
    const fromUrl = roomId.trim();
    if (canonical === fromUrl) return;
    routerReplace(
      `/community-messenger/rooms/${encodeURIComponent(canonical)}${qs ? `?${qs}` : ""}`,
      { scroll: false }
    );
  }, [snapshot?.room?.id, roomId, routerReplace, qs]);

  /** `?cm_ctx=` 딥링크로 입장 시 거래/배달 목록 메타 1회 동기화 */
  useEffect(() => {
    if (contextMetaFromUrlHandledRef.current) return;
    const raw = searchParams.get("cm_ctx");
    if (!raw?.trim()) return;
    contextMetaFromUrlHandledRef.current = true;
    const meta = decodeCommunityMessengerRoomCmCtx(raw);
    const stripCmCtxFromUrl = () => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("cm_ctx");
      const q = next.toString();
      routerReplace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    };
    if (!meta) {
      stripCmCtxFromUrl();
      return;
    }
    void (async () => {
      try {
        const res = await fetch(communityMessengerRoomResourcePath(roomId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "context_meta", contextMeta: meta }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (res.ok && json.ok) void refresh(true);
      } finally {
        stripCmCtxFromUrl();
      }
    })();
  }, [pathname, refresh, roomId, routerReplace, searchParams, contextMetaFromUrlHandledRef]);

  useEffect(() => {
    sheetInfoFromUrlHandledRef.current = false;
  }, [roomId, sheetInfoFromUrlHandledRef]);

  /** 목록 롱프레스 「그룹/오픈 정보」 등 `?sheet=info` 로 방 정보 시트를 연다 */
  useEffect(() => {
    const sheet = searchParams.get("sheet");
    if (sheet !== "info") return;
    if (sheetInfoFromUrlHandledRef.current) return;
    if (!snapshot || loading) return;
    sheetInfoFromUrlHandledRef.current = true;
    openInfoSheetFromUrl();
    const next = new URLSearchParams(searchParams.toString());
    next.delete("sheet");
    const q = next.toString();
    routerReplace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [
    loading,
    pathname,
    routerReplace,
    searchParams,
    snapshot,
    openInfoSheetFromUrl,
    sheetInfoFromUrlHandledRef,
  ]);
}
