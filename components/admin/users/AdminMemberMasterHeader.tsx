"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useAdminMe } from "@/hooks/useAdminMe";
import { adminMemberMessengerHref } from "@/lib/admin-users/admin-member-messenger-link";
import {
  MEMBER_DETAIL_EDIT_CTA_KO,
  MEMBER_DETAIL_PASSWORD_CTA_KO,
  MEMBER_DETAIL_SYSTEM_KEY_KO,
  memberDetailPrimaryActions,
  memberDetailSignupOriginLabelKo,
  memberDetailStoreHref,
  resolveMemberDetailActionPolicy,
} from "@/lib/admin-users/member-detail-presentation";
import {
  memberAdminBadgeClassName,
  memberDetailContactEmail,
  memberDetailLoginIdLabel,
  memberDetailNicknameIfDistinct,
  resolveMemberDetailHeaderBadges,
} from "@/lib/admin-users/member-detail-control-center-ia";
import { memberAdminCtaClass, MEMBER_ADMIN_TYPOGRAPHY_CLASS } from "@/lib/admin-users/member-admin-visual-ssot";
import { adminMembershipRoleFromRow } from "@/lib/admin-users/member-role-badges";
import { formatPhMobileDisplay } from "@/lib/utils/ph-mobile";
import type { AdminUser } from "@/lib/types/admin-user";
import { EditMemberForm } from "./EditMemberForm";
import { AdminMemberPasswordDialog } from "./AdminMemberPasswordDialog";
import {
  displayNameForDetailUser,
  formatAdminLiteDate,
  formatAdminLiteDateTime,
  publicIdForDetailUser,
  resolveDetailAuthProvider,
} from "./admin-user-lite-display";
import type {
  AdminPersonMembershipRow,
  AdminPersonStoreRow,
  AdminUserDetailPayload,
} from "./AdminTestUserDetail";

function toEditUser(user: AdminUserDetailPayload, display: string): AdminUser {
  return {
    id: user.id,
    nickname: (user.nickname ?? "").trim() || display,
    displayName: display,
    username: user.username,
    loginUsername: user.username ?? undefined,
    dibay_id: user.dibay_id,
    email: user.email ?? undefined,
    phone: user.contact_phone ?? undefined,
    memberType: "normal",
    moderationStatus: (user.moderation_status ?? "normal") as AdminUser["moderationStatus"],
    productCount: 0,
    soldCount: 0,
    reviewCount: 0,
    reportCount: 0,
    chatCount: 0,
    joinedAt: user.created_at ?? new Date().toISOString(),
    profileRole: user.role,
    hasProfile: user.hasProfile,
    phoneVerified: user.phone_verified === true,
    verificationStatus: user.phone_verification_status,
    memberStatus: user.member_status ?? undefined,
  };
}

export function AdminMemberMasterHeader({
  user,
  stores,
  adminMembership,
  onUpdated,
  onOpenTab,
}: {
  user: AdminUserDetailPayload;
  stores: AdminPersonStoreRow[];
  adminMembership: AdminPersonMembershipRow | null;
  onUpdated?: () => void;
  onOpenTab?: (tab: "account" | "overview" | "store") => void;
}) {
  const { t, language } = useI18n();
  const router = useRouter();
  const { isSuperAdmin, hasPermission, loading: meLoading, snapshot } = useAdminMe();
  const locale = language === "en" ? "en-US" : "ko-KR";
  const empty = t("admin_users_empty_placeholder");
  const display = displayNameForDetailUser(user);
  const publicId = publicIdForDetailUser(user);
  const nicknameSecondary = memberDetailNicknameIfDistinct(display, user.nickname);
  const contactEmail = memberDetailContactEmail(user.email);
  const loginId = memberDetailLoginIdLabel(user.username);
  const hasStore = stores.length > 0;
  const primaryStore = stores[0] ?? null;
  const isAdmin = Boolean(adminMembership);
  const membershipRole = adminMembershipRoleFromRow(adminMembership?.role);
  const isSuper = membershipRole === "super_admin" || (isAdmin && isSuperAdmin);
  const signupOrigin = memberDetailSignupOriginLabelKo(resolveDetailAuthProvider(user.email));
  const [showEdit, setShowEdit] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordResetSupported, setPasswordResetSupported] = useState(false);
  const [showSystemKey, setShowSystemKey] = useState(false);
  const editUser = useMemo(() => toEditUser(user, display), [user, display]);

  const badges = resolveMemberDetailHeaderBadges({
    moderationStatus: user.moderation_status,
    status: user.status,
    phoneVerified: user.phone_verified,
    hasStore,
    hasAdminMembership: isAdmin,
    isSuperAdmin: isSuper,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/auth`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as { passwordResetSupported?: boolean };
        if (!cancelled) setPasswordResetSupported(data.passwordResetSupported === true);
      } catch {
        if (!cancelled) setPasswordResetSupported(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);
  const phone = formatPhMobileDisplay(user.contact_phone ?? "") || user.contact_phone?.trim() || empty;

  const canManageMember = isSuperAdmin || hasPermission("users");
  const decisions = useMemo(() => {
    if (meLoading) return [];
    return resolveMemberDetailActionPolicy({
      moderationStatus: user.moderation_status,
      status: user.status,
      operator: {
        canModerate: canManageMember,
        canEditProfile: canManageMember,
        canResetPassword: canManageMember,
        canManagePrivilege: isSuperAdmin,
        canWithdraw: canManageMember,
        canPurge: canManageMember,
        isSelf: Boolean(snapshot?.userId && snapshot.userId === user.id),
        targetIsSuperAdmin: membershipRole === "super_admin",
      },
      hasStoreRelationship: hasStore,
      passwordResetSupported,
    });
  }, [
    meLoading,
    user.moderation_status,
    user.status,
    user.id,
    canManageMember,
    isSuperAdmin,
    hasStore,
    snapshot?.userId,
    membershipRole,
    passwordResetSupported,
  ]);

  const primary = memberDetailPrimaryActions(decisions);
  const canEdit = Boolean(primary.editProfile?.visible && primary.editProfile.enabled);
  const canPassword = Boolean(primary.managePassword?.visible && primary.managePassword.enabled);

  return (
    <div className="rounded-lg border border-sam-border bg-sam-surface px-4 py-3" data-member-detail-header="1">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[color:var(--sam-brand-soft,#eff6ff)] text-lg font-bold text-[color:var(--sam-brand,#2563eb)]">
            {display.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 space-y-1">
            <h1 className={MEMBER_ADMIN_TYPOGRAPHY_CLASS.MEMBER_PRIMARY_NAME} data-member-display-name="1">
              {display}
            </h1>
            {nicknameSecondary ? (
              <p className={MEMBER_ADMIN_TYPOGRAPHY_CLASS.MEMBER_SECONDARY_NAME} data-member-nickname="1">
                {nicknameSecondary}
              </p>
            ) : null}
            {publicId ? (
              <p className={MEMBER_ADMIN_TYPOGRAPHY_CLASS.MEMBER_IDENTIFIER} data-member-public-id="1">
                {publicId}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5" data-member-orthogonal-badges="1">
              {badges.map((badge) => (
                <span
                  key={`${badge.axis}-${badge.key}`}
                  className={memberAdminBadgeClassName(badge.tone)}
                  data-member-badge-axis={badge.axis}
                  data-member-account-state={badge.axis === "account" ? "1" : undefined}
                  data-member-verification={badge.axis === "verify" ? "1" : undefined}
                  data-member-store-badge={badge.axis === "store" ? "1" : undefined}
                  data-member-admin-badge={badge.axis === "privilege" ? "1" : undefined}
                >
                  {badge.labelKo}
                </span>
              ))}
            </div>
            <p className="text-xs text-sam-muted" data-member-signup-origin="1">
              가입 경로 · {signupOrigin}
            </p>
            <p className="text-sm text-sam-fg">
              {t("admin_users_lite_label_phone")} {phone}
              {contactEmail ? (
                <>
                  {" · "}
                  연락 이메일 {contactEmail}
                </>
              ) : null}
              {loginId ? (
                <>
                  {" · "}
                  로그인 ID {loginId}
                </>
              ) : null}
            </p>
            <p className="text-sm text-sam-fg">
              {t("admin_users_col_region")} {user.region_name?.trim() || empty}
              {" · "}
              {t("admin_users_col_joined")} {formatAdminLiteDate(user.created_at, locale, empty)}
              {" · "}
              {t("admin_users_col_last_login")} {formatAdminLiteDateTime(user.last_login_at, locale, empty)}
            </p>
            <p className="flex flex-wrap items-center gap-2 text-xs text-sam-muted">
              <button
                type="button"
                className="rounded-ui-rect border border-sam-border px-1.5 py-0.5 text-xs font-medium text-sam-fg"
                onClick={() => setShowSystemKey((v) => !v)}
              >
                {MEMBER_DETAIL_SYSTEM_KEY_KO}
              </button>
              {showSystemKey ? (
                <>
                  <span className="font-mono">{user.id}</span>
                  <button
                    type="button"
                    className="rounded-ui-rect border border-sam-border px-1.5 py-0.5 text-xs font-medium text-[color:var(--sam-brand,#2563eb)]"
                    onClick={() => {
                      void navigator.clipboard.writeText(user.id).catch(() => {});
                    }}
                  >
                    {t("admin_users_action_copy_uuid")}
                  </button>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-member-primary-actions="1">
          {canEdit ? (
            <button
              type="button"
              className={memberAdminCtaClass("primary")}
              onClick={() => setShowEdit(true)}
              data-member-cta="edit"
              data-member-cta-variant="primary"
              data-member-cta-cap="CAP-PROFILE-EDIT"
            >
              {MEMBER_DETAIL_EDIT_CTA_KO}
            </button>
          ) : null}
          <button
            type="button"
            className={memberAdminCtaClass("secondary")}
            onClick={() => router.push(adminMemberMessengerHref(user.id))}
            data-member-cta="messenger"
            data-member-cta-variant="secondary"
            data-member-cta-cap="CAP-MSG-MESSENGER"
          >
            {t("admin_users_cc_cta_messenger_view")}
          </button>
          {canPassword ? (
            <button
              type="button"
              className={memberAdminCtaClass("secondary")}
              onClick={() => setShowPassword(true)}
              data-member-cta="password"
              data-member-cta-variant="secondary"
              data-member-cta-cap="CAP-PASSWORD"
            >
              {MEMBER_DETAIL_PASSWORD_CTA_KO}
            </button>
          ) : null}
          <button
            type="button"
            className={memberAdminCtaClass("tertiary")}
            onClick={() => onOpenTab?.("account")}
            data-member-cta="account_tab"
            data-member-cta-variant="tertiary"
            data-member-cta-cap="CAP-VERIFY-VIEW"
          >
            인증 관리
          </button>
          {primaryStore ? (
            <a
              href={memberDetailStoreHref(primaryStore.id)}
              className={memberAdminCtaClass("tertiary")}
              data-member-cta="store_detail"
              data-member-cta-variant="tertiary"
              data-member-cta-cap="CAP-STORE-VIEW"
            >
              매장 상세
            </a>
          ) : null}
          <button
            type="button"
            className={memberAdminCtaClass("tertiary")}
            onClick={() => onOpenTab?.("overview")}
            data-member-cta="privilege_view"
            data-member-cta-variant="tertiary"
            data-member-cta-cap="CAP-PRIV-VIEW"
          >
            관리 권한
          </button>
        </div>
      </div>
      {showEdit ? (
        <EditMemberForm
          user={editUser}
          onClose={() => setShowEdit(false)}
          onSuccess={() => {
            setShowEdit(false);
            onUpdated?.();
          }}
        />
      ) : null}
      <AdminMemberPasswordDialog
        open={showPassword}
        userId={user.id}
        onClose={() => setShowPassword(false)}
        onSuccess={() => onUpdated?.()}
      />
    </div>
  );
}
