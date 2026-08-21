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
    expect(header).not.toMatch(/confirmNickname/);
    expect(header).not.toMatch(/admin_users_purge_confirm_nickname_prompt/);
    expect(header).toMatch(/PromoteMemberToAdminSheet/);
    expect(header).toMatch(/admin_users_action_promote_admin/);
  });

  it("create member form shows when requested without adminUserId gate", () => {
    const src = readFileSync(join(process.cwd(), "components/admin/users/AdminUserListPage.tsx"), "utf8");
    expect(src).toMatch(/showCreateMember \? \(/);
    expect(src).not.toMatch(/showCreateMember && adminUserId/);
  });

  it("delete API does not require nickname retype for purge", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/users/[id]/delete/route.ts"), "utf8");
    expect(src).not.toMatch(/confirm_nickname_required/);
    expect(src).toMatch(/admin_permanent_delete/);
  });

  it("staff API promotes existing members via userId", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/staff/route.ts"), "utf8");
    expect(src).toMatch(/existingUserId/);
    expect(src).toMatch(/promote_to_admin/);
  });

  it("ops history includes deletion requests and actor login fields", () => {
    const src = readFileSync(join(process.cwd(), "lib/admin-users/member-ops-history.ts"), "utf8");
    expect(src).toMatch(/account_deletion_requests/);
    expect(src).toMatch(/actorLoginId/);
    expect(src).toMatch(/actionLabel/);
  });

  it("admin deletion request queue API exists", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/account-deletion-requests/route.ts"), "utf8");
    expect(src).toMatch(/export async function GET/);
    expect(src).toMatch(/action !== "reject"/);
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
