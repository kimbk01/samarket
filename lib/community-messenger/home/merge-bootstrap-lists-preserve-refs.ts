import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function normRoomId(id: string): string {
  return String(id ?? "").trim().toLowerCase();
}

/** 목록 행 리렌더 여부 — `merge-bootstrap-room-summary-into-lists` 와 동일 계약 */
export function roomSummaryListRowShallowEqual(
  a: CommunityMessengerRoomSummary,
  b: CommunityMessengerRoomSummary
): boolean {
  if (a === b) return true;
  const keys = Object.keys(a) as Array<keyof CommunityMessengerRoomSummary>;
  if (keys.length !== Object.keys(b).length) return false;
  for (const k of keys) {
    if (!(k in b)) return false;
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export type MergeRoomListsPreserveRefsResult = {
  list: CommunityMessengerRoomSummary[];
  changedRoomCount: number;
  unchangedRoomCount: number;
  /** `list` 가 `prevList` 와 동일 참조로 유지됨 */
  listReferenceStable: boolean;
};

/**
 * lite/full bootstrap apply — 서버 방 배열을 prev 와 병합하며 변경 없는 행은 기존 object reference 유지.
 * 배열 전체 deep clone·무조건 replace 금지.
 */
export function mergeRoomListsPreserveRefs(
  prevList: CommunityMessengerRoomSummary[],
  nextList: CommunityMessengerRoomSummary[]
): MergeRoomListsPreserveRefsResult {
  if (prevList === nextList) {
    return {
      list: prevList,
      changedRoomCount: 0,
      unchangedRoomCount: nextList.length,
      listReferenceStable: true,
    };
  }
  const prevById = new Map(prevList.map((r) => [normRoomId(r.id), r]));
  let changedRoomCount = 0;
  let unchangedRoomCount = 0;
  const out: CommunityMessengerRoomSummary[] = [];
  for (const inc of nextList) {
    const old = prevById.get(normRoomId(inc.id));
    if (old && roomSummaryListRowShallowEqual(old, inc)) {
      out.push(old);
      unchangedRoomCount += 1;
    } else {
      out.push(inc);
      changedRoomCount += 1;
    }
  }
  const listReferenceStable =
    out.length === prevList.length && out.every((row, i) => row === prevList[i]);
  return {
    list: listReferenceStable ? prevList : out,
    changedRoomCount,
    unchangedRoomCount,
    listReferenceStable,
  };
}

export function profileArraysReferenceEqual<T>(a: T[] | undefined, b: T[] | undefined): boolean {
  if (a === b) return true;
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) {
    if (aa[i] !== bb[i]) return false;
  }
  return true;
}

function recordShallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (a === b) return true;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  for (const k of keysA) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function normRecordId(id: unknown): string {
  return String(id ?? "").trim().toLowerCase();
}

export type MergeJsonRecordsPreserveRefsResult<T> = {
  list: T[];
  changedCount: number;
  unchangedCount: number;
  listReferenceStable: boolean;
};

/** lite JSON 재파싱 시 동일 레코드는 prev object reference 유지 (friends·requests 등) */
export function mergeJsonRecordsPreserveRefs<T extends Record<string, unknown>>(
  prevList: T[],
  nextList: T[],
  idKey = "id"
): MergeJsonRecordsPreserveRefsResult<T> {
  if (prevList === nextList) {
    return {
      list: prevList,
      changedCount: 0,
      unchangedCount: nextList.length,
      listReferenceStable: true,
    };
  }
  const prevById = new Map(prevList.map((r) => [normRecordId(r[idKey]), r]));
  let changedCount = 0;
  let unchangedCount = 0;
  const out: T[] = [];
  for (const inc of nextList) {
    const old = prevById.get(normRecordId(inc[idKey]));
    if (old && recordShallowEqual(old as Record<string, unknown>, inc as Record<string, unknown>)) {
      out.push(old);
      unchangedCount += 1;
    } else {
      out.push(inc);
      changedCount += 1;
    }
  }
  const listReferenceStable =
    out.length === prevList.length && out.every((row, i) => row === prevList[i]);
  return {
    list: listReferenceStable ? prevList : out,
    changedCount,
    unchangedCount,
    listReferenceStable,
  };
}
