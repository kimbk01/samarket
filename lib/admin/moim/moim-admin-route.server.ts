import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { isUuidString } from "@/lib/shared/uuid-string";
import { MOIM_ADMIN_REASON_MIN_LENGTH, moimAdminHttpStatus } from "@/lib/admin/moim/moim-admin-contract";

/**
 * 모임 어드민 API 공용 (설계 moim §8). 권한 판정은 각 라우트가 `requireAdminPermission("moim")` /
 * `requireSuperAdmin()` 을 직접 부른다 (메뉴 leaf ↔ API 가드 계약 테스트가 라우트 본문에서 가드를 읽는다).
 */

export function moimAdminJson<T>(req: NextRequest): Promise<T | null> {
  return req.json().then(
    (v) => v as T,
    () => null
  );
}

export function moimAdminUuid(value: unknown): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  return isUuidString(v) ? v : null;
}

/** 사유 — 앞뒤 공백 제거 · 2자 이상 · 500자까지 (SQL 이 다시 검사한다) */
export function moimAdminReason(value: unknown): string | null {
  const v = typeof value === "string" ? value.trim().slice(0, 500) : "";
  return v.length >= MOIM_ADMIN_REASON_MIN_LENGTH ? v : null;
}

export function moimAdminBad(error = "invalid_request", status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * RPC 결과 → 응답 (R5 D §1-1 번호표 하나 — `moimAdminHttpStatus`): 409 = 다른 관리자가 먼저 바꿈 · 404 = 행이 정말 없음 ·
 * 422 = 모임 상태 때문에 못 하는 조치(종료·삭제·해제 불가·같은 단계 진행 중 등) · 500 = 알 수 없음 · 그 밖 = 400.
 */
export function moimAdminRpcResponse(result: { ok: true } | { ok: false; error: string }, extra?: Record<string, unknown>) {
  if (result.ok) return NextResponse.json({ ...result, ...(extra ?? {}) });
  const error = result.error;
  return NextResponse.json({ ok: false, error }, { status: moimAdminHttpStatus(error) });
}

export function moimAdminReadError(error: string) {
  return NextResponse.json({ ok: false, error }, { status: error.endsWith("_not_found") ? 404 : 500 });
}
