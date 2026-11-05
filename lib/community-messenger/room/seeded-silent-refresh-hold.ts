import { isAuthoritativeMessengerRoomEntrySnapshot } from "@/lib/community-messenger/room/messenger-room-initial-snapshot-authority";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

/** composer 준비 신호 — 신호를 만든 시점의 방(적용된 스냅샷 방 id)과 hold 세대 */
export type SeededSilentHoldSignal = { roomId: string; generation: number };

export type SeededSilentRefreshHold = {
  /** 방 진입(마운트·방 전환)마다 새 세대 — 시드 진입이면 첫 silent refresh 를 보류한다. 새 세대 번호 반환 */
  arm(seeded: boolean): number;
  /** 화면 이탈 — 그 세대의 대기 refresh 를 풀어 영원히 남지 않게 한다(이미 다음 세대면 무시) */
  disarm(generation: number): void;
  generation(): number;
  /** 보류 중인 세대(1 이상), 보류가 없으면 0 */
  activeGeneration(): number;
  /** 보류 중이면 대기 Promise, 아니면 null */
  pending(): Promise<void> | null;
  /** 같은 세대 · 신호 방 = 적용 스냅샷 방 · placeholder 아닌 정상 시드일 때만 해제 */
  release(signal: SeededSilentHoldSignal | undefined, snapshot: CommunityMessengerRoomSnapshot | null): boolean;
};

export function createSeededSilentRefreshHold(): SeededSilentRefreshHold {
  let generation = 0;
  let active: { generation: number; promise: Promise<void>; resolve: () => void } | null = null;

  const drop = () => {
    const a = active;
    active = null;
    a?.resolve();
  };

  return {
    arm(seeded) {
      drop();
      generation += 1;
      if (!seeded) return generation;
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      active = { generation, promise, resolve };
      return generation;
    },
    disarm(gen) {
      if (active?.generation === gen) drop();
    },
    generation: () => generation,
    activeGeneration: () => active?.generation ?? 0,
    pending: () => active?.promise ?? null,
    release(signal, snapshot) {
      const a = active;
      if (!a || !signal) return false;
      if (signal.generation !== a.generation) return false;
      const rid = signal.roomId.trim();
      if (!rid) return false;
      if (!isAuthoritativeMessengerRoomEntrySnapshot(snapshot)) return false;
      if (snapshot.room.id.trim() !== rid) return false;
      drop();
      return true;
    },
  };
}
