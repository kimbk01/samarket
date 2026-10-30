import { describe, expect, it } from "vitest";
import { adminMenu, type AdminMenuItem } from "@/components/admin/admin-menu";
import { resolveActiveWorkspace } from "@/lib/admin/admin-workspace-routing";
import {
  collectMenuPathEntries,
  hasActiveDescendantInMenu,
  isLeafMenuActive,
} from "@/components/admin/sidebar/admin-sidebar-active-path";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";

const ws = (path: string, preferred?: string | null) => resolveActiveWorkspace(path, "master", adminMenu, preferred).id;

function leaves(items: AdminMenuItem[], out: AdminMenuItem[] = []): AdminMenuItem[] {
  for (const i of items) {
    if (i.children?.length) leaves(i.children, out);
    else out.push(i);
  }
  return out;
}

/** 재감사 E-8 (Owner 승인 2026-10-30): 별칭 진입점은 들어온 워크스페이스를 유지, 기억이 없으면 원래 메뉴 */
describe("들어온 워크스페이스 기억 · 별칭 진입점", () => {
  it("기억이 없으면 같은 화면은 원래(별칭 아닌) 메뉴의 워크스페이스", () => {
    expect(ws("/admin/platform-popup")).toBe("promotion");
    expect(ws("/admin/my/banners")).toBe("promotion");
    expect(ws("/admin/notifications")).toBe("notifications");
    expect(ws("/admin/store-reviews")).toBe("delivery");
    expect(ws("/admin/reviews")).toBe("trade");
    expect(ws("/admin/menus/trade")).toBe("trade");
  });

  it("광고·배너에서 들어오면 목록·상세·편집·쿼리 변경에도 광고·배너 유지", () => {
    for (const p of [
      "/admin/platform-popup",
      "/admin/platform-popup/abc-123",
      "/admin/platform-popup?page=2&size=50",
      "/admin/my/banners/xyz/edit",
      "/admin/my/banners/create",
      "/admin/platform-events/new",
      "/admin/platform-promotion/intro",
      // 알림 발송 v3 (2026-10-30): 광고·배너 「홍보 발송」 별칭 삭제 → /admin/notifications 는 알림 워크스페이스 한 곳.
    ]) {
      expect(ws(p, "ads"), p).toBe("ads");
    }
  });

  it("도메인 진입점(?domain=)은 그 도메인 워크스페이스 — 상세로 가도 유지 (G-06)", () => {
    expect(ws("/admin/platform-popup?domain=delivery")).toBe("delivery");
    expect(ws("/admin/platform-popup?domain=trade")).toBe("trade");
    expect(ws("/admin/advertising/banners?domain=community")).toBe("community");
    expect(ws("/admin/advertising/placements?domain=delivery")).toBe("delivery");
    expect(ws("/admin/platform-popup/abc", "delivery")).toBe("delivery");
    expect(ws("/admin/platform-popup?domain=delivery&page=2", "delivery")).toBe("delivery");
    // 필터 없이 열면 원래 메뉴
    expect(ws("/admin/advertising/placements")).toBe("ads");
  });

  it("기억한 워크스페이스 메뉴에 없는 화면이면 원래 워크스페이스로", () => {
    expect(ws("/admin/stores/orders", "ads")).toBe("delivery");
    expect(ws("/admin/community/posts", "ads")).toBe("community");
  });

  it("별칭 항목은 원래 메뉴와 같은 경로를 가리킨다 (화면·원장 하나)", () => {
    const all = leaves(adminMenu);
    const aliases = all.filter((l) => l.entryAlias);
    expect(aliases.length).toBeGreaterThan(0);
    for (const a of aliases) {
      const base = a.path!.split("?")[0];
      const canonical = all.filter((l) => !l.entryAlias && l.path && l.path.split("?")[0] === base);
      expect(canonical.length, `${a.key} ${a.path}`).toBeGreaterThan(0);
      expect(a.path).not.toMatch(/[?&]from=/);
    }
  });

  it("사이드바 강조는 워크스페이스 전체에서 1개만 (매장 알림 설정 ≠ 입점 심사)", () => {
    const delivery = findAdminMenuByKey(adminMenu, "delivery")!;
    const scope = collectMenuPathEntries(delivery.children ?? []);
    const cur = "/admin/stores/application-settings?menu=alerts";
    const active = leaves(delivery.children ?? []).filter((l) =>
      isLeafMenuActive(l.path, cur, scope, l.matchPaths, {
        exactPath: l.exactPath === true,
        matchPathPrefixes: l.matchPathPrefixes,
      })
    );
    expect(active.map((l) => l.key)).toEqual(["store-settings-alerts"]);
    const storesSection = findAdminMenuByKey(adminMenu, "delivery-section-stores")!;
    expect(hasActiveDescendantInMenu(storesSection.children ?? [], cur, scope)).toBe(false);
  });
});
