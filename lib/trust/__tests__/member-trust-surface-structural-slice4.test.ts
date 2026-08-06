/**
 * Slice 4 structural contract — Member trust surfaces share SSOT helper.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");

describe("Slice4 trust surface structural", () => {
  it("trust page and home manner row both use buildMemberTrustSurface", () => {
    const trustPage = readFileSync(path.join(root, "app/(main)/mypage/trust/page.tsx"), "utf8");
    const home = readFileSync(
      path.join(root, "components/mypage/home/MypageProfileSummary.tsx"),
      "utf8",
    );
    expect(trustPage).toContain("buildMemberTrustSurface");
    expect(trustPage).toContain("/api/me/profile?fresh=1");
    expect(trustPage).not.toMatch(/text-signature/);
    expect(home).toContain("buildMemberTrustSurface");
    expect(home).toContain("mypage-profile-manner-row");
  });

  it("top battery tier hex matches design-system primaryHex", () => {
    const battery = readFileSync(path.join(root, "lib/trust/manner-battery.ts"), "utf8");
    const ds = readFileSync(path.join(root, "lib/ui/design-system-hard-lock.ts"), "utf8");
    expect(ds).toContain('primaryHex: "#0B421A"');
    expect(battery).toContain('#0B421A');
    expect(battery).not.toContain("#EA580C");
  });
});
