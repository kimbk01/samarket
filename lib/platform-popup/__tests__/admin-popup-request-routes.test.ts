import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PLATFORM_POPUP_ADMIN_REQUEST_ROUTES } from "@/lib/platform-popup/platform-popup-owner-routes";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("관리자 팝업 오너 신청 경로", () => {
  it("신청 목록 = 광고 작업 「팝업」 종류 · /admin/platform-popup/requests 정적 경로가 그곳으로 보낸다", () => {
    expect(PLATFORM_POPUP_ADMIN_REQUEST_ROUTES.queue).toBe("/admin/advertising?family=popup");
    const page = read("app/admin/platform-popup/requests/page.tsx");
    expect(page).toContain("redirect(PLATFORM_POPUP_ADMIN_REQUEST_ROUTES.queue)");
  });

  it("신청 상세의 목록 링크는 연결된 화면이 없는 ?tab=requests 를 쓰지 않는다", () => {
    const detail = read("components/admin/platform-popup/AdminPlatformPopupRequestDetailWorkspace.tsx");
    expect(detail).not.toContain("/admin/platform-popup?tab=requests");
    expect(detail).toContain("href={PLATFORM_POPUP_ADMIN_REQUEST_ROUTES.queue}");
  });
});

describe("배달 광고 파트너 멤버십 — 매장 이름 열", () => {
  it("stores.store_name 만 조회하고 조회 오류는 500", () => {
    const route = read("app/api/admin/delivery-ads/partner/memberships/route.ts");
    expect(route).toContain('.select("id, store_name")');
    expect(route).not.toMatch(/select\("id, name"\)/);
    expect(route).toContain("if (storesRes.error)");
  });
});
