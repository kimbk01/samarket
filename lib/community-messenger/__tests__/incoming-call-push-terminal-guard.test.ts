import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ status: "ringing" as string | null, queries: 0, fail: false }));

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => {
            state.queries += 1;
            if (state.fail) return { data: null, error: { message: "boom" } };
            return { data: state.status == null ? null : { status: state.status }, error: null };
          }),
        })),
      })),
    })),
  })),
}));

import {
  INCOMING_CALL_PUSH_STALE_RECHECK_AFTER_MS,
  isIncomingCallPushStaleForTerminalSession,
} from "@/lib/community-messenger/service";

const START = "2026-10-22T00:00:00.000Z";
const startMs = new Date(START).getTime();

describe("수신 통화 푸시 — 종료된 세션은 늦게 울리지 않는다", () => {
  beforeEach(() => {
    state.status = "ringing";
    state.queries = 0;
    state.fail = false;
  });

  it("정상 경로(시작 직후)는 DB 조회 없이 발송", async () => {
    await expect(isIncomingCallPushStaleForTerminalSession("s1", START, startMs + 300)).resolves.toBe(false);
    expect(state.queries).toBe(0);
  });

  it("늦게 재개된 발송 + 세션이 취소됨 → 발송 금지", async () => {
    state.status = "cancelled";
    await expect(
      isIncomingCallPushStaleForTerminalSession("s1", START, startMs + INCOMING_CALL_PUSH_STALE_RECHECK_AFTER_MS + 12_000)
    ).resolves.toBe(true);
    expect(state.queries).toBe(1);
  });

  it.each(["rejected", "missed", "ended", "active"])("세션 %s → 발송 금지", async (status) => {
    state.status = status;
    await expect(isIncomingCallPushStaleForTerminalSession("s1", START, startMs + 5_000)).resolves.toBe(true);
  });

  it("늦어도 아직 ringing 이면 발송", async () => {
    await expect(isIncomingCallPushStaleForTerminalSession("s1", START, startMs + 5_000)).resolves.toBe(false);
  });

  it("조회 실패·행 없음은 발송(통화 유실 방지)", async () => {
    state.fail = true;
    await expect(isIncomingCallPushStaleForTerminalSession("s1", START, startMs + 5_000)).resolves.toBe(false);
    state.fail = false;
    state.status = null;
    await expect(isIncomingCallPushStaleForTerminalSession("s1", START, startMs + 5_000)).resolves.toBe(false);
  });
});
