"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminUser, MemberType } from "@/lib/types/admin-user";
import { useAdminMe } from "@/hooks/useAdminMe";
import { useAdminMemberUuidVisibility } from "@/hooks/useAdminMemberUuidVisibility";
import type { MessageKey } from "@/lib/i18n/messages";
import { DibayOverlayButton, DibayOverlayRoot } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

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
  const { isSuperAdmin: isMasterUi } = useAdminMe();
  const [nickname, setNickname] = useState(user.nickname);
  const [dibayId, setDibayId] = useState(() => (user.dibay_id ?? "").replace(/^@+/, ""));
  const [email, setEmail] = useState(user.email ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [memberType, setMemberType] = useState<MemberType>(user.memberType);
  const [phoneStatus, setPhoneStatus] = useState(() => inferPhoneValue(user));
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isReadOnly = user.hasProfile === false;
  const memberLocked =
    user.profileRole === "master" || (!isMasterUi && user.memberType === "admin");

  const memberOptions: MemberType[] =
    user.memberType === "admin" ? ["admin"] : ["normal", "premium"];

  useEffect(() => {
    setNickname(user.nickname);
    setDibayId((user.dibay_id ?? "").replace(/^@+/, ""));
    setEmail(user.email ?? "");
    setPhone(user.phone ?? "");
    setMemberType(user.memberType);
    setPhoneStatus(inferPhoneValue(user));
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
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
    const body: {
      nickname?: string;
      memberType?: MemberType;
      phoneVerificationStatus?: string;
      dibayId?: string;
      email?: string;
      phone?: string;
      password?: string;
    } = {};
    if (nextNickname !== user.nickname) body.nickname = nextNickname;
    const nextDibayId = dibayId.trim().replace(/^@+/, "").toLowerCase();
    const currentDibayId = (user.dibay_id ?? "").replace(/^@+/, "").toLowerCase();
    if (nextDibayId !== currentDibayId) body.dibayId = nextDibayId;
    const nextEmail = email.trim().toLowerCase();
    const currentEmail = (user.email ?? "").trim().toLowerCase();
    if (nextEmail !== currentEmail) body.email = nextEmail;
    const nextPhone = phone.trim();
    const currentPhone = (user.phone ?? "").trim();
    if (nextPhone !== currentPhone) body.phone = nextPhone;
    const effectiveMember = memberLocked ? user.memberType : memberType;
    if (effectiveMember !== user.memberType) body.memberType = effectiveMember;
    if (phoneStatus !== inferPhoneValue(user)) body.phoneVerificationStatus = phoneStatus;

    if (newPassword || confirmPassword) {
      if (newPassword.length < 4) {
        setError(t("admin_users_err_password_min"));
        return;
      }
      if (newPassword !== confirmPassword) {
        setError(t("admin_users_err_password_mismatch"));
        return;
      }
      body.password = newPassword;
    }

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
        const message =
          data.error === "invalid_dibay_id"
            ? t("admin_users_err_invalid_dibay_id")
            : data.error === "dibay_id_taken"
              ? t("admin_users_err_dibay_id_taken")
              : data.error === "invalid_email"
                ? t("admin_users_err_invalid_email")
                : data.message ?? data.error ?? t("admin_users_err_save_failed");
        setError(message);
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
    <DibayOverlayRoot open onClose={onClose} dismissible placement="center" zRole="dialog">
      <form
        onSubmit={handleSubmit}
        className={`${OverlayUi.dialogPanel} !max-w-lg max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={OverlayUi.title}>{t("admin_users_form_edit_member_title")}</h2>
        <p className={`mt-1 ${OverlayUi.bodySecondary}`}>
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
        {isReadOnly ? (
          <p className="mt-2 rounded-ui-rect border border-sky-200 bg-sky-50 px-3 py-2 sam-text-helper text-sky-950">
            {t("admin_users_edit_test_only_hint")}
          </p>
        ) : null}

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_lite_label_public_id")}</span>
            <input
              value={dibayId}
              onChange={(e) => setDibayId(e.target.value.replace(/^@+/, ""))}
              maxLength={20}
              disabled={isReadOnly}
              className="mt-1.5 w-full rounded-ui-rect border border-sam-border px-3 py-2 font-mono sam-text-body disabled:cursor-not-allowed disabled:bg-sam-surface-muted"
              placeholder="dai_kim"
            />
          </label>

          <label className="block">
            <span className="sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_label_email")}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isReadOnly}
              className="mt-1.5 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body disabled:cursor-not-allowed disabled:bg-sam-surface-muted"
            />
          </label>

          <label className="block">
            <span className="sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_lite_label_phone")}</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isReadOnly}
              className="mt-1.5 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body disabled:cursor-not-allowed disabled:bg-sam-surface-muted"
            />
          </label>

          <label className="block">
            <span className="sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_label_nickname")}</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={20}
              disabled={isReadOnly}
              className="mt-1.5 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body disabled:cursor-not-allowed disabled:bg-sam-surface-muted"
              placeholder={t("admin_users_label_nickname")}
            />
          </label>

          <label className="block">
            <span className="sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_label_member_type")}</span>
            <select
              value={memberType}
              onChange={(e) => setMemberType(e.target.value as MemberType)}
              disabled={isReadOnly || memberLocked}
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
            ) : null}
            {user.memberType !== "admin" ? (
              <>
                <span className="mt-1 block sam-text-xxs text-sam-muted">
                  {t("admin_users_edit_member_type_hint")}
                </span>
                <span className="mt-1 block sam-text-xxs text-sam-muted">
                  {t("admin_users_admin_via_staff_tab_hint")}
                </span>
              </>
            ) : null}
          </label>

          <label className="block">
            <span className="sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_label_password")}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={4}
              maxLength={128}
              disabled={isReadOnly}
              className="mt-1.5 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body disabled:cursor-not-allowed disabled:bg-sam-surface-muted"
              placeholder={t("admin_users_ph_password_min")}
            />
            <span className="mt-1 block sam-text-xxs text-sam-muted">
              {t("admin_users_auth_password_hint")}
            </span>
          </label>

          <label className="block">
            <span className="sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_label_password_confirm")}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={4}
              maxLength={128}
              disabled={isReadOnly}
              className="mt-1.5 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body disabled:cursor-not-allowed disabled:bg-sam-surface-muted"
              placeholder={t("admin_users_ph_password_min")}
            />
          </label>

          <label className="block">
            <span className="sam-text-body-secondary font-medium text-sam-fg">{t("admin_users_label_phone_verify_status")}</span>
            <select
              value={phoneStatus}
              onChange={(e) => setPhoneStatus(e.target.value)}
              disabled={isReadOnly}
              className="mt-1.5 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body disabled:cursor-not-allowed disabled:bg-sam-surface-muted"
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

        <div className={`${OverlayUi.actionsRow} mt-6`}>
          <DibayOverlayButton roleTone="secondary" type="button" onClick={onClose}>
            {t("common_cancel")}
          </DibayOverlayButton>
          <DibayOverlayButton
            roleTone="primary"
            type="submit"
            disabled={submitting || isReadOnly}
            loading={submitting}
          >
            {submitting ? t("admin_users_saving") : t("common_save")}
          </DibayOverlayButton>
        </div>
      </form>
    </DibayOverlayRoot>
  );
}
