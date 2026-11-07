import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * D-12 · D-13 (재감사 3차 2026-11-07) — 팝업·PTR 기록 API.
 * D-12: 노출될 수 없는 캠페인(초안·검토·반려·종료 · PTR 허용 목록 밖)의 기록은 200 + 저장 안 함.
 * D-13: DB 고유 인덱스 충돌(23505) = deduped (500 아님) · 노출 id 는 노출마다 다르다.
 */

const h = vi.hoisted(() => ({
  userId: null as string | null,
  campaign: null as Record<string, unknown> | null,
  insertError: null as { code?: string; message: string } | null,
  inserts: [] as unknown[],
}));

vi.mock("@/lib/auth/get-optional-authenticated-user-id", () => ({
  getOptionalAuthenticatedUserId: vi.fn(async () => h.userId),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({
    from: () => ({
      insert: async (row: unknown) => {
        if (h.insertError) return { error: h.insertError };
        h.inserts.push(row);
        return { error: null };
      },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.campaign, error: null }) }) }),
    }),
  }),
}));
vi.mock("@/lib/http/rate-limit-redis", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getOptionalRateLimitRedis: () => null,
}));

import { POST } from "@/app/api/platform-popup/events/route";
import { decidePlatformPopupEventRecordable } from "@/lib/platform-popup/popup-event-record-gate";
import { newPlatformPopupExposureId } from "@/lib/platform-popup/popup-exposure-id";

let seq = 0;
function send(over: Record<string, unknown> = {}) {
  seq += 1;
  const ip = `203.0.113.${seq % 250}`;
  return POST(
    new Request("https://x.test/api/platform-popup/events", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip, "x-real-ip": ip },
      body: JSON.stringify({
        campaignId: `camp-${seq}`,
        creativeId: "cr",
        eventType: "impression",
        source: "renderer",
        exposureId: `exp-${seq}`,
        deviceKey: "dev-1",
        ...over,
      }),
    }) as never
  );
}

beforeEach(() => {
  h.userId = null;
  h.campaign = { status: "active", presentation_type: "center_modal" };
  h.insertError = null;
  h.inserts.length = 0;
});

describe("D-12 캠페인 확인", () => {
  it.each(["active", "scheduled", "paused"])("%s 는 저장", async (status) => {
    h.campaign = { status, presentation_type: "center_modal" };
    const r = await send();
    expect(await r.json()).toMatchObject({ ok: true });
    expect(h.inserts).toHaveLength(1);
  });

  it.each(["draft", "pending_review", "rejected", "ended"])("%s 는 200 + 저장 안 함", async (status) => {
    h.campaign = { status, presentation_type: "center_modal" };
    const r = await send();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, skipped: true });
    expect(h.inserts).toHaveLength(0);
  });

  it("없는 캠페인 → 200 + 저장 안 함", async () => {
    h.campaign = null;
    const r = await send();
    expect(await r.json()).toMatchObject({ ok: true, skipped: true });
    expect(h.inserts).toHaveLength(0);
  });

  it("PTR 허용 목록: 목록 밖 회원·비회원은 저장 안 함 · 목록 안 회원은 저장", async () => {
    const allowed = "11111111-1111-1111-1111-111111111111";
    h.campaign = { status: "active", presentation_type: "ptr_reveal", audience_mode: "allowlist", audience_user_ids: [allowed] };
    h.userId = "22222222-2222-2222-2222-222222222222";
    expect(await (await send()).json()).toMatchObject({ skipped: true });
    h.userId = null;
    expect(await (await send()).json()).toMatchObject({ skipped: true });
    h.userId = allowed;
    expect(await (await send()).json()).toMatchObject({ ok: true });
    expect(h.inserts).toHaveLength(1);
  });

  it("공개 PTR(all)·일반 팝업은 허용 목록을 보지 않는다", () => {
    expect(decidePlatformPopupEventRecordable({ status: "active", presentation_type: "ptr_reveal", audience_mode: "all" }, null)).toEqual({ ok: true });
    expect(decidePlatformPopupEventRecordable({ status: "active", presentation_type: "center_modal", audience_mode: "allowlist", audience_user_ids: [] }, null)).toEqual({ ok: true });
  });
});

describe("D-13 중복", () => {
  it("DB 고유 인덱스 충돌(23505) = deduped (500 아님)", async () => {
    h.insertError = { code: "23505", message: "duplicate key value violates unique constraint" };
    const r = await send();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, deduped: true });
  });

  it("다른 DB 오류는 원문 없이 500", async () => {
    h.insertError = { code: "XX000", message: "boom internal" };
    const r = await send();
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("boom");
  });

  it("노출 id 는 노출마다 다르다 (예전: 캠페인:소재:조회 회차 — 실행마다 1부터)", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newPlatformPopupExposureId()));
    expect(ids.size).toBe(50);
  });

  it("저장되는 meta.exposureId = 요청의 노출 id (meta 가 덮어쓰지 못함)", async () => {
    await send({ exposureId: "exp-fixed", meta: { exposureId: "spoof", placement: "ptr_reveal" } });
    expect((h.inserts[0] as { meta: Record<string, unknown> }).meta).toMatchObject({ exposureId: "exp-fixed", placement: "ptr_reveal" });
  });
});
