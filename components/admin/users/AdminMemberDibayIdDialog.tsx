"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MemberAdminDialog } from "@/components/admin/users/MemberAdminDialog";
import { MEMBER_ADMIN_COPY_KEY } from "@/lib/admin-users/member-admin-copy-ssot";
import { adminMemberPublicIdAt } from "@/lib/admin-users/admin-member-identity";
import {
  dibayIdErrorMessageKo,
  isSystemReservedDibayIdPrefix,
  isValidDibayIdFormat,
  normalizeDibayIdInput,
} from "@/lib/auth/dibay-id-policy";

const DIBAY_ID_REASON_MAX = 300;

export function AdminMemberDibayIdDialog({
  open,
  userId,
  currentDibayId,
  isAdminCreatedMember = false,
  onClose,
  onSuccess,
}: {
  open: boolean;
  userId: string;
  currentDibayId?: string | null;
  /** 관리자 생성 회원 — 로그인 아이디(@manual.local)를 @ID 와 함께 바꿀 수 있다 (설계안 ⑧ G3) */
  isAdminCreatedMember?: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { t } = useI18n();
  const currentDisplay = adminMemberPublicIdAt(currentDibayId) || "—";
  const [nextId, setNextId] = useState(() => normalizeDibayIdInput(currentDibayId));
  /** 변경 사유 — 필수 (서버·DB admin_set_dibay_id 가 같은 트랜잭션에서 감사 기록) */
  const [reason, setReason] = useState("");
  const [syncLoginId, setSyncLoginId] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNextId(normalizeDibayIdInput(currentDibayId));
    setReason("");
    setSyncLoginId(false);
    setErrorText(null);
    setPending(false);
  }, [open, currentDibayId]);

  const normalized = normalizeDibayIdInput(nextId);
  const currentNorm = normalizeDibayIdInput(currentDibayId);
  const dirty = normalized !== currentNorm;
  const trimmedReason = reason.trim();

  const clientError = useMemo(() => {
    if (!dirty) return null;
    if (!normalized) return t("admin_users_member_dibay_id_required");
    if (!isValidDibayIdFormat(normalized)) {
      return isSystemReservedDibayIdPrefix(normalized)
        ? (dibayIdErrorMessageKo("dibay_id_reserved_prefix") as string)
        : t("admin_users_member_dibay_id_invalid_format_detail");
    }
    if (!trimmedReason) return t("admin_users_member_dibay_id_reason_required");
    if (trimmedReason.length > DIBAY_ID_REASON_MAX) return t("admin_users_member_dibay_id_reason_too_long", { max: DIBAY_ID_REASON_MAX });
    return null;
  }, [dirty, normalized, trimmedReason, t]);

  const handleChange = async () => {
    setErrorText(null);
    if (clientError) {
      setErrorText(clientError);
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dibayId: normalized,
          dibayIdReason: trimmedReason,
          ...(isAdminCreatedMember && syncLoginId ? { syncManualLoginId: true } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !data.ok) {
        if (
          (data.error === "login_id_taken" ||
            data.error === "login_id_update_failed" ||
            data.error === "login_id_sync_not_manual") &&
          data.message
        ) {
          setErrorText(data.message);
          return;
        }
        if (data.error === "dibay_id_similar_taken" || data.error === "dibay_id_reserved_prefix") {
          setErrorText(dibayIdErrorMessageKo(data.error) ?? t(MEMBER_ADMIN_COPY_KEY.mutation_failed));
          return;
        }
        if (res.status === 409 || data.error === "dibay_id_taken") {
          setErrorText(t("admin_users_member_dibay_id_taken"));
          return;
        }
        if (data.error === "dibay_id_reason_required" || data.error === "reason_required") {
          setErrorText(t("admin_users_member_dibay_id_reason_required"));
          return;
        }
        if (data.error === "dibay_id_reason_too_long" || data.error === "reason_too_long") {
          setErrorText(t("admin_users_member_dibay_id_reason_too_long", { max: DIBAY_ID_REASON_MAX }));
          return;
        }
        if (
          data.error === "invalid_dibay_id" ||
          data.error === "dibay_id_invalid_format" ||
          data.error === "dibay_id_reserved" ||
          data.error === "dibay_id_reserved_pattern"
        ) {
          setErrorText(t("admin_users_member_dibay_id_invalid_format"));
          return;
        }
        if (res.status === 401 || res.status === 403) {
          setErrorText(t("admin_users_member_no_permission"));
          return;
        }
        setErrorText(t(MEMBER_ADMIN_COPY_KEY.mutation_failed));
        return;
      }
      onSuccess?.();
      onClose();
    } catch {
      setErrorText(t(MEMBER_ADMIN_COPY_KEY.mutation_failed));
    } finally {
      setPending(false);
    }
  };

  if (!open) return null;

  return (
    <MemberAdminDialog
      open={open}
      title={t(MEMBER_ADMIN_COPY_KEY.dibay_id_change_title)}
      description={t(MEMBER_ADMIN_COPY_KEY.dibay_id_change_body)}
      size="small"
      dirty={dirty}
      pending={pending}
      errorText={errorText}
      primaryLabel={t(MEMBER_ADMIN_COPY_KEY.dibay_id_change_primary)}
      primaryDisabled={!dirty || Boolean(clientError)}
      onCancel={onClose}
      onPrimary={() => void handleChange()}
    >
      <div className="space-y-3" data-member-dibay-id-dialog="1" data-member-screen="S14">
        <div>
          <p className="mb-1 text-[13px] text-sam-muted">{t(MEMBER_ADMIN_COPY_KEY.dibay_id_current_label)}</p>
          <p className="font-mono text-sm text-sam-fg" data-member-dibay-id-current="1">
            {currentDisplay}
          </p>
        </div>
        <label className="block text-[13px]">
          <span className="mb-1 block text-sam-muted">{t(MEMBER_ADMIN_COPY_KEY.dibay_id_new_label)}</span>
          <div className="flex items-center gap-1">
            <span className="text-sam-muted">@</span>
            <input
              className="w-full rounded-md border border-sam-border px-3 py-2 font-mono"
              value={nextId}
              onChange={(e) => setNextId(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              data-member-dibay-id-input="1"
            />
          </div>
        </label>
        <label className="block text-[13px]">
          <span className="mb-1 block text-sam-muted">{t("admin_users_dibay_id_reason_required")}</span>
          <textarea
            className="w-full rounded-md border border-sam-border px-3 py-2"
            rows={2}
            maxLength={DIBAY_ID_REASON_MAX}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("admin_users_dibay_id_reason_placeholder")}
            data-member-dibay-id-reason="1"
          />
          <span className="mt-1 block text-[12px] text-sam-muted">
            {t("admin_users_dibay_id_admin_change_note")}
          </span>
        </label>
        {isAdminCreatedMember ? (
          <label className="flex items-start gap-2 text-[13px]" data-member-dibay-id-sync-login="1">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={syncLoginId}
              onChange={(e) => setSyncLoginId(e.target.checked)}
            />
            <span>
              <span className="block font-medium text-sam-fg">{t("admin_users_dibay_id_sync_login_id")}</span>
              <span className="block text-[12px] text-sam-muted">
                {syncLoginId
                  ? t("admin_users_dibay_id_sync_login_id_on", { loginId: normalized || t("admin_users_dibay_id_new_login_id") })
                  : t("admin_users_dibay_id_sync_login_id_off")}
              </span>
            </span>
          </label>
        ) : null}
      </div>
    </MemberAdminDialog>
  );
}
