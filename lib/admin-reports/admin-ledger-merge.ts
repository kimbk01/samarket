/**
 * 여러 원장 통합 조회 — 병합 페이지 · 원장별 커서 (감사 설계 2026-10-30 보완 §2 「통합 조회를 TS 로 구현할 때의 검증 기준」, J-5).
 * DB 무변경: 원장마다 따로 조회(각 page+1 건, (created_at DESC, id DESC))해 여기서 병합 정렬한다.
 *
 * - 누락 없음: 화면 총건수 = 원장별 건수 합 (`sourceCounts`).
 * - 중복 없음: 행 키 = `(source, id)`. 같은 대상 신고가 여러 원장에 있으면 원장별로 각각 표시한다.
 * - 페이지네이션: 다음 커서는 원장별로 들고 간다 —
 *   keyset 원장 = 마지막으로 보여 준 행의 (created_at, id) · offset 원장(기존 RPC 스트림) = 지금까지 보여 준 건수.
 *   다 읽은 원장은 `done` 으로 표시해 다음 쪽에서 행을 다시 읽지 않는다 (건수만 다시 센다).
 * - 정렬: created_at DESC → id DESC → source DESC (원장 안에서는 (created_at, id) 순서와 같다).
 *
 * Client-safe 순수 모듈 (DB 접근 없음).
 */

export type LedgerSourceCursor =
  | { k: "keyset"; ts: string; id: string }
  | { k: "offset"; o: number }
  | { k: "done" };

export type LedgerCursorMap = Record<string, LedgerSourceCursor>;

export type LedgerMergeRow = { source: string; id: string; createdAt: string };

export type LedgerSourceBatch<T extends LedgerMergeRow> = {
  source: string;
  mode: "keyset" | "offset";
  /** 이번 쪽을 읽을 때 쓴 커서 (없으면 처음부터) */
  cursor: LedgerSourceCursor | null;
  /** 커서 뒤의 행 — 원장 안 정렬 순서, 최대 page+1 건 */
  rows: T[];
  /** 필터 조건의 원장 전체 건수 (exact) */
  count: number;
};

export type LedgerMergeResult<T extends LedgerMergeRow> = {
  rows: T[];
  /** 다음 쪽 커서 (더 없으면 null) */
  nextCursor: string | null;
  /** = Σ sourceCounts */
  total: number;
  sourceCounts: Record<string, number>;
};

/**
 * 정렬 키 — 밀리초 + 마이크로초 (Postgres timestamptz 는 μs 정밀도, JS Date 는 ms).
 * 같은 ms 에 들어온 두 행도 DB 와 같은 순서로 놓는다. 파싱 실패 = 0 (맨 뒤).
 */
export function ledgerTimeKey(ts: string | null | undefined): number {
  const s = String(ts ?? "").trim();
  if (!s) return 0;
  // Postgres 문자열 형식(`2026-10-30 01:00:00+00`)도 받는다
  const iso = (s.includes("T") ? s : s.replace(" ", "T")).replace(/([+-]\d{2})$/, "$1:00");
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 0;
  const frac = /\.(\d+)/.exec(s)?.[1] ?? "";
  const micro = Number((frac + "000000").slice(3, 6)) || 0;
  return ms * 1000 + micro;
}

/** 병합 정렬 비교 — 최신순 (created_at DESC, id DESC, source DESC). */
export function compareLedgerRows(a: LedgerMergeRow, b: LedgerMergeRow): number {
  const ta = ledgerTimeKey(a.createdAt);
  const tb = ledgerTimeKey(b.createdAt);
  if (ta !== tb) return tb - ta;
  if (a.id !== b.id) return a.id < b.id ? 1 : -1;
  if (a.source !== b.source) return a.source < b.source ? 1 : -1;
  return 0;
}

export function ledgerRowKey(r: Pick<LedgerMergeRow, "source" | "id">): string {
  return `${r.source}:${r.id}`;
}

function toBase64Url(s: string): string {
  let bin = "";
  for (const byte of new TextEncoder().encode(s)) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeLedgerCursor(map: LedgerCursorMap): string {
  return toBase64Url(JSON.stringify(map));
}

const SAFE_ID = /^[0-9a-zA-Z_-]{1,80}$/;

/** 잘못된 커서 = null (처음 쪽). 모르는 원장 키·형식은 버린다. */
export function decodeLedgerCursor(raw: string | null | undefined, sources: readonly string[]): LedgerCursorMap | null {
  const s = String(raw ?? "").trim();
  if (!s || s.length > 4000) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(s));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const out: LedgerCursorMap = {};
  for (const src of sources) {
    const v = (parsed as Record<string, unknown>)[src] as Record<string, unknown> | undefined;
    if (!v || typeof v !== "object") continue;
    if (v.k === "done") out[src] = { k: "done" };
    else if (v.k === "offset" && Number.isInteger(v.o) && (v.o as number) >= 0 && (v.o as number) <= 100_000) {
      out[src] = { k: "offset", o: v.o as number };
    } else if (
      v.k === "keyset" &&
      typeof v.ts === "string" &&
      Number.isFinite(Date.parse(v.ts)) &&
      typeof v.id === "string" &&
      SAFE_ID.test(v.id)
    ) {
      out[src] = { k: "keyset", ts: v.ts, id: v.id };
    }
  }
  return Object.keys(out).length ? out : null;
}

/** 원장별 (created_at, id) 다음 조건 — PostgREST `or()` 식 (커서 시각 = DB 원문 그대로). */
export function ledgerKeysetOrFilter(cursor: { ts: string; id: string }, tsColumn = "created_at"): string {
  return `${tsColumn}.lt.${cursor.ts},and(${tsColumn}.eq.${cursor.ts},id.lt.${cursor.id})`;
}

/**
 * 원장별 page+1 건을 병합해 한 쪽을 만든다.
 * 각 원장이 「커서 뒤 상위 page+1 건」을 주면 병합 상위 page 건은 전체 정렬과 같다.
 */
export function mergeLedgerPage<T extends LedgerMergeRow>(
  batches: LedgerSourceBatch<T>[],
  limit: number
): LedgerMergeResult<T> {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const b of batches) {
    if (b.cursor?.k === "done") continue;
    for (const r of b.rows) {
      const key = ledgerRowKey(r);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(r);
    }
  }
  merged.sort(compareLedgerRows);
  const rows = merged.slice(0, Math.max(0, limit));

  const sourceCounts: Record<string, number> = {};
  const next: LedgerCursorMap = {};
  let more = false;
  for (const b of batches) {
    sourceCounts[b.source] = Math.max(0, Math.trunc(b.count) || 0);
    if (b.cursor?.k === "done") {
      next[b.source] = { k: "done" };
      continue;
    }
    const mine = rows.filter((r) => r.source === b.source);
    const consumed = mine.length;
    if (b.mode === "offset") {
      const o = (b.cursor?.k === "offset" ? b.cursor.o : 0) + consumed;
      const has = o < sourceCounts[b.source];
      next[b.source] = has ? { k: "offset", o } : { k: "done" };
      more ||= has;
    } else {
      const has = new Set(b.rows.filter((r) => r.source === b.source).map((r) => r.id)).size > consumed;
      const last = mine[mine.length - 1];
      if (!has) next[b.source] = { k: "done" };
      else if (last) next[b.source] = { k: "keyset", ts: last.createdAt, id: last.id };
      else if (b.cursor) next[b.source] = b.cursor;
      // 이번 쪽에 한 건도 안 보인 원장(커서 없음)은 다음 쪽에서도 처음부터 — 키를 남기지 않는다
      more ||= has;
    }
  }
  const total = Object.values(sourceCounts).reduce((a, n) => a + n, 0);
  return { rows, nextCursor: more ? encodeLedgerCursor(next) : null, total, sourceCounts };
}
