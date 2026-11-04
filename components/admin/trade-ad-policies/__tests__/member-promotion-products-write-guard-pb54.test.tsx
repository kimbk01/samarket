/** @vitest-environment jsdom */
/**
 * 광고 ② PB-54·AD-126 (2026-11-04) — 상위노출 가격 저장 버튼 권한:
 * 권한이 없으면 버튼이 꺼지고 안내가 보이며, 사유 창(confirmAdminAction)을 열지 않는다.
 * 커뮤니티 상품은 거래 권한 + 커뮤니티 홍보 권한이 모두 있어야 한다(서버와 같은 기준).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  confirm: vi.fn(),
  alert: vi.fn(),
  access: {} as Record<string, { allowed: boolean; reason: string | null; loading: boolean }>,
}));

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({
    t: (k: string, vars?: Record<string, string>) => (vars ? `${k}:${Object.values(vars).join("|")}` : k),
    language: "ko",
  }),
}));
vi.mock("@/components/admin/AdminPageHeader", () => ({ AdminPageHeader: () => null }));
vi.mock("@/lib/admin/operator-ux/admin-confirm-action", () => ({ confirmAdminAction: h.confirm }));
vi.mock("@/components/admin/access/use-admin-route-access", () => ({
  useAdminWriteGuard: (path: string) => {
    const s = h.access[path] ?? { allowed: true, reason: null, loading: false };
    return {
      ...s,
      guard: () => {
        if (s.allowed) return true;
        h.alert(s.reason);
        return false;
      },
    };
  },
}));

import { AdminMemberPromotionProductsPage } from "@/components/admin/trade-ad-policies/AdminMemberPromotionProductsPage";

let root: Root;
const fetchMock = vi.fn();
const snapshot = {
  ok: true,
  migrated: true,
  products: [
    { id: "trade-3d", domain: "trade", durationDays: 3, pointCost: 300, isActive: true, revision: 1, updatedAt: null, fallbackTitleKo: "거래 3일", fallbackTitleEn: "Trade 3d" },
    { id: "community-3d", domain: "community", durationDays: 3, pointCost: 200, isActive: true, revision: 1, updatedAt: null, fallbackTitleKo: "커뮤니티 3일", fallbackTitleEn: "Community 3d" },
  ],
  changes: [],
  activeCounts: {},
  adminNames: {},
};

async function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<AdminMemberPromotionProductsPage />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}
const rowOf = (title: string) =>
  Array.from(document.querySelectorAll("tbody tr")).find((tr) => tr.textContent?.includes(title)) as HTMLElement;
const saveOf = (title: string) =>
  Array.from(rowOf(title).querySelectorAll("button")).find((b) => b.textContent === "admin_boost_prices_save") as HTMLButtonElement;

beforeEach(() => {
  h.confirm.mockReset().mockResolvedValue({ ok: false });
  h.alert.mockReset();
  h.access = {};
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => snapshot });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("PB-54·AD-126 상위노출 가격 저장 — 권한 조건", () => {
  it("권한이 있으면 두 상품 모두 저장 버튼이 켜진다", async () => {
    await mount();
    expect(saveOf("거래 3일").disabled).toBe(false);
    expect(saveOf("커뮤니티 3일").disabled).toBe(false);
    expect(document.querySelector("[data-admin-write-denied]")).toBeNull();
  });

  it("거래 권한이 없으면 버튼이 꺼지고 안내가 보이며, 눌러도 사유 창을 열지 않는다", async () => {
    h.access["/admin/trade-ad-policies"] = { allowed: false, reason: "거래 권한 필요", loading: false };
    await mount();
    expect(saveOf("거래 3일").disabled).toBe(true);
    expect(saveOf("커뮤니티 3일").disabled).toBe(true);
    expect(rowOf("거래 3일").querySelector("[data-admin-write-denied]")?.textContent).toContain("거래 권한 필요");
    await act(async () => saveOf("거래 3일").click());
    expect(h.confirm).not.toHaveBeenCalled();
  });

  it("커뮤니티 홍보 권한이 없으면 커뮤니티 상품만 막힌다", async () => {
    h.access["/admin/community/promotions"] = { allowed: false, reason: "커뮤니티 홍보 권한 필요", loading: false };
    await mount();
    expect(saveOf("거래 3일").disabled).toBe(false);
    expect(saveOf("커뮤니티 3일").disabled).toBe(true);
    expect(rowOf("커뮤니티 3일").querySelector("[data-admin-write-denied]")?.textContent).toContain("커뮤니티 홍보 권한 필요");
    expect(rowOf("거래 3일").querySelector("[data-admin-write-denied]")).toBeNull();
  });
});
