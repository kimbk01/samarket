import {
  noteMessengerRoomTimelineGap,
  selectNewestConfirmedMessageAnchor,
  type MessengerCatchUpAnchorMessage,
} from "@/lib/community-messenger/room/messenger-room-catchup-anchor";

/**
 * 방 bump 버스트에서 버려지는 bump → 타임라인 갭 등록.
 *
 * `useMessengerRoomBumpBroadcastSubscription` 은 같은 프레임의 bump 가 앞선 rAF(스냅샷 병합·catch-up)를 취소하고,
 * 180ms 안의 bump 는 앞선 hint 를 덮어쓴다. 마지막 bump 단건만 병합되면 앞선 메시지는 방을 다시 불러오기 전까지 빠진다.
 * 버스트 첫 bump 시점의 최신 확정 행을 앵커로 잡아 두고, **버려지는 순간에만** 갭으로 등록한다
 * (열린 방 catch-up 이 그 앵커부터 `after=` 로 메움). 평상시 bump 는 요청 수가 늘지 않는다.
 */
export type RoomBumpBurstGapTracker = {
  /** bump 수신마다 — 버스트 첫 bump 일 때만 앵커를 잡는다. */
  onBumpReceived: () => void;
  /** 앞선 bump 처리가 취소되거나 hint 가 덮어써질 때. */
  onBumpDropped: () => void;
  /** catch-up 을 보냈거나 catch-up 없이 끝난 bump — 다음 버스트로 앵커를 넘기지 않는다. */
  endBurst: () => void;
};

export function createRoomBumpBurstGapTracker(deps: {
  getMessages: () => ReadonlyArray<MessengerCatchUpAnchorMessage>;
  getRoomId: () => string;
  noteGap?: typeof noteMessengerRoomTimelineGap;
}): RoomBumpBurstGapTracker {
  const noteGap = deps.noteGap ?? noteMessengerRoomTimelineGap;
  let anchor: { id: string; createdAt: string | null } | null = null;
  return {
    onBumpReceived: () => {
      if (anchor) return;
      const confirmed = deps.getMessages().filter((m) => !m.pending);
      const id = selectNewestConfirmedMessageAnchor([...confirmed]);
      if (!id) return;
      const row = confirmed.find((m) => String(m.id ?? "").trim() === id);
      anchor = { id, createdAt: row?.createdAt ?? null };
    },
    onBumpDropped: () => {
      if (!anchor) return;
      const rid = deps.getRoomId().trim();
      if (rid) noteGap(rid, anchor.id, anchor.createdAt);
    },
    endBurst: () => {
      anchor = null;
    },
  };
}
