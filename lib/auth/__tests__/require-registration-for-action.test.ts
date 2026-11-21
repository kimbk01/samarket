import { beforeEach, describe, expect, it, vi } from "vitest";

/** 설계 2026-11-21 §4 C — 섞인 경로의 새 행동 분기 가입 확인 (중앙 게이트와 같은 판정·응답) */
const state = vi.hoisted(() => ({
  snapshot: null as unknown,
  registration: { kind: "REGISTERED" } as unknown,
}));
vi.mock("@/lib/auth/load-member-write-gate-snapshot", () => ({
  loadMemberWriteGateSnapshot: async () => state.snapshot,
}));
vi.mock("@/lib/auth/resolve-member-registration-authority", () => ({
  resolveMemberRegistrationAuthority: async () => state.registration,
}));

import { requireRegistrationForAction } from "@/lib/auth/require-registration-for-action.server";

describe("requireRegistrationForAction", () => {
  beforeEach(() => {
    state.snapshot = { consent: { adminRole: null }, registration: null };
    state.registration = { kind: "REGISTERED" };
  });

  it("가입 완료 → 통과(null)", async () => {
    expect(await requireRegistrationForAction("u1")).toBeNull();
  });

  it("가입 진행 중 → 403 signup_incomplete + step", async () => {
    state.registration = { kind: "REGISTRATION_REQUIRED", step: "address" };
    const res = await requireRegistrationForAction("u1");
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body).toMatchObject({ code: "signup_incomplete", error: "signup_incomplete", step: "address" });
  });

  it("관리자(admin·super_admin) 면제", async () => {
    state.registration = { kind: "REGISTRATION_REQUIRED", step: "phone" };
    state.snapshot = { consent: { adminRole: "admin" }, registration: null };
    expect(await requireRegistrationForAction("u1")).toBeNull();
  });

  it("확인 실패 → 503 (통과 아님)", async () => {
    state.registration = { kind: "UNAVAILABLE" };
    expect((await requireRegistrationForAction("u1"))!.status).toBe(503);
  });
});
