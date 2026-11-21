/**
 * 한 경로에 「새 행동」과 「정리·그 밖」이 함께 있는 라우트용 — 새 행동 분기에서만 부르는 가입 확인
 * (설계 `docs/audit/registration-action-cta-ssot-design-2026-11-21.md` §4 C).
 *
 * 판정은 중앙 쓰기 게이트와 같다: 쓰기 검사 스냅샷(`member_write_gate_snapshot` 1회) → 특권 관리자 면제 →
 * 전화 인증 + 대표 주소. 조회 실패는 통과시키지 않는다(503).
 * 거절 응답은 중앙 게이트와 같은 모양(`registrationIncompleteResponse`).
 */
import { NextResponse } from "next/server";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";
import { loadMemberWriteGateSnapshot } from "@/lib/auth/load-member-write-gate-snapshot";
import { resolveMemberRegistrationAuthority } from "@/lib/auth/resolve-member-registration-authority";

/** 가입 진행 중 거절 — 중앙 쓰기 게이트·라우트 공통 응답 모양 (`signup_incomplete` + 빠진 단계) */
export function registrationIncompleteResponse(step: "phone" | "address"): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: "signup_incomplete",
      code: "signup_incomplete",
      message: "signup_incomplete",
      step,
      authenticated: true,
    },
    { status: 403 },
  );
}

export async function requireRegistrationForAction(userId: string): Promise<NextResponse | null> {
  const uid = String(userId ?? "").trim();
  if (!uid) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const snapshot = await loadMemberWriteGateSnapshot(uid);
  if (isPrivilegedAdminRole(snapshot?.consent?.adminRole ?? null)) return null;
  const registration = await resolveMemberRegistrationAuthority(uid, snapshot?.registration ?? null);
  if (registration.kind === "REGISTERED") return null;
  if (registration.kind === "UNAVAILABLE") {
    return NextResponse.json(
      { ok: false, error: "consent_state_unavailable", code: "consent_state_unavailable", authenticated: true },
      { status: 503 },
    );
  }
  return registrationIncompleteResponse(registration.step);
}
