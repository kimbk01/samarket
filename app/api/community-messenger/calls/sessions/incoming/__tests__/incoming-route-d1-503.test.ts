/**
 * D1 — 수신 목록 라우트: 서비스 오류 → 503(code community_messenger_incoming_calls_unavailable), 정상 → 200 그대로.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const result = vi.fn();
vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: vi.fn(async () => ({ ok: true, userId: "11111111-1111-1111-1111-111111111111" })),
}));
vi.mock("@/lib/http/api-route", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, enforceRateLimit: vi.fn(async () => ({ ok: true })) };
});
vi.mock("@/lib/community-messenger/service", () => ({
  listIncomingCommunityMessengerCallSessionsResult: (...a: unknown[]) => result(...a),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/community-messenger/calls/sessions/incoming/route";

const req = () => new NextRequest("http://localhost/api/community-messenger/calls/sessions/incoming?directOnly=1");

beforeEach(() => result.mockReset());

describe("D1 라우트", () => {
  it("정상 → 200 { ok:true, sessions } (기존 형태 그대로)", async () => {
    result.mockResolvedValue({ ok: true, sessions: [{ id: "c1" }] });
    const res = await GET(req());
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.sessions).toEqual([{ id: "c1" }]);
    expect(result).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111", { directOnly: true });
  });

  it("정상 빈 목록 → 200 []", async () => {
    result.mockResolvedValue({ ok: true, sessions: [] });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).sessions).toEqual([]);
  });

  for (const reason of ["direct_query_failed", "group_query_failed", "db_unavailable"] as const) {
    it(`서비스 오류(${reason}) → 503, 빈 목록을 보내지 않음`, async () => {
      result.mockResolvedValue({ ok: false, reason });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const res = await GET(req());
      expect(res.status).toBe(503);
      const j = await res.json();
      expect(j.ok).toBe(false);
      expect(j.code).toBe("community_messenger_incoming_calls_unavailable");
      expect(j.sessions).toBeUndefined();
      expect(warn).toHaveBeenCalledWith("[incoming-calls] unavailable", { reason, directOnly: true });
      warn.mockRestore();
    });
  }
});
