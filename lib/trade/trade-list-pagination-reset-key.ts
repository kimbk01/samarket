/** 클라 더보기 `resetKey` — 전체 id join 금지(목록 길어질수록 문자열·effect 비용 증가) */
export function tradeListPaginationResetKey(
  prefix: string,
  items: readonly { id?: string | null }[]
): string {
  const len = items.length;
  if (len === 0) return `${prefix}:0`;
  const first = items[0]?.id?.trim() ?? "";
  const last = items[len - 1]?.id?.trim() ?? "";
  return `${prefix}:${len}:${first}:${last}`;
}
