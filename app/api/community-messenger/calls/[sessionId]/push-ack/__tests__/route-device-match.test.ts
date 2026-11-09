import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * R3 (2026-11-09) — 수신 확인은 보낸 기기의 발송 행에 기록.
 * 문서: `docs/audit/call-residual-risk-design-2026-11-09.md` §2 R3.
 */

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  updates: [] as Array<{ table: string; id: unknown; patch: Row }>,
  failTable: null as string | null,
}));

function makeQuery(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let orderKey: string | null = null;
  let ascending = true;
  let limitN: number | null = null;
  let updatePatch: Row | null = null;
  const run = () => {
    let rows = (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    if (orderKey) {
      const k = orderKey;
      rows = [...rows].sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : 1) * (ascending ? 1 : -1));
    }
    if (limitN != null) rows = rows.slice(0, limitN);
    return rows;
  };
  const q: Record<string, unknown> = {
    select: () => q,
    update: (patch: Row) => {
      updatePatch = patch;
      return q;
    },
    eq: (k: string, v: unknown) => {
      if (updatePatch) {
        db.updates.push({ table, id: v, patch: updatePatch });
        return Promise.resolve({ error: null });
      }
      filters.push((r) => r[k] === v);
      return q;
    },
    in: (k: string, vs: unknown[]) => {
      filters.push((r) => vs.includes(r[k]));
      return q;
    },
    order: (k: string, o?: { ascending?: boolean }) => {
      orderKey = k;
      ascending = o?.ascending !== false;
      return q;
    },
    limit: (n: number) => {
      limitN = n;
      return q;
    },
    maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
    then: (resolve: (v: { data: Row[] | null; error: { message: string } | null }) => unknown) =>
      db.failTable === table
        ? resolve({ data: null, error: { message: "boom" } })
        : resolve({ data: run(), error: null }),
  };
  return q;
}

vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserIdStrict: vi.fn(async () => ({ ok: true, userId: "user-b" })),
}));

vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({ from: (t: string) => makeQuery(t) }),
}));

import { POST } from "@/app/api/community-messenger/calls/[sessionId]/push-ack/route";

function ackRequest(body: Row) {
  return new Request("https://x/api/community-messenger/calls/call-1/push-ack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}
const params = { params: Promise.resolve({ sessionId: "call-1" }) };

beforeEach(() => {
  db.updates = [];
  db.failTable = null;
  db.tables = {
    community_messenger_call_sessions: [
      { id: "call-1", status: "ringing", initiator_user_id: "user-a", recipient_user_id: "user-b" },
    ],
    user_devices: [
      { id: "row-phone-old", user_id: "user-b", device_id: "phone" },
      { id: "row-phone", user_id: "user-b", device_id: "phone" },
      { id: "row-tablet", user_id: "user-b", device_id: "tablet" },
    ],
    notification_deliveries: [
      {
        id: "d-phone",
        user_id: "user-b",
        device_id: "row-phone",
        target_type: "call_session",
        target_id: "call-1",
        event_type: "call_ringing",
        created_at: "2026-11-09T06:55:47.600Z",
        provider_response: { provider: "fcm" },
      },
      {
        id: "d-tablet",
        user_id: "user-b",
        device_id: "row-tablet",
        target_type: "call_session",
        target_id: "call-1",
        event_type: "call_ringing",
        created_at: "2026-11-09T06:55:47.700Z",
        provider_response: { provider: "fcm" },
      },
    ],
  };
});

describe("push-ack device match (R3)", () => {
  it("보낸 기기(phone)의 발송 행에 기록 — 더 최근인 다른 기기(tablet) 행을 덮어쓰지 않음", async () => {
    const res = await POST(ackRequest({ deviceId: "phone", receivedAt: 1 }), params);
    expect(res.status).toBe(200);
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].id).toBe("d-phone");
    const pr = db.updates[0].patch.provider_response as Record<string, Record<string, unknown>>;
    expect(pr.nativeAck.deviceId).toBe("phone");
    expect(pr.nativeAck.deviceMatched).toBe(true);
    expect(pr.provider).toBe("fcm");
  });

  it("다른 기기(tablet) 확인은 tablet 행에", async () => {
    await POST(ackRequest({ deviceId: "tablet", receivedAt: 1 }), params);
    expect(db.updates[0].id).toBe("d-tablet");
  });

  it("기기 행을 못 찾으면 기존 방식(최근 행) + deviceMatched false", async () => {
    await POST(ackRequest({ deviceId: "unknown", receivedAt: 1 }), params);
    expect(db.updates[0].id).toBe("d-tablet");
    const pr = db.updates[0].patch.provider_response as Record<string, Record<string, unknown>>;
    expect(pr.nativeAck.deviceMatched).toBe(false);
  });

  it("deviceId 없는 구 앱 요청도 기존처럼 기록 (호환)", async () => {
    const res = await POST(ackRequest({ receivedAt: 1 }), params);
    const json = (await res.json()) as { ok: boolean; matched: boolean };
    expect(json).toMatchObject({ ok: true, matched: true });
    expect(db.updates[0].id).toBe("d-tablet");
  });

  it("R4: stage=presented 는 nativePresentation 에만 기록 — 기존 수신 확인(nativeAck) 보존", async () => {
    const prev = db.tables.notification_deliveries[0];
    prev.provider_response = { provider: "fcm", nativeAck: { receivedAt: 5, deviceId: "phone" } };
    const res = await POST(
      ackRequest({
        deviceId: "phone",
        stage: "presented",
        surface: "activity",
        platform: "android",
        mediaChannelImportance: 4,
        screenInteractive: true,
      }),
      params,
    );
    const json = (await res.json()) as { ok: boolean; matched: boolean };
    expect(json).toMatchObject({ ok: true, matched: true });
    expect(db.updates[0].id).toBe("d-phone");
    const pr = db.updates[0].patch.provider_response as Record<string, Record<string, unknown>>;
    expect(pr.nativeAck).toEqual({ receivedAt: 5, deviceId: "phone" });
    expect(pr.nativePresentation).toMatchObject({
      stage: "presented",
      surface: "activity",
      platform: "android",
      mediaChannelImportance: 4,
      screenInteractive: true,
      deviceMatched: true,
    });
  });

  it("R4: stage=suppressed + reason 기록", async () => {
    await POST(ackRequest({ deviceId: "tablet", stage: "suppressed", reason: "busy_or_terminal" }), params);
    const pr = db.updates[0].patch.provider_response as Record<string, Record<string, unknown>>;
    expect(db.updates[0].id).toBe("d-tablet");
    expect(pr.nativePresentation).toMatchObject({ stage: "suppressed", reason: "busy_or_terminal" });
    expect(pr.nativeAck).toBeUndefined();
  });

  it("R4: 모르는 stage 는 기존 수신 확인으로 처리 (호환)", async () => {
    await POST(ackRequest({ deviceId: "phone", stage: "weird", receivedAt: 9 }), params);
    const pr = db.updates[0].patch.provider_response as Record<string, Record<string, unknown>>;
    expect(pr.nativeAck.receivedAt).toBe(9);
    expect(pr.nativePresentation).toBeUndefined();
  });

  it("F5: 기기 조회가 실패해도 수신 확인을 버리지 않고 최근 행에 기록 (deviceMatched false)", async () => {
    db.failTable = "user_devices";
    const res = await POST(ackRequest({ deviceId: "phone", receivedAt: 1 }), params);
    expect(res.status).toBe(200);
    expect(db.updates[0].id).toBe("d-tablet");
    const pr = db.updates[0].patch.provider_response as Record<string, Record<string, unknown>>;
    expect(pr.nativeAck.deviceMatched).toBe(false);
  });
});
