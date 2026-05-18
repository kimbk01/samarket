"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminUser } from "@/lib/types/admin-user";
import { applyUserModerationAction } from "@/lib/admin-users/apply-user-moderation";
import { setMemberType } from "@/lib/admin-users/mock-admin-users";

interface AdminUserActionPanelProps {
  user: AdminUser;
  onActionSuccess: () => void;
}

export function AdminUserActionPanel({
  user,
  onActionSuccess,
}: AdminUserActionPanelProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState<string | null>(null);

  const runModeration = (action: "warn" | "suspend" | "ban" | "restore") => {
    setLoading(action);
    const result = applyUserModerationAction(user.id, action);
    setLoading(null);
    if (result.ok) onActionSuccess();
    else alert(result.message ?? t("admin_users_action_failed"));
  };

  const runPremium = (isPremium: boolean) => {
    setLoading(isPremium ? "premium_on" : "premium_off");
    setMemberType(user.id, isPremium ? "premium" : "normal");
    setLoading(null);
    onActionSuccess();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {user.moderationStatus !== "warned" && (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => runModeration("warn")}
            className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app disabled:opacity-50"
          >
            {loading === "warn" ? t("admin_users_action_processing") : t("admin_users_action_warn")}
          </button>
        )}
        {user.moderationStatus !== "suspended" && (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => runModeration("suspend")}
            className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app disabled:opacity-50"
          >
            {loading === "suspend" ? t("admin_users_action_processing") : t("admin_users_action_suspend")}
          </button>
        )}
        {user.moderationStatus !== "banned" && (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => runModeration("ban")}
            className="rounded border border-red-100 bg-red-50 px-3 py-2 sam-text-body-secondary font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {loading === "ban" ? t("admin_users_action_processing") : t("admin_users_action_ban")}
          </button>
        )}
        {user.moderationStatus !== "normal" && (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => runModeration("restore")}
            className="rounded border border-emerald-100 bg-emerald-50 px-3 py-2 sam-text-body-secondary font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            {loading === "restore" ? t("admin_users_action_processing") : t("admin_users_action_restore")}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-sam-border-soft pt-3">
        {user.memberType !== "admin" && (
          <>
            {user.memberType === "premium" ? (
              <button
                type="button"
                disabled={loading !== null}
                onClick={() => runPremium(false)}
                className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app disabled:opacity-50"
              >
                {loading === "premium_off" ? t("admin_users_action_processing") : t("admin_users_action_premium_off")}
              </button>
            ) : (
              <button
                type="button"
                disabled={loading !== null}
                onClick={() => runPremium(true)}
                className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app disabled:opacity-50"
              >
                {loading === "premium_on" ? t("admin_users_action_processing") : t("admin_users_action_premium_on")}
              </button>
            )}
          </>
        )}
        <span className="rounded border border-sam-border-soft bg-sam-app px-3 py-2 sam-text-helper text-sam-muted">
          {t("admin_users_admin_assign_placeholder")}
        </span>
      </div>
    </div>
  );
}
