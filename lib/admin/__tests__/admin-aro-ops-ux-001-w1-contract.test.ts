/**
 * ARO-OPS-UX-001-W1 targeted contract tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  compareOperationalFrequency,
  computeTableMinWidthPx,
  DEFAULT_SELECT_ALL_SCOPE,
  evaluateTabletTableGeometry,
  getTerminologyEntry,
  isBulkActionAllowed,
  listOperationalFrequencyRegistry,
  listVisibleBulkActions,
  managementCtaConsoleVariant,
  MANAGEMENT_COLUMN_DEFAULTS,
  MANAGEMENT_PAGE_ANATOMY,
  resolveSelectAllScope,
  selectionHeaderState,
  shouldClearSelectionOnQueryChange,
  toggleCurrentPageSelection,
  TRADE_POST_ENTITY_ACTION_POLICY,
  MEMBER_ENTITY_ACTION_POLICY,
} from "@/lib/admin/management";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("ARO-OPS-UX-001-W1 shared management contract", () => {
  it("W1-01 frequency registry typed", () => {
    const entries = listOperationalFrequencyRegistry();
    expect(entries.length).toBeGreaterThan(5);
    expect(compareOperationalFrequency("DAILY_CRITICAL", "ARCHIVE")).toBeLessThan(0);
    expect(entries.some((e) => e.route === "/admin/posts-management")).toBe(true);
  });

  it("W1-02 terminology registry typed", () => {
    expect(getTerminologyEntry("MEMBER").fallbackKo).toBe("회원");
    expect(getTerminologyEntry("ADVERTISEMENT").doNotUseAs.join(" ")).toMatch(/홍보/);
    expect(getTerminologyEntry("DELETE").doNotUseAs).toContain("숨김");
    expect(getTerminologyEntry("PROMOTION").doNotUseAs.join(" ")).toMatch(/광고/);
  });

  it("W1-03 shared management owner exists", () => {
    expect(existsSync(join(root, "lib/admin/management/index.ts"))).toBe(true);
    expect(existsSync(join(root, "components/admin/management/index.ts"))).toBe(true);
    expect(MANAGEMENT_PAGE_ANATOMY[0]).toBe("breadcrumb");
    expect(MANAGEMENT_PAGE_ANATOMY).toContain("bulkBar");
    expect(MANAGEMENT_PAGE_ANATOMY).toContain("tableViewport");
  });

  it("W1-04 parallel v2 absent", () => {
    const mgmt = read("components/admin/management/index.ts");
    expect(mgmt).not.toMatch(/AdminDataTableV2|NewAdminTable|admin-ui-v2|ManagementV2/);
    expect(existsSync(join(root, "components/admin/management-v2"))).toBe(false);
    expect(existsSync(join(root, "components/admin/AdminDataTableV2.tsx"))).toBe(false);
  });

  it("W1-05..08 selection current-page + indeterminate + clear", () => {
    expect(DEFAULT_SELECT_ALL_SCOPE).toBe("CURRENT_PAGE");
    expect(() => resolveSelectAllScope("GLOBAL_DB")).toThrow(/GLOBAL_DB/);
    const ids = ["a", "b", "c"];
    expect(selectionHeaderState(new Set(), ids)).toBe("none");
    expect(selectionHeaderState(new Set(["a"]), ids)).toBe("some");
    expect(selectionHeaderState(new Set(["a", "b", "c"]), ids)).toBe("all");
    const all = toggleCurrentPageSelection(new Set(), ids);
    expect([...all].sort()).toEqual(["a", "b", "c"]);
    expect(toggleCurrentPageSelection(all, ids).size).toBe(0);
    expect(shouldClearSelectionOnQueryChange("page:1", "page:2")).toBe(true);
    expect(shouldClearSelectionOnQueryChange(null, "page:1")).toBe(false);
  });

  it("W1-09..11 bulk policy + Trade hard_delete allowed (B1R eligibility)", () => {
    const visible = listVisibleBulkActions(TRADE_POST_ENTITY_ACTION_POLICY);
    expect(visible).toContain("hide");
    expect(visible).toContain("restore");
    expect(visible).toContain("soft_delete");
    expect(visible).toContain("hard_delete");
    expect(isBulkActionAllowed(TRADE_POST_ENTITY_ACTION_POLICY, "hard_delete")).toBe(true);
    expect(TRADE_POST_ENTITY_ACTION_POLICY.hardDeleteAvailable).toBe(true);
    expect(MEMBER_ENTITY_ACTION_POLICY.deleteMode).toBe("BLOCKED");
    expect(listVisibleBulkActions(MEMBER_ENTITY_ACTION_POLICY)).toEqual([]);
  });

  it("W1-12..13 table viewport + column semantics", () => {
    const viewport = read("components/admin/management/AdminManagementTableViewport.tsx");
    expect(viewport).toContain("overflow-x-auto");
    expect(viewport).toContain("data-admin-mgmt-table-viewport");
    expect(MANAGEMENT_COLUMN_DEFAULTS.SELECTION.shrink).toBe(false);
    expect(MANAGEMENT_COLUMN_DEFAULTS.ACTIONS.shrink).toBe(false);
    expect(computeTableMinWidthPx(["SELECTION", "TITLE", "ACTIONS"])).toBeGreaterThan(200);
  });

  it("W1-14 CTA taxonomy", () => {
    expect(managementCtaConsoleVariant("PRIMARY")).toBe("primary");
    expect(managementCtaConsoleVariant("DANGER")).toBe("danger");
    expect(managementCtaConsoleVariant("STATUS")).toBe("secondary");
  });

  it("W1-15 proof surface uses shared contract; mutation helpers unchanged", () => {
    const page = read("components/admin/posts-management/AdminPostsManagementPage.tsx");
    const table = read("components/admin/posts-management/AdminPostsManagementTable.tsx");
    expect(page).toContain("AdminManagementSurfaceRoot");
    expect(page).toContain("queryScopeKey");
    expect(read("components/admin/management/AdminManagementSurfaceRoot.tsx")).toContain(
      "data-aro-ops-ux-001-w1"
    );
    expect(table).toContain("AdminManagementTableViewport");
    expect(table).toContain("useAdminManagementSelection");
    expect(table).toContain("TRADE_POST_ENTITY_ACTION_POLICY");
    expect(table).toContain("confirmAndUpdateAdminPostStatus");
    expect(table).not.toContain("DB 영구 삭제 · NOT_READY");
  });

  it("W1-16 tablet geometry helper", () => {
    const ok = evaluateTabletTableGeometry({
      bodyScrollWidth: 1024,
      bodyClientWidth: 1024,
      tableViewportScrollWidth: 1400,
      tableViewportClientWidth: 800,
    });
    expect(ok.bodyNoXOverflow).toBe(true);
    expect(ok.tableNeedsHorizontalScroll).toBe(true);
    const failBody = evaluateTabletTableGeometry({
      bodyScrollWidth: 1200,
      bodyClientWidth: 1024,
      tableViewportScrollWidth: 800,
      tableViewportClientWidth: 800,
    });
    expect(failBody.bodyNoXOverflow).toBe(false);
  });
});
