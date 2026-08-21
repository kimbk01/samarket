import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("admin member auth + address Slice 5", () => {
  it("auth route uses Auth admin getUserById and does not infer verified from email", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/users/[id]/auth/route.ts"), "utf8");
    expect(src).toMatch(/auth\.admin\.getUserById/);
    expect(src).toMatch(/emailConfirmedAt/);
    expect(src).not.toMatch(/Boolean\(.*email.*\) \?\? true/);
    expect(src).not.toMatch(/verified:\s*Boolean\(authUser\.email/);
  });

  it("address route is read-only and does not call listUserAddresses writer", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/users/[id]/addresses/route.ts"), "utf8");
    expect(src).toMatch(/from\("user_addresses"\)/);
    expect(src).not.toMatch(/listUserAddresses\(/);
    expect(src).not.toMatch(/export async function PATCH/);
    expect(src).not.toMatch(/export async function POST/);
  });

  it("detail does not treat email presence as verified", () => {
    const src = readFileSync(join(process.cwd(), "components/admin/users/AdminTestUserDetail.tsx"), "utf8");
    expect(src).not.toMatch(/Boolean\(user\.verified_member_at\) \|\| Boolean\(user\.email/);
    expect(src).toMatch(/const emailVerified = Boolean\(user\.verified_member_at\)/);
  });

  it("auth route exposes PATCH password", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/users/[id]/auth/route.ts"), "utf8");
    expect(src).toMatch(/export async function PATCH/);
  });

  it("master header exposes purge for users managers", () => {
    const header = readFileSync(join(process.cwd(), "components/admin/users/AdminMemberMasterHeader.tsx"), "utf8");
    expect(header).toMatch(/mode:\s*"purge"/);
    expect(header).toMatch(/canManageMember/);
  });

  it("delete API purge uses users permission", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/users/[id]/delete/route.ts"), "utf8");
    expect(src).toMatch(/requireAdminPermission\("users"\)/);
    expect(src).not.toMatch(/requireSuperAdmin\(\)/);
  });

  it("member PATCH syncs Auth password", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/users/[id]/route.ts"), "utf8");
    expect(src).toMatch(/authPatch\.password/);
  });

});
