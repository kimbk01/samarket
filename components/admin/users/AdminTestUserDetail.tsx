"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useAdminMemberUuidVisibility } from "@/hooks/useAdminMemberUuidVisibility";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { formatPhMobileDisplay } from "@/lib/utils/ph-mobile";
import { AdminUserPointsSection } from "./AdminUserPointsSection";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";

export type ApiTestUserRow = {
  id: string;
  username: string | null;
  email?: string | null;
  role: string;
  display_name: string | null;
  nickname?: string | null;
  contact_phone?: string | null;
  contact_address?: string | null;
  phone_verified?: boolean;
  phone_verified_at?: string | null;
  phone_verification_status?: string;
  member_status?: string | null;
  verified_member_at?: string | null;
  created_at: string | null;
};

const ROLE_LABEL_KEYS: Record<string, MessageKey> = {
  admin: "admin_users_test_role_admin",
  master: "admin_users_test_role_master",
  special: "admin_users_test_role_special",
  member: "admin_users_test_role_member",
};

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

function contactPhoneDisplay(raw: string | null | undefined): string {
  const t = raw?.trim() ?? "";
  if (!t) return "";
  const spaced = formatPhMobileDisplay(t);
  return spaced || t;
}

export function AdminTestUserDetail({ user }: { user: ApiTestUserRow }) {
  const { t, language } = useI18n();
  const dateLocale = dateLocaleTag(language);
  const { showMemberUuid, setShowMemberUuid } = useAdminMemberUuidVisibility();
  const display =
    user.nickname?.trim() || user.display_name?.trim() || user.username || (showMemberUuid ? user.id : "—");

  const roleLabelKey = ROLE_LABEL_KEYS[user.role];

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_users_detail_test_title" backHref="/admin/users" />

      <AdminCard titleKey="admin_users_card_member_account">
        <dl className="grid gap-3 sam-text-body">
          <div>
            <dt className="sam-text-helper font-medium text-sam-muted">{t("admin_users_test_label_login_id")}</dt>
            <dd className="mt-0.5 font-mono sam-text-body font-semibold text-sam-fg">{user.username ?? "—"}</dd>
          </div>
          <div>
            <dt className="sam-text-helper font-medium text-sam-muted">{t("admin_users_label_nickname")}</dt>
            <dd className="mt-0.5 text-sam-fg">{display}</dd>
          </div>
          <div>
            <dt className="sam-text-helper font-medium text-sam-muted">{t("admin_users_label_email")}</dt>
            <dd className="mt-0.5 text-sam-fg">{user.email?.trim() || "—"}</dd>
          </div>
          <div>
            <dt className="sam-text-helper font-medium text-sam-muted">{t("admin_users_test_label_uuid")}</dt>
            <dd className="mt-0.5 sam-text-body-secondary text-sam-fg">
              {showMemberUuid ? (
                <>
                  <span className="break-all font-mono sam-text-helper">{user.id}</span>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <button
                      type="button"
                      className="sam-text-helper font-medium text-signature hover:underline"
                      onClick={() => {
                        void navigator.clipboard.writeText(user.id).catch(() => {});
                      }}
                    >
                      {t("admin_users_action_copy_uuid")}
                    </button>
                    <button
                      type="button"
                      className="sam-text-helper font-medium text-sam-muted hover:underline"
                      onClick={() => setShowMemberUuid(false)}
                    >
                      {t("admin_users_action_hide")}
                    </button>
                  </div>
                </>
              ) : (
                <span className="text-sam-muted">
                  {t("admin_users_test_hidden")}{" "}
                  <button
                    type="button"
                    className="font-medium text-signature hover:underline"
                    onClick={() => setShowMemberUuid(true)}
                  >
                    {t("admin_users_action_show")}
                  </button>
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="sam-text-helper font-medium text-sam-muted">{t("admin_users_test_label_role")}</dt>
            <dd className="mt-0.5 text-sam-fg">{roleLabelKey ? t(roleLabelKey) : user.role}</dd>
          </div>
          <div>
            <dt className="sam-text-helper font-medium text-sam-muted">{t("admin_users_test_label_phone_verify")}</dt>
            <dd className="mt-0.5 text-sam-fg">
              {user.phone_verified
                ? t("admin_users_test_phone_done")
                : user.phone_verification_status === "pending"
                  ? t("admin_users_test_phone_pending")
                  : t("admin_users_phone_unverified")}
            </dd>
          </div>
          <div>
            <dt className="sam-text-helper font-medium text-sam-muted">{t("admin_users_test_label_phone_verified_at")}</dt>
            <dd className="mt-0.5 text-sam-fg">
              {user.phone_verified_at ? new Date(user.phone_verified_at).toLocaleString(dateLocale) : "—"}
            </dd>
          </div>
          <div>
            <dt className="sam-text-helper font-medium text-sam-muted">{t("admin_users_test_label_member_status")}</dt>
            <dd className="mt-0.5 text-sam-fg">
              {user.phone_verified && String(user.member_status ?? "").toLowerCase() === "active"
                ? t("admin_users_test_member_active")
                : !user.phone_verified
                  ? t("admin_users_test_member_need_phone")
                  : String(user.member_status ?? "").toLowerCase() === "pending"
                    ? t("admin_users_test_member_pending")
                    : (user.member_status ?? "—")}
            </dd>
          </div>
          <div>
            <dt className="sam-text-helper font-medium text-sam-muted">{t("admin_users_test_label_verified_at")}</dt>
            <dd className="mt-0.5 text-sam-fg">
              {user.verified_member_at ? new Date(user.verified_member_at).toLocaleString(dateLocale) : "—"}
            </dd>
          </div>
          <div>
            <dt className="sam-text-helper font-medium text-sam-muted">{t("admin_users_test_label_created")}</dt>
            <dd className="mt-0.5 text-sam-fg">
              {user.created_at ? new Date(user.created_at).toLocaleString(dateLocale) : "—"}
            </dd>
          </div>
          <div>
            <dt className="sam-text-helper font-medium text-sam-muted">{t("admin_users_test_label_contact")}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sam-fg">
              {user.contact_phone?.trim() ? (
                contactPhoneDisplay(user.contact_phone)
              ) : (
                <span className="text-sam-meta">—</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="sam-text-helper font-medium text-sam-muted">{t("admin_users_test_label_address")}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sam-fg">
              {user.contact_address?.trim() ? (
                user.contact_address.trim()
              ) : (
                <span className="text-sam-meta">—</span>
              )}
            </dd>
          </div>
        </dl>
      </AdminCard>

      <AdminCard titleKey="admin_users_card_phone_verify">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={async () => {
              const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/phone-verification`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action: "approve" }),
              });
              const data = await res.json().catch(() => null);
              if (!res.ok || !data?.ok) {
                alert(data?.error || t("admin_users_test_approve_failed"));
                return;
              }
              window.location.reload();
            }}
            className="rounded bg-signature px-4 py-2 sam-text-body-secondary font-medium text-white"
          >
            {t("admin_users_test_approve_phone")}
          </button>
          <button
            type="button"
            onClick={async () => {
              const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/phone-verification`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action: "reset" }),
              });
              const data = await res.json().catch(() => null);
              if (!res.ok || !data?.ok) {
                alert(data?.error || t("admin_users_test_reset_failed"));
                return;
              }
              window.location.reload();
            }}
            className="rounded border border-sam-border px-4 py-2 sam-text-body-secondary font-medium text-sam-fg"
          >
            {t("admin_users_test_reset_phone")}
          </button>
        </div>
      </AdminCard>

      <AdminUserPointsSection userId={user.id} />

      <AdminCard titleKey="admin_users_card_login_test_guide">
        <ul className="list-disc space-y-2 pl-5 sam-text-body-secondary leading-relaxed text-sam-fg">
          <li>
            <Link href="/login" className="text-signature underline">
              {t("admin_users_test_guide_login_page")}
            </Link>
            {t("admin_users_test_guide_login_a")}{" "}
            <strong>{t("admin_users_test_guide_login_b")}</strong>
            {t("admin_users_test_guide_login_c")}{" "}
            <Link href="/my" className="text-signature underline">
              {t("admin_users_test_guide_my_page")}
            </Link>
            {t("admin_users_test_guide_login_d")}
          </li>
          <li>
            {t("admin_users_test_guide_multi_account")}
          </li>
          <li>{t("admin_users_test_guide_profile_split")}</li>
        </ul>
      </AdminCard>
    </div>
  );
}
