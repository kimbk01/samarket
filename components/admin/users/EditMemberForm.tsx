"use client";

import { useState, useCallback, useEffect } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminUser, MemberType } from "@/lib/types/admin-user";
import { getAdminRole } from "@/lib/admin-permission";
import { useAdminMemberUuidVisibility } from "@/hooks/useAdminMemberUuidVisibility";
import type { MessageKey } from "@/lib/i18n/messages";

const MEMBER_LABEL_KEYS: Record<MemberType, MessageKey> = {
  normal: "admin_users_member_type_normal_short",
  premium: "admin_users_member_type_premium_short",
  admin: "admin_users_member_type_admin_short",
};

const PHONE_OPTION_KEYS: { value: string; labelKey: MessageKey }[] = [
  { value: "unverified", labelKey: "admin_users_phone_unverified" },
  { value: "pending", labelKey: "admin_users_phone_pending" },
  { value: "verified", labelKey: "admin_users_phone_verified" },
  { value: "rejected", labelKey: "admin_users_phone_rejected" },
];

interface EditMemberFormProps {
  user: AdminUser;
  onClose: () => void;
  onSuccess: () => void;
}

function inferPhoneValue(u: AdminUser): string {
  if (u.phoneVerified) return "verified";
  const s = (u.verificationStatus ?? "").toLowerCase();
  if (s === "pending" || s === "rejected" || s === "verified" || s === "unverified") return s;
  return "unverified";
}

export function EditMemberForm({ user, onClose, onSuccess }: EditMemberFormProps) {
  const { t } = useI18n();
  const { showMemberUuid, setShowMemberUuid } = useAdminMemberUuidVisibility();
  const isMasterUi = getAdminRole() === "master";
  const [nickname, setNickname] = useState(user.nickname);
  const [memberType, setMemberType] = useState<MemberType>(user.memberType);
  const [phoneStatus, setPhoneStatus] = useState(() => inferPhoneValue(user));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const memberLocked =
    user.profileRole === "master" || (!isMasterUi && user.memberType === "admin");

  const memberOptions: MemberType[] = isMasterUi
    ? ["normal", "premium", "admin"]
    : user.memberType === "admin"
      ? ["admin"]
      : ["normal", "premium"];

  useEffect(() => {
    setNickname(user.nickname);
    setMemberType(user.memberType);
    setPhoneStatus(inferPhoneValue(user));
  }, [user]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const nextNickname = nickname.trim();
    if (!nextNickname) {
      setError(t("admin_users_err_nickname_required"));
      return;
    }
    if (nextNickname.length > 20) {
      setError(t("admin_users_err_nickname_max"));
      return;
    }
    const body: { nickname?: string; memberType?: MemberType; phoneVerificationStatus?: string } = {};
    if (nextNickname !== user.nickname) body.nickname = nextNickname;
    const effectiveMember = memberLocked ? user.memberType : memberType;
    if (effectiveMember !== user.memberType) body.memberType = effectiveMember;
    if (phoneStatus !== inferPhoneValue(user)) body.phoneVerificationStatus = phoneStatus;

    if (Object.keys(body).length === 0) {
      setError(t("admin_users_err_no_changes"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.message ?? data.error ?? t("admin_users_err_save_failed"));
        setSubmitting(false);
        return;
      }
      onSuccess();
      onClose();
    } catch {
      setError(t("admin_users_request_failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={handleBackdrop}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="presentation"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-ui-rect border border-sam-border bg-sam-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-sam-fg">{t("admin_users_form_edit_member_title")}</h2>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">
          {user.nickname}
          {showMemberUuid ? (
            <span className="ml-2 font-mono sam-text-helper text-sam-meta">{user.loginUsername ?? user.id}</span>
          ) : user.loginUsername ? (
            <span className="ml-2 font-mono sam-text-helper text-sam-meta">{user.loginUsername}</span>
          ) : (
            <>
              <span className="ml-2 sam-text-helper text-sam-muted">{t("admin_users_id_hidden")}</span>
              <button
                type="button"
                className="ml-2 sam-text-helper font-medium text-signature hover:underline"
                onClick={() => setShowMemberUuid(true)}
              >
                {t("admin_users_show_uuid")}
              </button>
            </>
          )}
        </p>
        <p className="mt-2 sam-text-helper text-amber-800">
          {t("admin_users_edit_profiles_hint")}
        </p>
        {user.hasProfile === false ? (
          <p className="mt-2 rounded-ui-rect border border-sky-200 bg-sky-50 px-3 py-2 sam-text-helper text-sky-950">
            {t("admin_users_edit_test_only_hint")}
          </p>
        ) : null}

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_label_nickname")}</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={20}
              className="mt-1.5 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
              placeholder={t("admin_users_label_nickname")}
            />
          </label>

          <label className="block">
            <span className="sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_label_member_type")}</span>
            <select
              value={memberType}
              onChange={(e) => setMemberType(e.target.value as MemberType)}
              disabled={memberLocked}
              className="mt-1.5 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body disabled:cursor-not-allowed disabled:bg-sam-surface-muted"
            >
              {memberOptions.map((v) => (
                <option key={v} value={v}>
                  {t(MEMBER_LABEL_KEYS[v])}
                </option>
              ))}
            </select>
            {user.profileRole === "master" ? (
              <span className="mt-1 block sam-text-xxs text-amber-700">
                {t("admin_users_edit_master_role_hint")}
              </span>
            ) : !isMasterUi ? (
              <span className="mt-1 block sam-text-xxs text-sam-muted">
                {t("admin_users_edit_member_type_hint")}
              </span>
            ) : null}
          </label>

          <label className="block">
            <span className="sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_label_phone_verify_status")}</span>
            <select
              value={phoneStatus}
              onChange={(e) => setPhoneStatus(e.target.value)}
              className="mt-1.5 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
            >
              {PHONE_OPTION_KEYS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? <p className="mt-4 sam-text-body-secondary text-red-600">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-ui-rect border border-sam-border px-4 py-2 sam-text-body font-medium text-sam-fg hover:bg-sam-app"
          >
            {t("common_cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white hover:bg-signature/90 disabled:opacity-50"
          >
            {submitting ? t("admin_users_saving") : t("common_save")}
          </button>
        </div>
      </form>
    </div>
  );
}
