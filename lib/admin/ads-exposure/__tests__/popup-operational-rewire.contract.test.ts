import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");

describe("popup operational rewire source contracts", () => {
  it("requires a hub name and no longer posts an untitled fallback", () => {
    const hub = read("components/admin/platform-popup/AdminPlatformPopupHubPage.tsx");
    const route = read("app/api/admin/platform-popup-campaigns/route.ts");
    expect(hub).toContain("광고 이름을 입력해 주세요.");
    expect(hub).toContain("createName.trim()");
    expect(hub).not.toContain('fallbackKo: "새 팝업 캠페인"');
    expect(route).not.toContain('"Untitled popup"');
  });

  it("creates draft first and approves only after creative readiness", () => {
    const source = read("lib/platform-popup/admin-direct-complete-create.ts");
    const createAt = source.indexOf("createPlatformPopupAdminCampaign");
    const creativeAt = source.indexOf("replacePlatformPopupReadyCreative", createAt);
    const approveAt = source.indexOf("adminApprovePlatformPopupCampaign", creativeAt);
    expect(createAt).toBeGreaterThan(-1);
    expect(creativeAt).toBeGreaterThan(createAt);
    expect(approveAt).toBeGreaterThan(creativeAt);
    expect(source).toContain('status: "draft"');
    expect(source).toContain("incomplete: true");
  });

  it("renders creative and uses a distinct preview destination", () => {
    const workspace = read("components/admin/ads/AdminAdvertisingWorkspace.tsx");
    expect(workspace).toContain("selectedShell.creativeImageUrl");
    expect(workspace).toContain("r.previewHref");
    expect(workspace).toContain("selectedShell.previewHref");
    expect(workspace).toContain("수정 / 상세");
  });
});
