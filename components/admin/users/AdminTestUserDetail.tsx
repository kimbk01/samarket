"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  ADMIN_USERS_LITE_BTN_OUTLINE_PRIMARY,
  ADMIN_USERS_LITE_CARD,
  ADMIN_USERS_LITE_PAGE_BG,
} from "@/lib/ui/admin-users-lite-styles";
import {
  displayNameForDetailUser,
  formatAdminLiteDate,
  formatAdminLiteDateTime,
  publicIdForDetailUser,
  resolveAccountCategoryFromRole,
  resolveDetailAuthProvider,
  roleBadgeClass,
  statusBadgeClass,
  statusCategoryForDetailUser,
} from "./admin-user-lite-display";
import type { AdminAccountCategory, AdminAuthProvider, AdminUser, MemberType } from "@/lib/types/admin-user";
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
  hasProfile?: boolean;
  /** User Facts Trust SSOT — profiles.trust_score */
  trust_score?: number | null;
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

const ROLE_LABEL_KEYS: Record<AdminAccountCategory, MessageKey> = {
  member: "admin_users_lite_role_member",
  store_manager: "admin_users_lite_role_store_manager",
  admin: "admin_users_lite_role_admin",
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
  const category = resolveAccountCategoryFromRole(user.role, user.member_type);
  if (category === "admin") return "admin";
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
  presentation = "page",
  onUpdated,
  onSendMessage,
  onDeleted,
}: {
  user: AdminUserDetailPayload;
  presentation?: "page" | "modal";
  onUpdated?: () => void;
  onSendMessage?: (userId: string) => void;
  onDeleted?: () => void;
}) {
  const { t, language, safeT } = useI18n();
  const router = useRouter();
  const dateLocale = dateLocaleTag(language);
  const emptyDash = t("admin_users_empty_placeholder");
  const [showEdit, setShowEdit] = useState(false);
  const [pointsBalance, setPointsBalance] = useState<number | null>(null);
  const [trustScore, setTrustScore] = useState<number | null>(
    user.trust_score != null && Number.isFinite(Number(user.trust_score))
      ? Number(user.trust_score)
      : null,
  );
  const [trustBusy, setTrustBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const display = displayNameForDetailUser(user);
  const publicId = publicIdForDetailUser(user);
  const accountCategory = resolveAccountCategoryFromRole(user.role, user.member_type);
  const statusCategory = statusCategoryForDetailUser(user);
  const authProvider = resolveDetailAuthProvider(user.email);
  const isReadOnly = user.hasProfile === false;
  const editUser = useMemo(() => detailUserToAdminUser(user, display), [user, display]);

  const roleLabelKey =
    String(user.role ?? "").trim().toLowerCase() === "super_admin" ||
    String(user.role ?? "").trim().toLowerCase() === "master"
      ? "admin_users_lite_role_super_admin"
      : ROLE_LABEL_KEYS[accountCategory];

  const phoneDisplay = contactPhoneDisplay(user.contact_phone) || emptyDash;
  const joinedAt = formatAdminLiteDate(user.created_at, dateLocale, emptyDash);
  const updatedAt = emptyDash;
  const lastActivity = formatAdminLiteDateTime(user.phone_verified_at ?? user.created_at, dateLocale, emptyDash);
  const emailVerified = Boolean(user.verified_member_at) || Boolean(user.email?.trim());

  useEffect(() => {
    setTrustScore(
      user.trust_score != null && Number.isFinite(Number(user.trust_score))
        ? Number(user.trust_score)
        : null,
    );
  }, [user.trust_score, user.id]);

  useEffect(() => {
    if (isReadOnly) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/points`);
        const data = (await res.json()) as { balance?: number };
        if (!cancelled) setPointsBalance(data.balance ?? 0);
      } catch {
        if (!cancelled) setPointsBalance(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isReadOnly, user.id]);

  const handleAdjustTrust = useCallback(async () => {
    const current = trustScore ?? 50;
    const raw = window.prompt(
      safeT("admin_users_trust_adjust_prompt", {
        fallbackKo: `신뢰 점수(0–100). 현재 ${current}`,
        fallbackEn: `Trust score (0–100). Current ${current}`,
      }),
      String(current),
    );
    if (raw == null) return;
    const next = Number(raw);
    if (!Number.isFinite(next)) {
      window.alert(
        safeT("admin_users_trust_adjust_invalid", {
          fallbackKo: "유효한 숫자를 입력해 주세요.",
          fallbackEn: "Enter a valid number.",
        }),
      );
      return;
    }
    const reason =
      window.prompt(
        safeT("admin_users_trust_adjust_reason", {
          fallbackKo: "조정 사유 (선택)",
          fallbackEn: "Reason (optional)",
        }),
      ) ?? "";
    setTrustBusy(true);
    try {
      const res = await fetch("/api/admin/trust-score", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: user.id,
          newScore: next,
          reason: reason.trim() || "admin_adjust",
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        trustScore?: number;
      };
      if (!res.ok || !data.ok) {
        window.alert(data.message ?? data.error ?? t("admin_users_action_failed"));
        return;
      }
      if (data.trustScore != null && Number.isFinite(Number(data.trustScore))) {
        setTrustScore(Number(data.trustScore));
      } else {
        try {
          const detailRes = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
            credentials: "include",
          });
          const detail = (await detailRes.json()) as {
            ok?: boolean;
            user?: { trust_score?: number | null };
          };
          if (detail.ok && detail.user?.trust_score != null) {
            setTrustScore(Number(detail.user.trust_score));
          } else {
            setTrustScore(next);
          }
        } catch {
          setTrustScore(next);
        }
      }
      onUpdated?.();
    } catch {
      window.alert(t("admin_users_action_failed"));
    } finally {
      setTrustBusy(false);
    }
  }, [trustScore, user.id, safeT, t, onUpdated]);

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
    const reason = window.prompt(
      safeT("admin_users_delete_reason_prompt", {
        fallbackKo: "삭제 사유를 입력해 주세요.",
        fallbackEn: "Enter a reason for deletion.",
      }),
    );
    if (!reason?.trim()) return;

    const display = displayNameForDetailUser(user);
    const typed = window.prompt(
      safeT("admin_users_delete_confirm_nickname_prompt", {
        fallbackKo: `확인을 위해 닉네임「${display}」을 입력해 주세요.`,
        fallbackEn: `Type nickname「${display}」 to confirm.`,
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

    setDeleting(true);
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
      if (presentation === "modal") {
        onDeleted?.();
        return;
      }
      window.location.href = "/admin/users";
    } catch {
      window.alert(t("admin_users_error_network"));
    } finally {
      setDeleting(false);
    }
  }, [onDeleted, presentation, t, user]);

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
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${roleBadgeClass(accountCategory)}`}>
                {t(roleLabelKey)}
              </span>
            </div>
            <div className="space-y-1 text-xs text-[#667085]">
              <p>
                {t("admin_users_col_joined")}: <span className="font-semibold text-[#344054]">{joinedAt}</span>
              </p>
              <p>
                {t("admin_users_lite_last_activity")}:{" "}
                <span className="font-semibold text-[#344054]">{lastActivity}</span>
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
          <FieldRow label={t("admin_users_lite_col_role")} value={t(roleLabelKey)} action={changeBtn} />
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

        <DetailCard title={t("admin_users_lite_card_activity")}>
          <div className="mb-4 rounded-lg border border-[#f2f4f7] bg-[#f9fafb] px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-[#667085]">
                  {safeT("admin_users_trust_score_label", {
                    fallbackKo: "신뢰 점수 (trust_score)",
                    fallbackEn: "Trust score (trust_score)",
                  })}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-[#101828]">
                  {trustScore == null ? emptyDash : Math.round(trustScore)}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-[#98a2b3]">
                  {safeT("admin_users_trust_score_hint", {
                    fallbackKo: "SSOT: profiles.trust_score · 회원 표시와 동일 권위",
                    fallbackEn: "SSOT: profiles.trust_score · same authority as member UI",
                  })}
                </p>
              </div>
              {!isReadOnly ? (
                <button
                  type="button"
                  disabled={trustBusy}
                  onClick={() => void handleAdjustTrust()}
                  className="shrink-0 rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-xs font-semibold text-[#2563eb] disabled:opacity-60"
                >
                  {safeT("admin_users_trust_adjust", {
                    fallbackKo: "점수 조정",
                    fallbackEn: "Adjust",
                  })}
                </button>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-[#667085]">{t("admin_users_lite_total_orders")}</p>
              <p className="mt-1 text-2xl font-bold text-[#101828]">0</p>
            </div>
            <div>
              <p className="text-xs font-medium text-[#667085]">{t("admin_users_lite_total_payment")}</p>
              <p className="mt-1 text-2xl font-bold text-[#101828]">0</p>
            </div>
            <div>
              <p className="text-xs font-medium text-[#667085]">{t("admin_users_lite_points")}</p>
              <p className="mt-1 text-2xl font-bold text-[#101828]">
                {pointsBalance === null ? emptyDash : pointsBalance.toLocaleString(dateLocale)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[#667085]">{t("admin_users_lite_last_order_date")}</p>
              <p className="mt-1 text-sm font-semibold text-[#101828]">{emptyDash}</p>
            </div>
          </div>
          <button
            type="button"
            disabled
            title={t("admin_users_lite_action_todo")}
            className="mt-4 w-full rounded-lg border border-[#d0d5dd] bg-white px-4 py-2.5 text-sm font-semibold text-[#2563eb] disabled:opacity-60"
          >
            {t("admin_users_lite_view_orders")}
          </button>
        </DetailCard>

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
                label={t("admin_users_lite_delete_account")}
                icon={<Trash2 className="h-4 w-4" />}
                tone="danger"
                disabled={deleting}
                onClick={() => void handleDelete()}
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
