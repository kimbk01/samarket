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
