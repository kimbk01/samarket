import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isAdminBannerHardDeletable } from "@/lib/admin-banners/admin-banner-remove-policy";
import { myPageBannerLiveWindowFilters } from "@/lib/my/mypage-tables-select";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("마이페이지 배너 삭제·기간 (감사 AD-01 · AD-05 · Owner J-4)", () => {
  it("게시한 적 없는 초안만 실제 삭제, 그 외는 보관", () => {
    expect(isAdminBannerHardDeletable({ status: "draft", impressionCount: 0, everPublished: false })).toBe(true);
    expect(isAdminBannerHardDeletable({ status: "draft", impressionCount: 3, everPublished: false })).toBe(false);
    expect(isAdminBannerHardDeletable({ status: "active", impressionCount: 0, everPublished: false })).toBe(false);
    expect(isAdminBannerHardDeletable({ status: "hidden", impressionCount: 0, everPublished: false })).toBe(false);
  });

  it("광고 최종 점검: 노출 0 이어도 게시 이력이 있거나 모르면 지우지 않는다", () => {
    expect(isAdminBannerHardDeletable({ status: "draft", impressionCount: 0, everPublished: true })).toBe(false);
    expect(isAdminBannerHardDeletable({ status: "draft", impressionCount: 0 })).toBe(false);
    expect(
      isAdminBannerHardDeletable({ status: "draft", impressionCount: 0, clickCount: 2, everPublished: false })
    ).toBe(false);
  });

  it("DELETE API: 조건부 삭제 + 보관은 hidden + 감사 기록", () => {
    const db = read("lib/admin-banners/admin-banners-db.ts");
    const route = read("app/api/admin/banners/[id]/route.ts");
    expect(route).toContain("export async function DELETE");
    expect(route).toMatch(/banner\.delete|banner\.archive/);
    expect(db).toContain('.eq("status", "draft")');
    expect(db).toContain('.eq("impression_count", 0)');
    expect(db).toContain('updateAdminBanner(sb, id, { status: "hidden" })');
  });

  it("고객 조회 2곳 모두 노출 기간 조건을 쓴다 (종료 시각과 같은 순간은 제외)", () => {
    expect(myPageBannerLiveWindowFilters("2026-10-30T00:00:00.000Z")).toEqual({
      startOr: "start_at.is.null,start_at.lte.2026-10-30T00:00:00.000Z",
      endOr: "end_at.is.null,end_at.gt.2026-10-30T00:00:00.000Z",
    });
    // MB-A03 (2026-11-04): 고객 조회 2곳 + 공통 광고 화면 숫자 = 같은 조건 함수 1개(`myPageBannerLiveQuerySpec`)
    for (const f of [
      "lib/my/load-mypage-cms-pack.ts",
      "lib/mypage/mypage-summary.server.ts",
      "app/api/admin/advertising/other-surfaces/route.ts",
    ]) {
      const src = read(f);
      expect(src, f).toContain("myPageBannerLiveQuerySpec(");
      expect(src, f).toMatch(/\.or\((live|myBannerLive)\.startOr\)/);
      expect(src, f).toMatch(/\.or\((live|myBannerLive)\.endOr\)/);
    }
  });

  it("옛 경로 /admin/banners 는 마이페이지 배너로 (AD-03)", () => {
    expect(read("app/admin/banners/page.tsx")).toContain('redirect("/admin/my/banners")');
    expect(read("app/admin/banners/[id]/page.tsx")).toContain("/edit`");
  });
});
