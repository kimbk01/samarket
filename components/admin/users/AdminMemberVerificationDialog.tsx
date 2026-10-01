"use client";

import { useEffect, useMemo, useState } from "react";
import { MemberAdminDialog } from "@/components/admin/users/MemberAdminDialog";
import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";
import { adminMemberPublicIdAt } from "@/lib/admin-users/admin-member-identity";

type ConfirmAction = "approve" | "reset" | null;

function isVerified(phoneVerified?: boolean, status?: string | null): boolean {
  if (phoneVerified === true) return true;
  return String(status ?? "").toLowerCase() === "verified";
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
  const [phoneValue, setPhoneValue] = useState(phone ?? "");
  const [pending, setPending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction>(null);

  const verified = isVerified(phoneVerified, verificationStatus);

  useEffect(() => {
    if (!open) return;
    setPhoneValue(phone ?? "");
    setErrorText(null);
    setPending(false);
    setConfirm(null);
  }, [open, phone, phoneVerified, verificationStatus]);

  const phoneDirty = phoneValue.trim() !== (phone ?? "").trim();
  const canApprove = !verified && phoneValue.trim().length > 0;
  const canReset = verified;

  const targetLabel = useMemo(() => {
    const id = adminMemberPublicIdAt(publicId);
    return id || "선택한 회원";
  }, [publicId]);

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
        data.error === "invalid_phone" ? "전화번호 형식을 확인해 주세요." : MEMBER_ADMIN_COPY.mutation_failed,
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
      setErrorText(MEMBER_ADMIN_COPY.mutation_failed);
    } finally {
      setPending(false);
    }
  };

  const runVerifyAction = async (action: "approve" | "reset") => {
    setErrorText(null);
    if (action === "approve" && !phoneValue.trim()) {
      setErrorText(MEMBER_ADMIN_COPY.verify_no_phone_for_approve);
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
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/phone-verification`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        if (res.status === 401 || res.status === 403) {
          setErrorText("이 작업을 수행할 권한이 없습니다.");
        } else {
          setErrorText(MEMBER_ADMIN_COPY.mutation_failed);
        }
        setConfirm(null);
        return;
      }
      setConfirm(null);
      onSuccess?.();
      onClose();
    } catch {
      setErrorText(MEMBER_ADMIN_COPY.mutation_failed);
      setConfirm(null);
    } finally {
      setPending(false);
    }
  };

  if (!open) return null;

  if (confirm) {
    return (
      <MemberAdminDialog
        open
        title={
          confirm === "approve"
            ? MEMBER_ADMIN_COPY.verify_approve_confirm_title
            : MEMBER_ADMIN_COPY.verify_reset_confirm_title
        }
        description={
          confirm === "approve"
            ? `${targetLabel} — ${MEMBER_ADMIN_COPY.verify_approve_confirm_body}`
            : `${targetLabel} — ${MEMBER_ADMIN_COPY.verify_reset_confirm_body}`
        }
        size="small"
        tone="default"
        pending={pending}
        errorText={errorText}
        primaryLabel={confirm === "approve" ? MEMBER_ADMIN_COPY.verify_approve : MEMBER_ADMIN_COPY.verify_reset}
        onCancel={() => setConfirm(null)}
        onPrimary={() => void runVerifyAction(confirm)}
      >
        <div data-member-verify-confirm={confirm}>
          <p className="text-[13px] text-[#475467]">
            현재 상태: {verified ? MEMBER_ADMIN_COPY.verify_status_done : MEMBER_ADMIN_COPY.verify_status_pending}
          </p>
        </div>
      </MemberAdminDialog>
    );
  }

  return (
    <MemberAdminDialog
      open={open}
      title={MEMBER_ADMIN_COPY.verify_manage_title}
      size="standard"
      dirty={phoneDirty}
      pending={pending}
      errorText={errorText}
      primaryLabel={phoneDirty ? MEMBER_ADMIN_COPY.verify_save_phone : "닫기"}
      primaryDisabled={false}
      onCancel={onClose}
      onPrimary={() => {
        if (phoneDirty) void savePhone();
        else onClose();
      }}
    >
      <div className="space-y-4" data-member-verification-dialog="1" data-member-screen="S15">
        <label className="block text-[13px]">
          <span className="mb-1 block text-[#667085]">{MEMBER_ADMIN_COPY.verify_phone_label}</span>
          <input
            className="w-full rounded-md border border-[#d0d5dd] px-3 py-2"
            value={phoneValue}
            onChange={(e) => setPhoneValue(e.target.value)}
            data-member-verify-phone-input="1"
          />
        </label>
        <div>
          <p className="mb-1 text-[13px] text-[#667085]">{MEMBER_ADMIN_COPY.verify_status_label}</p>
          <p
            className="text-sm font-semibold text-[#101828]"
            data-member-verify-status={verified ? "verified" : "unverified"}
          >
            {verified ? MEMBER_ADMIN_COPY.verify_status_done : MEMBER_ADMIN_COPY.verify_status_pending}
          </p>
        </div>
        <div className="flex flex-wrap gap-2" data-member-verify-actions="1">
          {canApprove ? (
            <button
              type="button"
              className="rounded-md bg-[#2563eb] px-3 py-2 text-[13px] font-semibold text-white"
              data-member-verify-action="approve"
              data-member-cta-cap="CAP-VERIFY-APPROVE"
              disabled={pending}
              onClick={() => setConfirm("approve")}
            >
              {MEMBER_ADMIN_COPY.verify_approve}
            </button>
          ) : null}
          {canReset ? (
            <button
              type="button"
              className="rounded-md border border-[#d0d5dd] px-3 py-2 text-[13px] font-semibold text-[#344054]"
              data-member-verify-action="reset"
              data-member-cta-cap="CAP-VERIFY-RESET"
              disabled={pending}
              onClick={() => setConfirm("reset")}
            >
              {MEMBER_ADMIN_COPY.verify_reset}
            </button>
          ) : null}
        </div>
      </div>
    </MemberAdminDialog>
  );
}
