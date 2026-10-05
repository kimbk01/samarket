import { OVERLAY_Z_CLASS } from "@/lib/ui/dibay-overlay-contract";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MEMBER_ADMIN_CAPABILITY_CATALOG,
  MEMBER_ADMIN_CAPABILITY_CATALOG_COUNT,
  MEMBER_ADMIN_CAPABILITY_IDS,
  memberAdminCapabilityClaimsFinal,
} from "@/lib/admin-users/member-admin-capability-catalog";
import {
  MEMBER_ADMIN_SCREEN_CATALOG,
  MEMBER_ADMIN_SCREEN_CATALOG_COUNT,
  MEMBER_ADMIN_SCREEN_IDS,
  memberAdminDialogSizeForScreen,
} from "@/lib/admin-users/member-admin-screen-catalog";
import {
  MEMBER_ADMIN_COPY,
  MEMBER_ADMIN_FORBIDDEN_OPERATOR_TERMS,
  MEMBER_ADMIN_FORBIDDEN_PLACEHOLDER_FINAL_COPY,
  MEMBER_ADMIN_FORBIDDEN_PRIVILEGE_AXIS_LABEL,
  assertNoForbiddenOperatorTerms,
  containsForbiddenPrivilegeAxisLabel,
  findForbiddenOperatorTerms,
  findPlaceholderFinalCopy,
  memberAdminLifecycleLabelKo,
} from "@/lib/admin-users/member-admin-copy-ssot";
import {
  MEMBER_ADMIN_DIALOG_CLOSE_HIT_MIN_PX,
  memberAdminCloseHitTargetOk,
  resolveMemberAdminCloseDiscoverability,
  resolveMemberAdminDismiss,
} from "@/lib/admin-users/member-admin-dialog-contract";
import {
  MEMBER_ADMIN_CTA_VARIANTS,
  MEMBER_ADMIN_DIALOG_SIZE_BY_WORKFLOW,
  MEMBER_ADMIN_DIALOG_SIZE_CLASS,
  MEMBER_ADMIN_SPACING,
  MEMBER_ADMIN_TYPOGRAPHY_CLASS,
  MEMBER_ADMIN_FORM_FIELD_CLASS,
  isMemberAdminCtaVariant,
  memberAdminCtaClass,
} from "@/lib/admin-users/member-admin-visual-ssot";
import {
  memberAdminAccountStatusBadge,
  memberAdminBlockedDistinctFromSuspended,
  memberAdminPrivilegeBadge,
  memberAdminStoreBadge,
  memberAdminVerifyBadge,
} from "@/lib/admin-users/member-admin-badge-presentation";
import { MEMBER_ADMIN_OPEN_DECISIONS } from "@/lib/admin-users/member-admin-open-decisions";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("R1 Capability catalog guard", () => {
  it("locks R0 CAP IDs (R0 table count = 33; Owner verbal 37 is not authority)", () => {
    expect(MEMBER_ADMIN_CAPABILITY_CATALOG_COUNT).toBe(33);
    expect(MEMBER_ADMIN_CAPABILITY_IDS).toHaveLength(33);
    expect(new Set(MEMBER_ADMIN_CAPABILITY_IDS).size).toBe(33);
    for (const id of [
      "CAP-CREATE",
      "CAP-PROFILE-EDIT",
      "CAP-PASSWORD",
      "CAP-WARN",
      "CAP-PURGE",
      "CAP-MSG-SUPPORT",
      "CAP-TEST-MAINT",
    ]) {
      expect(MEMBER_ADMIN_CAPABILITY_IDS).toContain(id);
    }
  });

  it("does not claim moderation CAPs as final YES until L4 PASS", () => {
    for (const row of MEMBER_ADMIN_CAPABILITY_CATALOG.filter((r) =>
      ["CAP-WARN", "CAP-SUSPEND", "CAP-BLOCK", "CAP-WITHDRAW", "CAP-PURGE"].includes(r.id),
    )) {
      expect(memberAdminCapabilityClaimsFinal(row.currentStatus)).toBe(false);
    }
  });
});

describe("R1 Screen catalog guard", () => {
  it("locks S01–S28", () => {
    expect(MEMBER_ADMIN_SCREEN_CATALOG_COUNT).toBe(28);
    expect(MEMBER_ADMIN_SCREEN_IDS[0]).toBe("S01");
    expect(MEMBER_ADMIN_SCREEN_IDS[27]).toBe("S28");
    expect(new Set(MEMBER_ADMIN_SCREEN_IDS).size).toBe(28);
  });

  it("maps create/edit/password dialog sizes", () => {
    expect(memberAdminDialogSizeForScreen("S12")).toBe("large");
    expect(memberAdminDialogSizeForScreen("S13")).toBe("standard");
    expect(memberAdminDialogSizeForScreen("S16")).toBe("small");
    expect(MEMBER_ADMIN_DIALOG_SIZE_BY_WORKFLOW.create).toBe("large");
    expect(MEMBER_ADMIN_DIALOG_SIZE_BY_WORKFLOW.edit).toBe("standard");
    expect(MEMBER_ADMIN_DIALOG_SIZE_BY_WORKFLOW.password).toBe("small");
  });
});

describe("R1 Dialog visual + X discoverability", () => {
  it("MemberAdminDialog source has discoverable X + footer separator contract", () => {
    const src = read("components/admin/users/MemberAdminDialog.tsx");
    expect(src).toContain("data-member-admin-dialog-close");
    expect(src).toContain("MEMBER_ADMIN_DIALOG_CLOSE_CLASS");
    expect(src).toContain("MEMBER_ADMIN_DIALOG_FOOTER_CLASS");
    expect(src).toContain("MEMBER_ADMIN_DIALOG_HEADER_CLASS");
    expect(src).toContain('data-member-admin-dialog-close-glyph="1"');
    expect(src).toContain("MEMBER_ADMIN_DIALOG_CLOSE_HIT_MIN_PX");
    expect(src).toContain("size = \"standard\"");
    expect(src).toMatch(/size\?: MemberAdminDialogSize/);
    // behavior preserved
    expect(src).toContain("resolveMemberAdminDismiss");
    expect(src).toContain("data-member-admin-dirty-confirm");
  });

  it("close discoverability structural resolver", () => {
    expect(MEMBER_ADMIN_DIALOG_CLOSE_HIT_MIN_PX).toBe(44);
    expect(memberAdminCloseHitTargetOk(44, 44)).toBe(true);
    const ok = resolveMemberAdminCloseDiscoverability({
      hitWidthPx: 44,
      hitHeightPx: 44,
      hasAriaLabel: true,
      hasVisibleGlyph: true,
      disabledWhenPending: true,
      topRightExpected: true,
    });
    expect(ok.ok).toBe(true);
    const bad = resolveMemberAdminCloseDiscoverability({
      hitWidthPx: 20,
      hitHeightPx: 20,
      hasAriaLabel: false,
      hasVisibleGlyph: false,
      disabledWhenPending: false,
      topRightExpected: false,
    });
    expect(bad.ok).toBe(false);
    expect(bad.reasons.length).toBeGreaterThan(0);
  });

  it("size class map only allows small/standard/large", () => {
    expect(Object.keys(MEMBER_ADMIN_DIALOG_SIZE_CLASS).sort()).toEqual(["large", "small", "standard"]);
  });

  it("P4 workflows pass canonical size props", () => {
    expect(read("components/admin/users/CreateMemberForm.tsx")).toMatch(/size="large"/);
    expect(read("components/admin/users/EditMemberForm.tsx")).toMatch(/size="standard"/);
    expect(read("components/admin/users/AdminMemberPasswordDialog.tsx")).toMatch(/size="small"/);
  });
});

describe("R1 CTA system", () => {
  it("exposes exactly PRIMARY/SECONDARY/TERTIARY/DANGER", () => {
    expect(MEMBER_ADMIN_CTA_VARIANTS.sort()).toEqual(["danger", "primary", "secondary", "tertiary"]);
    for (const v of MEMBER_ADMIN_CTA_VARIANTS) {
      expect(isMemberAdminCtaVariant(v)).toBe(true);
      expect(memberAdminCtaClass(v)).toContain("member-admin-cta");
    }
    expect(isMemberAdminCtaVariant("ghost")).toBe(false);
  });

  it("detail header consumes hierarchy (not equal primary outlines)", () => {
    const src = read("components/admin/users/AdminMemberMasterHeader.tsx");
    expect(src).toContain('data-member-cta-variant="primary"');
    expect(src).toContain('data-member-cta-variant="secondary"');
    expect(src).toContain('data-member-cta-variant="tertiary"');
    expect(src).not.toContain("ADMIN_USERS_LITE_BTN_OUTLINE_PRIMARY");
  });
});

describe("R1 Typography / spacing / form", () => {
  it("defines required typography roles", () => {
    for (const role of [
      "PAGE_TITLE",
      "FIELD_LABEL",
      "HELP_TEXT",
      "ERROR_TEXT",
      "BUTTON_TEXT",
      "BADGE_TEXT",
    ] as const) {
      expect(MEMBER_ADMIN_TYPOGRAPHY_CLASS[role]).toBeTruthy();
    }
  });

  it("freezes spacing rhythm keys", () => {
    expect(MEMBER_ADMIN_SPACING.fieldGap).toBe(12);
    expect(MEMBER_ADMIN_SPACING.ctaSiblingGap).toBe(8);
    expect(MEMBER_ADMIN_SPACING.dialogBodyFooter).toBe(16);
  });

  it("form field presentation classes exist", () => {
    expect(MEMBER_ADMIN_FORM_FIELD_CLASS.input).toContain("rounded-ui-rect");
    expect(MEMBER_ADMIN_FORM_FIELD_CLASS.select).toContain("rounded-ui-rect");
  });
});

describe("R1 Operator copy + forbidden terms", () => {
  it("forbids developer terms including profiles/auth.users", () => {
    expect(MEMBER_ADMIN_FORBIDDEN_OPERATOR_TERMS).toEqual(
      expect.arrayContaining(["profiles", "auth.users", "RPC", "RLS", "PATCH", "profiles에 반영"]),
    );
    expect(findForbiddenOperatorTerms("auth.users · profiles")).toEqual(
      expect.arrayContaining(["profiles", "auth.users"]),
    );
    expect(() => assertNoForbiddenOperatorTerms(MEMBER_ADMIN_COPY.member_register)).not.toThrow();
  });

  it("create subtitle catalog is operator Korean/English (no developer tables)", () => {
    const catalog = read("lib/i18n/catalog/admin.ts");
    expect(catalog).not.toContain('admin_users_form_create_member_subtitle: "auth.users · profiles"');
    expect(catalog).not.toContain("profiles에 반영됩니다");
    expect(catalog).toContain("새 회원을 등록합니다");
  });

  it("rejects placeholder 표시만 as final capability copy", () => {
    expect(MEMBER_ADMIN_FORBIDDEN_PLACEHOLDER_FINAL_COPY).toContain("표시만");
    expect(findPlaceholderFinalCopy("표시만")).toEqual(["표시만"]);
    // Danger zone may still show placeholder until R7 — must not map to CAP final YES
    const danger = read("components/admin/users/AdminMemberDangerZone.tsx");
    if (danger.includes("표시만")) {
      const warn = MEMBER_ADMIN_CAPABILITY_CATALOG.find((r) => r.id === "CAP-WARN");
      expect(warn?.currentStatus).not.toBe("YES");
    }
  });

  it("guards 회원 구분 as privilege/store authority label", () => {
    expect(MEMBER_ADMIN_FORBIDDEN_PRIVILEGE_AXIS_LABEL).toBe("회원 구분");
    expect(containsForbiddenPrivilegeAxisLabel("회원 구분")).toBe(true);
    // Edit may still contain residual field — marked R4-owned, not R0-complete
    const edit = read("components/admin/users/EditMemberForm.tsx");
    if (edit.includes("admin_users_label_member_type")) {
      expect(edit).toContain('data-member-edit-member-type-r4-owned="1"');
    }
  });
});

describe("R1 Badge presentation", () => {
  it("keeps BLOCKED distinct from SUSPENDED", () => {
    expect(memberAdminBlockedDistinctFromSuspended()).toBe(true);
    expect(memberAdminLifecycleLabelKo("BLOCKED")).not.toBe(memberAdminLifecycleLabelKo("SUSPENDED"));
    expect(memberAdminAccountStatusBadge("BLOCKED").tone).not.toBe(
      memberAdminAccountStatusBadge("SUSPENDED").tone,
    );
  });

  it("exposes independent axes", () => {
    expect(memberAdminVerifyBadge(true).axis).toBe("verify");
    expect(memberAdminStoreBadge(true).axis).toBe("store");
    expect(memberAdminPrivilegeBadge("super_admin").axis).toBe("privilege");
    expect(memberAdminPrivilegeBadge("super_admin").labelKo).toBe(MEMBER_ADMIN_COPY.privilege_super_admin);
  });
});

describe("R1 Open Decisions freeze", () => {
  it("locks OD-01…OD-08", () => {
    expect(Object.keys(MEMBER_ADMIN_OPEN_DECISIONS)).toEqual([
      "OD-01",
      "OD-02",
      "OD-03",
      "OD-04",
      "OD-05",
      "OD-06",
      "OD-07",
      "OD-08",
    ]);
    expect(MEMBER_ADMIN_OPEN_DECISIONS["OD-08"].decision).toBe("WARN_HISTORY_KEEP_ACTIVE");
  });
});

describe("R1 Dialog behavior preservation smoke", () => {
  it("dirty X still confirms", () => {
    expect(
      resolveMemberAdminDismiss({
        intent: "x",
        dirty: true,
        pending: false,
        tone: "default",
      }).kind,
    ).toBe("confirm_dirty");
  });
});

describe("R1 MemberAdminDialog stacking", () => {
  it("uses overlay dialog z-index above admin shell sticky header (z-40)", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("components/admin/users/MemberAdminDialog.tsx", "utf8"),
    );
    expect(src).toContain("OVERLAY_Z_CLASS.dialog");
    expect(src).toContain('data-member-admin-dialog-z="dialog"');
    // z-[1300] is MAIN_BOTTOM_NAV_SHEET_Z_CLASS — above admin shell z-40/z-45
    expect(OVERLAY_Z_CLASS.dialog).toMatch(/z-\[/);
  });
});

