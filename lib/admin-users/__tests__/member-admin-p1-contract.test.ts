import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MEMBER_ADMIN_COPY,
  assertNoForbiddenOperatorTerms,
  findForbiddenOperatorTerms,
  memberAdminCopy,
  memberAdminLifecycleLabelKo,
} from "@/lib/admin-users/member-admin-copy-ssot";
import {
  MEMBER_ADMIN_DIALOG_CLOSE_HIT_MIN_PX,
  memberAdminBackdropDismissible,
  memberAdminCloseHitTargetOk,
  memberAdminDirtyCloseCopy,
  resolveMemberAdminAfterMutation,
  resolveMemberAdminDismiss,
  resolveMemberAdminMutationUi,
} from "@/lib/admin-users/member-admin-dialog-contract";
import {
  listEnabledMemberAdminActions,
  listVisibleMemberAdminActions,
  memberModerationActionIdsFromPolicy,
  normalizeMemberAdminLifecycle,
  resolveMemberAdminActionPolicy,
  type MemberAdminActionContext,
  type MemberAdminOperatorAuthorization,
} from "@/lib/admin-users/member-admin-action-policy";
import { memberModerationActionsForStatus } from "@/lib/admin-users/member-moderation-cta";

const fullOp: MemberAdminOperatorAuthorization = {
  canModerate: true,
  canEditProfile: true,
  canResetPassword: true,
  canManagePrivilege: true,
  canWithdraw: true,
  canPurge: true,
  isSelf: false,
};

function ctx(
  lifecycle: MemberAdminActionContext["lifecycle"],
  partial: Partial<MemberAdminActionContext> = {},
): MemberAdminActionContext {
  return {
    lifecycle,
    operator: fullOp,
    hasStoreRelationship: false,
    passwordResetSupported: true,
    ...partial,
  };
}

describe("P1 Member Admin Dialog SSOT", () => {
  it("X hit target minimum is 44×44", () => {
    expect(MEMBER_ADMIN_DIALOG_CLOSE_HIT_MIN_PX).toBe(44);
    expect(memberAdminCloseHitTargetOk(44, 44)).toBe(true);
    expect(memberAdminCloseHitTargetOk(43, 44)).toBe(false);
  });

  it("dirty X / Cancel / ESC require discard confirmation", () => {
    for (const intent of ["x", "cancel", "esc"] as const) {
      const d = resolveMemberAdminDismiss({
        intent,
        dirty: true,
        pending: false,
        tone: "default",
      });
      expect(d.kind).toBe("confirm_dirty");
      if (d.kind === "confirm_dirty") {
        expect(d.copy.title).toBe("작성 중인 변경사항이 있습니다.");
        expect(d.copy.description).toBe("닫으시겠습니까?");
        expect(d.copy.stayLabel).toBe("계속 수정");
        expect(d.copy.discardLabel).toBe("변경사항 버리기");
      }
    }
  });

  it("clean cancel/X/ESC allow close", () => {
    for (const intent of ["x", "cancel", "esc"] as const) {
      expect(
        resolveMemberAdminDismiss({
          intent,
          dirty: false,
          pending: false,
          tone: "default",
        }).kind,
      ).toBe("allow_close");
    }
  });

  it("danger dialog blocks accidental backdrop close", () => {
    expect(memberAdminBackdropDismissible({ pending: false, tone: "danger" })).toBe(false);
    expect(
      resolveMemberAdminDismiss({
        intent: "backdrop",
        dirty: false,
        pending: false,
        tone: "danger",
      }),
    ).toEqual({ kind: "block", reason: "danger_backdrop" });
  });

  it("pending blocks close and double submit", () => {
    expect(
      resolveMemberAdminDismiss({
        intent: "x",
        dirty: true,
        pending: true,
        tone: "default",
      }),
    ).toEqual({ kind: "block", reason: "pending" });
    const ui = resolveMemberAdminMutationUi({ pending: true });
    expect(ui.primaryDisabled).toBe(true);
    expect(ui.cancelDisabled).toBe(true);
    expect(ui.showLoading).toBe(true);
    expect(ui.mayCloseEarly).toBe(false);
  });

  it("failure retains dialog; success closes with focus return", () => {
    expect(resolveMemberAdminAfterMutation("failure")).toEqual({
      kind: "keep_open",
      reason: "failure_retain",
    });
    expect(resolveMemberAdminAfterMutation("success")).toEqual({
      kind: "close_and_return_focus",
    });
  });

  it("MemberAdminDialog source implements contract markers", () => {
    const src = readFileSync(
      join(process.cwd(), "components/admin/users/MemberAdminDialog.tsx"),
      "utf8",
    );
    expect(src).toContain("data-member-admin-dialog-close");
    expect(src).toContain("MEMBER_ADMIN_DIALOG_CLOSE_HIT_MIN_PX");
    expect(src).toContain("resolveMemberAdminDismiss");
    expect(src).toContain("data-member-admin-dirty-confirm");
    expect(src).toContain("data-member-admin-dialog-error");
    expect(src).not.toContain("location.reload");
    expect(src).not.toContain("router.refresh");
    expect(src).not.toMatch(/setTimeout\([^)]*onCancel/);
  });

  it("dirty close copy SSOT matches Owner Korean", () => {
    const copy = memberAdminDirtyCloseCopy();
    expect(copy).toEqual({
      title: MEMBER_ADMIN_COPY.dirty_close_title,
      description: MEMBER_ADMIN_COPY.dirty_close_description,
      stayLabel: MEMBER_ADMIN_COPY.continue_editing,
      discardLabel: MEMBER_ADMIN_COPY.discard_changes,
    });
  });
});

describe("P1 Member Admin ActionPolicy", () => {
  it("ACTIVE exposes warn / suspend / block", () => {
    const enabled = listEnabledMemberAdminActions(ctx("ACTIVE")).map((a) => a.id);
    expect(enabled).toEqual(expect.arrayContaining(["warn", "suspend", "block"]));
    expect(enabled).not.toContain("unsuspend");
    expect(enabled).not.toContain("unblock");
  });

  it("SUSPENDED exposes warn / unsuspend / block", () => {
    const enabled = listEnabledMemberAdminActions(ctx("SUSPENDED")).map((a) => a.id);
    expect(enabled).toEqual(expect.arrayContaining(["warn", "unsuspend", "block"]));
    expect(enabled).not.toContain("suspend");
    expect(enabled).not.toContain("unblock");
  });

  it("BLOCKED exposes unblock only among moderation transitions", () => {
    const enabled = listEnabledMemberAdminActions(ctx("BLOCKED")).map((a) => a.id);
    expect(enabled).toContain("unblock");
    expect(enabled).not.toContain("warn");
    expect(enabled).not.toContain("suspend");
    expect(enabled).not.toContain("block");
  });

  it("WITHDRAWN has no suspend/block/unblock", () => {
    const visible = listVisibleMemberAdminActions(ctx("WITHDRAWN")).map((a) => a.id);
    expect(visible).not.toContain("suspend");
    expect(visible).not.toContain("block");
    expect(visible).not.toContain("unblock");
    expect(visible).not.toContain("warn");
  });

  it("PURGED has no normal moderation actions", () => {
    const enabled = listEnabledMemberAdminActions(ctx("PURGED")).map((a) => a.id);
    expect(enabled).not.toContain("warn");
    expect(enabled).not.toContain("suspend");
    expect(enabled).not.toContain("block");
    expect(enabled).not.toContain("edit_profile");
    expect(enabled).toContain("ops_history");
  });

  it("password only when contract supports; store only with relationship", () => {
    const noPw = resolveMemberAdminActionPolicy(
      ctx("ACTIVE", { passwordResetSupported: false }),
    ).find((a) => a.id === "manage_password");
    expect(noPw?.visible).toBe(false);

    const withStore = resolveMemberAdminActionPolicy(
      ctx("ACTIVE", { hasStoreRelationship: true }),
    ).find((a) => a.id === "manage_store");
    expect(withStore?.visible).toBe(true);
    expect(withStore?.enabled).toBe(true);

    const noStore = resolveMemberAdminActionPolicy(
      ctx("ACTIVE", { hasStoreRelationship: false }),
    ).find((a) => a.id === "manage_store");
    expect(noStore?.visible).toBe(false);
  });

  it("operator authorization gates privilege and moderation", () => {
    const noPriv = resolveMemberAdminActionPolicy(
      ctx("ACTIVE", {
        operator: { ...fullOp, canManagePrivilege: false },
      }),
    ).find((a) => a.id === "manage_privilege");
    expect(noPriv?.visible).toBe(false);

    const noMod = listEnabledMemberAdminActions(
      ctx("ACTIVE", {
        operator: { ...fullOp, canModerate: false },
      }),
    ).map((a) => a.id);
    expect(noMod).not.toContain("warn");
    expect(noMod).not.toContain("suspend");
    expect(noMod).not.toContain("block");

    const superTarget = listEnabledMemberAdminActions(
      ctx("ACTIVE", {
        operator: { ...fullOp, targetIsSuperAdmin: true },
      }),
    ).map((a) => a.id);
    expect(superTarget).not.toContain("block");
  });

  it("legacy moderation CTA projection stays compatible", () => {
    expect(memberModerationActionsForStatus("normal")).toEqual(["warn", "suspend", "ban"]);
    expect(memberModerationActionsForStatus("suspended")).toEqual(["restore", "ban"]);
    expect(memberModerationActionsForStatus("blocked")).toEqual(["restore"]);
    expect(memberModerationActionsForStatus("withdrawn")).toEqual([]);
    expect(memberModerationActionIdsFromPolicy("ACTIVE")).toEqual(["warn", "suspend", "ban"]);
  });

  it("normalize lifecycle does not expose schema names to UI labels", () => {
    expect(normalizeMemberAdminLifecycle("verified_user")).toBe("ACTIVE");
    expect(normalizeMemberAdminLifecycle("banned")).toBe("BLOCKED");
    expect(memberAdminLifecycleLabelKo("BLOCKED")).toBe("이용 차단");
    expect(memberAdminLifecycleLabelKo("SUSPENDED")).toBe("이용 정지");
  });
});

describe("P1 Korean Copy SSOT", () => {
  it("covers required operator labels", () => {
    expect(memberAdminCopy("member_management")).toBe("회원 관리");
    expect(memberAdminCopy("member_register")).toBe("회원 등록");
    expect(memberAdminCopy("edit_profile")).toBe("정보 수정");
    expect(memberAdminCopy("password_manage")).toBe("비밀번호 관리");
    expect(memberAdminCopy("store_ops")).toBe("매장 운영");
    expect(memberAdminCopy("admin_privilege")).toBe("관리 권한");
    expect(memberAdminCopy("status_active")).toBe("정상 이용");
    expect(memberAdminCopy("status_suspended")).toBe("이용 정지");
    expect(memberAdminCopy("status_unsuspend")).toBe("정지 해제");
    expect(memberAdminCopy("status_blocked")).toBe("이용 차단");
    expect(memberAdminCopy("status_unblock")).toBe("차단 해제");
    expect(memberAdminCopy("status_withdrawn")).toBe("탈퇴 완료");
    expect(memberAdminCopy("ops_history")).toBe("운영 이력");
    expect(memberAdminCopy("moderation")).toBe("신고·제재");
  });

  it("rejects forbidden developer terminology on operator surfaces", () => {
    expect(findForbiddenOperatorTerms("profiles.status = blocked")).toContain("profiles");
    expect(findForbiddenOperatorTerms("이용 차단")).toEqual([]);
    expect(() => assertNoForbiddenOperatorTerms("ban_duration missing")).toThrow(
      /Forbidden operator terminology/,
    );
    for (const value of Object.values(MEMBER_ADMIN_COPY)) {
      assertNoForbiddenOperatorTerms(value);
    }
  });

  it("ActionPolicy labels use Korean only", () => {
    for (const lifecycle of ["ACTIVE", "SUSPENDED", "BLOCKED", "WITHDRAWN", "PURGED"] as const) {
      for (const a of resolveMemberAdminActionPolicy(ctx(lifecycle))) {
        assertNoForbiddenOperatorTerms(a.labelKo);
        expect(a.labelKo).not.toMatch(/^[A-Z_]+$/);
      }
    }
  });
});
