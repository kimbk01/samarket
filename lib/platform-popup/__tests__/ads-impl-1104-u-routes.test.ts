import { beforeEach, describe, expect, it, vi } from "vitest";

/** 광고 ② 구현 U — 기록 API 요청 제한(D-21 ③)·팝업 이벤트 중복 거르기(④)·× 행 없음(PU-31)·FB-E07·PV-5 라우트 시험 */

const h = vi.hoisted(() => ({
  userId: null as string | null,
  inserts: [] as Array<{ table: string; row: unknown }>,
  rpc: vi.fn(async () => ({ data: { ok: true, deduped: false }, error: null })),
}));

vi.mock("@/lib/auth/get-optional-authenticated-user-id", () => ({
  getOptionalAuthenticatedUserId: vi.fn(async () => h.userId),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({
    from: (table: string) => ({
      insert: async (row: unknown) => {
        h.inserts.push({ table, row });
        return { error: null };
      },
      // D-12: 기록 API 는 캠페인 상태를 읽는다 — 노출 중 팝업으로 둔다
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { timezone: "Asia/Manila", status: "active", presentation_type: "center_modal" },
            error: null,
          }),
        }),
      }),
    }),
    rpc: h.rpc,
  }),
}));
vi.mock("@/lib/http/rate-limit-redis", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getOptionalRateLimitRedis: () => null,
}));

import { POST as popupEvents } from "@/app/api/platform-popup/events/route";
import { POST as popupSuppress } from "@/app/api/platform-popup/suppress/route";
import { POST as feedEvents } from "@/app/api/feed-ads/events/route";
import { AD_EVENT_RECORD_QUOTA, adEventRecordActorKey } from "@/lib/security/rate-limit-presets";

let ipSeq = 0;
const nextIp = () => `198.51.100.${++ipSeq % 250}`;

function req(url: string, body: unknown, ip: string) {
  return new Request(`https://x.test${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip, "x-real-ip": ip },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  h.userId = null;
  h.inserts.length = 0;
  h.rpc.mockClear();
});

describe("D-21 ③ 요청 제한 키", () => {
  it("회원 id 우선, 없으면 IP 해시(원문 IP 를 키에 남기지 않음)", () => {
    expect(adEventRecordActorKey({ userId: "u1", ip: "1.2.3.4" })).toBe("u:u1");
    const k = adEventRecordActorKey({ userId: null, ip: "1.2.3.4" });
    expect(k).toMatch(/^iph:[0-9a-f]{32}$/);
    expect(k).not.toContain("1.2.3.4");
  });
});

describe("POST /api/platform-popup/events", () => {
  /** D-13 (재감사 3차): 키에 노출 id 가 들어간다 — 같은 노출·같은 종류만 거르고, 다른 노출은 각각 저장한다 */
  it("④+D-13 같은 보는 사람·노출·종류는 1번만 저장 — 같은 노출 두 번째는 deduped · 다른 노출은 따로 저장", async () => {
    const ip = nextIp();
    const body = { campaignId: "c1", creativeId: "cr1", eventType: "click", source: "click_handler", exposureId: "e1", deviceKey: "dev-dedupe" };
    const a = await popupEvents(req("/api/platform-popup/events", body, ip));
    const b = await popupEvents(req("/api/platform-popup/events", body, ip));
    expect(a.status).toBe(200);
    expect(await b.json()).toMatchObject({ ok: true, deduped: true });
    expect(h.inserts.filter((i) => i.table === "platform_popup_campaign_events")).toHaveLength(1);
    // 다른 노출(e2)은 같은 소재여도 따로 저장 (예전 키는 노출 id 가 없어 지웠다)
    await popupEvents(req("/api/platform-popup/events", { ...body, exposureId: "e2" }, ip));
    expect(h.inserts).toHaveLength(2);
    // 종류가 다르면 따로 저장
    await popupEvents(req("/api/platform-popup/events", { ...body, eventType: "landing_success" }, ip));
    expect(h.inserts).toHaveLength(3);
  });

  it("③ 1분 120회를 넘으면 429 (요청 제한)", async () => {
    const ip = nextIp();
    let last = 0;
    for (let i = 0; i <= AD_EVENT_RECORD_QUOTA.limit; i++) {
      const r = await popupEvents(
        req("/api/platform-popup/events", { campaignId: `q${i}`, eventType: "click", source: "click_handler", exposureId: `x${i}`, deviceKey: "dev-q" }, ip)
      );
      last = r.status;
    }
    expect(last).toBe(429);
  });
});

describe("POST /api/platform-popup/suppress", () => {
  it("PU-31: CLOSE 는 DB 행을 쓰지 않는다(구 앱 호환으로 성공만)", async () => {
    const r = await popupSuppress(req("/api/platform-popup/suppress", { campaignId: "c1", mode: "CLOSE", deviceKey: "d1" }, nextIp()));
    expect(await r.json()).toMatchObject({ ok: true, skipped: true });
    expect(h.inserts).toHaveLength(0);
  });
  it("TODAY 는 효과 있는 숨김 행을 쓴다", async () => {
    await popupSuppress(req("/api/platform-popup/suppress", { campaignId: "c1", mode: "TODAY", deviceKey: "d1" }, nextIp()));
    expect(h.inserts.map((i) => i.table)).toEqual(["platform_popup_user_suppressions"]);
  });
});

describe("POST /api/feed-ads/events (FB-E07)", () => {
  const base = {
    eventType: "impression",
    campaignId: "11111111-1111-4111-8111-111111111111",
    creativeId: "22222222-2222-4222-8222-222222222222",
    placement: "TRADE_HOME",
  };
  it("소재 id 없는 요청 → 400 · 기록 안 함", async () => {
    const r = await feedEvents(req("/api/feed-ads/events", { ...base, creativeId: "" }, nextIp()));
    expect(r.status).toBe(400);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("목록에 없는 위치 값 → 400", async () => {
    const r = await feedEvents(req("/api/feed-ads/events", { ...base, placement: "HOME_TOP" }, nextIp()));
    expect(r.status).toBe(400);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("정상 요청은 위치·소재를 그대로 넘긴다", async () => {
    const r = await feedEvents(req("/api/feed-ads/events", { ...base, placement: "COMMUNITY_TOPIC" }, nextIp()));
    expect(r.status).toBe(200);
    expect((h.rpc.mock.calls[0] as unknown[])[1]).toMatchObject({ p_placement: "COMMUNITY_TOPIC", p_creative_id: base.creativeId });
  });
});
