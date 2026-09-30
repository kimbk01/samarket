import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MEMBER_ADMIN_COPY,
  findForbiddenOperatorTerms,
} from "@/lib/admin-users/member-admin-copy-ssot";
import {
  MEMBER_DETAIL_DANGER_ZONE_TITLE_KO,
  MEMBER_DETAIL_STORE_NONE_KO,
  MEMBER_DETAIL_TAB_LABEL_KO,
  memberDetailAccountStateLabelKo,
  memberDetailDangerActions,
  memberDetailShouldUseHistoryBack,
  memberDetailStoreHref,
  memberDetailVerificationLabelKo,
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

describe("P3 member detail control center contract", () => {
  it("keeps blocked ≠ suspended in account-state labels", () => {
    expect(memberDetailAccountStateLabelKo("blocked")).toBe(MEMBER_ADMIN_COPY.status_blocked);
    expect(memberDetailAccountStateLabelKo("suspended")).toBe(MEMBER_ADMIN_COPY.status_suspended);
    expect(memberDetailAccountStateLabelKo("blocked")).not.toBe(memberDetailAccountStateLabelKo("suspended"));
    expect(memberDetailAccountStateLabelKo("normal")).toBe(MEMBER_ADMIN_COPY.status_active);
    expect(memberDetailAccountStateLabelKo("withdrawn")).toBe(MEMBER_ADMIN_COPY.status_withdrawn);
  });

  it("keeps verification orthogonal from account state", () => {
    expect(memberDetailVerificationLabelKo(true)).toBe("인증 완료");
    expect(memberDetailVerificationLabelKo(false)).toBe("인증 미완료");
    expect(memberDetailAccountStateLabelKo("normal")).not.toBe(memberDetailVerificationLabelKo(false));
  });

  it("reuses P2 store business detail href", () => {
    expect(memberDetailStoreHref("42")).toBe("/admin/business/42");
    const storePanel = src("components/admin/users/AdminMemberStorePanel.tsx");
    expect(storePanel).toMatch(/memberDetailStoreHref/);
    expect(storePanel).toMatch(/매장 상세 보기/);
    expect(storePanel).toMatch(/MEMBER_DETAIL_STORE_NONE_KO|매장 없음/);
    expect(storePanel).not.toMatch(/\/admin\/stores\?q=/);
  });

  it("exposes approved tab IA labels", () => {
    expect(MEMBER_DETAIL_TAB_LABEL_KO.overview).toBe("개요");
    expect(MEMBER_DETAIL_TAB_LABEL_KO.account).toBe("계정·인증");
    expect(MEMBER_DETAIL_TAB_LABEL_KO.store).toBe("매장");
    expect(MEMBER_DETAIL_TAB_LABEL_KO.reports).toBe("신고·제재");
    expect(MEMBER_DETAIL_TAB_LABEL_KO.ops).toBe("운영 이력");
    const cc = src("components/admin/users/AdminMemberControlCenter.tsx");
    expect(cc).toMatch(/MEMBER_DETAIL_TAB_LABEL_KO/);
    expect(cc).toMatch(/"reports"/);
    expect(cc).toMatch(/AdminMemberDangerZone/);
    expect(cc).toMatch(/router\.back/);
  });

  it("projects Danger Zone visibility from ActionPolicy only", () => {
    const active = resolveMemberDetailActionPolicy({
      moderationStatus: "normal",
      operator: fullOp,
      hasStoreRelationship: false,
      passwordResetSupported: true,
    });
    const danger = memberDetailDangerActions(active);
    expect(danger.map((d) => d.id)).toEqual(expect.arrayContaining(["suspend", "block", "withdraw"]));
    expect(danger.some((d) => d.id === "purge")).toBe(false);
    expect(danger.every((d) => d.visible)).toBe(true);

    const withdrawn = resolveMemberDetailActionPolicy({
      moderationStatus: "withdrawn",
      operator: fullOp,
      hasStoreRelationship: false,
      passwordResetSupported: false,
    });
    expect(memberDetailDangerActions(withdrawn).some((d) => d.id === "purge")).toBe(true);

    const blocked = resolveMemberDetailActionPolicy({
      moderationStatus: "blocked",
      operator: fullOp,
      hasStoreRelationship: false,
      passwordResetSupported: true,
    });
    const blockedDanger = memberDetailDangerActions(blocked);
    expect(blockedDanger.some((d) => d.id === "unblock")).toBe(true);
    expect(blockedDanger.some((d) => d.id === "suspend" && d.visible)).toBe(false);

    const dz = src("components/admin/users/AdminMemberDangerZone.tsx");
    expect(dz).toMatch(/MEMBER_DETAIL_DANGER_ZONE_TITLE_KO/);
    expect(dz).toMatch(/data-member-detail-danger-zone/);
    expect(src("lib/admin-users/member-detail-presentation.ts")).toContain(MEMBER_DETAIL_DANGER_ZONE_TITLE_KO);
  });

  it("demotes destructive CTAs out of MasterHeader primary actions", () => {
    const header = src("components/admin/users/AdminMemberMasterHeader.tsx");
    expect(header).toMatch(/resolveMemberDetailActionPolicy/);
    expect(header).toMatch(/memberDetailAccountStateLabelKo/);
    expect(header).not.toMatch(/runPurge/);
    expect(header).not.toMatch(/runWithdraw/);
    expect(header).not.toMatch(/runModeration/);
    expect(header).not.toMatch(/영구 삭제/);
  });

  it("distinguishes loading / not_found / forbidden / error on detail page", () => {
    const page = src("components/admin/users/AdminUserDetailPage.tsx");
    expect(page).toMatch(/data-member-detail-state="loading"/);
    expect(page).toMatch(/data-member-detail-state="not_found"/);
    expect(page).toMatch(/data-member-detail-state="forbidden"/);
    expect(page).toMatch(/data-member-detail-state="error"/);
    expect(page).toMatch(/data-member-detail-state="found"/);
  });

  it("preserves list history back when referrer is member list", () => {
    expect(memberDetailShouldUseHistoryBack("https://samarket.vercel.app/admin/users?q=kim")).toBe(true);
    expect(memberDetailShouldUseHistoryBack("https://samarket.vercel.app/admin/business/1")).toBe(false);
    expect(MEMBER_DETAIL_STORE_NONE_KO).toBe("매장 없음");
  });

  it("overview and reports avoid raw moderation schema and developer terms", () => {
    const overview = src("components/admin/users/AdminMemberOverviewPanel.tsx");
    expect(overview).toMatch(/memberDetailAccountStateLabelKo/);
    expect(overview).not.toMatch(/String\(user\.moderation_status/);
    expect(overview).toMatch(/MEMBER_DETAIL_STORE_NONE_KO|매장 없음/);
    const reports = src("components/admin/users/AdminMemberReportsPanel.tsx");
    expect(reports).toMatch(/memberDetailAccountStateLabelKo/);
    expect(reports).not.toMatch(/toUpperCase\(\)/);
    for (const text of [overview, reports, src("components/admin/users/AdminMemberDangerZone.tsx")]) {
      expect(findForbiddenOperatorTerms(text)).toEqual([]);
    }
  });

  it("ops panel no longer exposes primary destructive execution CTAs", () => {
    const ops = src("components/admin/users/AdminMemberOpsPanel.tsx");
    expect(ops).not.toMatch(/runMemberDelete/);
    expect(ops).not.toMatch(/runModeration/);
    expect(ops).toMatch(/MEMBER_DETAIL_DANGER_ZONE_TITLE_KO|위험 작업/);
  });
});
