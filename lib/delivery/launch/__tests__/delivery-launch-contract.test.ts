import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DELIVERY_LAUNCH_SETTINGS,
  deliveryLaunchSettingsFromRow,
  isDeliveryFreePromoActive,
  manilaTodayYmd,
  normalizeDeliveryLaunchContent,
  normalizeFreeUntil,
  resolveDeliveryLaunchTexts,
  validateDeliveryLaunchImageGeometry,
} from "@/lib/delivery/launch/delivery-launch-contract";
import { isDeliveryRecruitingBlockedPath } from "@/components/delivery/launch/DeliveryRecruitingRouteGuard";

/** 배달 오픈 관리 계약 (Owner 「배달 on/off·매장 모집 배너」 2026-11-10) */
const read = (p: string) => readFileSync(p, "utf8");

describe("배달 오픈 관리 — 설정 계약", () => {
  it("행이 없거나(운영 미적용) 알 수 없는 값이면 정식 운영 = 지금 화면 그대로", () => {
    expect(deliveryLaunchSettingsFromRow(null)).toEqual(DEFAULT_DELIVERY_LAUNCH_SETTINGS);
    expect(deliveryLaunchSettingsFromRow({ mode: "weird" }).mode).toBe("open");
    expect(deliveryLaunchSettingsFromRow({ mode: "recruiting", revision: 3 })).toMatchObject({ mode: "recruiting", revision: 3 });
  });

  it("이미지 URL 은 https 만, 문구는 길이 상한", () => {
    const c = normalizeDeliveryLaunchContent({
      mobileImageUrl: "javascript:alert(1)",
      wideImageUrl: "http://x.test/a.png",
      texts: { ko: { title: "가".repeat(200) } },
    });
    expect(c.mobileImageUrl).toBe("");
    expect(c.wideImageUrl).toBe("");
    expect(c.texts.ko.title.length).toBe(60);
  });

  it("영어 빈 칸은 한국어로", () => {
    const c = normalizeDeliveryLaunchContent({ texts: { ko: { title: "매장을 신청하세요", body: "본문" }, en: { title: "Apply" } } });
    expect(resolveDeliveryLaunchTexts(c, "en")).toMatchObject({ title: "Apply", body: "본문" });
    expect(resolveDeliveryLaunchTexts(c, "ko").title).toBe("매장을 신청하세요");
  });

  it("무료 종료일 — 필리핀 날짜 기준, 종료일 당일까지 진행", () => {
    expect(normalizeFreeUntil("2027-02-30")).toBeNull();
    expect(normalizeFreeUntil("2027-06-30")).toBe("2027-06-30");
    // 2027-06-30 15:59 UTC = 23:59 PHT → 진행, 16:00 UTC = 07-01 00:00 PHT → 끝
    expect(isDeliveryFreePromoActive("2027-06-30", new Date("2027-06-30T15:59:00Z"))).toBe(true);
    expect(isDeliveryFreePromoActive("2027-06-30", new Date("2027-06-30T16:00:00Z"))).toBe(false);
    expect(manilaTodayYmd(new Date("2027-06-30T16:00:00Z"))).toBe("2027-07-01");
    expect(isDeliveryFreePromoActive(null)).toBe(false);
  });

  it("기기별 이미지 — 비율 ±8%·최소 크기", () => {
    expect(validateDeliveryLaunchImageGeometry("mobile", 1200, 900)).toEqual({ ok: true });
    expect(validateDeliveryLaunchImageGeometry("mobile", 800, 600)).toEqual({ ok: false, error: "image_too_small" });
    expect(validateDeliveryLaunchImageGeometry("mobile", 1600, 900)).toEqual({ ok: false, error: "image_ratio_mismatch" });
    expect(validateDeliveryLaunchImageGeometry("wide", 1536, 768)).toEqual({ ok: true });
  });
});

describe("배달 오픈 관리 — v3.2 배너·FAB·확인용 계정", () => {
  it("배너는 주 버튼 1개(문의 버튼 없음) · 마이페이지 매장 진입과 같은 판정", () => {
    const surface = read("components/delivery/launch/DeliveryRecruitingSurface.tsx");
    expect(surface).toContain("useDeliveryStoreOwnerEntry");
    expect(surface).not.toContain("inquiry");
    expect(read("lib/delivery/launch/use-delivery-store-owner-entry.ts")).toContain("resolveMypageHomeStoreOwnerEntry");
  });
  it("FAB 유형 — 매장 없음 STORE_PARTNERSHIP · 매장 있음 STORE_APPROVAL", () => {
    const surface = read("components/delivery/launch/DeliveryRecruitingSurface.tsx");
    expect(surface).toContain('category: "STORE_PARTNERSHIP"');
    expect(surface).toContain('category: "STORE_APPROVAL"');
  });
  it("확인용 계정·관리자 — 매장 모집 화면 미적용, 주문은 막음, 서버 판정", () => {
    const api = read("app/api/stores/launch-state/route.ts");
    expect(api).toContain("isDeliveryLaunchViewerBypass");
    const sql = read("supabase/migrations/20271110160000_delivery_launch_reviewers.sql");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.delivery_launch_reviewers");
    expect(read("components/stores/StoreDetailPublic.tsx")).toContain("delivery_recruiting_reviewer_no_order");
  });
  it("어드민 탭 — 시안 문구 채움·칸 아래 업로드 결과·축소 미리보기·확인 계정 칸", () => {
    const tab = read("components/admin/stores/delivery-screens/DeliveryScreensLaunchTab.tsx");
    expect(tab).toContain("withDesignDefaultTexts(s.content)");
    expect(tab).toContain("data-delivery-launch-upload-note");
    expect(tab).toContain("function ScaledPreview");
    expect(tab).toContain("data-delivery-launch-reviewers");
  });
});

describe("배달 오픈 관리 — 매장 모집 중 고객 경로", () => {
  it("업종·검색·장바구니·결제·주문은 배달 첫 화면으로, 매장 상세·사장님·상품권몰은 그대로", () => {
    for (const p of ["/stores/browse/food", "/stores/search", "/stores/cart", "/stores/abc/cart", "/stores/abc/checkout", "/stores/abc/order/1"]) {
      expect(isDeliveryRecruitingBlockedPath(p)).toBe(true);
    }
    for (const p of ["/stores", "/stores/abc", "/stores/abc/info", "/stores/owner/apply", "/stores/owner/products", "/stores/gift-mall"]) {
      expect(isDeliveryRecruitingBlockedPath(p)).toBe(false);
    }
  });

  it("주문 생성 API 가 모집 중 서버에서 거부", () => {
    const src = read("app/api/me/store-orders/route.ts");
    expect(src).toContain('launch.mode === "recruiting"');
    expect(src).toContain("DELIVERY_RECRUITING_ORDER_ERROR");
  });

  it("매장 상세 — 사장님 본인·관리자 외에는 모집 중 배달 첫 화면으로", () => {
    const src = read("components/stores/StoreDetailPublic.tsx");
    expect(src).toContain("!ownerHiddenPreview &&");
    expect(src).toContain("!storeOrderability.viewerIsOwner &&");
    expect(src).toContain('router.replace("/stores")');
  });

  it("배달 첫 화면 — 모집이면 배너·흐림·팝업, 광고 히어로 대신 / 광고 팝업 억제", () => {
    const hub = read("components/stores/home/hub/StoresHomeHub.tsx");
    expect(hub).toContain("<DeliveryRecruitingHero state={launchState} />");
    expect(hub).toContain("<StoresHomeRecruitingDim active={recruiting}>");
    expect(hub).toContain("<DeliveryRecruitingOverlays state={launchState} />");
    // 별도 모집 팝업·광고 팝업 억제는 되돌림 (Owner 2026-11-10) — 기존 고객센터 FAB 만
    expect(read("components/platform-popup/GlobalPopupHost.tsx")).not.toContain("deliveryRecruitingHome");
    expect(read("components/delivery/launch/DeliveryRecruitingSurface.tsx")).not.toContain("DibayDialog");
  });

  it("저장 = 최고관리자 · revision CAS(409) · 캐시 무효화", () => {
    const api = read("app/api/admin/delivery-launch/route.ts");
    expect(api).toContain("requireSuperAdmin");
    expect(api).toContain('"stale_revision"');
    expect(api).toContain("revalidateTag(DELIVERY_LAUNCH_SERVER_CACHE_TAG");
    const sql = read("supabase/migrations/20271110130000_delivery_launch_settings.sql");
    expect(sql).toContain("IF v_row.revision IS DISTINCT FROM p_expected_revision THEN");
    expect(sql).toContain("mode text NOT NULL DEFAULT 'open'");
  });
});

/**
 * Owner 2026-11-10: 「이 부분은 예외 프로세스 — 정식 운영으로 돌리면 기존 계약으로 원복」.
 * 정식 운영(open)이면 매장 모집 장치가 하나도 작동하지 않아야 한다.
 */
describe("배달 오픈 관리 — 정식 운영이면 기존 동작 그대로 (예외 프로세스 원복)", () => {
  it("판정 함수 — open 이면 모집·확인용 예외 모두 false", async () => {
    const { isDeliveryRecruiting, isDeliveryRecruitingReviewer } = await import("@/lib/delivery/launch/use-delivery-launch-state");
    const base = { freeUntil: null, freePromoActive: false, fabEnabled: true, content: normalizeDeliveryLaunchContent({}) };
    expect(isDeliveryRecruiting({ ...base, mode: "open", viewerBypass: false })).toBe(false);
    expect(isDeliveryRecruitingReviewer({ ...base, mode: "open", viewerBypass: true })).toBe(false);
    expect(isDeliveryRecruiting({ ...base, mode: "recruiting", viewerBypass: true })).toBe(false);
    expect(isDeliveryRecruitingReviewer({ ...base, mode: "recruiting", viewerBypass: true })).toBe(true);
  });
  it("배달 첫 화면 — 모집 아니면 감싸지 않음(DOM 그대로)·광고 히어로 그대로", () => {
    const hub = read("components/stores/home/hub/StoresHomeHub.tsx");
    expect(hub).toContain("if (!active) return <>{children}</>;");
    expect(hub).toContain(": <StoresHomeHeroBanner refreshKey={bannerRefreshKey} />}");
    expect(hub).toContain("{recruiting && launchState ? <DeliveryRecruitingOverlays state={launchState} /> : null}");
  });
  it("서버 — 주문 거부·확인용 예외 판정은 recruiting 일 때만", () => {
    expect(read("app/api/me/store-orders/route.ts")).toContain('if (launch.mode === "recruiting") {');
    expect(read("app/api/stores/launch-state/route.ts")).toContain('if (state.mode === "recruiting" && viewerId) {');
  });
  it("광고 팝업은 모드와 무관 (원래 코드)", () => {
    expect(read("components/platform-popup/GlobalPopupHost.tsx")).not.toContain("delivery-launch");
  });
});
