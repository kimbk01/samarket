import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MEMBER_ADMIN_CAPABILITY_CATALOG } from "@/lib/admin-users/member-admin-capability-catalog";
import { MEMBER_ADMIN_SCREEN_CATALOG as SCREENS } from "@/lib/admin-users/member-admin-screen-catalog";
import {
  findForbiddenOperatorTerms,
  findPlaceholderFinalCopy,
  MEMBER_ADMIN_COPY,
} from "@/lib/admin-users/member-admin-copy-ssot";
import { memberAdminBlockedDistinctFromSuspended } from "@/lib/admin-users/member-admin-badge-presentation";
import {
  MEMBER_DETAIL_CTA_CAPABILITY_MAP,
  MEMBER_DETAIL_DANGER_EXECUTION_DEFERRED_KO,
  MEMBER_DETAIL_SUPPORT_MESSAGE_DEFERRED_KO,
  MEMBER_DETAIL_OVERVIEW_SECTION_LABEL_KO,
  MEMBER_DETAIL_OVERVIEW_SECTION_ORDER,
  MEMBER_DETAIL_TAB_ORDER,
  groupMemberDetailDangerActions,
  memberDetailContactEmail,
  memberDetailCtaCapabilityMapAccountsForCatalog,
  memberDetailLoginIdLabel,
  memberDetailNicknameIfDistinct,
  memberDetailOverviewSectionRenderPlan,
  parseMemberDetailTab,
  resolveMemberDetailHeaderBadges,
} from "@/lib/admin-users/member-detail-control-center-ia";
import {
  memberDetailAccountStateLabelKo,
  memberDetailDangerActions,
  memberDetailShouldUseHistoryBack,
  resolveMemberDetailActionPolicy,
} from "@/lib/admin-users/member-detail-presentation";
import type { MemberAdminOperatorAuthorization } from "@/lib/admin-users/member-admin-action-policy";

const fullOp: MemberAdminOperatorAuthorization = {
  canModerate: true,
  canEditProfile: true,
  canResetPassword: true,
  canManagePrivilege: true,
  canWithdraw: true,
  canPurge: true,
  isSelf: false,
};

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("R3 Member Detail Control Center IA", () => {
  it("preserves CAP 33 / Screens 28", () => {
    expect(MEMBER_ADMIN_CAPABILITY_CATALOG).toHaveLength(33);
    expect(SCREENS).toHaveLength(28);
    expect(memberDetailCtaCapabilityMapAccountsForCatalog()).toBe(true);
  });

  it("freezes tab catalog order including points/trust", () => {
    expect([...MEMBER_DETAIL_TAB_ORDER]).toEqual([
      "overview",
      "account",
      "store",
      "community",
      "trade",
      "delivery",
      "chat",
      "reports",
      "address",
      "ops",
      "points",
      "trust",
    ]);
    expect(parseMemberDetailTab("account")).toBe("account");
    expect(parseMemberDetailTab("nope")).toBe("overview");
    const cc = src("components/admin/users/AdminMemberControlCenter.tsx");
    expect(cc).toMatch(/MEMBER_DETAIL_TAB_ORDER|ADMIN_MEMBER_CC_TABS/);
    expect(cc).toMatch(/router\.replace/);
    expect(cc).not.toMatch(/history\.replaceState/);
  });

  it("header identity hierarchy: display > nickname > @ID; suppress synthetic contact", () => {
    expect(memberDetailNicknameIfDistinct("Kim", "Kim")).toBeNull();
    expect(memberDetailNicknameIfDistinct("Kim", "별명")).toBe("별명");
    expect(memberDetailContactEmail("user@manual.local")).toBeNull();
    expect(memberDetailContactEmail("real@example.com")).toBe("real@example.com");
    expect(memberDetailLoginIdLabel("login_kim")).toBe("login_kim");
    const header = src("components/admin/users/AdminMemberMasterHeader.tsx");
    expect(header).toMatch(/data-member-display-name/);
    expect(header).toMatch(/data-member-public-id/);
    expect(header).toMatch(/memberDetailNicknameIfDistinct/);
    expect(header).toMatch(/memberDetailContactEmail/);
    expect(header).toMatch(/MEMBER_ADMIN_TYPOGRAPHY_CLASS\.MEMBER_PRIMARY_NAME/);
    expect(header).not.toMatch(/memberNoteComposeHref/);
    expect(header).not.toMatch(/data-member-cta="note"/);
    expect(header).not.toMatch(/영구 삭제|이용 정지|이용 차단/);
    expect(header).not.toMatch(/ADMIN_USERS_LITE_BTN_/);
  });

  it("orthogonal badges: account/verify/store/privilege independent; blocked ≠ suspended", () => {
    expect(memberAdminBlockedDistinctFromSuspended()).toBe(true);
    expect(memberDetailAccountStateLabelKo("blocked")).not.toBe(
      memberDetailAccountStateLabelKo("suspended"),
    );
    const badges = resolveMemberDetailHeaderBadges({
      moderationStatus: "blocked",
      phoneVerified: false,
      hasStore: true,
      hasAdminMembership: true,
      isSuperAdmin: false,
    });
    expect(badges.map((b) => b.axis)).toEqual(["account", "verify", "store", "privilege"]);
    expect(badges.find((b) => b.axis === "account")?.labelKo).toBe(MEMBER_ADMIN_COPY.status_blocked);
    expect(badges.find((b) => b.axis === "verify")?.labelKo).toBe("인증 미완료");
    const header = src("components/admin/users/AdminMemberMasterHeader.tsx");
    expect(header).toMatch(/resolveMemberDetailHeaderBadges/);
    expect(header).toMatch(/data-member-orthogonal-badges/);
    expect(header).not.toMatch(/회원 구분/);
  });

  it("CTA hierarchy uses R1 variants and CAP ownership attrs", () => {
    const header = src("components/admin/users/AdminMemberMasterHeader.tsx");
    expect(header).toContain('data-member-cta-variant="primary"');
    expect(header).toContain('data-member-cta-variant="secondary"');
    expect(header).toContain('data-member-cta-variant="tertiary"');
    expect(header).toMatch(/memberAdminCtaClass\("primary"\)/);
    expect(header).toMatch(/data-member-cta-cap="CAP-PROFILE-EDIT"/);
    expect(header).toMatch(/data-member-cta-cap="CAP-MSG-MESSENGER"/);
    expect(header).toMatch(/data-member-cta-cap="CAP-PASSWORD"/);
    expect(header).toMatch(/data-member-cta-cap="CAP-VERIFY-VIEW"/);
    expect(header).toMatch(/data-member-cta-cap="CAP-PRIV-VIEW"/);
  });

  it("maps every Detail CTA to a catalog CAP with target phase", () => {
    expect(MEMBER_DETAIL_CTA_CAPABILITY_MAP.length).toBeGreaterThanOrEqual(12);
    for (const row of MEMBER_DETAIL_CTA_CAPABILITY_MAP) {
      expect(MEMBER_ADMIN_CAPABILITY_CATALOG.some((c) => c.id === row.capId)).toBe(true);
      expect(row.targetPhase).toBeTruthy();
      expect(row.handlerOrRoute).toBeTruthy();
    }
    const support = MEMBER_DETAIL_CTA_CAPABILITY_MAP.find((r) => r.ctaKey === "support_note");
    expect(support?.executableInR3).toBe(false);
    expect(support?.targetPhase).toBe("R8");
    const suspend = MEMBER_DETAIL_CTA_CAPABILITY_MAP.find((r) => r.ctaKey === "danger_suspend");
    expect(suspend?.targetPhase).toBe("R7");
    expect(suspend?.executableInR3).toBe(false);
  });

  it("Danger Zone: no placeholder chrome, consequence groups, no header danger", () => {
    const dz = src("components/admin/users/AdminMemberDangerZone.tsx");
    expect(findPlaceholderFinalCopy(dz)).toEqual([]);
    expect(dz).not.toContain("표시만");
    expect(dz).toMatch(/MEMBER_DETAIL_DANGER_EXECUTION_DEFERRED_KO/);
    expect(MEMBER_DETAIL_DANGER_EXECUTION_DEFERRED_KO).toBe("제재 워크플로에서 실행");
    expect(dz).toMatch(/data-danger-group=\{groupId\}/);
    expect(dz).toMatch(/MEMBER_DETAIL_DANGER_GROUP_ORDER/);
    expect(dz).toMatch(/deferred-r7/);
    expect(dz).toMatch(/groupMemberDetailDangerActions/);
    const decisions = resolveMemberDetailActionPolicy({
      moderationStatus: "normal",
      operator: fullOp,
      hasStoreRelationship: false,
      passwordResetSupported: true,
    });
    const grouped = groupMemberDetailDangerActions(memberDetailDangerActions(decisions));
    expect(grouped.restriction.map((d) => d.id)).toEqual(
      expect.arrayContaining(["suspend", "block"]),
    );
    expect(grouped.identity_end.map((d) => d.id)).toEqual(expect.arrayContaining(["withdraw"]));
    const header = src("components/admin/users/AdminMemberMasterHeader.tsx");
    expect(header).not.toMatch(/AdminMemberDangerZone/);
    expect(header).not.toMatch(/data-member-detail-danger-zone/);
  });

  it("overview hierarchy sections are operator-ordered", () => {
    expect([...MEMBER_DETAIL_OVERVIEW_SECTION_ORDER]).toEqual([
      "basic",
      "account_auth",
      "store",
      "privilege",
      "recent_activity",
      "recent_ops",
    ]);
    expect(MEMBER_DETAIL_OVERVIEW_SECTION_LABEL_KO.basic).toBe("회원 기본 정보");
    // Render plan is the only order authority — must equal SSOT, not a second list.
    expect(memberDetailOverviewSectionRenderPlan().map((s) => s.id)).toEqual([
      ...MEMBER_DETAIL_OVERVIEW_SECTION_ORDER,
    ]);
    expect(memberDetailOverviewSectionRenderPlan().map((s) => s.labelKo)).toEqual([
      "회원 기본 정보",
      "계정 / 인증",
      "매장",
      "관리 권한",
      "최근 활동",
      "최근 운영 조치",
    ]);
    const overview = src("components/admin/users/AdminMemberOverviewPanel.tsx");
    expect(overview).toMatch(/data-member-overview-hierarchy/);
    expect(overview).toMatch(/data-member-overview-section=\{sectionId\}/);
    // Must consume canonical plan — forbids independent hardcoded Panel order drift.
    expect(overview).toMatch(/memberDetailOverviewSectionRenderPlan\(\)\.map/);
    expect(overview).not.toMatch(/MEMBER_DETAIL_OVERVIEW_SECTION_LABEL_KO\.recent_activity/);
    expect(overview).not.toMatch(/MEMBER_DETAIL_OVERVIEW_SECTION_LABEL_KO\.account_auth/);
    // Section body keys must appear in SSOT order (Record insertion order in source).
    const bodyKeyOrder = [...overview.matchAll(/^\s+(basic|account_auth|store|privilege|recent_activity|recent_ops):\s*\(/gm)].map(
      (m) => m[1],
    );
    expect(bodyKeyOrder).toEqual([...MEMBER_DETAIL_OVERVIEW_SECTION_ORDER]);
    expect(overview).toMatch(/memberDetailContactEmail/);
    expect(overview).toMatch(/로그인 ID/);
    expect(findForbiddenOperatorTerms(overview)).toEqual([]);
  });

  it("account/auth suppresses synthetic contact email", () => {
    const auth = src("components/admin/users/AdminMemberAuthPanel.tsx");
    expect(auth).toMatch(/memberDetailContactEmail/);
    expect(auth).toMatch(/로그인 ID/);
    expect(auth).toMatch(/memberDetailAccountStateLabelKo/);
    expect(auth).toMatch(/memberDetailVerificationLabelKo/);
  });

  it("store panel keeps name + #id + business detail link", () => {
    const store = src("components/admin/users/AdminMemberStorePanel.tsx");
    expect(store).toMatch(/#\{store\.id\}/);
    expect(store).toMatch(/매장 상세 보기/);
    expect(store).toMatch(/MEMBER_DETAIL_STORE_NONE_KO|매장 없음/);
    expect(store).toMatch(/memberDetailStoreHref/);
  });

  it("back navigation preserves list history contract", () => {
    expect(memberDetailShouldUseHistoryBack("/admin/users?q=a&page=2")).toBe(true);
    const cc = src("components/admin/users/AdminMemberControlCenter.tsx");
    expect(cc).toMatch(/router\.back/);
    expect(cc).toMatch(/memberDetailShouldUseHistoryBack/);
  });

  it("load states remain distinct on detail page", () => {
    const page = src("components/admin/users/AdminUserDetailPage.tsx");
    for (const state of ["loading", "found", "not_found", "forbidden", "error"]) {
      expect(page).toContain(`data-member-detail-state="${state}"`);
    }
  });

  it("operator copy: no developer terms / no 표시만 on Detail surfaces", () => {
    const files = [
      "components/admin/users/AdminMemberMasterHeader.tsx",
      "components/admin/users/AdminMemberDangerZone.tsx",
      "components/admin/users/AdminMemberOverviewPanel.tsx",
      "components/admin/users/AdminMemberAuthPanel.tsx",
      "components/admin/users/AdminMemberReportsPanel.tsx",
    ];
    for (const file of files) {
      const text = src(file);
      expect(findForbiddenOperatorTerms(text)).toEqual([]);
      expect(findPlaceholderFinalCopy(text)).toEqual([]);
      expect(text).not.toContain("표시만");
    }
    // ControlCenter uses URLSearchParams (substring "RLS") — guard operator chrome only.
    const cc = src("components/admin/users/AdminMemberControlCenter.tsx");
    expect(cc).not.toContain("표시만");
    expect(cc).not.toContain("profiles에 반영");
    expect(cc).not.toContain("auth.users");
  });


  it("Ops contact: CAP-MSG-SUPPORT not rendered as executable note CTA", () => {
    const ops = src("components/admin/users/AdminMemberOpsPanel.tsx");
    expect(ops).not.toContain("쪽지 보내기");
    expect(ops).not.toContain('admin_users_cc_cta_send_note');
    expect(ops).not.toContain("/api/admin/member-notes");
    expect(ops).not.toContain("memberInquiryAdminHref");
    expect(ops).toMatch(/MEMBER_DETAIL_SUPPORT_MESSAGE_DEFERRED_KO/);
    expect(MEMBER_DETAIL_SUPPORT_MESSAGE_DEFERRED_KO).toBe("Support 워크플로에서 제공 (R8)");
    expect(ops).toMatch(/data-member-support-deferred/);
    expect(ops).toMatch(/CAP-MSG-MESSENGER/);
    expect(findPlaceholderFinalCopy(ops)).toEqual([]);
    expect(ops).not.toContain("표시만");
  });

  it("R2 list contract file still free of 표시만", () => {
    const table = src("components/admin/users/AdminUserTable.tsx");
    expect(table).not.toContain("표시만");
  });
});
