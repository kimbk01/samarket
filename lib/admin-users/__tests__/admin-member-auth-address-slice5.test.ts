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
});
