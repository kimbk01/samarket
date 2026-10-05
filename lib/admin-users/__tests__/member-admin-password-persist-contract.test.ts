import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("member/admin password persistence contracts", () => {
  it("profile email PATCH uses contact/login credential separation helper", () => {
    const src = read("app/api/admin/users/[id]/route.ts");
    expect(src).toMatch(/resolveContactEmailCredentialPatch/);
    expect(src).toMatch(/ensureManualLoginEmailAligned/);
    expect(src).not.toMatch(/patch\.auth_login_email = nextEmail/);
  });

  it("member create keeps Auth email on @manual.local and contact separate", () => {
    const src = read("app/api/admin/users/create/route.ts");
    expect(src).toMatch(/const authEmail = buildManualMemberAuthEmail\(username\)/);
    expect(src).toMatch(/auth_login_email: authEmail/);
    expect(src).toMatch(/email: contactEmail/);
  });

  it("password writers heal manual login email after set", () => {
    const auth = read("app/api/admin/users/[id]/auth/route.ts");
    const staff = read("app/api/admin/staff/[id]/route.ts");
    expect(auth).toMatch(/ensureManualLoginEmailAligned/);
    expect(staff).toMatch(/ensureManualLoginEmailAligned/);
  });

  it("native/SNS existing-user updates preserve admin-managed passwords", () => {
    for (const rel of [
      "lib/auth/native/google-native-session.server.ts",
      "lib/auth/native/kakao-native-session.server.ts",
      "lib/auth/native/apple-native-session.server.ts",
      "app/api/auth/naver/callback/route.ts",
      "lib/auth/provider-identity/web-oauth-owner-rebind.server.ts",
    ]) {
      const src = read(rel);
      expect(src, rel).toMatch(/shouldPreserveAdminManagedPassword/);
    }
  });
});
