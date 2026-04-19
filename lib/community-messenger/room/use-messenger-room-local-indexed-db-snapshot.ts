"use client";

import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { getLocalRoomSnapshot, putLocalRoomSnapshot } from "@/lib/community-messenger/local-store/roomSnapshotDb";
import { recordRouteEntryElapsedMetric } from "@/lib/runtime/samarket-runtime-debug";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
/**
 * Local-first: 목록 프리패치/서버 시드가 없을 때 IndexedDB 스냅샷으로 first paint를 당기고,
 * 스냅샷 갱신 시 로컬에 best-effort persist.
 * `useMessengerRoomClientPhase1` 의 동일 effect 블록을 옮긴 것 — 호출 순서(부트스트랩 직후) 유지.
 */
export function useMessengerRoomLocalIndexedDbSnapshot({
  roomId,
  snapshotRef,
  snapshot,
  setSnapshot,
  setLoading,
  loadedRef,
  setRoomReadyForRealtime,
}: {
  roomId: string;
  snapshotRef: MutableRefObject<CommunityMessengerRoomSnapshot | null>;
  snapshot: CommunityMessengerRoomSnapshot | null;
  setSnapshot: Dispatch<SetStateAction<CommunityMessengerRoomSnapshot | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  loadedRef: MutableRefObject<boolean>;
  setRoomReadyForRealtime: Dispatch<SetStateAction<boolean>>;
}): void {
  const localCacheReadStartRecordedRef = useRef(false);
  const localCacheReadEndRecordedRef = useRef(false);
  // Local-first: 서버 시드가 없을 때만 — 다음 마이크로태스크에서 바로 읽어 첫 페인트를 당김
  useEffect(() => {
    if (snapshotRef.current) return;
    const id = String(roomId ?? "").trim();
    if (!id) return;
    let cancelled = false;
    queueMicrotask(() => {
      void (async () => {
        if (!localCacheReadStartRecordedRef.current) {
          localCacheReadStartRecordedRef.current = true;
          recordRouteEntryElapsedMetric("messenger_room_entry", "phase1_local_cache_read_start_ms");
        }
        const local = await getLocalRoomSnapshot(id);
        if (!localCacheReadEndRecordedRef.current) {
          localCacheReadEndRecordedRef.current = true;
          recordRouteEntryElapsedMetric("messenger_room_entry", "phase1_local_cache_read_end_ms");
        }
        if (cancelled) return;
        if (!local) return;
        if (snapshotRef.current) return;
        setSnapshot(local);
        setLoading(false);
        loadedRef.current = true;
        setRoomReadyForRealtime(true);
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  // 스냅샷이 갱신될 때 로컬에 persist (best-effort, LRU/TTL/상한은 DB 레이어에서 처리)
  useEffect(() => {
    const snap = snapshotRef.current;
    if (!snap) return;
    const id = String(roomId ?? "").trim();
    if (!id) return;
    void putLocalRoomSnapshot(id, snap);
  }, [roomId, snapshot]);
}
