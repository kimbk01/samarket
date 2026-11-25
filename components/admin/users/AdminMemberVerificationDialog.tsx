"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MemberAdminDialog } from "@/components/admin/users/MemberAdminDialog";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { MEMBER_ADMIN_COPY_KEY } from "@/lib/admin-users/member-admin-copy-ssot";
import { adminMemberPublicIdAt } from "@/lib/admin-users/admin-member-identity";
import type { MessageKey } from "@/lib/i18n/messages";

type PhoneStatus = "unverified" | "pending" | "verified" | "rejected";
type ConfirmAction = "approve" | "reset" | "set_status" | null;

/** 화면 문구는 키로만 (언어 SSOT) — `admin_users_phone_status_*` · 인증 완료는 회원 관리 공통 문구(`verify_status_done`) */
const STATUS_OPTIONS: { value: PhoneStatus; labelKey: MessageKey }[] = [
  { value: "unverified", labelKey: "admin_users_phone_status_none" },
  { value: "pending", labelKey: "admin_users_member_verify_status_pending" },
  { value: "verified", labelKey: MEMBER_ADMIN_COPY_KEY.verify_status_done },
  { value: "rejected", labelKey: "admin_users_member_verify_status_rejected" },
];

function statusLabelKey(status: PhoneStatus): MessageKey {
  return STATUS_OPTIONS.find((o) => o.value === status)?.labelKey ?? "admin_users_phone_status_none";
}

function normalizeStatus(phoneVerified?: boolean, status?: string | null): PhoneStatus {
  if (phoneVerified === true) return "verified";
  const s = String(status ?? "").toLowerCase();
  if (s === "pending" || s === "rejected" || s === "verified" || s === "unverified") return s;
  return "unverified";
}

export function AdminMemberVerificationDialog({
  open,
  userId,
  publicId,
  phone,
  phoneVerified,
  verificationStatus,
  onClose,
  onSuccess,
}: {
  open: boolean;
  userId: string;
  publicId?: string | null;
  phone?: string | null;
  phoneVerified?: boolean;
  verificationStatus?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { t } = useI18n();
  const [phoneValue, setPhoneValue] = useState(phone ?? "");
  const [statusValue, setStatusValue] = useState<PhoneStatus>(() =>
    normalizeStatus(phoneVerified, verificationStatus),
  );
  const [pending, setPending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction>(null);

  const initialStatus = normalizeStatus(phoneVerified, verificationStatus);

  useEffect(() => {
    if (!open) return;
    setPhoneValue(phone ?? "");
    setStatusValue(normalizeStatus(phoneVerified, verificationStatus));
    setErrorText(null);
    setPending(false);
    setConfirm(null);
  }, [open, phone, phoneVerified, verificationStatus]);

  const phoneDirty = phoneValue.trim() !== (phone ?? "").trim();
  const statusDirty = statusValue !== initialStatus;
  const canApprove = statusValue !== "verified" && phoneValue.trim().length > 0;
  const canReset = initialStatus === "verified";

  const targetLabel = useMemo(() => {
    const id = adminMemberPublicIdAt(publicId);
    return id || t("admin_users_member_verify_selected_member");
  }, [publicId, t]);

  const patchPhone = async (): Promise<boolean> => {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phoneValue.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      setErrorText(
        data.error === "invalid_phone"
          ? t("admin_users_member_verify_invalid_phone")
          : data.error === "phone_taken"
            ? t("admin_users_err_phone_taken")
            : data.error === "dibay_id_taken"
              ? t("admin_users_member_dibay_id_taken")
            : data.error === "duplicate_value"
              ? t("admin_users_err_duplicate_value")
              : t(MEMBER_ADMIN_COPY_KEY.mutation_failed),
      );
      return false;
    }
    return true;
  };

  const savePhone = async () => {
    setErrorText(null);
    setPending(true);
    try {
      const ok = await patchPhone();
      if (ok) onSuccess?.();
    } catch {
      setErrorText(t(MEMBER_ADMIN_COPY_KEY.mutation_failed));
    } finally {
      setPending(false);
    }
  };

  const runVerifyAction = async (action: "approve" | "reset" | "set_status") => {
    setErrorText(null);
    if ((action === "approve" || (action === "set_status" && statusValue === "verified")) && !phoneValue.trim()) {
      setErrorText(t(MEMBER_ADMIN_COPY_KEY.verify_no_phone_for_approve));
      setConfirm(null);
      return;
    }
    setPending(true);
    try {
      if (phoneDirty) {
        const ok = await patchPhone();
        if (!ok) {
          setConfirm(null);
          setPending(false);
          return;
        }
      }
      const body =
        action === "set_status"
          ? { action: "set_status", status: statusValue }
          : { action };
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/phone-verification`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        if (res.status === 401 || res.status === 403) {
          setErrorText(t("admin_users_member_no_permission"));
        } else if (data.error === "phone_required") {
          setErrorText(t(MEMBER_ADMIN_COPY_KEY.verify_no_phone_for_approve));
        } else {
          setErrorText(t(MEMBER_ADMIN_COPY_KEY.mutation_failed));
        }
        setConfirm(null);
        return;
      }
      setConfirm(null);
      onSuccess?.();
      onClose();
    } catch {
      setErrorText(t(MEMBER_ADMIN_COPY_KEY.mutation_failed));
      setConfirm(null);
    } finally {
      setPending(false);
    }
  };

  if (!open) return null;

  if (confirm) {
    const title =
      confirm === "approve"
        ? t(MEMBER_ADMIN_COPY_KEY.verify_approve_confirm_title)
        : confirm === "reset"
          ? t(MEMBER_ADMIN_COPY_KEY.verify_reset_confirm_title)
          : t("admin_users_member_verify_set_status_confirm_title");
    const body =
      confirm === "approve"
        ? `${targetLabel} — ${t(MEMBER_ADMIN_COPY_KEY.verify_approve_confirm_body)}`
        : confirm === "reset"
          ? `${targetLabel} — ${t(MEMBER_ADMIN_COPY_KEY.verify_reset_confirm_body)}`
          : t("admin_users_member_verify_set_status_confirm_body", {
              target: targetLabel,
              status: t(statusLabelKey(statusValue)),
            });
    return (
      <MemberAdminDialog
        open
        title={title}
        description={body}
        size="small"
        tone="default"
        pending={pending}
        errorText={errorText}
        primaryLabel={
          confirm === "approve"
            ? t(MEMBER_ADMIN_COPY_KEY.verify_approve)
            : confirm === "reset"
              ? t(MEMBER_ADMIN_COPY_KEY.verify_reset)
              : t("admin_users_member_verify_save_status")
        }
        onCancel={() => setConfirm(null)}
        onPrimary={() => void runVerifyAction(confirm)}
      >
        <div data-member-verify-confirm={confirm}>
          <p className="text-[13px] text-sam-muted">
            {t("admin_users_member_verify_current_selection", { status: t(statusLabelKey(statusValue)) })}
          </p>
        </div>
      </MemberAdminDialog>
    );
  }

  return (
    <MemberAdminDialog
      open={open}
      title={t(MEMBER_ADMIN_COPY_KEY.verify_manage_title)}
      size="standard"
      dirty={phoneDirty || statusDirty}
      pending={pending}
      errorText={errorText}
      primaryLabel={phoneDirty && !statusDirty ? t(MEMBER_ADMIN_COPY_KEY.verify_save_phone) : statusDirty ? t("admin_users_member_verify_save_status") : t("admin_users_member_verify_close")}
      primaryDisabled={false}
      onCancel={onClose}
      onPrimary={() => {
        if (statusDirty) {
          setConfirm("set_status");
          return;
        }
        if (phoneDirty) void savePhone();
        else onClose();
      }}
    >
      <div className="space-y-4" data-member-verification-dialog="1" data-member-screen="S15">
        <label className="block text-[13px]">
          <span className="mb-1 block text-sam-muted">{t(MEMBER_ADMIN_COPY_KEY.verify_phone_label)}</span>
          <input
            className="w-full rounded-md border border-sam-border px-3 py-2"
            value={phoneValue}
            onChange={(e) => setPhoneValue(e.target.value)}
            data-member-verify-phone-input="1"
          />
        </label>
        <label className="block text-[13px]">
          <span className="mb-1 block text-sam-muted">{t(MEMBER_ADMIN_COPY_KEY.verify_status_label)}</span>
          <select
            className="w-full rounded-md border border-sam-border px-3 py-2"
            value={statusValue}
            onChange={(e) => setStatusValue(e.target.value as PhoneStatus)}
            data-member-verify-status-select="1"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2" data-member-verify-actions="1">
          {canApprove ? (
            <AdminActionButton
              variant="primary"
              data-member-verify-action="approve"
              data-member-cta-cap="CAP-VERIFY-APPROVE"
              disabled={pending}
              onClick={() => setConfirm("approve")}
            >
              {t(MEMBER_ADMIN_COPY_KEY.verify_approve)}
            </AdminActionButton>
          ) : null}
          {canReset ? (
            <AdminActionButton
              variant="secondary"
              data-member-verify-action="reset"
              data-member-cta-cap="CAP-VERIFY-RESET"
              disabled={pending}
              onClick={() => setConfirm("reset")}
            >
              {t(MEMBER_ADMIN_COPY_KEY.verify_reset)}
            </AdminActionButton>
          ) : null}
        </div>
      </div>
    </MemberAdminDialog>
  );
}
