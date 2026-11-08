/**
 * 홈 교체 규칙 — Owner 시안 v22 「고정되지 않게」 (2026-11-09).
 *
 * - 바뀌는 때 = 당겨서 새로고침 · 재접속(새 앱 실행 = 새 세션)만. 홈을 보는 동안·탭 갔다 오기·뒤로 가기로는 안 바뀐다.
 * - 고르는 방법 = 「한 번도 안 나온 것 먼저, 그다음 가장 오래전에 나온 것」 → 후보가 많아도 돌아가며 모두 나온다.
 *   후보 순서 자체는 각 칸의 기준(매장 = 배달 탭과 같은 순서, 거래 = 최신순, 배너 = 어드민 순서) 그대로.
 * - 저장: 세션 = 지금 보이는 선택(같은 세션 안에서는 그대로) · 기기 = 지금 선택 + 보인 기록(최근 것이 앞).
 *   저장소가 막혀 있으면(사생활 모드 등) 매번 후보 앞에서부터 보인다 — 화면은 정상으로 그린다.
 */

export type HomeShownLog = {
  stores: string[];
  /** 매장 id → 보인 메뉴 기록 */
  menus: Record<string, string[]>;
  trades: string[];
};

export type HomeRotationState = {
  bannerId: string | null;
  /** 지금 보이는 것 */
  stores: string[];
  menus: Record<string, string[]>;
  trades: string[];
  /** 보인 기록 — 최근 것이 앞 */
  log: HomeShownLog;
};

const SESSION_KEY = "dibay:home:pick:v2";
const LOCAL_KEY = "dibay:home:shown:v2";
export const HOME_SHOWN_LOG_CAP = 80;

export function emptyHomeRotation(): HomeRotationState {
  return { bannerId: null, stores: [], menus: {}, trades: [], log: { stores: [], menus: {}, trades: [] } };
}

const ids = (a: unknown): string[] => (Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : []);
function idMap(v: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, arr] of Object.entries(v as Record<string, unknown>)) out[k] = ids(arr);
  }
  return out;
}

function parse(raw: string | null): HomeRotationState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const log = (v.log ?? {}) as Record<string, unknown>;
    return {
      bannerId: typeof v.bannerId === "string" ? v.bannerId : null,
      stores: ids(v.stores),
      menus: idMap(v.menus),
      trades: ids(v.trades),
      log: { stores: ids(log.stores), menus: idMap(log.menus), trades: ids(log.trades) },
    };
  } catch {
    return null;
  }
}

/** 이번 세션에 이미 고른 것 (없으면 null = 새 세션 → 교체) */
export function readHomeSessionPick(): HomeRotationState | null {
  try {
    return parse(window.sessionStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

/** 기기에 남은 지난 선택·기록 (다음 교체 기준) */
export function readHomeShownHistory(): HomeRotationState {
  try {
    return parse(window.localStorage.getItem(LOCAL_KEY)) ?? emptyHomeRotation();
  } catch {
    return emptyHomeRotation();
  }
}

export function saveHomePick(next: HomeRotationState): void {
  const json = JSON.stringify(next);
  try {
    window.sessionStorage.setItem(SESSION_KEY, json);
  } catch {
    /* 저장소 막힘 — 화면은 그대로 */
  }
  try {
    window.localStorage.setItem(LOCAL_KEY, json);
  } catch {
    /* 저장소 막힘 — 화면은 그대로 */
  }
}

/** 기록에 이번에 보인 것을 앞에 넣는다 (중복 제거·상한) */
export function pushShownLog(log: readonly string[], shown: readonly string[]): string[] {
  const s = new Set(shown);
  return [...shown, ...log.filter((x) => !s.has(x))].slice(0, HOME_SHOWN_LOG_CAP);
}

/**
 * 「한 번도 안 나온 것 먼저(후보 순서), 그다음 가장 오래전에 나온 것」 — 앞에서 take 개.
 * @param log 보인 기록(최근 것이 앞)
 */
export function rotateUnseenFirst<T>(
  pool: readonly T[],
  idOf: (item: T) => string,
  log: readonly string[],
  take: number
): T[] {
  const age = new Map(log.map((id, i) => [id, i] as const));
  const fresh = pool.filter((p) => !age.has(idOf(p)));
  const seen = pool
    .filter((p) => age.has(idOf(p)))
    .sort((a, b) => (age.get(idOf(b)) ?? 0) - (age.get(idOf(a)) ?? 0));
  return [...fresh, ...seen].slice(0, Math.max(0, take));
}

/** 배너 — 지난번 배너 다음 차례 (어드민 순서로 한 바퀴) */
export function nextBannerId(list: readonly string[], lastId: string | null): string | null {
  if (list.length === 0) return null;
  if (!lastId) return list[0]!;
  const i = list.indexOf(lastId);
  return list[(i + 1) % list.length]!;
}

/** 세션 선택을 지금 후보에 맞춰 다시 쓰기 — 사라진 항목은 빼고, 모자라면 후보 앞에서 채운다 */
export function keepSessionPick<T>(
  pool: readonly T[],
  idOf: (item: T) => string,
  picked: readonly string[],
  take: number
): T[] {
  const byId = new Map(pool.map((p) => [idOf(p), p] as const));
  const kept = picked.map((id) => byId.get(id)).filter((x): x is T => x !== undefined);
  if (kept.length >= take) return kept.slice(0, take);
  const used = new Set(kept.map(idOf));
  return [...kept, ...pool.filter((p) => !used.has(idOf(p)))].slice(0, take);
}
