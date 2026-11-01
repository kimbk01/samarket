import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const cancel = vi.fn();
const fail = { next: false };
vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserIdStrict: async () => ({ ok: true, userId: "u1" }),
}));
vi.mock("@/lib/http/api-route", async (orig) => ({
  ...(await orig<typeof import("@/lib/http/api-route")>()),
  enforceRateLimit: async () => ({ ok: true }),
}));
vi.mock("@/lib/community-messenger/service", () => ({
  cancelCommunityMessengerCallAttempt: (...a: unknown[]) =>
    fail.next ? Promise.reject(new Error("call_attempt_cancel_record_failed:down")) : cancel(...a),
}));

import { POST } from "@/app/api/community-messenger/calls/attempts/[attemptId]/cancel/route";

const A = "6f106d55-77aa-4b18-b2c8-efe5311751ed";
const req = () => new NextRequest(`http://localhost/api/community-messenger/calls/attempts/${A}/cancel`, { method: "POST" });

/** §15-4 — 발신 시도 취소 API */
describe("POST /calls/attempts/[attemptId]/cancel", () => {
  beforeEach(() => {
    cancel.mockReset();
    fail.next = false;
  });

  it("본인 시도 취소 → 200 + 서비스 결과", async () => {
    cancel.mockResolvedValue({ ok: true, sessionId: "s1", status: "cancelled" });
    const res = await POST(req(), { params: Promise.resolve({ attemptId: A }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sessionId: "s1", status: "cancelled" });
    expect(cancel).toHaveBeenCalledWith({ userId: "u1", clientAttemptId: A });
  });

  it("잘못된 시도 ID → 400", async () => {
    cancel.mockResolvedValue({ ok: false, error: "bad_attempt_id" });
    const res = await POST(req(), { params: Promise.resolve({ attemptId: "x" }) });
    expect(res.status).toBe(400);
  });

  it("DB 실패 → 500 (클라이언트가 다시 시도)", async () => {
    fail.next = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await POST(req(), { params: Promise.resolve({ attemptId: A }) });
    spy.mockRestore();
    expect(res.status).toBe(500);
  });
});
