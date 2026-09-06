import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatPlatformPopupAdminError } from "@/lib/platform-popup/format-platform-popup-admin-error";
import { PLATFORM_POPUP_DEFAULT_INTERNAL_CTA_PATH } from "@/lib/platform-popup/types";

describe("platform popup admin CTA save contract", () => {
  it("create seeds internal_page + default path (not empty cta_target)", () => {
    const writer = readFileSync(
      join(process.cwd(), "lib/platform-popup/admin-campaign-writer.ts"),
      "utf8"
    );
    expect(writer).toContain('cta_type: "internal_page"');
    expect(writer).toContain("PLATFORM_POPUP_DEFAULT_INTERNAL_CTA_PATH");
    expect(PLATFORM_POPUP_DEFAULT_INTERNAL_CTA_PATH).toBe("/market");
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

  it("detail workspace heals empty internal CTA and formats save errors", () => {
    const ui = readFileSync(
      join(process.cwd(), "components/admin/platform-popup/AdminPlatformPopupDetailWorkspace.tsx"),
      "utf8"
    );
    expect(ui).toContain("PLATFORM_POPUP_DEFAULT_INTERNAL_CTA_PATH");
    expect(ui).toContain("formatPlatformPopupAdminError");
  });
});
