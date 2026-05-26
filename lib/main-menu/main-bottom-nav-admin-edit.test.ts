import { describe, expect, it } from "vitest";
import type { MainBottomNavAdminRow } from "@/lib/main-menu/main-bottom-nav-types";
import {
  applyMainBottomNavIconPatch,
  iconDraftToApplyPatch,
  isMainBottomNavRowFieldsDirty,
  isMainBottomNavRowsOrderEqual,
  restoreMainBottomNavRowsFromBaseline,
  revertMainBottomNavRowFieldsFromBaseline,
  patchMainBottomNavRowFab,
} from "@/lib/main-menu/main-bottom-nav-admin-edit";
import { getDefaultDeliveryFabConfig } from "@/lib/main-menu/resolve-main-bottom-nav-fab";

function row(id: string, label: string, overrides: Partial<MainBottomNavAdminRow> = {}): MainBottomNavAdminRow {
  return {
    id,
    visible: true,
    label,
    href: "/market",
    icon: "home",
    ...overrides,
  };
}

describe("main-bottom-nav-admin-edit", () => {
  it("restoreMainBottomNavRowsFromBaseline — 순서 복구, 다른 행 편집 유지", () => {
    const baseline = [row("a", "A"), row("b", "B"), row("c", "C")];
    const current = [row("c", "C edited"), row("a", "A"), row("b", "B")];
    const restored = restoreMainBottomNavRowsFromBaseline(current, baseline);
    expect(restored.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(restored.find((r) => r.id === "c")?.label).toBe("C edited");
  });

  it("restoreMainBottomNavRowsFromBaseline — revertFieldRowId 로 해당 행만 되돌림", () => {
    const baseline = [row("a", "A"), row("b", "B")];
    const current = [row("b", "B2"), row("a", "A2")];
    const restored = restoreMainBottomNavRowsFromBaseline(current, baseline, { revertFieldRowId: "a" });
    expect(restored.map((r) => r.id)).toEqual(["a", "b"]);
    expect(restored.find((r) => r.id === "a")?.label).toBe("A");
    expect(restored.find((r) => r.id === "b")?.label).toBe("B2");
  });

  it("revertMainBottomNavRowFieldsFromBaseline — 순서는 유지하고 필드만 되돌림", () => {
    const baseline = [row("a", "A"), row("b", "B")];
    const current = [row("b", "B2"), row("a", "A2")];
    const restored = revertMainBottomNavRowFieldsFromBaseline(current, baseline, "a");
    expect(restored.map((r) => r.id)).toEqual(["b", "a"]);
    expect(restored.find((r) => r.id === "a")?.label).toBe("A");
    expect(restored.find((r) => r.id === "b")?.label).toBe("B2");
  });

  it("isMainBottomNavRowFieldsDirty — lucideIcon 변경 감지", () => {
    const baseline = row("a", "A");
    const edited = row("a", "A", { lucideIcon: "List" });
    expect(isMainBottomNavRowFieldsDirty(edited, baseline, "메뉴")).toBe(true);
  });

  it("applyMainBottomNavIconPatch — builtin 전환 시 lucideIcon 제거", () => {
    const base = row("a", "A", { lucideIcon: "List" });
    const next = applyMainBottomNavIconPatch(base, iconDraftToApplyPatch({ source: "builtin", icon: "trade" }));
    expect(next.icon).toBe("trade");
    expect(next.lucideIcon).toBeUndefined();
  });

  it("isMainBottomNavRowsOrderEqual", () => {
    const a = [row("a", "A"), row("b", "B")];
    const b = [row("b", "B"), row("a", "A")];
    expect(isMainBottomNavRowsOrderEqual(a, a)).toBe(true);
    expect(isMainBottomNavRowsOrderEqual(a, b)).toBe(false);
  });

  it("patchMainBottomNavRowFab — enabled FAB 부착", () => {
    const base = row("stores", "배달");
    const fab = getDefaultDeliveryFabConfig();
    const next = patchMainBottomNavRowFab(base, fab);
    expect(next.fab?.enabled).toBe(true);
    expect(next.fab?.items.length).toBe(4);
  });

  it("patchMainBottomNavRowFab — 비활성 시 enabled false 저장", () => {
    const base = row("stores", "배달", { fab: getDefaultDeliveryFabConfig() });
    const next = patchMainBottomNavRowFab(base, undefined);
    expect(next.fab?.enabled).toBe(false);
    expect(next.fab?.items.length).toBe(0);
  });
});
