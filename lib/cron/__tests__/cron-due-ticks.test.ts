/**
 * 2026-11-19 예약 작업 2~4번 — 실행 1번 = DB 함수 1번. 결과 해석은 기존 RPC 를 따로 불렀을 때와 같다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { moimRpcResultFromTickJson, moimCronTick } from "@/lib/moim/server/moim-rpc.server";
import { runAdminNotificationDeliveryWorker } from "@/lib/admin/notifications/admin-notification-service";
import { runAdminNotificationCronTick } from "@/lib/admin/notifications/admin-notification-cron-tick";
import { runNotificationCampaignsCronTick, runStoreOrdersSlaScanTick } from "@/lib/cron/cron-due-ticks.server";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("2번 모임 — moim_cron_tick", () => {
  it("결과 해석 = callMoimRpc: 성공은 펼치고, ok=false·DB 오류는 실패", () => {
    expect(moimRpcResultFromTickJson({ ok: true, done: [] })).toEqual({ ok: true, done: [] });
    expect(moimRpcResultFromTickJson({ ok: true, expired: 0, policy: 14 })).toMatchObject({ ok: true, expired: 0 });
    const f = moimRpcResultFromTickJson({ ok: false, error: "forbidden" });
    expect(f.ok).toBe(false);
    const d = moimRpcResultFromTickJson({ ok: false, error: "boom", rpc_error: true });
    expect(d).toMatchObject({ ok: false, detail: "boom" });
  });

  it("함수 1번 · 함수 없음이면 null(기존 경로)", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        ok: true,
        v: 1,
        finish: { ok: true, done: [] },
        reminders_24h: { ok: true, reminders: [] },
        reminders_1h: { ok: true, reminders: [] },
        sanctions: { ok: true, refreshed: [] },
        join_requests: { ok: true, expired: 0, policy: 14 },
        schedule_rooms: { ok: true, archived: 0, policy: 30 },
        closed_retention: { ok: true, ended: 0, policy: 30 },
      },
      error: null,
    }));
    const t = await moimCronTick({ rpc } as never);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("moim_cron_tick", {});
    expect(t?.joinRequests).toMatchObject({ ok: true, expired: 0 });
    const missing = { rpc: async () => ({ data: null, error: { message: "does not exist" } }) } as never;
    expect(await moimCronTick(missing)).toBeNull();
  });

  it("DB 함수는 기존 7개를 같은 인자·순서로 부른다 · 라우트는 tick 없으면 기존 호출", () => {
    const sql = read("supabase/migrations/20271119241000_moim_cron_tick.sql");
    const order = [
      "moim_schedules_finish_due(200)",
      "moim_schedules_claim_reminders('24h')",
      "moim_schedules_claim_reminders('1h')",
      "moim_sanctions_expire_due(200)",
      "moim_join_requests_expire_due(200)",
      "moim_schedule_rooms_archive_due(200)",
      "moim_closed_retention_due(100)",
    ].map((s) => sql.indexOf(s));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const route = read("app/api/cron/moim-schedules/route.ts");
    expect(route).toContain("tick ? tick.finish : await moimSchedulesFinishDue(200, sb)");
  });
});

describe("3번 관리자 알림 — admin_notification_cron_tick", () => {
  const deps = { resolveAuthority: vi.fn(), sendPush: vi.fn() } as never;

  it("미리 받은 값이 모두 있으면(대기열·푸시 빈 목록) 작업자는 Supabase 를 부르지 않는다", async () => {
    const rpc = vi.fn();
    const sum = await runAdminNotificationDeliveryWorker({ rpc } as never, deps, {
      prefetched: { replayed: 0, replayError: null, outbox: [], outboxError: null, push: [], pushError: null },
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(sum).toMatchObject({ replayed: 0, outboxClaimed: 0, pushClaimed: 0, errors: [] });
  });

  it("push=null(대기열 확보함) → 대기열 처리 뒤 푸시 확보는 지금처럼 따로", async () => {
    const rpc = vi.fn(async (_name: string, _args?: unknown) => ({ data: [], error: null }));
    await runAdminNotificationDeliveryWorker({ rpc } as never, deps, {
      prefetched: { replayed: 2, replayError: null, outbox: [], outboxError: null, push: null, pushError: null },
    });
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["admin_notification_push_claim"]);
  });

  it("오류 문자열은 기존과 같은 요약 오류로", async () => {
    const sum = await runAdminNotificationDeliveryWorker({ rpc: vi.fn() } as never, deps, {
      prefetched: { replayed: null, replayError: "r", outbox: [], outboxError: "o", push: [], pushError: "p" },
    });
    expect(sum.errors).toEqual(["replay:r", "outbox_claim:o", "push_claim:p"]);
  });

  it("tick 해석 · 함수 없음이면 null", async () => {
    const rpc = vi.fn(async () => ({
      data: { ok: true, v: 1, settlement: { ok: true }, replayed: 0, outbox: [], push: [] },
      error: null,
    }));
    const t = await runAdminNotificationCronTick({ rpc } as never);
    expect(rpc).toHaveBeenCalledWith("admin_notification_cron_tick", {
      p_lookback: "72 hours",
      p_replay_limit: 200,
      p_batch: 20,
    });
    expect(t?.prefetched).toMatchObject({ replayed: 0, outbox: [], push: [] });
    expect(
      await runAdminNotificationCronTick({ rpc: async () => ({ data: null, error: { message: "x" } }) } as never)
    ).toBeNull();
  });
});

describe("4번 SLA·캠페인 tick", () => {
  it("SLA: 성공 · 검사 실패 · 함수 없음(null)", async () => {
    const ok = { rpc: async () => ({ data: { ok: true, v: 1, heartbeat_error: null }, error: null }) } as never;
    expect(await runStoreOrdersSlaScanTick(ok)).toEqual({ ok: true, heartbeatError: null });
    const bad = { rpc: async () => ({ data: { ok: false, v: 1, error: "boom" }, error: null }) } as never;
    expect(await runStoreOrdersSlaScanTick(bad)).toEqual({ ok: false, error: "boom" });
    const none = { rpc: async () => ({ data: null, error: { message: "missing" } }) } as never;
    expect(await runStoreOrdersSlaScanTick(none)).toBeNull();
  });

  it("캠페인: 확보 행 · 확보 없음(반복 목록) · 함수 없음(null)", async () => {
    const claimed = { rpc: async () => ({ data: { ok: true, v: 1, claimed: { id: "occ-1" } }, error: null }) } as never;
    expect(await runNotificationCampaignsCronTick(claimed, "t")).toEqual({ claimed: { id: "occ-1" }, recurringMissing: null });
    const idle = {
      rpc: async () => ({ data: { ok: true, v: 1, claimed: null, recurring_missing: ["c1"] }, error: null }),
    } as never;
    expect(await runNotificationCampaignsCronTick(idle, "t")).toEqual({ claimed: null, recurringMissing: ["c1"] });
    const none = { rpc: async () => ({ data: null, error: { message: "missing" } }) } as never;
    expect(await runNotificationCampaignsCronTick(none, "t")).toBeNull();
  });

  it("캠페인 DB 함수: 반복 캠페인 조건이 라우트의 기존 조회와 같다(20개 · queued/sending 없음)", () => {
    const sql = read("supabase/migrations/20271119244000_notification_campaigns_cron_tick.sql");
    expect(sql).toContain("c.send_mode = 'recurring' and c.status = 'active'");
    expect(sql).toContain("limit 20");
    expect(sql).toContain("o.status in ('queued', 'sending')");
    const route = read("app/api/cron/notification-campaigns-dispatch-scheduled/route.ts");
    expect(route).toContain('.eq("send_mode", "recurring")');
    expect(route).toContain('.in("status", ["queued", "sending"])');
    expect(route).toContain(".limit(20)");
  });

  it("작업끼리 합치지 않는다(#477 되돌림 교훈) — 통화·채팅 푸시 인계는 건드리지 않음", () => {
    for (const f of [
      "supabase/migrations/20271119240000_delivery_ads_cron_tick.sql",
      "supabase/migrations/20271119241000_moim_cron_tick.sql",
      "supabase/migrations/20271119242000_admin_notification_cron_tick.sql",
      "supabase/migrations/20271119243000_store_orders_sla_scan_tick.sql",
      "supabase/migrations/20271119244000_notification_campaigns_cron_tick.sql",
    ]) {
      const sql = read(f);
      expect(sql).not.toMatch(/push_handoff|call_session|accept_timeout|accept_reminder/i);
    }
  });
});
