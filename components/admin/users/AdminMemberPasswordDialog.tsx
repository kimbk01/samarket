"use client";

import { useMemo, useState } from "react";
import { MemberAdminDialog } from "@/components/admin/users/MemberAdminDialog";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { MEMBER_ADMIN_COPY_KEY } from "@/lib/admin-users/member-admin-copy-ssot";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  ADMIN_SET_PASSWORD_MAX_LENGTH,
  MEMBER_PASSWORD_MIN_LENGTH,
  adminSetPasswordHintKo,
  checkAdminSetPassword,
} from "@/lib/auth/admin-set-password-policy";

export function AdminMemberPasswordDialog({
  open,
  userId,
  onClose,
  onSuccess,
}: {
  open: boolean;
  userId: string;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const dirty = password.length > 0 || confirm.length > 0;

  const clearSecrets = () => {
    setPassword("");
    setConfirm("");
    setShow(false);
  };

  const handleClose = () => {
    if (pending) return;
    clearSecrets();
    setErrorText(null);
    onClose();
  };

  const submit = async () => {
    setErrorText(null);
    const rule = checkAdminSetPassword(password, "member");
    if (!rule.ok) {
      setErrorText(rule.messageKo);
      return;
    }
    if (password !== confirm) {
      setErrorText(t("admin_users_err_password_mismatch"));
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/auth`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
        errorKey?: string;
      };
      if (!res.ok || data.ok === false) {
        const text =
          (data.error === "password_weak" ||
            data.error === "password_min" ||
            data.error === "password_too_long") &&
          data.message
            ? data.message
            : data.error === "password_min" || data.errorKey === "admin_users_err_password_min"
            ? t("admin_users_err_password_min")
            : data.error === "password_reset_unsupported"
              ? t("admin_users_member_pw_reset_unsupported")
              : data.error === "forbidden_admin_target"
                ? t("admin_users_member_pw_forbidden_admin")
                : data.error === "forbidden_super_admin_target"
                  ? t("admin_users_member_pw_super_admin_only")
                  : data.error === "forbidden_other_super_admin_target"
                    ? t("admin_users_member_pw_other_super_admin")
                    : data.error === "membership_lookup_failed"
                      ? t("admin_users_member_pw_membership_lookup_failed")
                      : data.error === "membership_unavailable"
                        ? t("admin_users_member_pw_membership_unavailable")
                        : data.message && !String(data.message).includes("Auth")
                          ? data.message
                          : t("admin_users_action_failed");
        setErrorText(text);
        return;
      }
      clearSecrets();
      onSuccess?.();
      onClose();
    } catch {
      setErrorText(t("admin_users_error_network"));
    } finally {
      setPending(false);
    }
  };

  const inputType = show ? "text" : "password";

  return (
    <MemberAdminDialog
      open={open}
      title={t(MEMBER_ADMIN_COPY_KEY.password_temp_set_title)}
      size="small"
      description={t(MEMBER_ADMIN_COPY_KEY.password_temp_set_body)}
      dirty={dirty}
      pending={pending}
      errorText={errorText}
      primaryLabel={t(MEMBER_ADMIN_COPY_KEY.password_temp_set_primary)}
      primaryDisabled={!password || !confirm}
      onCancel={handleClose}
      onPrimary={() => void submit()}
      onClosed={clearSecrets}
    >
      <div className="space-y-3" data-member-password-dialog="1">
        <p className="text-[12px] text-sam-muted" data-member-password-rule="1">
          {adminSetPasswordHintKo("member")}
        </p>
        <label className="block text-[13px]">
          <span className="mb-1 block text-sam-muted">{t(MEMBER_ADMIN_COPY_KEY.password_new_label)}</span>
          <input
            type={inputType}
            autoComplete="new-password"
            value={password}
            disabled={pending}
            onChange={(e) => {
              setPassword(e.target.value);
              setErrorText(null);
            }}
            minLength={MEMBER_PASSWORD_MIN_LENGTH}
            maxLength={ADMIN_SET_PASSWORD_MAX_LENGTH}
            className="w-full rounded-md border border-sam-border px-3 py-2 text-sam-fg disabled:bg-sam-surface-muted"
          />
        </label>
        <label className="block text-[13px]">
          <span className="mb-1 block text-sam-muted">{t(MEMBER_ADMIN_COPY_KEY.password_new_confirm_label)}</span>
          <input
            type={inputType}
            autoComplete="new-password"
            value={confirm}
            disabled={pending}
            onChange={(e) => {
              setConfirm(e.target.value);
              setErrorText(null);
            }}
            minLength={MEMBER_PASSWORD_MIN_LENGTH}
            maxLength={ADMIN_SET_PASSWORD_MAX_LENGTH}
            className="w-full rounded-md border border-sam-border px-3 py-2 text-sam-fg disabled:bg-sam-surface-muted"
          />
        </label>
        <AdminChipButton selected={show} onClick={() => setShow((v) => !v)}>
          {show ? t("admin_users_member_pw_hide_input") : t("admin_users_member_pw_show_input")}
        </AdminChipButton>
      </div>
    </MemberAdminDialog>
  );
}
