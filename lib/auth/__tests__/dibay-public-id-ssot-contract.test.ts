import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd());
const SSOT = "lib/auth/dibay-public-id-ssot.ts";

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("dibay-public-id-ssot contract", () => {
  it("SSOT exports single gate and view entry points", () => {
    const src = read(SSOT);
    expect(src).toContain("export function isPublicIdSetupComplete");
    expect(src).toContain("export function evaluatePublicIdProfileView");
    expect(src).toContain("export function resolveSearchablePublicId");
    expect(src).toContain("DO NOT");
  });

  it("mypage uses evaluatePublicIdProfileView only", () => {
    const src = read("components/mypage/MyPageHomeDashboard.tsx");
    expect(src).toContain("evaluatePublicIdProfileView");
    expect(src).not.toContain("profileFieldsForDibayIdComplete");
    expect(src).not.toContain("isDibayIdComplete");
  });

  it("profile edit uses SSOT gate only", () => {
    const form = read("components/my/edit/ProfileEditForm.tsx");
    const helpers = read("lib/profile/profile-edit-form-helpers.ts");
    expect(form).toContain("isPublicIdSetupComplete");
    expect(form).toContain("dibay-public-id-ssot");
    expect(helpers).toContain("isPublicIdSetupComplete");
    expect(helpers).not.toContain("dibay_id_locked === true ? true : null");
  });

  it("messenger search delegates public id to SSOT", () => {
    const src = read("lib/community-messenger/user-public-id-search.ts");
    expect(src).toContain("resolveSearchablePublicId");
    expect(src).toContain("isPublicIdSearchEligible");
    expect(src).not.toMatch(/function resolvePublicId\(/);
  });

  it("messenger profile subtitle uses SSOT display", () => {
    const src = read("lib/community-messenger/service.ts");
    const fn = src.slice(src.indexOf("export function profileDibaySubtitle"));
    expect(fn.slice(0, 400)).toContain("resolvePublicIdAtDisplay");
  });
});
