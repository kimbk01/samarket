/**
 * 같은 시각 원장 줄의 순서 (재감사 R2 · Owner 2026-11-03).
 *
 * 한 트랜잭션에서 쓴 줄은 created_at(now())이 같고 id 는 무작위 uuid 라 정렬만으로 순서를 알 수 없다
 * (예: Cash 충전 승인 = TOP_UP + 미납 자동 납부 SALE_FEE_SETTLEMENT 같은 시각).
 * 잔액 사슬 — 한 줄의 직전 잔액(balanceAfter − signed)은 바로 앞 줄의 balanceAfter — 로 순서를 정한다.
 * 사슬로 하나로 정해지지 않으면 들어온 순서를 그대로 둔다(숨기거나 지어내지 않음).
 */

export type LedgerChainView = {
  createdAt: string;
  /** 부호 있는 금액 (입금 +, 출금 −) */
  signed: number;
  balanceAfter: number;
};

function chainAscending<T>(group: readonly T[], view: (r: T) => LedgerChainView, prevBalance: number | null): T[] | null {
  const pre = (r: T) => view(r).balanceAfter - view(r).signed;
  let starts = prevBalance == null ? [] : group.filter((r) => pre(r) === prevBalance);
  if (starts.length !== 1) {
    starts = group.filter((r) => !group.some((s) => s !== r && view(s).balanceAfter === pre(r)));
  }
  if (starts.length !== 1) return null;
  const out: T[] = [starts[0]!];
  const left = group.filter((r) => r !== starts[0]);
  while (left.length > 0) {
    const cur = view(out[out.length - 1]!).balanceAfter;
    const next = left.filter((r) => pre(r) === cur);
    if (next.length !== 1) return null;
    out.push(next[0]!);
    left.splice(left.indexOf(next[0]!), 1);
  }
  return out;
}

/**
 * `rows` = created_at 내림차순(최신 먼저). 같은 시각 묶음마다 사슬 순서(최신 먼저)로 다시 놓는다.
 * `olderBalance` = 목록 맨 끝(가장 오래된) 줄보다 앞선 잔액(알면) — 맨 끝 묶음의 시작을 정할 때 쓴다.
 */
export function orderLedgerChainDesc<T>(
  rows: readonly T[],
  view: (r: T) => LedgerChainView,
  olderBalance: number | null = null
): T[] {
  const out: T[] = [];
  let i = 0;
  while (i < rows.length) {
    const at = view(rows[i]!).createdAt;
    let j = i + 1;
    while (j < rows.length && view(rows[j]!).createdAt === at) j += 1;
    const group = rows.slice(i, j);
    if (group.length < 2) {
      out.push(...group);
    } else {
      const prev = j < rows.length ? view(rows[j]!).balanceAfter : olderBalance;
      const asc = chainAscending(group, view, prev);
      out.push(...(asc ? asc.reverse() : group));
    }
    i = j;
  }
  return out;
}

/** 최신 줄 (같은 시각이면 사슬의 마지막 줄). `rows` = created_at 내림차순. */
export function pickLedgerChainLatest<T>(
  rows: readonly T[],
  view: (r: T) => LedgerChainView,
  olderBalance: number | null = null
): T | null {
  return orderLedgerChainDesc(rows, view, olderBalance)[0] ?? null;
}

/**
 * 쪽 자르기 (재감사 P-7) — 쪽 경계에 걸린 같은 시각 묶음이 읽은 창 밖으로 이어질 수 있으면 그 묶음 전체를 더 읽은 뒤
 * 사슬 정렬하고 자른다. 이전: 앞뒤 고정 8줄만 더 읽어, 같은 시각 줄이 9줄 이상이면 경계 순서가 틀릴 수 있었다.
 * - `windowRows` = 정렬(created_at DESC, id DESC)된 창 [windowStart, windowStart + windowRows.length)
 * - `windowFull` = 창 끝까지 꽉 찼는지(뒤에 줄이 더 있을 수 있음)
 * - `loadGroup(createdAt)` = 그 시각 줄 전부(같은 정렬) + 그보다 최신인 줄 수(= 묶음의 절대 시작 위치). 실패 null.
 * 묶음이 창 안에서 끝나면 추가 조회 없음(평소 경우).
 */
export async function sliceLedgerChainPage<T>(input: {
  windowRows: readonly T[];
  windowStart: number;
  windowFull: boolean;
  offset: number;
  limit: number;
  view: (r: T) => LedgerChainView;
  loadGroup: (createdAt: string) => Promise<{ rows: T[]; newerCount: number } | null>;
}): Promise<T[] | null> {
  const { view } = input;
  let rows = [...input.windowRows];
  let start = input.windowStart;
  const pageFirst = input.offset - start;
  if (pageFirst < 0 || pageFirst >= rows.length) return [];
  const pageLast = Math.min(rows.length - 1, pageFirst + input.limit - 1);
  const at = (i: number) => view(rows[i]!).createdAt;

  // 뒤 경계 — 쪽 마지막 줄의 묶음이 창 끝까지 이어지고 창이 꽉 찼으면 뒤에 더 있을 수 있다
  const tailAt = at(pageLast);
  let tailFrom = pageLast;
  while (tailFrom > 0 && at(tailFrom - 1) === tailAt) tailFrom -= 1;
  let tailTo = pageLast;
  while (tailTo < rows.length - 1 && at(tailTo + 1) === tailAt) tailTo += 1;
  if (tailTo === rows.length - 1 && input.windowFull) {
    const g = await input.loadGroup(tailAt);
    if (!g) return null;
    rows = [...rows.slice(0, tailFrom), ...g.rows];
    // 묶음이 창 맨 앞부터였다면 그 묶음의 시작이 곧 창의 시작
    if (tailFrom === 0) start = g.newerCount;
  }

  // 앞 경계 — 쪽 첫 줄의 묶음이 창 맨 앞까지 이어지고 창 앞에 줄이 있으면 앞에 더 있을 수 있다
  const pf = input.offset - start;
  const headAt = view(rows[pf]!).createdAt;
  let headFrom = pf;
  while (headFrom > 0 && view(rows[headFrom - 1]!).createdAt === headAt) headFrom -= 1;
  if (headFrom === 0 && start > 0) {
    let headTo = pf;
    while (headTo < rows.length - 1 && view(rows[headTo + 1]!).createdAt === headAt) headTo += 1;
    const g = await input.loadGroup(headAt);
    if (!g) return null;
    rows = [...g.rows, ...rows.slice(headTo + 1)];
    start = g.newerCount;
  }

  const ordered = orderLedgerChainDesc(rows, view);
  const from = input.offset - start;
  return ordered.slice(from, from + input.limit);
}
