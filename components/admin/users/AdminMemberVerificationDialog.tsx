"use client";

import { useEffect, useMemo, useState } from "react";
import { MemberAdminDialog } from "@/components/admin/users/MemberAdminDialog";
import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";
import { adminMemberPublicIdAt } from "@/lib/admin-users/admin-member-identity";

type PhoneStatus = "unverified" | "pending" | "verified" | "rejected";
type ConfirmAction = "approve" | "reset" | "set_status" | null;

const STATUS_OPTIONS: { value: PhoneStatus; labelKo: string }[] = [
  { value: "unverified", labelKo: "미인증" },
  { value: "pending", labelKo: "인증 대기" },
  { value: "verified", labelKo: "인증 완료" },
  { value: "rejected", labelKo: "인증 거절" },
];

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

  const runVerifyAction = async (action: "approve" | "reset" | "set_status") => {
    setErrorText(null);
    if ((action === "approve" || (action === "set_status" && statusValue === "verified")) && !phoneValue.trim()) {
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
          setErrorText("이 작업을 수행할 권한이 없습니다.");
        } else if (data.error === "phone_required") {
          setErrorText(MEMBER_ADMIN_COPY.verify_no_phone_for_approve);
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
    const title =
      confirm === "approve"
        ? MEMBER_ADMIN_COPY.verify_approve_confirm_title
        : confirm === "reset"
          ? MEMBER_ADMIN_COPY.verify_reset_confirm_title
          : "전화 인증 상태를 변경할까요?";
    const body =
      confirm === "approve"
        ? `${targetLabel} — ${MEMBER_ADMIN_COPY.verify_approve_confirm_body}`
        : confirm === "reset"
          ? `${targetLabel} — ${MEMBER_ADMIN_COPY.verify_reset_confirm_body}`
          : `${targetLabel} — 상태를 「${STATUS_OPTIONS.find((o) => o.value === statusValue)?.labelKo ?? statusValue}」로 저장합니다.`;
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
            ? MEMBER_ADMIN_COPY.verify_approve
            : confirm === "reset"
              ? MEMBER_ADMIN_COPY.verify_reset
              : "상태 저장"
        }
        onCancel={() => setConfirm(null)}
        onPrimary={() => void runVerifyAction(confirm)}
      >
        <div data-member-verify-confirm={confirm}>
          <p className="text-[13px] text-[#475467]">
            현재 선택: {STATUS_OPTIONS.find((o) => o.value === statusValue)?.labelKo ?? statusValue}
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
      dirty={phoneDirty || statusDirty}
      pending={pending}
      errorText={errorText}
      primaryLabel={phoneDirty && !statusDirty ? MEMBER_ADMIN_COPY.verify_save_phone : statusDirty ? "상태 저장" : "닫기"}
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
          <span className="mb-1 block text-[#667085]">{MEMBER_ADMIN_COPY.verify_phone_label}</span>
          <input
            className="w-full rounded-md border border-[#d0d5dd] px-3 py-2"
            value={phoneValue}
            onChange={(e) => setPhoneValue(e.target.value)}
            data-member-verify-phone-input="1"
          />
        </label>
        <label className="block text-[13px]">
          <span className="mb-1 block text-[#667085]">{MEMBER_ADMIN_COPY.verify_status_label}</span>
          <select
            className="w-full rounded-md border border-[#d0d5dd] px-3 py-2"
            value={statusValue}
            onChange={(e) => setStatusValue(e.target.value as PhoneStatus)}
            data-member-verify-status-select="1"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.labelKo}
              </option>
            ))}
          </select>
        </label>
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
