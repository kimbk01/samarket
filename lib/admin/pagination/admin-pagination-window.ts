/**
 * Admin 서버 페이지네이션 표시 계산 (설계 v4 §7 「페이지네이션」) — 순수 함수만.
 *
 * - `adminPaginationWindow`: 이전·번호(최대 7칸, 생략 기호 포함)·다음 중 번호 칸.
 *   첫 쪽·마지막 쪽은 항상 보이고, 생략 기호도 한 칸으로 센다.
 * - `adminPaginationSummary`: 「전체 1,234건 중 1–50」 (숫자는 en-PH 천 단위 쉼표).
 */

import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";

export type AdminPaginationItem = number | "ellipsis-start" | "ellipsis-end";

export const ADMIN_PAGINATION_MAX_SLOTS = 7;

export function adminPaginationPageCount(total: number, size: number): number {
  const t = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  const s = Number.isFinite(size) && size >= 1 ? Math.floor(size) : 1;
  return Math.max(1, Math.ceil(t / s));
}

export function clampAdminPage(page: number, pageCount: number): number {
  const p = Number.isFinite(page) ? Math.floor(page) : 1;
  return Math.min(Math.max(1, p), Math.max(1, pageCount));
}

/**
 * 번호 칸 목록. `maxSlots` 는 5 이상 (첫·생략·현재·생략·끝 최소 구성).
 * 예) 10쪽 중 5쪽, 7칸 → [1, "ellipsis-start", 4, 5, 6, "ellipsis-end", 10]
 */
export function adminPaginationWindow(
  page: number,
  pageCount: number,
  maxSlots: number = ADMIN_PAGINATION_MAX_SLOTS
): AdminPaginationItem[] {
  const count = Math.max(1, Math.floor(pageCount));
  const slots = Math.max(5, Math.floor(maxSlots));
  const current = clampAdminPage(page, count);
  if (count <= slots) return Array.from({ length: count }, (_, i) => i + 1);

  // 양 끝(2칸)을 뺀 가운데 칸 수
  const inner = slots - 2;
  // 앞쪽: 1 … 없이 2..(inner) 까지 이어서 보여 줄 수 있는 경우
  if (current <= inner - 1) {
    const head = Array.from({ length: inner }, (_, i) => i + 1);
    return [...head, "ellipsis-end", count];
  }
  // 뒤쪽
  if (current >= count - (inner - 2)) {
    const tail = Array.from({ length: inner }, (_, i) => count - inner + 1 + i);
    return [1, "ellipsis-start", ...tail];
  }
  // 가운데: 1 … [current 주변 inner-2 칸] … count
  const around = inner - 2;
  const start = current - Math.floor((around - 1) / 2);
  const middle = Array.from({ length: around }, (_, i) => start + i);
  return [1, "ellipsis-start", ...middle, "ellipsis-end", count];
}

export function formatAdminCount(n: number): string {
  return formatAdminNumber(Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
}

/** 현재 쪽의 1부터 시작하는 시작·끝 번호 (전체 0건이면 0–0). */
export function adminPaginationRange(page: number, size: number, total: number): { start: number; end: number } {
  const t = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  if (t === 0) return { start: 0, end: 0 };
  const s = Math.max(1, Math.floor(size));
  const p = clampAdminPage(page, adminPaginationPageCount(t, s));
  const start = (p - 1) * s + 1;
  return { start, end: Math.min(t, p * s) };
}

/** 「전체 1,234건 중 1–50」 / "1–50 of 1,234". 0건이면 「전체 0건」 / "0 items". */
export function adminPaginationSummary(page: number, size: number, total: number, ko: boolean): string {
  const { start, end } = adminPaginationRange(page, size, total);
  const totalText = formatAdminCount(total);
  if (end === 0) return ko ? `전체 ${totalText}건` : `${totalText} items`;
  const range = `${formatAdminCount(start)}–${formatAdminCount(end)}`;
  return ko ? `전체 ${totalText}건 중 ${range}` : `${range} of ${totalText}`;
}
