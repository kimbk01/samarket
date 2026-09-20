/**
 * Closes the ACTIVE/LEASE static-test gap:
 * helper flags alone are insufficient — assert the actual PostgREST update patch.
 *
 * Pre-repair (origin/main) always wrote lease on every heartbeat → this test FAILs.
 * Post-repair (b5fa7c7d) purpose=active omits lease fields → PASS.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const updatePayloads: Array<Record<string, unknown>> = [];

const mockMaybeSingle = vi.fn();

function createUpdateChain() {
  // update(payload).eq("id", sid).eq("status", "active") → { error }
  const terminal = Promise.resolve({ error: null as null });
  const afterId = {
    eq: (_col: string, _val: string) => terminal,
  };
  return {
    eq: (_col: string, _val: string) => afterId,
  };
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
        updatePayloads.push(payload);
        return createUpdateChain();
      },
    }),
  }),
}));

vi.mock("@/lib/community-messenger/service", () => ({
  getCommunityMessengerCallSessionById: vi.fn(async () => ({
    id: "sess-1",
    status: "active",
  })),
}));

describe("call-session heartbeat purpose → DB patch isolation", () => {
  beforeEach(() => {
    updatePayloads.length = 0;
    mockMaybeSingle.mockReset();
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: "sess-1",
        initiator_user_id: "caller-1",
        recipient_user_id: "callee-1",
        status: "active",
      },
    });
  });

  it("heartbeatPurpose=active advances legacy HB only (no presence_lease_until)", async () => {
    const { heartbeatCommunityMessengerCallSession } = await import(
      "@/lib/community-messenger/call-session-heartbeat"
    );
    const result = await heartbeatCommunityMessengerCallSession({
      userId: "caller-1",
      sessionId: "sess-1",
      heartbeatPurpose: "active",
    });
    expect(result.ok).toBe(true);
    expect(updatePayloads).toHaveLength(1);
    const patch = updatePayloads[0]!;
    expect(patch).toHaveProperty("caller_last_heartbeat_at");
    expect(patch).not.toHaveProperty("caller_presence_lease_until");
    expect(patch).not.toHaveProperty("callee_presence_lease_until");
    expect(patch).not.toHaveProperty("callee_last_heartbeat_at");
  });

  it("heartbeatPurpose=native_lease advances shadow lease only (no legacy HB)", async () => {
    const { heartbeatCommunityMessengerCallSession } = await import(
      "@/lib/community-messenger/call-session-heartbeat"
    );
    const result = await heartbeatCommunityMessengerCallSession({
      userId: "caller-1",
      sessionId: "sess-1",
      heartbeatPurpose: "native_lease",
      nativePresenceCapable: true,
    });
    expect(result.ok).toBe(true);
    expect(updatePayloads).toHaveLength(1);
    const patch = updatePayloads[0]!;
    expect(patch).toHaveProperty("caller_presence_lease_until");
    expect(patch).not.toHaveProperty("caller_last_heartbeat_at");
    expect(patch).not.toHaveProperty("callee_last_heartbeat_at");
  });

  it("omitted heartbeatPurpose keeps legacy compatibility (HB + lease)", async () => {
    const { heartbeatCommunityMessengerCallSession } = await import(
      "@/lib/community-messenger/call-session-heartbeat"
    );
    const result = await heartbeatCommunityMessengerCallSession({
      userId: "callee-1",
      sessionId: "sess-1",
    });
    expect(result.ok).toBe(true);
    expect(updatePayloads).toHaveLength(1);
    const patch = updatePayloads[0]!;
    expect(patch).toHaveProperty("callee_last_heartbeat_at");
    expect(patch).toHaveProperty("callee_presence_lease_until");
    expect(patch).not.toHaveProperty("caller_last_heartbeat_at");
  });
});
