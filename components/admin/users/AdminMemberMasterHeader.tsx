"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useAdminMe } from "@/hooks/useAdminMe";
import { adminMemberMessengerHref } from "@/lib/admin-users/admin-member-messenger-link";
import { memberNoteComposeHref } from "@/lib/admin-users/member-deep-links";
import {
  memberModerationActionsForStatus,
  type MemberModerationAction,
} from "@/lib/admin-users/member-moderation-cta";
import {
  adminMembershipRoleFromRow,
  resolveAdminMemberRoleBadges,
  type AdminMemberRoleBadge,
} from "@/lib/admin-users/member-role-badges";
import { formatPhMobileDisplay } from "@/lib/utils/ph-mobile";
import type { AdminUser } from "@/lib/types/admin-user";
import type { MessageKey } from "@/lib/i18n/messages";
import { EditMemberForm } from "./EditMemberForm";
import {
  displayNameForDetailUser,
  formatAdminLiteDate,
  formatAdminLiteDateTime,
  memberRoleBadgeClass,
  publicIdForDetailUser,
  statusBadgeClass,
  statusCategoryForDetailUser,
} from "./admin-user-lite-display";
import type {
  AdminPersonMembershipRow,
  AdminPersonStoreRow,
  AdminUserDetailPayload,
} from "./AdminTestUserDetail";
import { ADMIN_USERS_LITE_BTN_OUTLINE_PRIMARY } from "@/lib/ui/admin-users-lite-styles";

const ROLE_BADGE_LABEL_KEYS: Record<AdminMemberRoleBadge, MessageKey> = {
  member: "admin_users_role_badge_member",
  store_owner: "admin_users_role_badge_store_owner",
  admin: "admin_users_lite_role_admin",
  super_admin: "admin_users_lite_role_super_admin",
};

const STATUS_LABEL_KEYS = {
  active: "admin_users_lite_status_active",
  needs_review: "admin_users_lite_status_needs_review",
  suspended: "admin_users_lite_status_suspended",
  deleted: "admin_users_lite_status_deleted",
} as const;

const MOD_LABEL: Record<MemberModerationAction, { ko: string; en: string }> = {
  warn: { ko: "경고", en: "Warn" },
  suspend: { ko: "정지", en: "Suspend" },
  ban: { ko: "차단", en: "Ban" },
  restore: { ko: "복원", en: "Restore" },
};

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
  onEditPermissions,
}: {
  user: AdminUserDetailPayload;
  stores: AdminPersonStoreRow[];
  adminMembership: AdminPersonMembershipRow | null;
  onUpdated?: () => void;
  onEditPermissions?: () => void;
}) {
  const { t, safeT, language } = useI18n();
  const router = useRouter();
  const { isSuperAdmin } = useAdminMe();
  const locale = language === "en" ? "en-US" : "ko-KR";
  const empty = t("admin_users_empty_placeholder");
  const display = displayNameForDetailUser(user);
  const publicId = publicIdForDetailUser(user);
  const statusCategory = statusCategoryForDetailUser(user);
  const roleBadges = resolveAdminMemberRoleBadges({
    hasStoreOwnership: stores.length > 0,
    adminMembershipRole: adminMembershipRoleFromRow(adminMembership?.role),
  });
  const actions = memberModerationActionsForStatus(user.moderation_status);
  const [showEdit, setShowEdit] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const editUser = useMemo(() => toEditUser(user, display), [user, display]);
  const phone = formatPhMobileDisplay(user.contact_phone ?? "") || user.contact_phone?.trim() || empty;
  const isAdmin = Boolean(adminMembership);

  const runModeration = useCallback(
    async (action: MemberModerationAction) => {
      const reason = window.prompt(
        safeT("admin_users_cc_moderation_confirm", {
          fallbackKo: "이 조치를 실행할까요? 사유를 입력하세요.",
          fallbackEn: "Run this action? Enter a reason.",
        }),
      );
      if (!reason?.trim()) return;
      setBusy(true);
      try {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/moderation`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            reason: reason.trim(),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || data.ok === false) {
          window.alert(data.error ?? t("admin_users_action_failed"));
          return;
        }
        onUpdated?.();
      } finally {
        setBusy(false);
        setShowManage(false);
      }
    },
    [onUpdated, safeT, t, user.id],
  );

  const runWithdraw = useCallback(async () => {
    const reason = window.prompt(
      safeT("admin_users_delete_reason_prompt", {
        fallbackKo: "삭제 사유를 입력해 주세요.",
        fallbackEn: "Enter a reason for deletion.",
      }),
    );
    if (!reason?.trim()) return;
    const typed = window.prompt(
      safeT("admin_users_delete_confirm_nickname_prompt", {
        fallbackKo: `확인을 위해 「${display}」을 입력해 주세요.`,
        fallbackEn: `Type「${display}」 to confirm.`,
      }),
    );
    if (!typed?.trim() || typed.trim() !== display) return;
    if (
      !window.confirm(
        safeT("admin_users_lite_delete_confirm", {
          fallbackKo: "이 회원을 탈퇴 처리(개인정보 익명화)하시겠습니까?",
          fallbackEn: "Withdraw this member and anonymize their personal data?",
        }),
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/delete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "withdraw", reason: reason.trim(), confirmNickname: typed.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !data.ok) {
        window.alert(data.message ?? data.error ?? t("admin_users_action_failed"));
        return;
      }
      window.location.href = "/admin/users";
    } finally {
      setBusy(false);
    }
  }, [display, safeT, t, user.id]);

  return (
    <div className="rounded-lg border border-[#e4e7ec] bg-white px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#eff6ff] text-lg font-bold text-[#2563eb]">
            {display.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold text-[#101828]">{display}</h1>
              {publicId ? <span className="text-[13px] font-medium text-[#475467]">{publicId}</span> : null}
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(statusCategory)}`}>
                {t(STATUS_LABEL_KEYS[statusCategory])}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {roleBadges.map((badge) => (
                <span
                  key={badge}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${memberRoleBadgeClass(badge)}`}
                >
                  {t(ROLE_BADGE_LABEL_KEYS[badge])}
                </span>
              ))}
            </div>
            <p className="text-[13px] text-[#344054]">
              {t("admin_users_lite_label_phone")} {phone}
              {" · "}
              {t("admin_users_label_email")} {user.email?.trim() || t("admin_users_lite_no_email")}
            </p>
            <p className="text-[13px] text-[#344054]">
              {t("admin_users_col_region")} {user.region_name?.trim() || empty}
              {" · "}
              {t("admin_users_col_joined")} {formatAdminLiteDate(user.created_at, locale, empty)}
              {" · "}
              {t("admin_users_col_last_login")} {formatAdminLiteDateTime(user.last_login_at, locale, empty)}
            </p>
            <p className="flex flex-wrap items-center gap-2 text-[11px] text-[#98a2b3]">
              <span>UUID {user.id}</span>
              <button
                type="button"
                className="rounded border border-[#d0d5dd] px-1.5 py-0.5 text-[11px] font-semibold text-[#2563eb]"
                onClick={() => {
                  void navigator.clipboard.writeText(user.id).catch(() => {});
                }}
              >
                {t("admin_users_action_copy_uuid")}
              </button>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={memberNoteComposeHref(user.id)} className={ADMIN_USERS_LITE_BTN_OUTLINE_PRIMARY}>
            {t("admin_users_cc_cta_send_note")}
          </a>
          <button
            type="button"
            className={ADMIN_USERS_LITE_BTN_OUTLINE_PRIMARY}
            onClick={() => router.push(adminMemberMessengerHref(user.id))}
          >
            {t("admin_users_cc_cta_messenger_view")}
          </button>
          <button type="button" className={ADMIN_USERS_LITE_BTN_OUTLINE_PRIMARY} onClick={() => setShowEdit(true)}>
            {t("admin_users_lite_action_edit_info")}
          </button>
          <div className="relative">
            <button
              type="button"
              className={ADMIN_USERS_LITE_BTN_OUTLINE_PRIMARY}
              disabled={busy}
              onClick={() => setShowManage((v) => !v)}
            >
              {t("admin_users_lite_detail_actions")} ▾
            </button>
            {showManage ? (
              <div className="absolute right-0 z-30 mt-1 min-w-[160px] rounded-md border border-[#e4e7ec] bg-white py-1 text-[13px] shadow-md">
                {actions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    className={`block w-full px-3 py-1.5 text-left hover:bg-[#f9fafb] ${
                      action === "ban" || action === "suspend" ? "text-[#b42318]" : "text-[#344054]"
                    }`}
                    onClick={() => void runModeration(action)}
                  >
                    {language === "en" ? MOD_LABEL[action].en : MOD_LABEL[action].ko}
                  </button>
                ))}
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-[#b42318] hover:bg-[#fef3f2]"
                  onClick={() => void runWithdraw()}
                >
                  {t("admin_users_lite_delete_account")}
                </button>
                {isAdmin && isSuperAdmin && onEditPermissions ? (
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-[#344054] hover:bg-[#f9fafb]"
                    onClick={() => {
                      setShowManage(false);
                      onEditPermissions();
                    }}
                  >
                    {safeT("admin_users_cta_edit_permissions", { fallbackKo: "권한 관리", fallbackEn: "Edit permissions" })}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
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
    </div>
  );
}
