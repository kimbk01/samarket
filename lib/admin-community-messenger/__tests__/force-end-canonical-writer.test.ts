import { beforeEach, describe, expect, it, vi } from "vitest";

const updateCommunityMessengerCallSession = vi.fn();
const appendAuditLog = vi.fn();

const sessionUpdate = vi.fn();
const participantUpdate = vi.fn();
const roomUpdate = vi.fn();

vi.mock("@/lib/community-messenger/service", () => ({
  updateCommunityMessengerCallSession: (...args: unknown[]) =>
    updateCommunityMessengerCallSession(...args),
}));

vi.mock("@/lib/audit/append-audit-log", () => ({
  appendAuditLog: (...args: unknown[]) => appendAuditLog(...args),
}));

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: (table: string) => {
      if (table === "community_messenger_call_sessions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "sess-1",
                  room_id: "room-1",
                  initiator_user_id: "caller-1",
                  recipient_user_id: "callee-1",
                  session_mode: "direct",
                  call_kind: "voice",
                  status: "active",
                  started_at: "2026-01-01T00:00:00.000Z",
                  answered_at: "2026-01-01T00:00:01.000Z",
                  ended_at: null,
                  created_at: "2026-01-01T00:00:00.000Z",
                },
                error: null,
              }),
            }),
          }),
          update: (...args: unknown[]) => {
            sessionUpdate(...args);
            return {
              eq: () => ({ error: null }),
            };
          },
        };
      }
      if (table === "community_messenger_call_session_participants") {
        return {
          select: () => ({
            eq: async () => ({
              data: [
                {
                  id: "p1",
                  session_id: "sess-1",
                  room_id: "room-1",
                  user_id: "caller-1",
                  participation_status: "joined",
                  joined_at: "2026-01-01T00:00:01.000Z",
                  left_at: null,
                  created_at: "2026-01-01T00:00:00.000Z",
                },
              ],
              error: null,
            }),
          }),
          update: (...args: unknown[]) => {
            participantUpdate(...args);
            return {
              eq: () => ({
                in: async () => ({ error: null }),
              }),
            };
          },
        };
      }
      if (table === "community_messenger_rooms") {
        return {
          update: (...args: unknown[]) => {
            roomUpdate(...args);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

describe("PHASE A / A4 admin force_end canonical writer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateCommunityMessengerCallSession.mockResolvedValue({
      ok: true,
      session: {
        id: "sess-1",
        status: "ended",
        endedReason: "admin_force_end:policy_violation",
      },
    });
    appendAuditLog.mockResolvedValue(undefined);
  });

  it("T16–T23: force_end calls writer with admin_force_end reason and keeps audit", async () => {
    const { runAdminCommunityMessengerCallSessionAction } = await import(
      "@/lib/admin-community-messenger/service"
    );

    const result = await runAdminCommunityMessengerCallSessionAction({
      sessionId: "sess-1",
      adminUserId: "admin-1",
      action: "force_end",
      reasonCode: "policy_violation",
      adminNote: "qa force end",
    });

    expect(result.ok).toBe(true);
    expect(
      (result as { ok: boolean; endedReason?: string }).endedReason,
    ).toBe("admin_force_end:policy_violation");
    expect(updateCommunityMessengerCallSession).toHaveBeenCalledTimes(1);
    expect(updateCommunityMessengerCallSession).toHaveBeenCalledWith({
      userId: "caller-1",
      sessionId: "sess-1",
      action: "end",
      clientEndedReason: "admin_force_end:policy_violation",
    });
    // No direct lifecycle SQL mutation on sessions.status
    expect(sessionUpdate).not.toHaveBeenCalled();
    expect(appendAuditLog).toHaveBeenCalledTimes(1);
    const auditArg = appendAuditLog.mock.calls[0]?.[1] as {
      action?: string;
      after_json?: { endedReason?: string; writerOk?: boolean };
    };
    expect(auditArg.action).toBe("admin.force_end_call_session");
    expect(auditArg.after_json?.endedReason).toBe("admin_force_end:policy_violation");
    expect(auditArg.after_json?.writerOk).toBe(true);
    expect(roomUpdate).toHaveBeenCalled();
    expect(participantUpdate).toHaveBeenCalled();
  });
});
