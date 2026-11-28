import "server-only";

/**
 * 시간순 쪽 넘김 커서 (R1 A-19 · 감사 P3-28) — `「시각|id」` 두 값으로 넘겨 같은 시각인 행이 쪽 사이에서 빠지지 않게 한다.
 * 화면은 받은 `nextBefore` 를 그대로 돌려줄 뿐이라 형식을 몰라도 된다. 예전 형식(시각만)도 받는다.
 * 잘못된 값은 DB 로 보내지 않는다(빈 쪽 · Postgres 오류 로그 없음).
 */

const TS_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MoimTimeCursor = { ts: string; id: string | null };

/** null = 커서 없음(첫 쪽) · "invalid" = 잘못된 값(빈 쪽으로 처리) */
export function parseMoimTimeCursor(raw: string | null | undefined): MoimTimeCursor | null | "invalid" {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  const [ts, id] = v.split("|");
  if (!ts || !TS_RE.test(ts)) return "invalid";
  if (id === undefined) return { ts, id: null };
  return UUID_RE.test(id) ? { ts, id } : "invalid";
}

type CursorQuery<Q> = { lt(col: string, v: string): Q; or(expr: string): Q };

export function applyMoimTimeCursor<Q extends CursorQuery<Q>>(q: Q, col: string, cursor: MoimTimeCursor): Q {
  if (!cursor.id) return q.lt(col, cursor.ts);
  return q.or(`${col}.lt."${cursor.ts}",and(${col}.eq."${cursor.ts}",id.lt.${cursor.id})`);
}

/** 커서 조건만 PostgREST 논리식으로 — 다른 `.or()`(검색어)와 한 식으로 묶을 때 쓴다 */
export function moimTimeCursorExpr(col: string, cursor: MoimTimeCursor): string {
  return cursor.id ? `${col}.lt."${cursor.ts}",and(${col}.eq."${cursor.ts}",id.lt.${cursor.id})` : `${col}.lt."${cursor.ts}"`;
}

export function moimTimeCursorOf(row: { id: string } & Record<string, unknown>, col: string): string | null {
  const ts = row[col];
  return typeof ts === "string" && ts ? `${ts}|${row.id}` : null;
}
