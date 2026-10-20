/**
 * `admin_settings` JSON 번들 안의 누적 기록(로그·변경 이력)을 서버에서 한 쪽씩 잘라 돌려주는 계약 (R7 목록 표준).
 *
 * - 번들은 DB 한 행(JSON)이라 PostgREST `.range()` 를 걸 수 없다 → 서버가 행을 읽고 정렬·필터 후 `offset..offset+limit` 만 응답.
 *   클라이언트는 그 쪽만 받는다 (화면 고정 상한 80·30 건 제거).
 * - `limit` 은 20/50/100 만 허용, 그 외(없음·NaN·다른 수)는 기본 20. `offset` 은 0 이상 정수(상한 100,000).
 * - 응답: `{ ok: true, items, total, limit, offset }` — total = 필터 후 전체 건수.
 */

import { ADMIN_LIST_MAX_OFFSET } from "@/lib/admin/pagination/parse-admin-list-page";

export const ADMIN_JSON_LIST_LIMITS = [20, 50, 100] as const;
export const ADMIN_JSON_LIST_DEFAULT_LIMIT = 20;

export type AdminJsonListPage = { limit: number; offset: number };

type ParamSource = { get(name: string): string | null };

export function parseAdminJsonListPage(sp: ParamSource): AdminJsonListPage {
  const rawLimit = Number(String(sp.get("limit") ?? "").trim());
  const limit = (ADMIN_JSON_LIST_LIMITS as readonly number[]).includes(rawLimit)
    ? rawLimit
    : ADMIN_JSON_LIST_DEFAULT_LIMIT;
  const rawOffset = String(sp.get("offset") ?? "").trim();
  const n = /^\d+$/.test(rawOffset) ? Number(rawOffset) : 0;
  const offset = Number.isSafeInteger(n) ? Math.min(n, ADMIN_LIST_MAX_OFFSET) : 0;
  return { limit, offset };
}

export type AdminJsonListResult<T> = { items: T[]; total: number; limit: number; offset: number };

/** 이미 정렬·필터된 전체 배열 → 한 쪽 + 전체 건수. */
export function sliceAdminJsonList<T>(all: readonly T[], page: AdminJsonListPage): AdminJsonListResult<T> {
  return {
    items: all.slice(page.offset, page.offset + page.limit),
    total: all.length,
    limit: page.limit,
    offset: page.offset,
  };
}

/** createdAt(ISO) 내림차순 정렬 사본 — 원본 순서와 무관하게 최신 먼저. */
export function sortAdminJsonListNewestFirst<T extends { createdAt: string }>(rows: readonly T[]): T[] {
  return sortAdminJsonListByDateDesc(rows, (r) => r.createdAt);
}

/** 임의 시각 필드(ISO) 내림차순 정렬 사본. 시각이 없거나 잘못된 행은 맨 뒤. */
export function sortAdminJsonListByDateDesc<T>(rows: readonly T[], pick: (row: T) => string | null | undefined): T[] {
  const ts = (r: T) => {
    const n = new Date(String(pick(r) ?? "")).getTime();
    return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY;
  };
  return [...rows].sort((a, b) => ts(b) - ts(a));
}
