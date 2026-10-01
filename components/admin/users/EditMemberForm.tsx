"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminUser } from "@/lib/types/admin-user";
import { useAdminMemberUuidVisibility } from "@/hooks/useAdminMemberUuidVisibility";
import { MemberAdminDialog } from "@/components/admin/users/MemberAdminDialog";
import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";
import { memberDetailContactEmail } from "@/lib/admin-users/member-detail-control-center-ia";

interface EditMemberFormProps {
  user: AdminUser;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * S13 — Profile / contact edit only.
 * Must not mutate @회원 ID, verification, password, store, privilege, or collapsed membership axis.
 */
export function EditMemberForm({ user, onClose, onSuccess }: EditMemberFormProps) {
  const { t } = useI18n();
  const { showMemberUuid, setShowMemberUuid } = useAdminMemberUuidVisibility();
  const contactEmailInitial = memberDetailContactEmail(user.email) ?? "";
  const [nickname, setNickname] = useState(user.nickname);
  const [email, setEmail] = useState(contactEmailInitial);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [pending, setPending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    setNickname(user.nickname);
    setEmail(memberDetailContactEmail(user.email) ?? "");
    setPhone(user.phone ?? "");
  }, [user]);

  const dirty = useMemo(() => {
    const currentEmail = memberDetailContactEmail(user.email) ?? "";
    return (
      nickname.trim() !== user.nickname ||
      email.trim().toLowerCase() !== currentEmail.trim().toLowerCase() ||
      phone.trim() !== (user.phone ?? "").trim()
    );
  }, [nickname, email, phone, user]);

  const handleSave = async () => {
    setErrorText(null);
    const nextNickname = nickname.trim();
    if (!nextNickname) {
      setErrorText(t("admin_users_err_nickname_required"));
      return;
    }
    if (nextNickname.length > 20) {
      setErrorText(t("admin_users_err_nickname_max"));
      return;
    }
    const body: { nickname?: string; email?: string; phone?: string } = {};
    if (nextNickname !== user.nickname) body.nickname = nextNickname;
    const nextEmail = email.trim().toLowerCase();
    const currentEmail = (memberDetailContactEmail(user.email) ?? "").trim().toLowerCase();
    if (nextEmail !== currentEmail) body.email = nextEmail;
    const nextPhone = phone.trim();
    const currentPhone = (user.phone ?? "").trim();
    if (nextPhone !== currentPhone) body.phone = nextPhone;
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setErrorText(
          data.error === "이미 사용 중인 닉네임입니다"
            ? t("admin_users_err_nickname_taken")
            : data.error === "invalid_email"
              ? t("admin_users_err_invalid_email")
              : data.error === "invalid_phone"
                ? "전화번호 형식을 확인해 주세요."
                : MEMBER_ADMIN_COPY.mutation_failed,
        );
        return;
      }
      onSuccess();
    } catch {
      setErrorText(MEMBER_ADMIN_COPY.mutation_failed);
    } finally {
      setPending(false);
    }
  };

  return (
    <MemberAdminDialog
      open
      title={MEMBER_ADMIN_COPY.member_edit_title}
      size="standard"
      dirty={dirty}
      pending={pending}
      errorText={errorText}
      primaryLabel={MEMBER_ADMIN_COPY.save_changes}
      primaryDisabled={!dirty}
      onCancel={onClose}
      onPrimary={() => void handleSave()}
    >
      <div className="space-y-3" data-member-profile-edit="1" data-member-screen="S13">
        <label className="block text-[13px]">
          <span className="mb-1 block text-[#667085]">{t("admin_users_label_nickname")}</span>
          <input
            className="w-full rounded-md border border-[#d0d5dd] px-3 py-2"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            data-member-profile-field="nickname"
          />
        </label>
        <label className="block text-[13px]">
          <span className="mb-1 block text-[#667085]">{t("admin_users_label_email")}</span>
          <input
            className="w-full rounded-md border border-[#d0d5dd] px-3 py-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-member-profile-field="email"
            placeholder="연락 이메일"
          />
        </label>
        <label className="block text-[13px]">
          <span className="mb-1 block text-[#667085]">{t("admin_users_lite_label_phone")}</span>
          <input
            className="w-full rounded-md border border-[#d0d5dd] px-3 py-2"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            data-member-profile-field="phone"
          />
        </label>
        {showMemberUuid ? (
          <p className="text-[11px] text-[#98a2b3]" data-member-uuid-reveal="1">
            {user.id}
          </p>
        ) : (
          <button
            type="button"
            className="text-[11px] text-[#667085] underline"
            onClick={() => setShowMemberUuid(true)}
          >
            {MEMBER_ADMIN_COPY.system_member_key}
          </button>
        )}
      </div>
    </MemberAdminDialog>
  );
}
