/**
 * P1-11 · AD-01 — 관리자 SSR 페이지 자체 서버 가드 회귀 테스트.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decideAdminPageAccess } from "@/lib/admin/access/require-admin-page-access";
import type { AdminApiActor } from "@/lib/admin/require-admin-permission";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import type { ProfileRow } from "@/lib/profile/types";

function actor(input: {
  role?: string;
  permissions?: AdminPermissionKey[];
  status?: string;
}): AdminApiActor {
  const role = input.role ?? "admin";
  return {
    userId: "u-1",
    profile: { id: "u-1", status: input.status ?? "verified_user" } as unknown as ProfileRow,
    role,
    permissions: input.permissions ?? [],
    isSuperAdmin: role === "super_admin",
  };
}

describe("decideAdminPageAccess (P1-11)", () => {
  it("관리자 actor 없음 → not_admin (scope=null 이 전체 노출로 이어지지 않음)", () => {
    expect(decideAdminPageAccess(null, "/admin/community")).toEqual({ ok: false, reason: "not_admin" });
    expect(decideAdminPageAccess(null, "/admin/delivery")).toEqual({ ok: false, reason: "not_admin" });
  });

  it("커뮤니티 신고함 = reports 키 필요 — 키 없는 운영자 거부", () => {
    expect(decideAdminPageAccess(actor({ permissions: ["boards"] }), "/admin/community/reports").ok).toBe(false);
    expect(decideAdminPageAccess(actor({ permissions: ["reports"] }), "/admin/community/reports").ok).toBe(true);
  });

  it("커뮤니티 주제·섹션 = boards 키 필요", () => {
    expect(decideAdminPageAccess(actor({ permissions: ["reports"] }), "/admin/community/topics").ok).toBe(false);
    expect(decideAdminPageAccess(actor({ permissions: ["boards"] }), "/admin/community/topics").ok).toBe(true);
    expect(decideAdminPageAccess(actor({ permissions: [] }), "/admin/community/sections").ok).toBe(false);
  });

  it("any_admin 화면은 활성 관리자면 허용 · 최고관리자는 전부 허용", () => {
    expect(decideAdminPageAccess(actor({}), "/admin/delivery").ok).toBe(true);
    expect(decideAdminPageAccess(actor({}), "/admin/messenger").ok).toBe(true);
    expect(decideAdminPageAccess(actor({ role: "super_admin" }), "/admin/community/reports").ok).toBe(true);
  });

  it("채팅 상세 = chats 키", () => {
    expect(decideAdminPageAccess(actor({}), "/admin/chats/room-1").ok).toBe(false);
    expect(decideAdminPageAccess(actor({ permissions: ["chats"] }), "/admin/chats/room-1").ok).toBe(true);
  });
});

describe("SSR 페이지는 데이터 조회 전에 자체 가드를 호출한다 (AD-01)", () => {
  const pages: Array<{ file: string; loader: string }> = [
    { file: "app/admin/community/reports/page.tsx", loader: "listCommunityReportGroupsForAdmin({" },
    { file: "app/admin/community/topics/page.tsx", loader: "loadAllCommunityTopicsForAdmin()," },
    { file: "app/admin/community/sections/page.tsx", loader: "loadAllCommunitySectionsForAdmin()," },
    { file: "app/admin/community/page.tsx", loader: "loadCommunityDomainDashboard({" },
    { file: "app/admin/delivery/page.tsx", loader: "loadDeliveryDomainDashboard()" },
    { file: "app/admin/messenger/page.tsx", loader: "loadMessengerDomainDashboard()" },
    { file: "app/admin/philife/meeting-reports/page.tsx", loader: "loadAdminMeetingReports(\n" },
    { file: "app/admin/chats/[id]/page.tsx", loader: "resolveTradeMessengerRoomForAdmin(getSupabaseServer()" },
    { file: "app/admin/stores/orders/[orderId]/chat/page.tsx", loader: "lookupAdminStoreOrderMessengerRoomId(orderId)" },
  ];
  for (const { file, loader } of pages) {
    it(file, () => {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      const guardIdx = src.indexOf("await requireAdminPageAccess(");
      const denyIdx = src.indexOf("if (!access.ok) return <AdminAccessDeniedPanel");
      const loaderIdx = src.lastIndexOf(loader);
      expect(guardIdx, "guard").toBeGreaterThan(0);
      expect(denyIdx, "deny").toBeGreaterThan(guardIdx);
      expect(loaderIdx, "loader").toBeGreaterThan(denyIdx);
    });
  }

  it("커뮤니티 대시보드는 scope=null 로 전체 지표를 렌더하지 않는다", () => {
    const src = readFileSync(join(process.cwd(), "app/admin/community/page.tsx"), "utf8");
    expect(src).not.toMatch(/scope\s*=\s*[^;]*:\s*null/);
    expect(src).not.toContain("requireAdminApiActor().catch");
  });
});
