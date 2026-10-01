import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MEMBER_ADMIN_CAPABILITY_CATALOG } from "@/lib/admin-users/member-admin-capability-catalog";
import { MEMBER_ADMIN_SCREEN_CATALOG } from "@/lib/admin-users/member-admin-screen-catalog";
import {
  findForbiddenOperatorTerms,
  MEMBER_ADMIN_COPY,
  MEMBER_ADMIN_FORBIDDEN_PRIVILEGE_AXIS_LABEL,
} from "@/lib/admin-users/member-admin-copy-ssot";
import {
  MEMBER_DETAIL_CTA_CAPABILITY_MAP,
  memberDetailCtaCapabilityMapAccountsForCatalog,
} from "@/lib/admin-users/member-detail-control-center-ia";
import {
  DIBAY_ID_RESERVED,
  isValidDibayIdFormat,
  normalizeDibayIdInput,
} from "@/lib/auth/dibay-id-policy";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("R4 Profile · @ID · Verification · Password", () => {
  it("preserves CAP 33 / Screens 28", () => {
    expect(MEMBER_ADMIN_CAPABILITY_CATALOG).toHaveLength(33);
    expect(MEMBER_ADMIN_SCREEN_CATALOG).toHaveLength(28);
  });

  it("S13 profile-only Edit — no @ID / verify / password / store / privilege / memberType", () => {
    const form = src("components/admin/users/EditMemberForm.tsx");
    expect(form).toMatch(/data-member-profile-edit="1"/);
    expect(form).toMatch(/data-member-screen="S13"/);
    expect(form).toMatch(/MemberAdminDialog/);
    expect(form).toMatch(/data-member-profile-field="nickname"/);
    expect(form).toMatch(/data-member-profile-field="email"/);
    expect(form).toMatch(/data-member-profile-field="phone"/);
    expect(form).not.toMatch(/dibayId/);
    expect(form).not.toMatch(/phoneVerificationStatus/);
    expect(form).not.toMatch(/memberType/);
    expect(form).not.toMatch(/data-member-edit-member-type-r4-owned/);
    expect(form).not.toMatch(/body\.password/);
    expect(form).not.toMatch(/회원 구분/);
    expect(form).not.toMatch(MEMBER_ADMIN_FORBIDDEN_PRIVILEGE_AXIS_LABEL);
    expect(form).not.toMatch(/manage_password|AdminMemberPasswordDialog/);
    expect(form).not.toMatch(/owner_user_id|store_id|CAP-PRIV-PROMOTE/);
    // fetch method: "PATCH" is transport code, not operator chrome (same as Password dialog).
    expect(findForbiddenOperatorTerms(form.replace(/method:\s*"PATCH"/g, ""))).toEqual([]);
  });

  it("PATCH rejects memberType and phoneVerificationStatus on profile route", () => {
    const route = src("app/api/admin/users/[id]/route.ts");
    expect(route).toMatch(/member_type_not_via_profile_edit/);
    expect(route).toMatch(/phone_verification_via_s15/);
    expect(route).toMatch(/admin_member_dibay_id_change/);
    expect(route).toMatch(/normalizeDibayIdInput/);
    expect(route).toMatch(/isValidDibayIdFormat/);
  });

  it("dedicated S14 @ID dialog consumes dibay-id-policy", () => {
    const dialog = src("components/admin/users/AdminMemberDibayIdDialog.tsx");
    expect(dialog).toMatch(/data-member-dibay-id-dialog="1"/);
    expect(dialog).toMatch(/data-member-screen="S14"/);
    expect(dialog).toMatch(/MemberAdminDialog/);
    expect(dialog).toMatch(/normalizeDibayIdInput/);
    expect(dialog).toMatch(/isValidDibayIdFormat/);
    expect(dialog).toMatch(/dibayId/);
    expect(dialog).toMatch(/dibay_id_taken|이미 사용 중인/);
    expect(MEMBER_ADMIN_COPY.dibay_id_change).toBe("@회원 ID 변경");
    expect(isValidDibayIdFormat(normalizeDibayIdInput("good_id1"))).toBe(true);
    expect(isValidDibayIdFormat("ab")).toBe(false);
    expect(DIBAY_ID_RESERVED.has("admin")).toBe(true);
    expect(isValidDibayIdFormat("admin")).toBe(false);
  });

  it("dedicated S15 verification dialog + ActionPolicy approve/reset", () => {
    const dialog = src("components/admin/users/AdminMemberVerificationDialog.tsx");
    expect(dialog).toMatch(/data-member-verification-dialog="1"/);
    expect(dialog).toMatch(/data-member-screen="S15"/);
    expect(dialog).toMatch(/MemberAdminDialog/);
    expect(dialog).toMatch(/data-member-verify-action="approve"/);
    expect(dialog).toMatch(/data-member-verify-action="reset"/);
    expect(dialog).toMatch(/phone-verification/);
    expect(dialog).toMatch(/canApprove/);
    expect(dialog).toMatch(/canReset/);
    expect(dialog).toMatch(/verify_status_done|인증 완료/);
    const route = src("app/api/admin/users/[id]/phone-verification/route.ts");
    expect(route).toMatch(/action === "reset"/);
    expect(route).toMatch(/admin_member_phone_verify_approve/);
    expect(route).toMatch(/admin_member_phone_verify_reset/);
  });

  it("S16 password workflow preserved", () => {
    const dialog = src("components/admin/users/AdminMemberPasswordDialog.tsx");
    expect(dialog).toMatch(/MemberAdminDialog/);
    expect(dialog).toMatch(/PASSWORD_TEMP_SET|password_temp_set_title|\/auth/);
    expect(dialog).toMatch(/data-member-password-dialog="1"/);
    const auth = src("app/api/admin/users/[id]/auth/route.ts");
    expect(auth).toMatch(/PASSWORD_TEMP_SET/);
    expect(auth).not.toMatch(/after_json:.*password[^_]/);
  });

  it("R3 Detail exposes separate S13–S16 CTAs", () => {
    const header = src("components/admin/users/AdminMemberMasterHeader.tsx");
    expect(header).toMatch(/data-member-cta-cap="CAP-PROFILE-EDIT"/);
    expect(header).toMatch(/data-member-cta-cap="CAP-DIBAY-ID"/);
    expect(header).toMatch(/data-member-cta-cap="CAP-VERIFY-VIEW"/);
    expect(header).toMatch(/data-member-cta-cap="CAP-PASSWORD"/);
    expect(header).toMatch(/AdminMemberDibayIdDialog/);
    expect(header).toMatch(/AdminMemberVerificationDialog/);
    expect(header).toMatch(/AdminMemberPasswordDialog/);
    expect(header).toMatch(/EditMemberForm/);
    expect(header).not.toMatch(/onOpenTab\?\.\("account"\)/);
  });

  it("CTA map accounts for CAP-DIBAY-ID and catalog length", () => {
    expect(memberDetailCtaCapabilityMapAccountsForCatalog()).toBe(true);
    expect(MEMBER_DETAIL_CTA_CAPABILITY_MAP.some((r) => r.capId === "CAP-DIBAY-ID")).toBe(true);
    const dibay = MEMBER_ADMIN_CAPABILITY_CATALOG.find((c) => c.id === "CAP-DIBAY-ID");
    expect(dibay?.currentStatus).toBe("YES");
    const approve = MEMBER_ADMIN_CAPABILITY_CATALOG.find((c) => c.id === "CAP-VERIFY-APPROVE");
    expect(approve?.currentStatus).toBe("YES");
  });

  it("phone number change does not invent auto verification reset in PATCH", () => {
    const route = src("app/api/admin/users/[id]/route.ts");
    // Phone patch assigns storage fields only; verification reset stays on S15 route.
    expect(route).toMatch(/nextPhonePatch/);
    expect(route).not.toMatch(/nextPhonePatch[\s\S]{0,120}phone_verified:\s*false/);
  });
});
