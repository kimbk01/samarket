/**
 * 광고 최종 점검 P2 — 배너 묶음.
 * ① 배달 홈 중간 배너 예비 풀 + 어드민 「배너 용량」 표기 ② 배달 홈 상단 점 누르는 자리
 * ③ 마이 CMS 배너: 모바일 이미지 · 목록 받아 닫으면 다음 · 게시 이력으로 삭제 판정 · 기간 지난 「활성」 표시(B-7)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  loaderInputs: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => ({}) }));
vi.mock("@/lib/stores/store-list-delivery-origin", () => ({
  resolveStoreListDeliveryOrigin: async () => ({ lat: 14.5, lng: 121.0, source: "member_address" }),
}));
vi.mock("@/lib/stores/delivery-viewer-gate", () => ({ resolveDeliveryViewerGate: () => "ok" }));
vi.mock("@/lib/stores/composition/stores-composition-policy-db", () => ({
  loadResolvedCompositionPolicyRowsReadOnly: async () => ({ rows: [] }),
}));
vi.mock("@/lib/stores/composition/stores-composition-insertion-live", () => ({
  homeBannerBeforeRestPolicyEnabled: () => true,
}));
vi.mock("@/lib/stores/load-delivery-ad-physical-banners", () => ({
  loadVisiblePhysicalBannerSlides: async (_sb: unknown, input: Record<string, unknown>) => {
    h.loaderInputs.push(input);
    return [
      { id: "b1", imageUrl: "https://x/1.png" },
      { id: "b2", imageUrl: "https://x/2.png" },
    ];
  },
}));
vi.mock("@/lib/stores/advertising/mark-sample-store-banner-slides", () => ({
  markSampleStoreBannerSlides: async (_sb: unknown, slides: unknown[]) => slides,
}));

import { GET as getBeforeRest } from "@/app/api/stores/home-before-rest-banners/route";
import { BANNER_PLACEMENT_CAPACITY_SSOT } from "@/lib/ads/banner-placement-capacity-ssot";
import {
  STAGE2_HOME_BEFORE_REST_BANNER_FALLBACK_POOL,
  STAGE2_SINGLE_BANNER_ADMIN_CAPACITY,
} from "@/lib/stores/advertising/delivery-ad-stage2-surface-contract";
import {
  MYPAGE_HOME_BANNER_FETCH_LIMIT,
  pickMypageHomeBanner,
  resolveMypageBannerImageSources,
} from "@/lib/mypage/mypage-home-banner-pick";
import type { MyPageBannerRow } from "@/lib/my/types";
import { loadMypageSummaryFieldsServer, loadMypageHomeBannersServer } from "@/lib/mypage/mypage-summary.server";
import { listAdminBanners, loadAdminBannerPublishedIds } from "@/lib/admin-banners/admin-banners-db";
import { isAdminBannerHardDeletable } from "@/lib/admin-banners/admin-banner-remove-policy";
import { adminBannerDisplayStatus, filterBanners } from "@/lib/admin-banners/admin-banner-utils";
import type { AdminBanner } from "@/lib/types/admin-banner";

vi.mock("server-only", () => ({}));

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const nextReq = (url: string) =>
  Object.assign(new Request(url), { nextUrl: new URL(url) }) as unknown as import("next/server").NextRequest;

/** 테스트용 Supabase 흉내 — 테이블별 결과를 돌려주고 걸린 조건을 기록한다. */
function fakeSb(results: Record<string, { data: unknown; error: unknown }>) {
  const calls: Array<{ table: string; ops: Array<[string, unknown[]]> }> = [];
  const sb = {
    from(table: string) {
      const call = { table, ops: [] as Array<[string, unknown[]]> };
      calls.push(call);
      const q: Record<string, unknown> = {};
      for (const op of ["select", "eq", "in", "or", "order", "limit", "maybeSingle"]) {
        q[op] = (...args: unknown[]) => {
          call.ops.push([op, args]);
          return q;
        };
      }
      q.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(results[table] ?? { data: [], error: null }).then(resolve, reject);
      return q;
    },
  };
  return { sb: sb as never, calls };
}

describe("① 배달 홈 중간 배너 — 예비 배너", () => {
  beforeEach(() => {
    h.loaderInputs = [];
  });

  it("서버가 등록 수용량(SSOT max)만큼 예비까지 내려 준다 (업종 상단과 같은 방식)", async () => {
    expect(STAGE2_HOME_BEFORE_REST_BANNER_FALLBACK_POOL).toBe(BANNER_PLACEMENT_CAPACITY_SSOT.STORES_HOME_INLINE_1.max);
    expect(STAGE2_HOME_BEFORE_REST_BANNER_FALLBACK_POOL).toBe(3);
    const json = await (await getBeforeRest(nextReq("http://x/api/stores/home-before-rest-banners"))).json();
    expect(h.loaderInputs).toHaveLength(1);
    expect(h.loaderInputs[0]).toMatchObject({ inventoryKey: "STORES_HOME_INLINE_1", capacity: 3 });
    expect(json.banners.map((b: { id: string }) => b.id)).toEqual(["b1", "b2"]);
  });

  it("앱은 첫 배너 1개만 그리고, 이미지가 깨지면 다음 배너로 넘어간다", () => {
    const src = read("components/stores/home/hub/StoresHomeBeforeRestBanner.tsx");
    expect(src).toContain("const slide = banners[0] ?? null;");
    expect(src).toContain("prev.filter((b) => b.id !== failedId)");
  });

  it("어드민: 「배너 용량 1」 대신 보이는 수 1 · 예비 포함 최대 3 (홈 중간·업종 상단 같은 표기)", () => {
    expect(STAGE2_SINGLE_BANNER_ADMIN_CAPACITY.STORES_HOME_INLINE_1).toEqual({ visibleAtOnce: 1, registrationMax: 3 });
    expect(STAGE2_SINGLE_BANNER_ADMIN_CAPACITY.STORES_CATEGORY_TOP).toEqual({ visibleAtOnce: 1, registrationMax: 3 });
    const browse = read("components/admin/stores/delivery-screens/DeliveryScreensBrowseTab.tsx");
    const home = read("components/admin/stores/delivery-screens/DeliveryScreensHomeTab.tsx");
    expect(browse).not.toContain('"배너 용량"');
    const storesCatalog = read("lib/i18n/catalog/copy-admin-b4-stores.ts");
    expect(storesCatalog).toContain('admin_stores_shown_at_once: "한 번에 보이는 배너"');
    expect(storesCatalog).toContain('admin_stores_max_incl_spares: "예비 포함 최대 등록"');
    for (const [src, key] of [
      [browse, "STORES_CATEGORY_TOP"],
      [home, "STORES_HOME_INLINE_1"],
    ] as const) {
      /** 언어 SSOT B4: 문구는 카탈로그 키 — 코드 모양 + 카탈로그 값으로 확인 */
      expect(src).toContain('"admin_stores_shown_at_once"');
      expect(src).toContain('"admin_stores_max_incl_spares"');
      expect(src).toContain(`STAGE2_SINGLE_BANNER_ADMIN_CAPACITY.${key}.registrationMax`);
    }
  });
});

describe("② 배달 홈 상단 점 — 누르는 자리 24px, 보이는 점 8px", () => {
  it("버튼은 h-6 w-6(24px), 안쪽 점은 h-2 w-2(8px)", () => {
    const src = read("components/stores/home/hub/StoresHomeHeroBanner.tsx");
    // 재감사 D-01: 점 묶음 줄은 누름을 받지 않고(pointer-events-none) 점 버튼만 받는다
    expect(src).toContain('className="pointer-events-auto group flex h-6 w-6 items-center justify-center"');
    expect(src).toContain('className="pointer-events-none absolute bottom-0 left-0 right-0 z-[2] flex justify-center"');
    expect(src).toContain("block h-2 w-2 rounded-full");
    expect(src).not.toMatch(/className=\{`h-2 w-2 rounded-full transition/);
  });
});

describe("③-a 마이 CMS 배너 — 모바일 이미지", () => {
  it("모바일 폭은 모바일 이미지, 없으면 기본 이미지 / 넓은 화면은 기본 이미지", () => {
    expect(resolveMypageBannerImageSources({ image_url: "d.png", mobile_image_url: "m.png" })).toEqual({
      mobileSrc: "m.png",
      desktopSrc: "d.png",
    });
    expect(resolveMypageBannerImageSources({ image_url: "d.png", mobile_image_url: "  " })).toEqual({
      mobileSrc: "d.png",
      desktopSrc: "d.png",
    });
    expect(resolveMypageBannerImageSources({ image_url: null, mobile_image_url: "m.png" })).toEqual({
      mobileSrc: "m.png",
      desktopSrc: "m.png",
    });
    expect(resolveMypageBannerImageSources({ image_url: "", mobile_image_url: null })).toBeNull();
  });

  it("고객 조회가 mobile_image_url 을 읽고, 화면은 <picture> 로 폭에 따라 고른다", () => {
    expect(read("lib/my/mypage-tables-select.ts")).toContain("mobile_image_url");
    const ui = read("components/my/MyTopBanner.tsx");
    expect(ui).toContain("<picture>");
    expect(ui).toContain("MYPAGE_BANNER_DESKTOP_MIN_WIDTH_PX");
    expect(ui).toContain("resolveMypageBannerImageSources(banner)");
  });
});

describe("③-b 마이 CMS 배너 — 닫으면 다음 배너", () => {
  const row = (id: string, dismissible = true): MyPageBannerRow => ({
    id,
    title: id,
    description: null,
    image_url: null,
    // DS-7 (2026-11-04): 링크 없는 마이 배너는 고객 응답에서 빠진다 → 시험 배너도 앱 안 경로를 가진다
    link_url: "/mypage",
    is_active: true,
    dismissible,
    sort_order: 0,
  });

  it("닫은 배너를 건너뛰고 다음 배너를 고른다 · 닫을 수 없는 배너는 기록과 상관없이 보인다", () => {
    const list = [row("a"), row("b"), row("c")];
    expect(pickMypageHomeBanner(list, () => false)?.id).toBe("a");
    expect(pickMypageHomeBanner(list, (id) => id === "a")?.id).toBe("b");
    expect(pickMypageHomeBanner(list, () => true)).toBeNull();
    expect(pickMypageHomeBanner([row("x", false), row("y")], () => true)?.id).toBe("x");
  });

  it("서버는 노출 조건에 맞는 배너를 여러 건(순서대로) 받는다", async () => {
    const { sb, calls } = fakeSb({ my_page_banners: { data: [row("a"), row("b")], error: null } });
    const list = await loadMypageHomeBannersServer(sb);
    expect(list.map((b) => b.id)).toEqual(["a", "b"]);
    const ops = calls[0]!.ops;
    expect(ops).toContainEqual(["limit", [MYPAGE_HOME_BANNER_FETCH_LIMIT]]);
    expect(ops.some(([op]) => op === "maybeSingle")).toBe(false);
    expect(ops).toContainEqual(["eq", ["is_active", true]]);
  });

  it("요약 응답: banners = 목록, banner = 첫 건 (옛 스냅샷 호환) · 실패면 둘 다 unavailable", async () => {
    const okList = [row("a"), row("b")];
    const fields = await loadMypageSummaryFieldsServer({} as never, "u1", {
      deps: { loadBanners: async () => okList } as never,
      timeoutMs: 50,
    });
    expect(fields.banners).toEqual({ status: "ok", value: okList });
    expect(fields.banner).toEqual({ status: "ok", value: okList[0] });
    const failed = await loadMypageSummaryFieldsServer({} as never, "u1", {
      deps: {
        loadBanners: async () => {
          throw new Error("db");
        },
      } as never,
      timeoutMs: 50,
    });
    expect(failed.banners).toEqual({ status: "unavailable" });
    expect(failed.banner).toEqual({ status: "unavailable" });
  });

  it("홈은 목록을 넘기고, 배너 부품이 닫지 않은 첫 배너를 그린다", () => {
    expect(read("components/mypage/MyPageHomeDashboard.tsx")).toContain("<MypageHomeCmsBanner banners={banners} />");
    const cms = read("components/mypage/home/MypageHomeCmsBanner.tsx");
    expect(cms).toContain("pickMypageHomeBanner(");
    expect(cms).toContain("rememberMypageBannerDismissed(banner.id)");
  });
});

describe("③-c 마이 CMS 배너 — 게시 이력으로 삭제 판정", () => {
  const draftRow = (id: string) => ({ id, title: id, status: "draft", impression_count: 0, click_count: 0 });

  it("변경 기록 activate · 감사 기록(전후 상태 active)을 게시 이력으로 본다", async () => {
    const { sb, calls } = fakeSb({
      admin_banner_change_logs: { data: [{ banner_id: "d1" }], error: null },
      audit_logs: { data: [{ target_id: "d2" }], error: null },
    });
    const ids = await loadAdminBannerPublishedIds(sb, ["d1", "d2", "d3"]);
    expect([...(ids ?? [])].sort()).toEqual(["d1", "d2"]);
    const logs = calls.find((c) => c.table === "admin_banner_change_logs")!.ops;
    expect(logs).toContainEqual(["eq", ["action_type", "activate"]]);
    const audit = calls.find((c) => c.table === "audit_logs")!.ops;
    expect(audit).toContainEqual(["eq", ["target_type", "admin_banner"]]);
    expect(audit).toContainEqual(["or", ["after_json->>status.eq.active,before_json->>status.eq.active"]]);
  });

  it("기록 조회가 실패하면 모름(null) → 게시된 것으로 보고 지우지 않는다", async () => {
    const { sb } = fakeSb({
      admin_banner_change_logs: { data: null, error: { message: "boom" } },
      audit_logs: { data: [], error: null },
    });
    expect(await loadAdminBannerPublishedIds(sb, ["d1"])).toBeNull();
  });

  it("목록: 노출 0 인 초안이라도 게시 이력이 있으면 삭제 대상이 아니다", async () => {
    const { sb } = fakeSb({
      my_page_banners: { data: [draftRow("d1"), draftRow("d2"), { ...draftRow("a1"), status: "active" }], error: null },
      admin_banner_change_logs: { data: [{ banner_id: "d1" }], error: null },
      audit_logs: { data: [], error: null },
    });
    const list = await listAdminBanners(sb);
    const byId = Object.fromEntries(list.map((b) => [b.id, b]));
    expect(byId.d1!.everPublished).toBe(true);
    expect(byId.d2!.everPublished).toBe(false);
    expect(byId.a1!.everPublished).toBe(true);
    expect(isAdminBannerHardDeletable(byId.d1!)).toBe(false);
    expect(isAdminBannerHardDeletable(byId.d2!)).toBe(true);
  });

  it("게시(활성)로 바꾸거나 활성으로 만들면 변경 기록 activate 를 남긴다", () => {
    const create = read("app/api/admin/banners/route.ts");
    const patch = read("app/api/admin/banners/[id]/route.ts");
    expect(create).toContain('actionType: "activate"');
    expect(patch).toContain('banner.status === "active" && beforeBanner?.status !== "active"');
    expect(patch).toContain('actionType: "activate"');
  });
});

describe("③-d B-7 — 기간 지난 「활성」은 「만료」로 표시", () => {
  const now = Date.parse("2026-11-03T10:00:00.000Z");
  const b = (status: AdminBanner["status"], endAt: string) => ({ status, endAt });

  it("종료 시각이 지났거나 같은 순간이면 만료, 아직이면 활성, 다른 상태는 그대로", () => {
    expect(adminBannerDisplayStatus(b("active", "2026-11-03T09:59:59.000Z"), now)).toBe("expired");
    expect(adminBannerDisplayStatus(b("active", "2026-11-03T10:00:00.000Z"), now)).toBe("expired");
    expect(adminBannerDisplayStatus(b("active", "2026-11-04T00:00:00.000Z"), now)).toBe("active");
    expect(adminBannerDisplayStatus(b("active", ""), now)).toBe("active");
    expect(adminBannerDisplayStatus(b("paused", "2026-11-01T00:00:00.000Z"), now)).toBe("paused");
  });

  it("목록 필터·배지가 표시 상태를 쓴다", () => {
    const past = { status: "active", endAt: "2020-01-01T00:00:00.000Z", priority: 0 } as AdminBanner;
    expect(filterBanners([past], { status: "expired" })).toHaveLength(1);
    expect(filterBanners([past], { status: "active" })).toHaveLength(0);
    for (const f of [
      "components/admin/my/AdminMyBannersPage.tsx",
      "components/admin/banners/AdminBannerTable.tsx",
    ]) {
      expect(read(f), f).toContain("<AdminBannerStatusBadge status={adminBannerDisplayStatus(");
    }
  });
});
