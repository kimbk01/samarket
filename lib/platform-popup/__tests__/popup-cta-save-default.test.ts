import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatPlatformPopupAdminError } from "@/lib/platform-popup/format-platform-popup-admin-error";

describe("platform popup admin CTA save contract", () => {
  it("DS-5: create seeds internal_page + empty target (no /market default)", () => {
    const writer = readFileSync(
      join(process.cwd(), "lib/platform-popup/admin-campaign-writer.ts"),
      "utf8"
    );
    expect(writer).toContain('cta_type: "internal_page"');
    expect(writer).toContain('cta_target: "",');
    expect(writer).not.toContain("PLATFORM_POPUP_DEFAULT_INTERNAL_CTA_PATH");
    expect(writer).toContain('error: "cta_target_required"');
  });

  it("maps cta_invalid:internal_path_required to human copy", () => {
    expect(formatPlatformPopupAdminError("cta_invalid:internal_path_required", "ko")).toContain(
      "/market"
    );
    expect(formatPlatformPopupAdminError("cta_invalid:internal_path_required", "ko")).not.toContain(
      "cta_invalid"
    );
    expect(formatPlatformPopupAdminError("cta_invalid:internal_path_required", "en")).toMatch(
      /in-app path|\/market/i
    );
  });

  it("DS-5: detail workspace does not heal empty internal CTA to /market and formats save errors", () => {
    const ui = readFileSync(
      join(process.cwd(), "components/admin/platform-popup/AdminPlatformPopupDetailWorkspace.tsx"),
      "utf8"
    );
    expect(ui).not.toContain("PLATFORM_POPUP_DEFAULT_INTERNAL_CTA_PATH");
    expect(ui).toContain('formatPlatformPopupAdminError("cta_target_required", lang)');
    expect(ui).toContain("formatPlatformPopupAdminError");
    expect(formatPlatformPopupAdminError("cta_target_required", "ko")).toBe("버튼을 누르면 이동할 앱 안 경로를 입력해 주세요.");
  });
});
