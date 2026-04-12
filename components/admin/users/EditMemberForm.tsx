"use client";

import { useState, useCallback, useEffect } from "react";
import type { AdminUser, MemberType } from "@/lib/types/admin-user";
import { getAdminRole } from "@/lib/admin-permission";
import { useAdminMemberUuidVisibility } from "@/hooks/useAdminMemberUuidVisibility";

const MEMBER_LABEL: Record<MemberType, string> = {
  normal: "일반",
  premium: "특별",
  admin: "관리자",
};

const PHONE_OPTIONS: { value: string; label: string }[] = [
  { value: "unverified", label: "미인증" },
  { value: "pending", label: "대기 (승인 요청)" },
  { value: "verified", label: "인증 완료" },
  { value: "rejected", label: "거절" },
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
  const { showMemberUuid, setShowMemberUuid } = useAdminMemberUuidVisibility();
  const isMasterUi = getAdminRole() === "master";
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

    const body: { memberType?: MemberType; phoneVerificationStatus?: string } = {};
    const effectiveMember = memberLocked ? user.memberType : memberType;
    if (effectiveMember !== user.memberType) body.memberType = effectiveMember;
    if (phoneStatus !== inferPhoneValue(user)) body.phoneVerificationStatus = phoneStatus;

    if (Object.keys(body).length === 0) {
      setError("변경된 항목이 없습니다.");
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
        setError(data.message ?? data.error ?? "저장에 실패했습니다.");
        setSubmitting(false);
        return;
      }
      onSuccess();
      onClose();
    } catch {
      setError("요청에 실패했습니다.");
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
        <h2 className="text-lg font-semibold text-sam-fg">회원 수정</h2>
        <p className="mt-1 text-[13px] text-sam-muted">
          {user.nickname}
          {showMemberUuid ? (
            <span className="ml-2 font-mono text-[12px] text-sam-meta">{user.loginUsername ?? user.id}</span>
          ) : user.loginUsername ? (
            <span className="ml-2 font-mono text-[12px] text-sam-meta">{user.loginUsername}</span>
          ) : (
            <>
              <span className="ml-2 text-[12px] text-sam-muted">(내부 ID 숨김)</span>
              <button
                type="button"
                className="ml-2 text-[12px] font-medium text-signature hover:underline"
                onClick={() => setShowMemberUuid(true)}
              >
                UUID 표시
              </button>
            </>
          )}
        </p>
        <p className="mt-2 text-[12px] text-amber-800">
          구분·전화 인증은 <strong>profiles</strong>(및 개발용 <strong>test_users.role</strong>)에 반영됩니다.
        </p>
        {user.hasProfile === false ? (
          <p className="mt-2 rounded-ui-rect border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] text-sky-950">
            수동(test_users)만 연결된 계정입니다. <strong>저장 시</strong> 같은 UUID로 Supabase Auth와 profiles가
            없으면 <strong>자동으로 만들어</strong> 정식 회원과 동일하게 맞춥니다.
          </p>
        ) : null}

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-[13px] font-medium text-sam-fg">회원 구분</span>
            <select
              value={memberType}
              onChange={(e) => setMemberType(e.target.value as MemberType)}
              disabled={memberLocked}
              className="mt-1.5 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[14px] disabled:cursor-not-allowed disabled:bg-sam-surface-muted"
            >
              {memberOptions.map((v) => (
                <option key={v} value={v}>
                  {MEMBER_LABEL[v]}
                </option>
              ))}
            </select>
            {user.profileRole === "master" ? (
              <span className="mt-1 block text-[11px] text-amber-700">
                최고 관리자 계정은 DB role이 유지됩니다. 전화 인증만 바꿀 수 있습니다.
              </span>
            ) : !isMasterUi ? (
              <span className="mt-1 block text-[11px] text-sam-muted">
                일반·특별 ↔ 관리자 변경은 최고 관리자만 할 수 있습니다.
              </span>
            ) : null}
          </label>

          <label className="block">
            <span className="text-[13px] font-medium text-sam-fg">전화 인증 상태</span>
            <select
              value={phoneStatus}
              onChange={(e) => setPhoneStatus(e.target.value)}
              className="mt-1.5 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[14px]"
            >
              {PHONE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? <p className="mt-4 text-[13px] text-red-600">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-ui-rect border border-sam-border px-4 py-2 text-[14px] font-medium text-sam-fg hover:bg-sam-app"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-ui-rect bg-signature px-4 py-2 text-[14px] font-medium text-white hover:bg-signature/90 disabled:opacity-50"
          >
            {submitting ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </div>
  );
}
