"use client";

import { useMemo, useState } from "react";
import { MemberAdminDialog } from "@/components/admin/users/MemberAdminDialog";
import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

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
    if (!password || password.length < 4) {
      setErrorText(t("admin_users_err_password_min"));
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
          data.error === "password_min" || data.errorKey === "admin_users_err_password_min"
            ? t("admin_users_err_password_min")
            : data.error === "password_reset_unsupported"
              ? "이 계정은 비밀번호 관리 대상이 아닙니다."
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
      title={MEMBER_ADMIN_COPY.password_temp_set_title}
      description={MEMBER_ADMIN_COPY.password_temp_set_body}
      dirty={dirty}
      pending={pending}
      errorText={errorText}
      primaryLabel={MEMBER_ADMIN_COPY.password_temp_set_primary}
      primaryDisabled={!password || !confirm}
      onCancel={handleClose}
      onPrimary={() => void submit()}
      onClosed={clearSecrets}
    >
      <div className="space-y-3" data-member-password-dialog="1">
        <label className="block text-[13px]">
          <span className="mb-1 block text-[#667085]">{MEMBER_ADMIN_COPY.password_new_label}</span>
          <input
            type={inputType}
            autoComplete="new-password"
            value={password}
            disabled={pending}
            onChange={(e) => {
              setPassword(e.target.value);
              setErrorText(null);
            }}
            minLength={4}
            maxLength={128}
            className="w-full rounded-md border border-[#d0d5dd] px-3 py-2 text-[#101828] disabled:bg-[#f9fafb]"
          />
        </label>
        <label className="block text-[13px]">
          <span className="mb-1 block text-[#667085]">{MEMBER_ADMIN_COPY.password_new_confirm_label}</span>
          <input
            type={inputType}
            autoComplete="new-password"
            value={confirm}
            disabled={pending}
            onChange={(e) => {
              setConfirm(e.target.value);
              setErrorText(null);
            }}
            minLength={4}
            maxLength={128}
            className="w-full rounded-md border border-[#d0d5dd] px-3 py-2 text-[#101828] disabled:bg-[#f9fafb]"
          />
        </label>
        <button
          type="button"
          className="text-[12px] font-semibold text-[#2563eb]"
          onClick={() => setShow((v) => !v)}
        >
          {show ? "입력값 숨기기" : "입력값 보기"}
        </button>
      </div>
    </MemberAdminDialog>
  );
}
