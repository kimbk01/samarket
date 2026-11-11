import type { MainTabKeepAliveHubId } from "@/lib/layout/resolve-main-surface";

/**
 * D1 허브 화면 보관대 상태 (순수 함수) — `components/layout/HubRetentionStack.tsx` 전용.
 * 설계: `docs/audit/d1-hub-screen-retention-design-2026-11-11.md` §3.
 */

/** 보관 대상 허브 — 채팅(`chat`)은 숨김 중 실시간·읽음 시험 통과 전까지 제외(설계서 §3-7). */
export const HUB_RETENTION_HUB_IDS: ReadonlySet<MainTabKeepAliveHubId> = new Set<MainTabKeepAliveHubId>([
  "home",
  "community",
  "trade",
  "delivery",
  "mypage",
]);

export type HubRetentionEntry<C> = {
  id: MainTabKeepAliveHubId;
  /** 이 칸에 공급하는 라우터 정보 — 숨김 중에는 떠나기 직전 값, 보이는 동안에는 현재 값 */
  ctx: C;
  /**
   * 숨김 → 보임으로 돌아온 순간의 「현재 라우터 정보」. 같은 주소로 돌아왔으면 그 뒤 라우터가 다시 바뀔 때까지
   * 떠나기 직전 정보(`ctx`)로 계속 그린다 — 돌아오는 이동이 받아 온 새 서버 응답으로 화면을 다시 만들지 않게.
   */
  pinnedLive: C | null;
};

export type HubRetentionState<C> = {
  /** 마지막으로 확인된 계정 키 — `null` = 아직 확인 중(비교하지 않음) */
  viewerKey: string | null;
  /** 지난 렌더에 보이던 보관 허브 */
  currentId: MainTabKeepAliveHubId | null;
  entries: ReadonlyArray<HubRetentionEntry<C>>;
};

type MembershipLike =
  | { status: "checking" }
  | { status: "guest" }
  | { status: "member"; profile: { id: string } };

/** 확인 중 = null(판정 보류), 비회원 = "guest", 회원 = "member:<id>" */
export function resolveHubRetentionViewerKey(m: MembershipLike): string | null {
  if (m.status === "checking") return null;
  if (m.status === "guest") return "guest";
  const id = m.profile.id.trim();
  return id ? `member:${id}` : "guest";
}

/**
 * 이번 렌더의 보관 목록. 바뀐 것이 없으면 같은 객체를 돌려준다(렌더 중 setState 반복 방지).
 * - 계정 키가 확인된 두 값 사이에서 바뀌면 목록을 비운다(이전 계정 화면 노출 금지).
 * - 처음 여는 허브는 현재 라우터 정보로 추가.
 * - 숨겨 둔 허브로 **같은 주소**로 돌아오면 떠나기 직전 정보를 그대로 쓴다(다시 만들지 않음). 주소가 다르면 현재 정보.
 * - 보이는 동안 라우터 정보가 다시 바뀌면(새로고침·같은 허브 안 이동) 현재 정보로 갱신.
 */
export function nextHubRetentionState<C>(
  prev: HubRetentionState<C>,
  input: {
    hubId: MainTabKeepAliveHubId | null;
    viewerKey: string | null;
    liveCtx: C;
    retainable: ReadonlySet<MainTabKeepAliveHubId>;
    sameAddress: (a: C, b: C) => boolean;
  }
): HubRetentionState<C> {
  let state = prev;
  if (input.viewerKey !== null && input.viewerKey !== prev.viewerKey) {
    const accountChanged = prev.viewerKey !== null;
    state = {
      viewerKey: input.viewerKey,
      currentId: accountChanged ? null : prev.currentId,
      entries: accountChanged ? [] : prev.entries,
    };
  }
  const id = input.hubId && input.retainable.has(input.hubId) ? input.hubId : null;
  if (!id) {
    return state.currentId === null ? state : { ...state, currentId: null };
  }
  const live = input.liveCtx;
  const idx = state.entries.findIndex((e) => e.id === id);
  if (idx < 0) {
    return { ...state, currentId: id, entries: [...state.entries, { id, ctx: live, pinnedLive: null }] };
  }
  const entry = state.entries[idx]!;
  let nextEntry: HubRetentionEntry<C> = entry;
  if (state.currentId !== id) {
    /** 숨김 → 보임 */
    nextEntry =
      entry.ctx !== live && input.sameAddress(entry.ctx, live)
        ? { id, ctx: entry.ctx, pinnedLive: live }
        : entry.ctx === live && entry.pinnedLive === null
          ? entry
          : { id, ctx: live, pinnedLive: null };
  } else if (entry.pinnedLive !== null) {
    if (entry.pinnedLive !== live) nextEntry = { id, ctx: live, pinnedLive: null };
  } else if (entry.ctx !== live) {
    nextEntry = { id, ctx: live, pinnedLive: null };
  }
  if (nextEntry === entry && state.currentId === id) return state;
  const entries = nextEntry === entry ? state.entries : state.entries.map((e, i) => (i === idx ? nextEntry : e));
  return { ...state, currentId: id, entries };
}

/**
 * 보관 중인 허브(숨김) 기록 — 하단 탭 누름 미리 받기(`bottom-nav-tap-prewarm-data`)가
 * 이미 화면·데이터를 가진 허브의 데이터를 다시 받지 않게 한다(설계서 §4 60초 규칙과 같은 기준).
 * 보관대 인스턴스마다 따로 기록하고, 인스턴스가 사라지면 그 기록도 지운다.
 */
type RetainedRecord = { hiddenAt: number; epoch: number };
const retainedByInstance = new Map<number, Map<MainTabKeepAliveHubId, RetainedRecord>>();
let nextInstanceId = 1;

export function allocateHubRetentionInstanceId(): number {
  return nextInstanceId++;
}

export function recordHubRetentionSnapshot(
  instanceId: number,
  hidden: ReadonlyArray<MainTabKeepAliveHubId>,
  epoch: number,
  now: number = Date.now()
): void {
  const prev = retainedByInstance.get(instanceId);
  const next = new Map<MainTabKeepAliveHubId, RetainedRecord>();
  for (const id of hidden) {
    next.set(id, prev?.get(id) ?? { hiddenAt: now, epoch });
  }
  retainedByInstance.set(instanceId, next);
}

export function forgetHubRetentionInstance(instanceId: number): void {
  retainedByInstance.delete(instanceId);
}

/** 이 허브가 보관 중이고 숨긴 지 `maxAgeMs` 안·같은 데이터 세대면 true */
export function isHubScreenRetainedFresh(
  hubId: MainTabKeepAliveHubId,
  epoch: number,
  maxAgeMs: number,
  now: number = Date.now()
): boolean {
  for (const records of retainedByInstance.values()) {
    const r = records.get(hubId);
    if (r && r.epoch === epoch && now - r.hiddenAt < maxAgeMs) return true;
  }
  return false;
}
