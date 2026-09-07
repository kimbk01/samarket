import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("admin popup ops CTA wiring", () => {
  it("shell mode=all keeps delete/pause via filterWorkspaceActionsByMode", () => {
    const src = read("components/admin/ads/AdminAdvertisingWorkspace.tsx");
    expect(src).toContain("filterWorkspaceActionsByMode");
    expect(src).not.toMatch(/if \(mode !== \"operations\"\) return \[\]/);
  });

  it("drawer actions allow popup draft delete", () => {
    const src = read("lib/admin/advertising-workspace/resolve-drawer-actions.ts");
    expect(src).toContain('bucket === "draft"');
    expect(src).toContain('"delete_safe_draft"');
    expect(src).toContain("filterWorkspaceActionsByMode");
  });

  it("workspace action route wires popup draft delete writer", () => {
    const src = read("app/api/admin/advertising-workspace/action/route.ts");
    expect(src).toContain("adminDeletePlatformPopupDraftCampaign");
    expect(src).toContain('action === "delete_safe_draft"');
  });

  it("Admin Direct detail hides human review CTA and exposes delete", () => {
    const src = read("components/admin/platform-popup/AdminPlatformPopupDetailWorkspace.tsx");
    expect(src).toContain("isAdminDirect");
    expect(src).toContain("data-admin-popup-delete-draft");
    expect(src).toContain("data-admin-popup-pause");
    expect(src).toContain("!isAdminDirect");
    expect(src).toContain("admin_platform_popup_action_submit_review");
  });

  it("authority matrix allows platform_popup DELETE_DRAFT", () => {
    const src = read("lib/ads/admin-authority-matrix.ts");
    expect(src).toMatch(/platform_popup:\s*\{[\s\S]*DELETE_DRAFT:\s*"Y"/);
  });
});
