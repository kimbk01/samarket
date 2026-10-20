/**
 * R7 목록 표준 — 플랫폼·홍보 목록 API 계약 (가짜 DB).
 * `limit`(20/50/100)·`offset` → `.range()` + `count: "exact"` → 응답 `total`. 고정 상한(`.limit(200)`) 제거.
 * `limit` 이 없는 호출(다른 화면 호출자)은 기존 응답 그대로.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parsePlatformAdminListPage } from "@/lib/admin/platform-list/admin-platform-list-page";

const requireAdminApiUser = vi.fn();
const tryCreateSupabaseServiceClient = vi.fn();

vi.mock("@/lib/admin/require-admin-api", () => ({
  requireAdminApiUser: (...args: unknown[]) => requireAdminApiUser(...args),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => tryCreateSupabaseServiceClient(),
}));

type Call = [string, ...unknown[]];
type QueryLog = { table: string; calls: Call[]; url: URL };

/** 체인 호출을 기록하고 await 시 표 별 고정 결과를 돌려주는 가짜 Supabase. */
function fakeSb(tables: Record<string, { data: unknown[]; count?: number }>) {
  const log: QueryLog[] = [];
  const sb = {
    from(table: string) {
      const entry: QueryLog = { table, calls: [], url: new URL(`http://db.test/rest/v1/${table}`) };
      log.push(entry);
      const res = tables[table] ?? { data: [] };
      const builder: unknown = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "url") return entry.url;
            if (prop === "then") {
              return (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
                Promise.resolve({ data: res.data, error: null, count: res.count ?? null }).then(ok, ko);
            }
            return (...args: unknown[]) => {
              entry.calls.push([String(prop), ...args]);
              return builder;
            };
          },
        }
      );
      return builder;
    },
  };
  return { sb, log };
}

const callsOf = (log: QueryLog[], table: string) => log.find((q) => q.table === table)?.calls ?? [];
const has = (calls: Call[], name: string) => calls.some((c) => c[0] === name);
const argsOf = (calls: Call[], name: string) => calls.find((c) => c[0] === name)?.slice(1);
const req = (url: string) => new NextRequest(`http://localhost${url}`);

beforeEach(() => {
  vi.resetModules();
  requireAdminApiUser.mockReset();
  tryCreateSupabaseServiceClient.mockReset();
  requireAdminApiUser.mockResolvedValue({ ok: true, userId: "admin-1" });
});

describe("parsePlatformAdminListPage", () => {
  const sp = (q: string) => new URLSearchParams(q);
  it("limit 이 없으면 null (기존 응답 호환)", () => {
    expect(parsePlatformAdminListPage(sp(""))).toBeNull();
    expect(parsePlatformAdminListPage(sp("offset=20"))).toBeNull();
  });
  it("limit 은 20/50/100 만, 그 외는 20 · offset 은 0 이상", () => {
    expect(parsePlatformAdminListPage(sp("limit=50&offset=100"))).toEqual({ limit: 50, offset: 100 });
    expect(parsePlatformAdminListPage(sp("limit=200"))).toEqual({ limit: 20, offset: 0 });
    expect(parsePlatformAdminListPage(sp("limit=7&offset=-3"))).toEqual({ limit: 20, offset: 0 });
  });
});

describe("GET /api/admin/platform-events", () => {
  it("limit/offset → range + count exact → total", async () => {
    const { sb, log } = fakeSb({ platform_events: { data: [{ id: "e1", title: "A" }], count: 321 } });
    tryCreateSupabaseServiceClient.mockReturnValue(sb);
    const { GET } = await import("@/app/api/admin/platform-events/route");
    const res = await GET(req("/api/admin/platform-events?limit=50&offset=100"));
    const j = (await res.json()) as { ok: boolean; total: number; limit: number; offset: number; events: unknown[] };
    expect(j).toMatchObject({ ok: true, total: 321, limit: 50, offset: 100 });
    const calls = callsOf(log, "platform_events");
    expect(argsOf(calls, "select")?.[1]).toEqual({ count: "exact" });
    expect(argsOf(calls, "range")).toEqual([100, 149]);
    expect(has(calls, "limit")).toBe(false);
  });

  it("limit 없음 → 기존 응답 (알림 캠페인 화면 제목 맵 호출자)", async () => {
    const { sb, log } = fakeSb({ platform_events: { data: [] } });
    tryCreateSupabaseServiceClient.mockReturnValue(sb);
    const { GET } = await import("@/app/api/admin/platform-events/route");
    const j = (await (await GET(req("/api/admin/platform-events"))).json()) as Record<string, unknown>;
    expect(j.ok).toBe(true);
    expect("total" in j).toBe(false);
    expect(argsOf(callsOf(log, "platform_events"), "limit")).toEqual([200]);
  });
});

describe("GET /api/admin/platform-promotion/banners", () => {
  it("항상 서버 페이지 — 기본 20건, total = count, 고정 200 상한 없음", async () => {
    const { sb, log } = fakeSb({
      platform_promotion_distributions: { data: [], count: 45 },
    });
    tryCreateSupabaseServiceClient.mockReturnValue(sb);
    const { GET } = await import("@/app/api/admin/platform-promotion/banners/route");
    const j = (await (await GET(req("/api/admin/platform-promotion/banners"))).json()) as Record<string, unknown>;
    expect(j).toMatchObject({ ok: true, total: 45, limit: 20, offset: 0 });
    const calls = callsOf(log, "platform_promotion_distributions");
    expect(argsOf(calls, "range")).toEqual([0, 19]);
    expect(has(calls, "limit")).toBe(false);

    const second = fakeSb({ platform_promotion_distributions: { data: [], count: 45 } });
    tryCreateSupabaseServiceClient.mockReturnValue(second.sb);
    await GET(req("/api/admin/platform-promotion/banners?limit=100&offset=100"));
    expect(argsOf(callsOf(second.log, "platform_promotion_distributions"), "range")).toEqual([100, 199]);
  });
});

describe("GET /api/admin/platform-event-owner-requests", () => {
  it("서버 페이지 + total (예전: 상한 없이 전부)", async () => {
    const { sb, log } = fakeSb({ platform_event_owner_requests: { data: [], count: 7 } });
    tryCreateSupabaseServiceClient.mockReturnValue(sb);
    const { GET } = await import("@/app/api/admin/platform-event-owner-requests/route");
    const j = (await (await GET(req("/api/admin/platform-event-owner-requests?limit=50"))).json()) as Record<
      string,
      unknown
    >;
    expect(j).toMatchObject({ ok: true, total: 7, limit: 50, offset: 0 });
    const calls = log[0]!.calls;
    expect(argsOf(calls, "select")).toEqual(["*", { count: "exact" }]);
    expect(argsOf(calls, "range")).toEqual([0, 49]);
  });
});

describe("GET /api/admin/app-notices", () => {
  it("limit 있음 → range + total + 분류·제목 검색 (서버)", async () => {
    const { sb, log } = fakeSb({ app_notices: { data: [{ id: "n1" }], count: 230 } });
    tryCreateSupabaseServiceClient.mockReturnValue(sb);
    const { GET } = await import("@/app/api/admin/app-notices/route");
    const j = (await (await GET(req("/api/admin/app-notices?limit=20&offset=200&content_type=notice&q=환불"))).json()) as Record<
      string,
      unknown
    >;
    expect(j).toMatchObject({ ok: true, total: 230, limit: 20, offset: 200 });
    const calls = callsOf(log, "app_notices");
    expect(argsOf(calls, "range")).toEqual([200, 219]);
    expect(has(calls, "limit")).toBe(false);
    expect(argsOf(calls, "ilike")).toEqual(["title", "%환불%"]);
    expect(argsOf(calls, "eq")).toEqual(["content_type", "notice"]);
  });

  it("limit 없음 → 기존 응답 (캠페인 화면 콘텐츠 선택 호출자)", async () => {
    const { sb, log } = fakeSb({ app_notices: { data: [] } });
    tryCreateSupabaseServiceClient.mockReturnValue(sb);
    const { GET } = await import("@/app/api/admin/app-notices/route");
    const j = (await (await GET(req("/api/admin/app-notices"))).json()) as Record<string, unknown>;
    expect("total" in j).toBe(false);
    expect(argsOf(callsOf(log, "app_notices"), "limit")).toEqual([200]);
  });
});

describe("팝업 / 당겨서 새로고침 목록 — listPlatformPopupAdminCampaignPage · countPlatformPopupAdminCampaigns", () => {
  const NOW = "2026-10-20T04:00:00.000Z";

  it("「지금 노출 중」 필터: status=active + 시작 ≤ 지금 + 종료 없음/≥ 지금, 목록과 건수가 같은 조건", async () => {
    const { listPlatformPopupAdminCampaignPage, countPlatformPopupAdminCampaigns } = await import(
      "@/lib/platform-popup/admin-campaign-loader"
    );
    const page = fakeSb({ platform_popup_campaigns: { data: [], count: 3 } });
    const r = await listPlatformPopupAdminCampaignPage(page.sb as never, {
      filter: { status: "live", nowIso: NOW },
      limit: 20,
      offset: 40,
    });
    expect(r).toEqual({ ok: true, items: [], total: 3 });
    const listCalls = callsOf(page.log, "platform_popup_campaigns");
    expect(argsOf(listCalls, "range")).toEqual([40, 59]);
    expect(has(listCalls, "limit")).toBe(false);
    expect(argsOf(listCalls, "eq")).toEqual(["status", "active"]);
    const listAnd = page.log[0]!.url.searchParams.get("and");

    const count = fakeSb({ platform_popup_campaigns: { data: [], count: 3 } });
    const c = await countPlatformPopupAdminCampaigns(count.sb as never, { status: "live", nowIso: NOW });
    expect(c).toEqual({ ok: true, total: 3 });
    const countCalls = callsOf(count.log, "platform_popup_campaigns");
    expect(argsOf(countCalls, "select")).toEqual(["id", { count: "exact", head: true }]);
    expect(count.log[0]!.url.searchParams.get("and")).toBe(listAnd);
    expect(listAnd).toContain("presentation_type.neq.ptr_reveal");
    expect(listAnd).toContain(`start_at.lte."${NOW}"`);
    expect(listAnd).toContain(`end_at.gte."${NOW}"`);
  });

  it("scope=ptr + 검색어 → ptr_reveal 만 + 이름·문구·이동 경로 ilike", async () => {
    const { listPlatformPopupAdminCampaignPage } = await import("@/lib/platform-popup/admin-campaign-loader");
    const { sb, log } = fakeSb({ platform_popup_campaigns: { data: [], count: 0 } });
    await listPlatformPopupAdminCampaignPage(sb as never, {
      filter: { scope: "ptr", status: "paused", q: "summer" },
      limit: 50,
      offset: 0,
    });
    const calls = callsOf(log, "platform_popup_campaigns");
    expect(calls.filter((c) => c[0] === "eq").map((c) => c.slice(1))).toEqual([
      ["presentation_type", "ptr_reveal"],
      ["status", "paused"],
    ]);
    const and = log[0]!.url.searchParams.get("and") ?? "";
    expect(and).toContain('name.ilike."%summer%"');
    expect(and).toContain('external_url.ilike."%summer%"');
  });

  it("허용 밖 상태값은 무시, 형태 필터는 서버 조건 (혜택 다이얼로그)", async () => {
    const { listPlatformPopupAdminCampaignPage } = await import("@/lib/platform-popup/admin-campaign-loader");
    const { sb, log } = fakeSb({ platform_popup_campaigns: { data: [], count: 0 } });
    await listPlatformPopupAdminCampaignPage(sb as never, {
      filter: { status: "drop_table", composition: "benefit_dialog" },
      limit: 20,
      offset: 0,
    });
    const eqs = callsOf(log, "platform_popup_campaigns").filter((c) => c[0] === "eq").map((c) => c.slice(1));
    expect(eqs).toEqual([["presentation_type", "benefit_dialog"]]);
  });

  it("API 는 limit 이 있을 때만 페이지 모드 — 화면은 주소 필터를 API 로 넘긴다", () => {
    const route = readFileSync(path.join(process.cwd(), "app/api/admin/platform-popup-campaigns/route.ts"), "utf8");
    expect(route).toContain("parsePlatformAdminListPage(params)");
    expect(route).toContain("listPlatformPopupAdminCampaignPage");
    const list = readFileSync(
      path.join(process.cwd(), "components/admin/platform-popup/AdminPlatformPopupListPage.tsx"),
      "utf8"
    );
    expect(list).toContain("useAdminListQuery");
    expect(list).toContain("AdminPagination");
    expect(list).toContain("PLATFORM_POPUP_LIVE_STATUS_FILTER");
  });
});
