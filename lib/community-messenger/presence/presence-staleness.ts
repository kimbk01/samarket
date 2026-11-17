import type { CommunityMessengerPresenceState } from "@/lib/community-messenger/types";
import { SAMARKET_PRESENCE_PING_ONLINE_MAX_MS } from "@/lib/community-messenger/presence/presence-policy";

export type PresenceStalenessInput = {
  state: CommunityMessengerPresenceState;
  /** 해당 state 를 관측한 시각(Realtime track `updatedAt` 또는 HTTP 스냅샷 수신 시각) */
  updatedAtIso: string | null | undefined;
  nowMs: number;
};

export type PresenceStalenessResult = {
  state: CommunityMessengerPresenceState;
  /** 이 시각이 지나면 표시 state 가 다시 바뀜(재렌더 예약용). 변화 없음이면 null */
  nextChangeAtMs: number | null;
};

/**
 * 표시용 presence 신선도 보정 — `online` 관측이 policy 의 ping 창을 넘기면 그대로 두지 않는다.
 * - 관측 경과 ≤ `SAMARKET_PRESENCE_PING_ONLINE_MAX_MS` → online 유지
 * - 그 이후 → offline (P3 2026-11-18: 「자리 비움」 단계 삭제)
 * `away`/`offline` 관측이나 관측 시각이 없는 값은 건드리지 않는다(정보 없음 ≠ 오래됨).
 */
export function resolvePresenceStateWithStaleness(input: PresenceStalenessInput): PresenceStalenessResult {
  if (input.state !== "online") return { state: input.state, nextChangeAtMs: null };
  const raw = typeof input.updatedAtIso === "string" ? input.updatedAtIso.trim() : "";
  const observedMs = raw ? Date.parse(raw) : Number.NaN;
  if (!Number.isFinite(observedMs)) return { state: "online", nextChangeAtMs: null };
  const age = input.nowMs - observedMs;
  /** P3(레거시 기준): 중간 단계 「자리 비움」 없음 — 하트비트 창을 넘긴 online 관측은 바로 오프라인 */
  if (age > SAMARKET_PRESENCE_PING_ONLINE_MAX_MS) return { state: "offline", nextChangeAtMs: null };
  return { state: "online", nextChangeAtMs: observedMs + SAMARKET_PRESENCE_PING_ONLINE_MAX_MS + 1 };
}
