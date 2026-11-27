/**
 * 고객 문의 최종 감사 L14 — 매시 첫 실행(UTC 분 0~4) 판정은 크론 **시작 시각**으로 한다(동작).
 * 대기열 작업이 길어져 분 5 를 넘겨도 그 시간 자동 종료·대기열 정리를 건너뛰지 않는다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = { autoClose: 0, purge: 0 };

vi.mock("@/lib/security/cron-auth", () => ({ verifyCronRequestAuthorization: () => true }));
vi.mock("@/lib/security/cron-side-effect-gate", () => ({ rejectCronIfSideEffectsBlocked: () => null }));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({ rpc: async () => ({ data: null, error: null }) }),
}));
vi.mock("@/lib/admin/notifications/admin-notification-cron-tick", () => ({ runAdminNotificationCronTick: async () => null }));
vi.mock("@/lib/admin/notifications/admin-notification-service", () => ({
  runAdminNotificationDeliveryWorker: async () => {
    // 대기열 작업이 오래 걸려 UTC 분 6 이 됐다
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 28, 3, 6, 10)));
    return { errors: [] as string[] };
  },
  purgeDeliveredSupportOutbox: async () => {
    calls.purge += 1;
    return { ok: true, deleted: 0 };
  },
}));
vi.mock("@/lib/support/support-case-service", () => ({
  shouldRunSupportAutoClose: (now: Date) => now.getUTCMinutes() < 5,
  autoCloseStaleAnsweredSupportCases: async () => {
    calls.autoClose += 1;
    return { ok: true, closed: 0 };
  },
}));

beforeEach(() => {
  calls.autoClose = 0;
  calls.purge = 0;
  process.env.CRON_SECRET = "s";
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("support final audit — cron hourly gate", () => {
  it("L14: started at minute 4, worker ran past minute 5 → auto close and outbox purge still run", async () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 28, 3, 4, 30)));
    const { GET } = await import("@/app/api/cron/admin-notification-delivery/route");
    const res = await GET(new Request("http://x/api/cron/admin-notification-delivery"));
    expect(res.status).toBe(200);
    // 고치기 전: 끝난 뒤 시각(분 6)으로 판정해 건너뛰었다
    expect(calls.autoClose).toBe(1);
    expect(calls.purge).toBe(1);
  });

  it("L14: started at minute 7 → not the hourly run", async () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 28, 3, 7, 0)));
    const { GET } = await import("@/app/api/cron/admin-notification-delivery/route");
    await GET(new Request("http://x/api/cron/admin-notification-delivery"));
    expect(calls.autoClose).toBe(0);
    expect(calls.purge).toBe(0);
  });
});
