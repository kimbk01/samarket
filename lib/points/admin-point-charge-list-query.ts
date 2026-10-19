/**
 * `GET /api/admin/point-charges` 상태 필터 파서 (pure).
 *
 * - `status` 미지정·`all` → 필터 없음(null).
 * - `open` → 처리 대기 전체 (`pending|waiting_confirm|on_hold`) — DB RPC 승인 가능 상태와 동일.
 * - 쉼표 목록 허용 (`pending,waiting_confirm`). 화이트리스트 밖 값은 버린다.
 * - 유효 값이 하나도 없으면 null — 잘못된 링크는 전체 목록.
 */
import type { PointChargeRequestStatus } from "@/lib/types/point";

export const POINT_CHARGE_REQUEST_STATUSES = [
  "pending",
  "waiting_confirm",
  "on_hold",
  "approved",
  "rejected",
  "cancelled",
] as const satisfies readonly PointChargeRequestStatus[];

export const POINT_CHARGE_OPEN_STATUSES = ["pending", "waiting_confirm", "on_hold"] as const satisfies readonly PointChargeRequestStatus[];

export function isPointChargeRequestStatus(v: string): v is PointChargeRequestStatus {
  return (POINT_CHARGE_REQUEST_STATUSES as readonly string[]).includes(v);
}

export function parsePointChargeStatusFilter(raw: string | null | undefined): PointChargeRequestStatus[] | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s || s === "all") return null;
  const out = new Set<PointChargeRequestStatus>();
  for (const part of s.split(",")) {
    const p = part.trim();
    if (p === "open") POINT_CHARGE_OPEN_STATUSES.forEach((x) => out.add(x));
    else if (isPointChargeRequestStatus(p)) out.add(p);
  }
  return out.size ? [...out] : null;
}
