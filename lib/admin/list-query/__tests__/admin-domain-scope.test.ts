/**
 * G-06 — 도메인 범위(`?domain=`) : URL 키 보존 + 팝업·당겨서 새로고침 서버 필터(목록·건수 같은 id 집합).
 */
import { describe, expect, it } from "vitest";
import {
  ADMIN_DOMAIN_SCOPE_QUERY_KEY,
  normalizeAdminDomainScope,
  parseBannerOverviewDomain,
  placementSectionVisible,
  platformPopupSurfacesForDomainScope,
  popupSurfaceInDomainScope,
  writeAdminDomainScope,
} from "@/lib/admin/list-query/admin-domain-scope";
import {
  ADMIN_LIST_QUERY_RESERVED_KEYS,
  adminListQueryToApiParams,
  applyAdminListQueryPatch,
  parseAdminListQuery,
  writeAdminListQuery,
} from "@/lib/admin/list-query/admin-list-query";
import { platformPopupSurfaceMatches } from "@/lib/platform-popup/surfaces";

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
const argsAll = (calls: Call[], name: string) => calls.filter((c) => c[0] === name).map((c) => c.slice(1));

describe("도메인 범위 키·매핑", () => {
  it("`domain` 은 목록 공통 예약 키가 아니다 (`from` 은 기간 예약)", () => {
    expect(ADMIN_DOMAIN_SCOPE_QUERY_KEY).toBe("domain");
    expect((ADMIN_LIST_QUERY_RESERVED_KEYS as readonly string[]).includes(ADMIN_DOMAIN_SCOPE_QUERY_KEY)).toBe(false);
  });

  it("허용 밖 값은 전체(\"\")", () => {
    expect(normalizeAdminDomainScope("Delivery")).toBe("delivery");
    expect(normalizeAdminDomainScope("popup")).toBe("");
    expect(normalizeAdminDomainScope(null)).toBe("");
  });

  it("팝업 노출 위치 매핑 — 도메인 위치 + GLOBAL (런타임 매칭과 같은 의미)", () => {
    expect(platformPopupSurfacesForDomainScope("delivery")).toEqual(["DELIVERY", "DELIVERY_OWNER", "GLOBAL"]);
    expect(platformPopupSurfacesForDomainScope("trade")).toEqual(["TRADE", "GLOBAL"]);
    expect(platformPopupSurfacesForDomainScope("community")).toEqual(["COMMUNITY", "GLOBAL"]);
    // GLOBAL 캠페인은 런타임에서 배달 화면에도 뜬다 → 배달 범위에 포함하는 근거
    expect(platformPopupSurfaceMatches(["GLOBAL"], "DELIVERY")).toBe(true);
    expect(platformPopupSurfaceMatches(["TRADE"], "DELIVERY")).toBe(false);
  });

  it("노출 위치 관리 섹션·팝업 위치 카드", () => {
    expect(placementSectionVisible("trade", "")).toBe(true);
    expect(placementSectionVisible("trade", "delivery")).toBe(false);
    expect(placementSectionVisible("delivery", "delivery")).toBe(true);
    expect(placementSectionVisible("popup", "community")).toBe(true);
    expect(popupSurfaceInDomainScope("DELIVERY_OWNER", "delivery")).toBe(true);
    expect(popupSurfaceInDomainScope("TRADE", "delivery")).toBe(false);
    expect(popupSurfaceInDomainScope("MYPAGE", "")).toBe(true);
  });

  it("writeAdminDomainScope — 다른 키 유지, 전체면 키 삭제", () => {
    expect(writeAdminDomainScope("tab=x&domain=trade", "delivery").toString()).toBe("tab=x&domain=delivery");
    expect(writeAdminDomainScope("tab=x&domain=trade", "").toString()).toBe("tab=x");
  });

  it("배너 현황 도메인 파싱 — 행 domain 값 그대로, 그 외 = 전체", () => {
    expect(parseBannerOverviewDomain("delivery")).toBe("delivery");
    expect(parseBannerOverviewDomain("common")).toBe("common");
    expect(parseBannerOverviewDomain("x")).toBe("all");
    expect(parseBannerOverviewDomain(null)).toBe("all");
  });
});

describe("목록 주소 보존 — extras 로 등록한 `domain` 은 쪽 이동에도 남는다", () => {
  const config = { extras: ["composition", "domain"] as const };

  it("2쪽 이동: domain 유지 + API 파라미터에 domain 전달", () => {
    const state = parseAdminListQuery(new URLSearchParams("domain=delivery&status=live"), config);
    expect(state.extras.domain).toBe("delivery");
    const next = applyAdminListQueryPatch(state, { page: 2 });
    const url = writeAdminListQuery("domain=delivery&status=live", next, config);
    expect(url.get("domain")).toBe("delivery");
    expect(url.get("page")).toBe("2");
    const api = adminListQueryToApiParams(next, config);
    expect(api.get("domain")).toBe("delivery");
    expect(api.get("offset")).toBe("20");
  });

  it("도메인 변경은 1쪽으로, 「전체」 선택은 키 제거", () => {
    const state = parseAdminListQuery(new URLSearchParams("domain=trade&page=3"), config);
    const changed = applyAdminListQueryPatch(state, { extras: { domain: "community" } });
    expect(changed.page).toBe(1);
    const cleared = applyAdminListQueryPatch(state, { extras: { domain: "" } });
    expect(writeAdminListQuery("domain=trade&page=3", cleared, config).has("domain")).toBe(false);
  });
});

describe("팝업 서버 필터 — listPlatformPopupAdminCampaignPage · countPlatformPopupAdminCampaigns", () => {
  it("domain=delivery → 노출 위치 표에서 DELIVERY·DELIVERY_OWNER·GLOBAL 캠페인 id → 목록·건수 in(id)", async () => {
    const { listPlatformPopupAdminCampaignPage, countPlatformPopupAdminCampaigns } = await import(
      "@/lib/platform-popup/admin-campaign-loader"
    );
    const tables = {
      platform_popup_campaign_surfaces: { data: [{ campaign_id: "c1" }, { campaign_id: "c2" }, { campaign_id: "c1" }] },
      platform_popup_campaigns: { data: [], count: 2 },
    };
    const page = fakeSb(tables);
    const r = await listPlatformPopupAdminCampaignPage(page.sb as never, {
      filter: { scope: "popup", domain: "delivery" },
      limit: 20,
      offset: 20,
    });
    expect(r).toMatchObject({ ok: true, total: 2 });
    expect(argsAll(callsOf(page.log, "platform_popup_campaign_surfaces"), "in")).toEqual([
      ["surface", ["DELIVERY", "DELIVERY_OWNER", "GLOBAL"]],
    ]);
    const campaignCalls = callsOf(page.log, "platform_popup_campaigns");
    expect(argsAll(campaignCalls, "in")).toEqual([["id", ["c1", "c2"]]]);
    expect(argsAll(campaignCalls, "range")).toEqual([[20, 39]]);

    const count = fakeSb(tables);
    const c = await countPlatformPopupAdminCampaigns(count.sb as never, { scope: "ptr", domain: "delivery" });
    expect(c).toEqual({ ok: true, total: 2 });
    expect(argsAll(callsOf(count.log, "platform_popup_campaigns"), "in")).toEqual([["id", ["c1", "c2"]]]);
  });

  it("해당 캠페인이 없으면 빈 결과용 id (전체로 새지 않음) · 허용 밖 domain 은 필터 없음", async () => {
    const { listPlatformPopupAdminCampaignPage } = await import("@/lib/platform-popup/admin-campaign-loader");
    const empty = fakeSb({ platform_popup_campaign_surfaces: { data: [] }, platform_popup_campaigns: { data: [], count: 0 } });
    await listPlatformPopupAdminCampaignPage(empty.sb as never, {
      filter: { scope: "popup", domain: "trade" },
      limit: 20,
      offset: 0,
    });
    expect(argsAll(callsOf(empty.log, "platform_popup_campaigns"), "in")).toEqual([
      ["id", ["00000000-0000-0000-0000-000000000000"]],
    ]);

    const none = fakeSb({ platform_popup_campaigns: { data: [], count: 0 } });
    await listPlatformPopupAdminCampaignPage(none.sb as never, {
      filter: { scope: "popup", domain: "popup" },
      limit: 20,
      offset: 0,
    });
    expect(none.log.some((q) => q.table === "platform_popup_campaign_surfaces")).toBe(false);
    expect(argsAll(callsOf(none.log, "platform_popup_campaigns"), "in")).toEqual([]);
  });
});
