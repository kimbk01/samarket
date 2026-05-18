"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getAdminUserById, getAdminMemo, setAdminMemo, getActivitySummary } from "@/lib/admin-users/mock-admin-users";
import { getModerationLogsByUserId } from "@/lib/admin-users/mock-user-moderation-logs";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminModerationStatusBadge } from "@/components/admin/AdminModerationStatusBadge";
import { AdminUserActionPanel } from "./AdminUserActionPanel";
import { AdminUserModerationLogList } from "./AdminUserModerationLogList";
import { AdminUserSummaryCards } from "./AdminUserSummaryCards";
import {
  AdminTestUserDetail,
  type ApiTestUserRow,
} from "@/components/admin/users/AdminTestUserDetail";
import { AdminUserPointsSection } from "./AdminUserPointsSection";
import { useAdminMemberUuidVisibility } from "@/hooks/useAdminMemberUuidVisibility";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MemberType } from "@/lib/types/admin-user";
import type { AppLanguageCode } from "@/lib/i18n/config";

const MEMBER_TYPE_LABEL_KEYS: Record<MemberType, MessageKey> = {
  normal: "admin_users_member_type_normal_full",
  premium: "admin_users_member_type_premium_full",
  admin: "admin_users_member_type_admin_full",
};

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

interface AdminUserDetailPageProps {
  userId: string;
}

export function AdminUserDetailPage({ userId }: AdminUserDetailPageProps) {
  const { t, language } = useI18n();
  const dateLocale = dateLocaleTag(language);
  const { showMemberUuid, setShowMemberUuid } = useAdminMemberUuidVisibility();
  const [refresh, setRefresh] = useState(0);
  const [memoInput, setMemoInput] = useState("");
  const [apiUser, setApiUser] = useState<ApiTestUserRow | "loading" | "absent">("loading");
  const user = getAdminUserById(userId);
  const summary = getActivitySummary(userId);
  const logs = getModerationLogsByUserId(userId);
  const refreshDetail = useCallback(() => setRefresh((r) => r + 1), []);

  useEffect(() => {
    let cancelled = false;
    setApiUser("loading");
    (async () => {
      try {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
          credentials: "include",
        });
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { ok?: boolean; user?: ApiTestUserRow };
          if (data.ok && data.user) {
            setApiUser(data.user);
            return;
          }
        }
        setApiUser("absent");
      } catch {
        if (!cancelled) setApiUser("absent");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (apiUser === "loading") {
    return (
      <div className="py-12 text-center sam-text-body text-sam-muted">{t("admin_users_detail_loading")}</div>
    );
  }

  if (apiUser !== "absent") {
    return <AdminTestUserDetail user={apiUser} />;
  }

  if (!user) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">
        {t("admin_users_detail_not_found")}
      </div>
    );
  }

  const hasMemo = getAdminMemo(userId);

  const handleSaveMemo = () => {
    setAdminMemo(userId, memoInput);
    setMemoInput("");
    refreshDetail();
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_users_detail_title" backHref="/admin/users" />

      <AdminCard titleKey="admin_users_card_basic_info">
        <div className="flex gap-4">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-sam-border-soft" />
          <div className="min-w-0 flex-1">
            <p className="sam-text-body font-semibold text-sam-fg">{user.nickname}</p>
            {showMemberUuid ? (
              <p className="sam-text-body-secondary text-sam-muted">
                {t("admin_users_label_id_prefix")} {user.id}
                <button
                  type="button"
                  className="ml-2 sam-text-helper font-medium text-signature hover:underline"
                  onClick={() => setShowMemberUuid(false)}
                >
                  {t("admin_users_action_hide")}
                </button>
              </p>
            ) : (
              <p className="sam-text-body-secondary text-sam-muted">
                {t("admin_users_label_id_hidden")}
                <button
                  type="button"
                  className="ml-2 sam-text-helper font-medium text-signature hover:underline"
                  onClick={() => setShowMemberUuid(true)}
                >
                  {t("admin_users_action_show")}
                </button>
              </p>
            )}
            {user.email && (
              <p className="mt-1 sam-text-body-secondary text-sam-muted">{user.email}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <AdminModerationStatusBadge status={user.moderationStatus} />
              <span className="rounded bg-sam-surface-muted px-2 py-0.5 sam-text-helper text-sam-fg">
                {t(MEMBER_TYPE_LABEL_KEYS[user.memberType])}
              </span>
            </div>
            <p className="mt-2 sam-text-body-secondary text-sam-muted">
              {t("admin_users_label_joined")} {new Date(user.joinedAt).toLocaleString(dateLocale)}
              {user.lastActiveAt && (
                <> · {t("admin_users_label_last_active")} {new Date(user.lastActiveAt).toLocaleDateString(dateLocale)}</>
              )}
            </p>
            {user.location && (
              <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("admin_users_label_region_prefix")} {user.location}</p>
            )}
          </div>
        </div>
      </AdminCard>

      <AdminUserSummaryCards summary={summary} />

      <AdminCard titleKey="admin_users_card_trade_summary">
        <dl className="grid gap-2 sam-text-body">
          <div>
            <dt className="text-sam-muted">{t("admin_users_stat_products")}</dt>
            <dd>{user.productCount}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_users_stat_sold")}</dt>
            <dd>{user.soldCount}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_users_stat_reports")}</dt>
            <dd>{user.reportCount}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_users_stat_chats")}</dt>
            <dd>{user.chatCount}</dd>
          </div>
        </dl>
      </AdminCard>

      <AdminCard titleKey="admin_users_card_memo">
        {hasMemo && (
          <p className="mb-2 sam-text-body-secondary text-sam-fg">{hasMemo}</p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={t("admin_ads_memo_placeholder")}
            value={memoInput}
            onChange={(e) => setMemoInput(e.target.value)}
            className="min-w-0 flex-1 rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg placeholder:text-sam-meta"
          />
          <button
            type="button"
            onClick={handleSaveMemo}
            className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app"
          >
            {t("common_save")}
          </button>
        </div>
      </AdminCard>

      <AdminUserPointsSection userId={userId} />

      <AdminCard titleKey="admin_users_card_admin_action">
        <AdminUserActionPanel user={user} onActionSuccess={refreshDetail} />
      </AdminCard>

      <AdminCard titleKey="admin_users_card_moderation_log">
        <AdminUserModerationLogList logs={logs} />
      </AdminCard>
    </div>
  );
}
