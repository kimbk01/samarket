/**
 * A-웹 isolated integration — REAL Postgres + PostgREST, real supabase-js query builder.
 * Only the provider sender (FCM HTTP) and non-DB gates are stubbed.
 *
 * Opt-in (excluded from the default suite by *.staging.test.ts):
 *   DIBAY_INTEG_POSTGREST_URL=http://localhost:54399 DIBAY_INTEG_JWT=<service_role jwt> \
 *   DIBAY_INTEG_PSQL="psql -h localhost -p 55433 -U postgres" \
 *   npx vitest run --config <cfg including this file> lib/push/dispatch/__tests__/a-web-isolated-integration.staging.test.ts
 * Schema: production column shapes for notification_deliveries / notification_events /
 * user_devices / settings tables / admin_notification_campaign_targets (legacy unique).
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PostgrestClient } from "@supabase/postgrest-js";
import { beforeAll, describe, expect, it, vi } from "vitest";

const URL_ = process.env.DIBAY_INTEG_POSTGREST_URL ?? "";
const JWT = process.env.DIBAY_INTEG_JWT ?? "";
const PSQL = process.env.DIBAY_INTEG_PSQL ?? "";
const enabled = Boolean(URL_ && JWT && PSQL);

const db = enabled
  ? new PostgrestClient(URL_, { headers: { Authorization: `Bearer ${JWT}`, apikey: JWT } })
  : (null as unknown as PostgrestClient);

const fcmCalls: Array<{ token: string }> = [];
let fcmPlan: Array<"sent" | "fail503"> = [];
vi.mock("@/lib/push/dispatch/fcm-sender", () => ({
  sendFcmToTarget: async (target: { push_token: string }) => {
    fcmCalls.push({ token: target.push_token });
    const next = fcmPlan.shift() ?? "sent";
    return next === "sent"
      ? { status: "sent", provider_response: { provider: "fcm", message_id: `m-${fcmCalls.length}` } }
      : { status: "failed", error_message: "Service Unavailable", provider_response: { provider: "fcm", http_status: 503 } };
  },
}));
vi.mock("@/lib/push/dispatch/apns-sender", () => ({ sendApnsToTarget: vi.fn(), sendVoipApnsToTarget: vi.fn() }));
vi.mock("@/lib/push/dispatch/web-push-sender", () => ({ isWebPushConfigured: () => false, sendWebPushToTarget: vi.fn() }));
vi.mock("@/lib/notifications/notification-sound-ssot-server-hydrate", () => ({
  ensureNotificationSoundSsotHydratedForServer: async () => undefined,
}));
vi.mock("@/lib/push/dispatch/notification-delivery-safety-gate", () => ({
  evaluateNotificationDeliverySafety: async () => ({ allow: true }),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => db }));
vi.mock("@/lib/env/runtime", async (orig) => ({ ...(await orig<object>()), getSiteOrigin: () => "https://samarket.vercel.app" }));

async function seedUserWithDevice(settings?: Record<string, unknown>) {
  const { resolvePushEnvironment } = await import("@/lib/push/push-environment");
  const userId = randomUUID();
  const devId = randomUUID();
  const ins = await db.from("user_devices").insert({
    id: devId, user_id: userId, platform: "android", device_id: `hw-${devId}`,
    push_token: `tok-${devId}`, push_provider: "fcm", environment: resolvePushEnvironment(), is_active: true,
  });
  expect(ins.error).toBeNull();
  if (settings) {
    await db.from("user_notification_settings").insert({ user_id: userId, ...settings });
    await db.from("user_settings").insert({ user_id: userId });
  }
  return { userId, devId };
}

async function seedEvent(userId: string, type: string, display: Record<string, unknown> = {}) {
  const id = randomUUID();
  const r = await db.from("notification_events").insert({
    id, user_id: userId, type, category: "system", title: "t", body: "b", dedupe_key: `k-${id}`, display_payload: display,
  });
  expect(r.error).toBeNull();
  return id;
}

async function deliveries(eventId: string) {
  const { data } = await db.from("notification_deliveries").select("status, provider_response, device_id").eq("notification_event_id", eventId);
  return (data ?? []) as Array<{ status: string; provider_response: Record<string, unknown>; device_id: string }>;
}

function payload(userId: string, eventId: string) {
  return {
    user_id: userId, notification_type: "system", title: "t", body: "b", link_url: "/orders/store/o1",
    link_url_absolute: null, occurred_at: new Date().toISOString(),
    meta: { event_type: "order_status", kind: "store_order_owner_status", notification_event_id: eventId },
  };
}

describe.skipIf(!enabled)("A-웹 isolated integration (real Postgres + PostgREST)", () => {
  beforeAll(() => {
    process.env.PUSH_DISPATCH_ENABLED = "1";
  });

  it("SRV-01: FCM 503 → retry resends once → 3rd attempt never resends (single row)", async () => {
    const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
    const { userId } = await seedUserWithDevice();
    const eventId = await seedEvent(userId, "order_status");
    fcmCalls.length = 0;
    fcmPlan = ["fail503", "sent"];

    const r1 = await dispatchPushForUser(payload(userId, eventId) as never, { notification_event_id: eventId, skip_settings_gate: true });
    expect(r1.outcome).toBe("retryable");
    expect((await deliveries(eventId)).map((d) => d.status)).toEqual(["failed"]);

    const r2 = await dispatchPushForUser(payload(userId, eventId) as never, { notification_event_id: eventId, skip_settings_gate: true });
    expect(r2.outcome).toBe("sent");
    const after2 = await deliveries(eventId);
    expect(after2).toHaveLength(1);
    expect(after2[0].status).toBe("sent");
    expect(after2[0].provider_response.delivery_attempt).toBe(2);

    const r3 = await dispatchPushForUser(payload(userId, eventId) as never, { notification_event_id: eventId, skip_settings_gate: true });
    expect(r3.outcome).toBe("sent");
    expect(fcmCalls).toHaveLength(2); // 503 + one successful resend, never a third send
    expect(await deliveries(eventId)).toHaveLength(1);
  });

  it("SRV-01: two concurrent retries of the same failed row send exactly once", async () => {
    const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
    const { userId } = await seedUserWithDevice();
    const eventId = await seedEvent(userId, "order_status");
    fcmCalls.length = 0;
    fcmPlan = ["fail503"];
    await dispatchPushForUser(payload(userId, eventId) as never, { notification_event_id: eventId, skip_settings_gate: true });
    fcmPlan = ["sent", "sent"];
    const [a, b] = await Promise.all([
      dispatchPushForUser(payload(userId, eventId) as never, { notification_event_id: eventId, skip_settings_gate: true }),
      dispatchPushForUser(payload(userId, eventId) as never, { notification_event_id: eventId, skip_settings_gate: true }),
    ]);
    expect(fcmCalls).toHaveLength(2); // initial 503 + exactly one resend
    expect([a.outcome, b.outcome].sort()).toEqual(["retryable", "sent"]); // loser sees in_flight
    expect((await deliveries(eventId)).map((d) => d.status)).toEqual(["sent"]);
  });

  it("SRV-01: a stale pending row (unknown provider outcome, like the 114 rows) is never resent", async () => {
    const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
    const { userId, devId } = await seedUserWithDevice();
    const eventId = await seedEvent(userId, "order_status");
    await db.from("notification_deliveries").insert({
      user_id: userId, device_id: devId, event_type: "order_status", status: "pending", notification_event_id: eventId,
    });
    fcmCalls.length = 0;
    const r = await dispatchPushForUser(payload(userId, eventId) as never, { notification_event_id: eventId, skip_settings_gate: true });
    expect(fcmCalls).toHaveLength(0);
    expect(r.outcome).toBe("retryable");
    expect((await deliveries(eventId)).map((d) => d.status)).toEqual(["pending"]);
  });

  it("SRV-02: trade chat push follows trade_chat_enabled (real preference reader)", async () => {
    const { shouldSendWebPushForUser } = await import("@/lib/notifications/web-push-user-settings-gate");
    const { buildPushPayload } = await import("@/lib/notifications/pipeline/notify-push-dispatcher");
    const rowOf = (userId: string) => ({
      id: randomUUID(), user_id: userId, type: "trade_message", category: "chat", room_id: randomUUID(), call_session_id: null,
      actor_user_id: null, message_id: null, title: "t", body: "b", display_payload: {}, unread: true, read_at: null,
      delivered_at: null, opened_at: null, muted_snapshot: false, push_suppressed_reason: null, sound_suppressed_reason: null,
      dedupe_key: "k", created_at: new Date().toISOString(),
    });
    const on = await seedUserWithDevice({ trade_chat_enabled: true, community_chat_enabled: false });
    const off = await seedUserWithDevice({ trade_chat_enabled: false, community_chat_enabled: true });
    expect(await shouldSendWebPushForUser(db as never, on.userId, buildPushPayload(rowOf(on.userId) as never, 0))).toBe(true);
    expect(await shouldSendWebPushForUser(db as never, off.userId, buildPushPayload(rowOf(off.userId) as never, 0))).toBe(false);
  });

  it("ADM-02: real PostgREST error codes drive the fallback; phase 1 → phase 2 keeps per-occurrence history", async () => {
    const { upsertCampaignTargetRows } = await import("@/lib/admin/notification-campaigns/campaign-target-rows");
    const sql = (q: string) => execSync(`${PSQL} -X -q -v ON_ERROR_STOP=1 -c ${JSON.stringify(q)}`, { stdio: "pipe" });
    const camp = randomUUID(), occ1 = randomUUID(), occ2 = randomUUID(), user = randomUUID();
    sql(`insert into auth.users values ('${user}');`);
    sql(`insert into public.admin_notification_campaigns values ('${camp}');`);
    sql(`insert into public.admin_notification_campaign_occurrences values ('${occ1}','${camp}'),('${occ2}','${camp}');`);
    const row = (occ: string, status: "pending" | "sent") => ({ campaign_id: camp, occurrence_id: occ, user_id: user, status });

    // Before any migration: occurrence key has no unique → PostgREST 42P10 → legacy fallback.
    const r0 = await upsertCampaignTargetRows(db as never, [row(occ1, "sent")]);
    expect(r0).toEqual({ mode: "legacy", error: null });

    // Phase 1 (additive) — the real migration file.
    const mig = path.resolve(process.cwd(), "supabase/migrations/20270514120000_admin_campaign_targets_occurrence_unique.sql");
    execSync(`${PSQL} -X -q -v ON_ERROR_STOP=1 -f ${mig}`, { stdio: "pipe" });
    // Old deployed code path (legacy key) still works after phase 1.
    const legacy = await db.from("admin_notification_campaign_targets").upsert([row(occ1, "sent")], { onConflict: "campaign_id,user_id" });
    expect(legacy.error).toBeNull();
    // New occurrence row while legacy unique still exists → PostgREST 23505 → legacy fallback.
    const r1 = await upsertCampaignTargetRows(db as never, [row(occ2, "pending")], { ignoreDuplicates: true });
    expect(r1.mode).toBe("legacy");

    // Phase 2 (docs SQL, manual after deploy).
    const p2 = path.resolve(process.cwd(), "docs/notifications/adm02-phase2-drop-legacy-campaign-target-unique.sql");
    execSync(`${PSQL} -X -q -v ON_ERROR_STOP=1 -f ${p2}`, { stdio: "pipe" });
    const r2 = await upsertCampaignTargetRows(db as never, [row(occ2, "pending")], { ignoreDuplicates: true });
    expect(r2).toEqual({ mode: "occurrence", error: null });
    const { data } = await db.from("admin_notification_campaign_targets").select("occurrence_id, status").eq("user_id", user).order("status");
    expect(data).toEqual([
      { occurrence_id: occ2, status: "pending" },
      { occurrence_id: occ1, status: "sent" },
    ]);
  });
});
