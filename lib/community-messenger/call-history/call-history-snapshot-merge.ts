import { mergeCallHistoryForHomeList } from "@/lib/community-messenger/call-history/call-history-merge";
import { resolveCallHistoryTimestamp } from "@/lib/community-messenger/call-history/call-duration";
import { sortCallHistoryEntries } from "@/lib/community-messenger/call-history/call-history-sorter";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";

/** Per-row version — `endedAt` 우선, 없으면 `startedAt` (서버 call_logs 계약). */
export function callLogVersionMs(
  call: Pick<CommunityMessengerCallLog, "startedAt" | "endedAt" | "id">
): number {
  const t = Date.parse(resolveCallHistoryTimestamp(call));
  return Number.isFinite(t) ? t : 0;
}

function normCallLogId(id: string): string {
  return String(id ?? "").trim().toLowerCase();
}

function callLogRowShallowEqual(a: CommunityMessengerCallLog, b: CommunityMessengerCallLog): boolean {
  if (a === b) return true;
  const keys = Object.keys(a) as Array<keyof CommunityMessengerCallLog>;
  if (keys.length !== Object.keys(b).length) return false;
  for (const k of keys) {
    if (!(k in b)) return false;
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function pickNewerCallLogRow(
  prev: CommunityMessengerCallLog,
  incoming: CommunityMessengerCallLog
): CommunityMessengerCallLog {
  const prevMs = callLogVersionMs(prev);
  const incMs = callLogVersionMs(incoming);
  if (incMs > prevMs) return incoming;
  if (prevMs > incMs) return prev;
  if (prev.status !== incoming.status) return incoming;
  if (prev.displayType !== incoming.displayType) return incoming;
  if (prev.durationSeconds !== incoming.durationSeconds) return incoming;
  if (prev.endedAt !== incoming.endedAt) return incoming;
  return prev;
}

export type MergeCallHistoryListsResult = {
  list: CommunityMessengerCallLog[];
  /** incoming 이 prev 보다 오래된 행을 버린 수 */
  staleIncomingRowsDropped: number;
  /** prev 에만 있던 realtime 행 유지 수 */
  prevOnlyRowsKept: number;
  listReferenceStable: boolean;
};

/**
 * 통화 목록 snapshot/realtime 병합 — id 단위 union + timestamp desc.
 * 배열 전체 replace 금지: prev-only( realtime 선반영 ) 행은 유지한다.
 */
export function mergeCallHistoryLists(
  prevList: CommunityMessengerCallLog[],
  incomingList: CommunityMessengerCallLog[]
): MergeCallHistoryListsResult {
  if (prevList === incomingList) {
    return {
      list: prevList,
      staleIncomingRowsDropped: 0,
      prevOnlyRowsKept: 0,
      listReferenceStable: true,
    };
  }

  const prevById = new Map(prevList.map((row) => [normCallLogId(row.id), row]));
  const incomingById = new Map(incomingList.map((row) => [normCallLogId(row.id), row]));
  const allIds = new Set([...prevById.keys(), ...incomingById.keys()]);

  let staleIncomingRowsDropped = 0;
  let prevOnlyRowsKept = 0;
  const mergedRows: CommunityMessengerCallLog[] = [];

  for (const id of allIds) {
    const prev = prevById.get(id);
    const inc = incomingById.get(id);
    if (prev && inc) {
      const picked = pickNewerCallLogRow(prev, inc);
      if (picked === prev && callLogVersionMs(inc) < callLogVersionMs(prev)) {
        staleIncomingRowsDropped += 1;
      }
      mergedRows.push(picked);
      continue;
    }
    if (prev) {
      prevOnlyRowsKept += 1;
      mergedRows.push(prev);
      continue;
    }
    if (inc) mergedRows.push(inc);
  }

  const sorted = mergeCallHistoryForHomeList(sortCallHistoryEntries(mergedRows));

  const out: CommunityMessengerCallLog[] = [];
  const sortedById = new Map(sorted.map((row) => [normCallLogId(row.id), row]));
  for (const row of sorted) {
    const id = normCallLogId(row.id);
    const prev = prevById.get(id);
    const picked = sortedById.get(id);
    if (!picked) continue;
    if (prev && callLogRowShallowEqual(prev, picked)) {
      out.push(prev);
    } else {
      out.push(picked);
    }
  }

  const listReferenceStable =
    out.length === prevList.length && out.every((row, index) => row === prevList[index]);

  return {
    list: listReferenceStable ? prevList : out,
    staleIncomingRowsDropped,
    prevOnlyRowsKept,
    listReferenceStable,
  };
}

let callHistoryFetchSeq = 0;
let lastAppliedCallHistoryFetchSeq = 0;

/** in-flight fetch 가 역순 완료될 때 stale snapshot apply 차단 */
export function beginCallHistoryFetchSequence(): number {
  callHistoryFetchSeq += 1;
  return callHistoryFetchSeq;
}

export function shouldApplyCallHistoryFetchSequence(seq: number): boolean {
  if (!Number.isFinite(seq) || seq <= 0) return true;
  return seq >= lastAppliedCallHistoryFetchSeq;
}

export function commitCallHistoryFetchSequence(seq: number): void {
  if (!Number.isFinite(seq) || seq <= 0) return;
  if (seq >= lastAppliedCallHistoryFetchSeq) {
    lastAppliedCallHistoryFetchSeq = seq;
  }
}

export function clearCallHistorySnapshotMergeStateForTests(): void {
  callHistoryFetchSeq = 0;
  lastAppliedCallHistoryFetchSeq = 0;
}
