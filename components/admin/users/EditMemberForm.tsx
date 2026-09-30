"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminUser, MemberType } from "@/lib/types/admin-user";
import { useAdminMe } from "@/hooks/useAdminMe";
import { useAdminMemberUuidVisibility } from "@/hooks/useAdminMemberUuidVisibility";
import type { MessageKey } from "@/lib/i18n/messages";
import { MemberAdminDialog } from "@/components/admin/users/MemberAdminDialog";
import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";

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
  const [errorText, setErrorText] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(true);

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

  const dirty = useMemo(() => {
    const nextDibayId = dibayId.trim().replace(/^@+/, "").toLowerCase();
    const currentDibayId = (user.dibay_id ?? "").replace(/^@+/, "").toLowerCase();
    return (
      nickname.trim() !== user.nickname ||
      nextDibayId !== currentDibayId ||
      email.trim().toLowerCase() !== (user.email ?? "").trim().toLowerCase() ||
      phone.trim() !== (user.phone ?? "").trim() ||
      (!memberLocked && memberType !== user.memberType) ||
      phoneStatus !== inferPhoneValue(user)
    );
  }, [nickname, dibayId, email, phone, memberType, phoneStatus, user, memberLocked]);

  const close = () => {
    if (pending) return;
    setOpen(false);
    onClose();
  };

  const submit = async () => {
    if (isReadOnly) return;
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
    const body: {
      nickname?: string;
      memberType?: MemberType;
      phoneVerificationStatus?: string;
      dibayId?: string;
      email?: string;
      phone?: string;
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

    if (Object.keys(body).length === 0) {
      setErrorText(t("admin_users_err_no_changes"));
      return;
    }

    setPending(true);
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
        setErrorText(message);
        return;
      }
      onSuccess();
      setOpen(false);
      onClose();
    } catch {
      setErrorText(t("admin_users_err_request"));
    } finally {
      setPending(false);
    }
  };

  return (
    <MemberAdminDialog
      open={open}
      title={MEMBER_ADMIN_COPY.member_edit_title}
      size="standard"
      description="회원 프로필 정보를 수정합니다. 비밀번호는 포함되지 않습니다."
      dirty={dirty}
      pending={pending}
      errorText={errorText}
      primaryLabel={MEMBER_ADMIN_COPY.save_changes}
      primaryDisabled={isReadOnly || !dirty}
      onCancel={close}
      onPrimary={() => void submit()}
    >
      <div className="space-y-3" data-member-edit-dialog="1">
        {isReadOnly ? (
          <p className="text-[13px] text-[#b42318]">프로필이 없어 수정할 수 없습니다.</p>
        ) : null}
        <label className="block text-[13px]">
          <span className="mb-1 block text-[#667085]">{t("admin_users_label_nickname")}</span>
          <input
            value={nickname}
            disabled={pending || isReadOnly}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            className="w-full rounded-md border border-[#d0d5dd] px-3 py-2"
          />
        </label>
        <label className="block text-[13px]">
          <span className="mb-1 block text-[#667085]">{t("admin_users_lite_label_public_id")}</span>
          <input
            value={dibayId}
            disabled={pending || isReadOnly}
            onChange={(e) => setDibayId(e.target.value)}
            className="w-full rounded-md border border-[#d0d5dd] px-3 py-2"
          />
        </label>
        <label className="block text-[13px]">
          <span className="mb-1 block text-[#667085]">{t("admin_users_label_email")}</span>
          <input
            type="email"
            value={email}
            disabled={pending || isReadOnly}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-[#d0d5dd] px-3 py-2"
          />
        </label>
        <label className="block text-[13px]">
          <span className="mb-1 block text-[#667085]">{t("admin_users_lite_label_phone")}</span>
          <input
            value={phone}
            disabled={pending || isReadOnly}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-md border border-[#d0d5dd] px-3 py-2"
          />
        </label>
        <label className="block text-[13px]" data-member-edit-member-type-r4-owned="1">
          <span className="mb-1 block text-[#667085]">{t("admin_users_label_member_type")}</span>
          <select
            value={memberType}
            disabled={pending || isReadOnly || memberLocked}
            onChange={(e) => setMemberType(e.target.value as MemberType)}
            className="w-full rounded-md border border-[#d0d5dd] px-3 py-2"
          >
            {memberOptions.map((opt) => (
              <option key={opt} value={opt}>
                {t(MEMBER_LABEL_KEYS[opt])}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[13px]">
          <span className="mb-1 block text-[#667085]">{t("admin_users_label_phone_verify_status")}</span>
          <select
            value={phoneStatus}
            disabled={pending || isReadOnly}
            onChange={(e) => setPhoneStatus(e.target.value)}
            className="w-full rounded-md border border-[#d0d5dd] px-3 py-2"
          >
            {PHONE_OPTION_KEYS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[11px] text-[#98a2b3]">
          {MEMBER_ADMIN_COPY.password_manage}은 별도 「{MEMBER_ADMIN_COPY.password_temp_set_title}」에서 처리합니다.
        </p>
        {showMemberUuid ? (
          <p className="font-mono text-[11px] text-[#98a2b3]">{user.id}</p>
        ) : (
          <button
            type="button"
            className="text-[11px] font-semibold text-[#667085]"
            onClick={() => setShowMemberUuid(true)}
          >
            {MEMBER_ADMIN_COPY.system_member_key}
          </button>
        )}
      </div>
    </MemberAdminDialog>
  );
}
