/**
 * C-14 — heartbeat `mediaConnected` → connected_at 이 null 이고 active(수락 완료)일 때만 CAS 로 채운다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type UpdateCall = { payload: Record<string, unknown>; filters: Array<[string, string, unknown]> };
const updateCalls: UpdateCall[] = [];
const mockMaybeSingle = vi.fn();

function createUpdateChain(call: UpdateCall) {
  const chain: Record<string, unknown> = {};
  const self = chain as {
    eq: (c: string, v: unknown) => typeof self;
    is: (c: string, v: unknown) => typeof self;
    select: (s: string) => { maybeSingle: () => Promise<{ data: unknown }> };
    then: Promise<{ error: null }>["then"];
  };
  const terminal = Promise.resolve({ error: null as null });
  self.eq = (c, v) => {
    call.filters.push(["eq", c, v]);
    return self;
  };
  self.is = (c, v) => {
    call.filters.push(["is", c, v]);
    return self;
  };
  self.select = () => ({ maybeSingle: async () => ({ data: { id: "sess-1" } }) });
  self.then = terminal.then.bind(terminal);
  return self;
}

vi.mock("@/lib/supabase/resolve-service-supabase-for-api", () => ({
  resolveServiceSupabaseForApi: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mockMaybeSingle,
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        const call: UpdateCall = { payload, filters: [] };
        updateCalls.push(call);
        return createUpdateChain(call);
      },
    }),
  }),
}));

vi.mock("@/lib/community-messenger/service", () => ({
  getCommunityMessengerCallSessionById: vi.fn(async () => ({ id: "sess-1", status: "active" })),
}));

function seedRow(overrides: Record<string, unknown> = {}) {
  mockMaybeSingle.mockResolvedValue({
    data: {
      id: "sess-1",
      initiator_user_id: "caller-1",
      recipient_user_id: "callee-1",
      status: "active",
      answered_at: "2026-10-21T00:00:00.000Z",
      connected_at: null,
      ...overrides,
    },
  });
}

describe("C-14 heartbeat mediaConnected → connected_at 채움", () => {
  beforeEach(() => {
    updateCalls.length = 0;
    mockMaybeSingle.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("판정: mediaConnected·active·answered·connected_at null 일 때만 true", async () => {
    const { shouldFillConnectedAtFromHeartbeat } = await import("@/lib/community-messenger/call-session-heartbeat");
    const base = { mediaConnected: true, status: "active", answeredAt: "t", connectedAt: null };
    expect(shouldFillConnectedAtFromHeartbeat(base)).toBe(true);
    expect(shouldFillConnectedAtFromHeartbeat({ ...base, mediaConnected: false })).toBe(false);
    expect(shouldFillConnectedAtFromHeartbeat({ ...base, status: "ended" })).toBe(false);
    expect(shouldFillConnectedAtFromHeartbeat({ ...base, answeredAt: null })).toBe(false);
    expect(shouldFillConnectedAtFromHeartbeat({ ...base, connectedAt: "2026-10-21T00:00:01Z" })).toBe(false);
  });

  it("connected_at 이 null 이면 CAS(status=active, connected_at is null) 로 채운다", async () => {
    seedRow();
    const { heartbeatCommunityMessengerCallSession } = await import("@/lib/community-messenger/call-session-heartbeat");
    const result = await heartbeatCommunityMessengerCallSession({
      userId: "caller-1",
      sessionId: "sess-1",
      mediaConnected: true,
    });
    expect(result.ok).toBe(true);
    expect(updateCalls).toHaveLength(2);
    const fill = updateCalls[1]!;
    expect(fill.payload).toHaveProperty("connected_at");
    expect(fill.filters).toEqual(
      expect.arrayContaining([
        ["eq", "status", "active"],
        ["is", "connected_at", null],
      ]),
    );
  });

  it("이미 connected_at 이 있으면 덮어쓰지 않는다", async () => {
    seedRow({ connected_at: "2026-10-21T00:00:05.000Z" });
    const { heartbeatCommunityMessengerCallSession } = await import("@/lib/community-messenger/call-session-heartbeat");
    await heartbeatCommunityMessengerCallSession({ userId: "caller-1", sessionId: "sess-1", mediaConnected: true });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.payload).not.toHaveProperty("connected_at");
  });

  it("mediaConnected 없으면(네이티브·기존 바이너리) connected_at 을 건드리지 않는다", async () => {
    seedRow();
    const { heartbeatCommunityMessengerCallSession } = await import("@/lib/community-messenger/call-session-heartbeat");
    await heartbeatCommunityMessengerCallSession({ userId: "callee-1", sessionId: "sess-1" });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]!.payload).not.toHaveProperty("connected_at");
  });
});
