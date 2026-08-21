"use client";

import { dibayAlert, dibayConfirm } from "@/components/ui/dibay-overlay";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Circle,
  MessageSquare,
  Pencil,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { adminMemberMessengerHref } from "@/lib/admin-users/admin-member-messenger-link";
import { formatPhMobileDisplay } from "@/lib/utils/ph-mobile";
import { EditMemberForm } from "./EditMemberForm";
import { AdminUserProviderIcon } from "./AdminUserProviderIcon";
import { AdminUserTrustSection } from "./AdminUserTrustSection";
import { AdminUserPointsSection } from "./AdminUserPointsSection";
import {
  ADMIN_USERS_LITE_BTN_OUTLINE_PRIMARY,
  ADMIN_USERS_LITE_CARD,
  ADMIN_USERS_LITE_PAGE_BG,
} from "@/lib/ui/admin-users-lite-styles";
import {
  displayNameForDetailUser,
  formatAdminLiteDate,
  formatAdminLiteDateTime,
  memberRoleBadgeClass,
  publicIdForDetailUser,
  resolveDetailAuthProvider,
  statusBadgeClass,
  statusCategoryForDetailUser,
} from "./admin-user-lite-display";
import {
  adminMembershipRoleFromRow,
  resolveAdminMemberRoleBadges,
  type AdminMemberRoleBadge,
} from "@/lib/admin-users/member-role-badges";
import type { AdminAuthProvider, AdminUser, MemberType } from "@/lib/types/admin-user";
import type { ModerationStatus } from "@/lib/types/report";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";

/** GET /api/admin/users/:id `user` 페이로드 (profiles SSOT + hasProfile 계약) */
export type AdminUserDetailPayload = {
  id: string;
  username: string | null;
  dibay_id?: string | null;
  email?: string | null;
  role: string;
  display_name: string | null;
  nickname?: string | null;
  contact_phone?: string | null;
  phone_verified?: boolean;
  phone_verified_at?: string | null;
  phone_verification_status?: string;
  member_status?: string | null;
  verified_member_at?: string | null;
  member_type?: string | null;
  status?: string | null;
  moderation_status?: string;
  created_at: string | null;
  last_login_at?: string | null;
  region_name?: string | null;
  hasProfile?: boolean;
  /** User Facts Trust SSOT — profiles.trust_score */
  trust_score?: number | null;
};

export type AdminPersonStoreRow = {
  id: string;
  store_name?: string | null;
  slug?: string | null;
  approval_status?: string | null;
  is_visible?: boolean | null;
  created_at?: string | null;
};

export type AdminPersonMembershipRow = {
  id: string;
  role: string;
  status: string;
  admin_tier?: string | null;
  granted_at?: string | null;
  bootstrap_seed?: boolean | null;
};

const PROVIDER_LABEL_KEYS: Record<AdminAuthProvider, MessageKey> = {
  google: "admin_user_provider_google",
  kakao: "admin_user_provider_kakao",
  naver: "admin_user_provider_naver",
  apple: "admin_user_provider_apple",
  facebook: "admin_user_provider_facebook",
  email: "admin_user_provider_email",
  manual: "admin_user_provider_manual",
  unknown: "admin_user_provider_unknown",
};

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

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

function deriveMemberType(user: AdminUserDetailPayload): MemberType {
  const memberType = String(user.member_type ?? "").trim().toLowerCase();
  return memberType === "premium" || memberType === "special" ? "premium" : "normal";
}

function detailUserToAdminUser(user: AdminUserDetailPayload, display: string): AdminUser {
  return {
    id: user.id,
    nickname: display,
    username: user.username,
    dibay_id: user.dibay_id,
    email: user.email ?? undefined,
    phone: user.contact_phone ?? undefined,
    memberType: deriveMemberType(user),
    moderationStatus: (user.moderation_status ?? "normal") as ModerationStatus,
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

function contactPhoneDisplay(raw: string | null | undefined): string {
  const value = raw?.trim() ?? "";
  if (!value) return "";
  return formatPhMobileDisplay(value) || value;
}

function providerAccountLabel(provider: AdminAuthProvider, t: (key: MessageKey) => string): string {
  const name = t(PROVIDER_LABEL_KEYS[provider] ?? PROVIDER_LABEL_KEYS.unknown);
  if (provider === "unknown") return name;
  return `${name} ${t("admin_users_lite_provider_account_suffix")}`;
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={`${ADMIN_USERS_LITE_CARD} flex h-full flex-col`}>
      <div className="border-b border-[#eaecf0] px-5 py-4">
        <h2 className="text-sm font-bold text-[#101828]">{title}</h2>
      </div>
      <div className="flex-1 p-5">{children}</div>
    </div>
  );
}

function FieldRow({
  label,
  value,
  action,
}: {
  label: string;
  value: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#f2f4f7] py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-[#667085]">{label}</p>
        <p className="mt-1 text-sm font-semibold text-[#101828]">{value}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function VerifyRow({
  label,
  done,
  doneLabel,
  pendingLabel,
}: {
  label: string;
  done: boolean;
  doneLabel: string;
  pendingLabel: string;
}) {
  return (
    <div className="flex items-center gap-2 py-2 text-sm font-medium text-[#344054]">
      {done ? (
        <CheckCircle2 className="h-4 w-4 text-[#12b76a]" aria-hidden />
      ) : (
        <Circle className="h-4 w-4 text-[#d0d5dd]" aria-hidden />
      )}
      <span>{label}</span>
      <span className={`ml-auto text-xs font-semibold ${done ? "text-[#067647]" : "text-[#98a2b3]"}`}>
        {done ? doneLabel : pendingLabel}
      </span>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  tone = "default",
  disabled = false,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  tone?: "default" | "warn" | "danger";
  disabled?: boolean;
  onClick?: () => void;
}) {
  const toneClass =
    tone === "danger"
      ? "border-[#fecdca] text-[#b42318] hover:bg-[#fef3f2]"
      : tone === "warn"
        ? "border-[#fdead7] text-[#c4320a] hover:bg-[#fff6ed]"
        : "border-[#d0d5dd] text-[#344054] hover:bg-[#f9fafb]";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg border bg-white px-4 py-3 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
    >
      <span className="text-[#667085]">{icon}</span>
      {label}
    </button>
  );
}

export function AdminMemberDetail({
  user,
  stores = [],
  adminMembership = null,
  activityStatus: _activityStatus = "not_implemented",
  presentation = "page",
  hideLedgerSections = false,
  onUpdated,
  onSendMessage,
  onDeleted,
}: {
  user: AdminUserDetailPayload;
  stores?: AdminPersonStoreRow[];
  adminMembership?: AdminPersonMembershipRow | null;
  activityStatus?: "not_implemented" | "ok";
  presentation?: "page" | "modal";
  hideLedgerSections?: boolean;
  onUpdated?: () => void;
  onSendMessage?: (userId: string) => void;
  onDeleted?: () => void;
}) {
  const { t, language, safeT } = useI18n();
  const router = useRouter();
  const dateLocale = dateLocaleTag(language);
  const emptyDash = t("admin_users_empty_placeholder");
  const [showEdit, setShowEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const display = displayNameForDetailUser(user);
  const publicId = publicIdForDetailUser(user);
  const roleBadges = resolveAdminMemberRoleBadges({
    hasStoreOwnership: stores.length > 0,
    adminMembershipRole: adminMembershipRoleFromRow(adminMembership?.role),
  });
  const statusCategory = statusCategoryForDetailUser(user);
  const authProvider = resolveDetailAuthProvider(user.email);
  const isReadOnly = user.hasProfile === false;
  const editUser = useMemo(() => detailUserToAdminUser(user, display), [user, display]);

  const phoneDisplay = contactPhoneDisplay(user.contact_phone) || emptyDash;
  const joinedAt = formatAdminLiteDate(user.created_at, dateLocale, emptyDash);
  const updatedAt = emptyDash;
  const lastLogin = formatAdminLiteDateTime(user.last_login_at, dateLocale, emptyDash);
  const emailVerified = Boolean(user.verified_member_at);

  const onEditSuccess = useCallback(() => {
    setShowEdit(false);
    if (presentation === "modal") {
      onUpdated?.();
      return;
    }
    window.location.reload();
  }, [onUpdated, presentation]);

  const handleSendMessage = useCallback(() => {
    if (onSendMessage) {
      onSendMessage(user.id);
      return;
    }
    router.push(adminMemberMessengerHref(user.id));
  }, [onSendMessage, router, user.id]);

  const handleDelete = useCallback(async () => {
    if (
      !(await dibayConfirm({
        title: safeT("admin_users_lite_delete_confirm", {
          fallbackKo: "이 회원을 탈퇴 처리(개인정보 익명화)하시겠습니까?",
          fallbackEn: "Withdraw this member and anonymize their personal data?",
        }),
        confirmTone: "destructive",
      }))
    ) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/delete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "withdraw", reason: "admin_withdraw" }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !data.ok) {
        await dibayAlert({ title: data.message ?? data.error ?? t("admin_users_action_failed") });
        return;
      }
      if (presentation === "modal") {
        onDeleted?.();
        return;
      }
      window.location.href = "/admin/users";
    } catch {
      await dibayAlert({ title: t("admin_users_error_network") });
    } finally {
      setDeleting(false);
    }
  }, [onDeleted, presentation, safeT, t, user.id]);

  const handlePurge = useCallback(async () => {
    if (
      !(await dibayConfirm({
        title: safeT("admin_users_purge_confirm", {
          fallbackKo: "이 회원을 영구 삭제하시겠습니까? 되돌릴 수 없습니다.",
          fallbackEn: "Permanently delete this member? This cannot be undone.",
        }),
        confirmTone: "destructive",
      }))
    ) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/delete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "purge", reason: "admin_permanent_delete" }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        blockers?: string[];
      };
      if (!res.ok || !data.ok) {
        const blockerText =
          Array.isArray(data.blockers) && data.blockers.length > 0 ? `\n${data.blockers.join(", ")}` : "";
        await dibayAlert({
          title: `${data.message ?? data.error ?? t("admin_users_action_failed")}${blockerText}`,
        });
        return;
      }
      if (presentation === "modal") {
        onDeleted?.();
        return;
      }
      window.location.href = "/admin/users";
    } catch {
      await dibayAlert({ title: t("admin_users_error_network") });
    } finally {
      setDeleting(false);
    }
  }, [onDeleted, presentation, safeT, t, user.id]);

  const editFieldBtn = (
    <button
      type="button"
      onClick={() => setShowEdit(true)}
      className="rounded-md border border-[#d0d5dd] px-2 py-1 text-xs font-semibold text-[#2563eb] hover:bg-[#f9fafb]"
    >
      {t("admin_users_action_edit")}
    </button>
  );

  const changeBtn = (
    <button
      type="button"
      disabled
      title={t("admin_users_lite_action_todo")}
      className="rounded-md border border-[#d0d5dd] px-2 py-1 text-xs font-semibold text-[#667085] disabled:opacity-60"
    >
      {t("admin_users_lite_change_role")}
    </button>
  );

  const content = (
    <>
      {presentation === "page" ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <nav className="text-xs font-medium text-[#667085]" aria-label="Breadcrumb">
              <span>{t("admin_users_lite_breadcrumb_members")}</span>
              <span className="mx-1.5 text-[#98a2b3]">›</span>
              <Link href="/admin/users" className="hover:text-[#344054]">
                {t("admin_users_lite_list_title")}
              </Link>
              <span className="mx-1.5 text-[#98a2b3]">›</span>
              <span className="text-[#344054]">{t("admin_users_detail_title")}</span>
            </nav>
            <Link href="/admin/users" className={ADMIN_USERS_LITE_BTN_OUTLINE_PRIMARY}>
              {t("admin_users_lite_back_to_list")}
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-[#101828]">{t("admin_users_detail_title")}</h1>
        </>
      ) : null}

      {isReadOnly ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950" role="status">
          <span className="font-semibold">{t("admin_users_profile_not_created")}</span>
          <span className="mx-1.5">·</span>
          <span>{t("admin_users_readonly")}</span>
        </div>
      ) : null}

      <div className={`${ADMIN_USERS_LITE_CARD} p-5`}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#eff6ff] text-3xl font-bold text-[#2563eb]">
              {display.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 space-y-1">
              <h2 className="text-xl font-bold text-[#101828]">{display}</h2>
              {publicId ? <p className="text-sm font-medium text-[#667085]">{publicId}</p> : null}
              <p className="flex flex-wrap items-center gap-2 font-mono text-xs text-[#667085]">
                <span className="break-all">{user.id}</span>
                <button
                  type="button"
                  className="rounded-md border border-[#d0d5dd] px-2 py-0.5 text-[11px] font-semibold text-[#2563eb] hover:bg-[#f9fafb]"
                  onClick={() => {
                    void navigator.clipboard.writeText(user.id).catch(() => {});
                  }}
                >
                  {t("admin_users_action_copy_uuid")}
                </button>
              </p>
              <p className="text-sm text-[#475467]">{user.email?.trim() || t("admin_users_lite_no_email")}</p>
              <p className="text-sm text-[#475467]">{phoneDisplay}</p>
              <p className="inline-flex items-center gap-2 text-sm font-medium text-[#344054]">
                <AdminUserProviderIcon provider={authProvider} />
                {providerAccountLabel(authProvider, t)}
              </p>
            </div>
          </div>
          <div className="shrink-0 space-y-3 lg:text-right">
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClass(statusCategory)}`}>
                {t(STATUS_LABEL_KEYS[statusCategory])}
              </span>
              {roleBadges.map((badge) => (
                <span
                  key={badge}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${memberRoleBadgeClass(badge)}`}
                >
                  {t(ROLE_BADGE_LABEL_KEYS[badge])}
                </span>
              ))}
            </div>
            <div className="space-y-1 text-xs text-[#667085]">
              <p>
                {t("admin_users_col_joined")}: <span className="font-semibold text-[#344054]">{joinedAt}</span>
              </p>
              <p>
                {t("admin_users_col_last_login")}:{" "}
                <span className="font-semibold text-[#344054]">{lastLogin}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DetailCard title={t("admin_users_card_basic_info")}>
          <FieldRow
            label={t("admin_users_label_nickname")}
            value={display}
            action={
              !isReadOnly ? (
                <button
                  type="button"
                  onClick={() => setShowEdit(true)}
                  className="rounded-md border border-[#d0d5dd] px-2 py-1 text-xs font-semibold text-[#2563eb]"
                >
                  {t("admin_users_action_edit")}
                </button>
              ) : undefined
            }
          />
          <FieldRow
            label={t("admin_users_lite_label_public_id")}
            value={publicId || emptyDash}
            action={!isReadOnly ? editFieldBtn : undefined}
          />
          <FieldRow
            label={t("admin_users_label_email")}
            value={user.email?.trim() || emptyDash}
            action={!isReadOnly ? editFieldBtn : undefined}
          />
          <FieldRow
            label={t("admin_users_lite_label_phone")}
            value={phoneDisplay}
            action={!isReadOnly ? editFieldBtn : undefined}
          />
          <FieldRow label={t("admin_users_lite_join_method_label")} value={providerAccountLabel(authProvider, t)} />
          <FieldRow label={t("admin_users_col_joined")} value={joinedAt} />
          <FieldRow label={t("admin_users_lite_label_updated_at")} value={updatedAt} />
        </DetailCard>

        <DetailCard title={t("admin_users_lite_detail_role_status")}>
          <FieldRow
            label={t("admin_users_lite_col_role")}
            value={roleBadges.map((badge) => t(ROLE_BADGE_LABEL_KEYS[badge])).join(" · ")}
            action={changeBtn}
          />
          <FieldRow label={t("admin_users_lite_col_status")} value={t(STATUS_LABEL_KEYS[statusCategory])} action={changeBtn} />
          <div className="mt-2 border-t border-[#f2f4f7] pt-2">
            <VerifyRow
              label={t("admin_users_lite_label_phone_verified")}
              done={user.phone_verified === true}
              doneLabel={t("admin_users_lite_verified_done")}
              pendingLabel={t("admin_users_lite_verified_pending")}
            />
            <VerifyRow
              label={t("admin_users_lite_email_verified")}
              done={emailVerified}
              doneLabel={t("admin_users_lite_verified_done")}
              pendingLabel={t("admin_users_lite_verified_pending")}
            />
            <VerifyRow
              label={t("admin_users_lite_label_account_verified")}
              done={Boolean(user.verified_member_at)}
              doneLabel={t("admin_users_lite_verified_done")}
              pendingLabel={t("admin_users_lite_verified_pending")}
            />
          </div>
        </DetailCard>

        {hideLedgerSections ? null : (
          <AdminUserTrustSection
            userId={user.id}
            initialTrustScore={user.trust_score}
            readOnly={isReadOnly}
            onUpdated={onUpdated}
          />
        )}

        <DetailCard title={t("admin_users_lite_card_store_relation")}>
          {stores.length === 0 ? (
            <p className="text-sm text-[#667085]">{t("admin_users_lite_store_relation_empty")}</p>
          ) : (
            <ul className="space-y-3">
              {stores.map((store) => (
                <li key={store.id} className="border-b border-[#f2f4f7] pb-3 last:border-b-0 last:pb-0">
                  <p className="text-sm font-semibold text-[#101828]">
                    {store.store_name?.trim() || store.slug?.trim() || store.id}
                  </p>
                  <p className="mt-1 text-xs text-[#667085]">
                    {store.approval_status ?? emptyDash}
                    {store.slug ? ` · /${store.slug}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </DetailCard>

        <DetailCard title={t("admin_users_lite_card_admin_membership")}>
          {adminMembership ? (
            <>
              <FieldRow label={t("admin_users_lite_col_role")} value={adminMembership.role} />
              <FieldRow
                label={t("admin_users_lite_col_status")}
                value={adminMembership.status}
              />
              <FieldRow
                label={t("admin_users_lite_membership_granted_at")}
                value={
                  adminMembership.granted_at
                    ? formatAdminLiteDateTime(adminMembership.granted_at, dateLocale, emptyDash)
                    : emptyDash
                }
              />
            </>
          ) : (
            <p className="text-sm text-[#667085]">{t("admin_users_lite_admin_membership_empty")}</p>
          )}
        </DetailCard>

        <DetailCard title={t("admin_users_lite_card_activity")}>
          <p className="text-sm text-[#667085]">{t("admin_users_lite_activity_not_implemented")}</p>
        </DetailCard>

        {hideLedgerSections ? null : (
          <div className="mt-4">
            <AdminUserPointsSection userId={user.id} />
          </div>
        )}

        {!isReadOnly ? (
          <DetailCard title={t("admin_users_lite_detail_actions")}>
            <div className="space-y-2">
              <ActionButton
                label={t("admin_users_lite_action_edit_info")}
                icon={<Pencil className="h-4 w-4" />}
                onClick={() => setShowEdit(true)}
              />
              <ActionButton
                label={t("admin_users_lite_send_notify")}
                icon={<Bell className="h-4 w-4" />}
                disabled
              />
              <ActionButton
                label={t("admin_users_lite_send_message")}
                icon={<MessageSquare className="h-4 w-4" />}
                onClick={handleSendMessage}
              />
              <ActionButton
                label={t("admin_users_lite_suspend_account")}
                icon={<ShieldAlert className="h-4 w-4" />}
                tone="warn"
                disabled
              />
              <ActionButton
                label={safeT("admin_users_lite_withdraw_account", {
                  fallbackKo: "탈퇴 처리(익명화)",
                  fallbackEn: "Withdraw (anonymize)",
                })}
                icon={<Trash2 className="h-4 w-4" />}
                tone="danger"
                disabled={deleting}
                onClick={() => void handleDelete()}
              />
              <ActionButton
                label={safeT("admin_users_purge_account", {
                  fallbackKo: "영구 삭제",
                  fallbackEn: "Permanent delete",
                })}
                icon={<Trash2 className="h-4 w-4" />}
                tone="danger"
                disabled={deleting}
                onClick={() => void handlePurge()}
              />
            </div>
          </DetailCard>
        ) : null}
      </div>

      {showEdit ? (
        <EditMemberForm user={editUser} onClose={() => setShowEdit(false)} onSuccess={onEditSuccess} />
      ) : null}
    </>
  );

  if (presentation === "modal") {
    return <div className="space-y-4">{content}</div>;
  }

  return <div className={`${ADMIN_USERS_LITE_PAGE_BG} space-y-4 pb-6`}>{content}</div>;
}
