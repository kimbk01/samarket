"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";

/** 부적절한 프로필 사진·소개글 초기화 — `/api/admin/member-profile-content/:id` (L2: 확인 + 사유) */
export function AdminMemberProfileContentReset({
  userId,
  onUpdated,
}: {
  userId: string;
  onUpdated?: () => void;
}) {
  const { safeT, language } = useI18n();
  const ko = language !== "en";
  const [avatar, setAvatar] = useState(false);
  const [bio, setBio] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const canSubmit = (avatar || bio) && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("sanction"),
      ko,
      title: safeT("admin_member_profile_reset_confirm"),
      confirmLabel: adminCta("reset", ko),
      destructive: true,
      reasonPlaceholder: safeT("admin_member_profile_reset_reason_placeholder"),
    });
    if (!confirmed.ok) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/member-profile-content/${encodeURIComponent(userId)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar, bio, reason: confirmed.reason ?? "" }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || json.ok !== true) {
        setMessage({
          tone: "error",
          text: safeT("admin_member_profile_reset_failed"),
        });
        return;
      }
      setAvatar(false);
      setBio(false);
      setMessage({
        tone: "ok",
        text: safeT("admin_member_profile_reset_done"),
      });
      onUpdated?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${ADMIN_USERS_LITE_CARD} space-y-3 p-4`} data-member-profile-content-reset="1">
      <h3 className="text-xs font-bold uppercase tracking-wide text-sam-muted">
        {safeT("admin_member_profile_reset_title")}
      </h3>
      <div className="flex flex-wrap gap-4 text-sm text-sam-fg">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={avatar} onChange={(e) => setAvatar(e.target.checked)} />
          {safeT("admin_member_profile_reset_avatar")}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={bio} onChange={(e) => setBio(e.target.checked)} />
          {safeT("admin_member_profile_reset_bio")}
        </label>
      </div>
      <div className="flex items-center gap-3">
        <AdminActionButton variant="danger" size="sm" disabled={!canSubmit} onClick={() => void submit()}>
          {adminCta("reset", ko)}
        </AdminActionButton>
        {message ? (
          <p className={`text-xs font-semibold ${message.tone === "ok" ? "text-sam-primary" : "text-sam-danger"}`}>
            {message.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
