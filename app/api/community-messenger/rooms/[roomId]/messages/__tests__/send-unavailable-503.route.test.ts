/**
 * F1 (설계 2026-11-18 PR-1) — 글 전송 route:
 *  - 서버 저장 여부를 알 수 없는 실패(`message_send_unavailable`·`message_send_failed`·확정 행 재조회 실패) → 503
 *  - 업무 거절 코드 → 지금처럼 4xx
 *  - dedupe 캐시는 실패 응답을 저장하지 않는다(성공만)
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  sendResults: [] as Array<{ ok: boolean; error?: string; message?: unknown }>,
  sendCalls: 0,
  reread: null as unknown,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: () => undefined };
});
vi.mock("@/lib/http/rate-limit-redis", () => ({
  getOptionalRateLimitRedis: () => null,
  rateLimitIncrCount: async () => 0,
  rateLimitPttlMs: async () => 0,
  rateLimitRedisStorageKey: (k: string) => k,
}));
vi.mock("@/lib/auth/ensure-api-route-auth-gate", () => ({
  ensureApiRouteAuthGate: async () => ({ ok: true, userId: "u1", auth_ms: 0, auth_cache_hit: 0, auth_source: "test" }),
}));
vi.mock("@/lib/community-messenger/server/messenger-room-canonical-resolve-api", () => ({
  messengerRoomCanonicalOrJsonError: async (_u: string, raw: string) => ({
    ok: true,
    canonicalRoomId: raw,
    rawRouteRoomId: raw,
    permission_query_ms: 0,
    membership_cache_hit: 0,
  }),
}));
function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const k of ["select", "eq", "filter", "order", "limit"]) c[k] = () => c;
  c.maybeSingle = async () => result;
  return c;
}
vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({ from: () => chain({ data: { id: "u1" }, error: null }) }),
}));
vi.mock("@/lib/profile/require-profile-completion.server", () => ({
  PROFILE_FIELDS_GATE_SELECT: "id",
  requireProfileFieldsForAction: async () => ({ ok: true }),
}));
vi.mock("@/lib/auth/member-access", () => ({
  MEMBER_ACCESS_PROFILE_SELECT: "id",
  assertVerifiedMemberForAction: async () => ({ ok: true }),
}));
vi.mock("@/lib/community-messenger/group/group-active-membership-gate", () => ({
  assertActiveGroupMembershipIfGroup: async () => ({ ok: true }),
}));
vi.mock("@/lib/community-messenger/direct-room-communication-gate", () => ({
  assertDirectRoomCommunicationNotBlocked: async () => ({ ok: true }),
}));
vi.mock("@/lib/community-messenger/monitoring/messenger-api-route-timing", () => ({
  recordMessengerApiTiming: () => undefined,
}));
vi.mock("@/lib/supabase/resolve-service-supabase-for-api", () => ({
  resolveServiceSupabaseForApi: () => null,
}));
vi.mock("@/lib/i18n/request-app-language", () => ({
  resolveRequestAppLanguageOr: async () => "en",
}));
vi.mock("@/lib/community-messenger/service", () => ({
  sendCommunityMessengerMessage: async () => {
    state.sendCalls += 1;
    return state.sendResults.shift() ?? { ok: false, error: "message_send_unavailable" };
  },
  findCommunityMessengerMessageByClientId: async () => state.reread,
}));

import { POST } from "../route";

let seq = 0;
function send(cid: string) {
  seq += 1;
  const req = new NextRequest(`http://localhost/api/community-messenger/rooms/room-${seq}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${seq % 250}` },
    body: JSON.stringify({ content: "hi", clientMessageId: cid }),
  });
  return POST(req, { params: Promise.resolve({ roomId: "room-1" }) });
}

beforeEach(() => {
  state.sendResults = [];
  state.sendCalls = 0;
  state.reread = null;
});

describe("F1 글 전송 route 503 매핑", () => {
  it.each(["message_send_unavailable", "message_send_failed"])("%s → 503 + code message_send_unavailable (요청 언어 문구)", async (error) => {
    state.sendResults.push({ ok: false, error });
    const res = await send(`cid-unavail-${error}`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; code: string; error: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("message_send_unavailable");
    expect(body.error).toBe("Message not sent. Tap resend to try again.");
  });

  it.each(["room_readonly", "forbidden", "trade_seller_closed", "reply_target_invalid", "message_send_rejected"])(
    "업무 거절 %s → 400 (지금처럼 4xx)",
    async (error) => {
      state.sendResults.push({ ok: false, error });
      const res = await send(`cid-biz-${error}`);
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe(error);
    }
  );

  it("성공인데 메시지 본문 없음 + 확정 행 재조회 실패 → 503", async () => {
    state.sendResults.push({ ok: true });
    state.reread = null;
    const res = await send("cid-reread-miss");
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe("message_send_unavailable");
  });

  it("dedupe 캐시: 실패 응답은 저장하지 않는다 — 같은 cid 재전송은 서비스를 다시 부른다", async () => {
    state.sendResults.push({ ok: false, error: "message_send_unavailable" });
    state.sendResults.push({ ok: true, message: { id: "m1", clientMessageId: "cid-retry", createdAt: "2026-11-18T00:00:00.000Z" } });
    const first = await send("cid-retry");
    expect(first.status).toBe(503);
    const second = await send("cid-retry");
    expect(second.status).toBe(200);
    expect(state.sendCalls).toBe(2);
  });

  it("dedupe 캐시: 업무 거절도 저장하지 않는다", async () => {
    state.sendResults.push({ ok: false, error: "room_readonly" });
    state.sendResults.push({ ok: false, error: "room_readonly" });
    await send("cid-biz-twice");
    await send("cid-biz-twice");
    expect(state.sendCalls).toBe(2);
  });

  it("dedupe 캐시: 성공 응답은 2.5초 안 같은 cid 에 재생(서비스 1회)", async () => {
    state.sendResults.push({ ok: true, message: { id: "m2", clientMessageId: "cid-ok", createdAt: "2026-11-18T00:00:00.000Z" } });
    const a = await send("cid-ok");
    const b = await send("cid-ok");
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(state.sendCalls).toBe(1);
    expect(((await b.json()) as { message: { id: string } }).message.id).toBe("m2");
  });
});
