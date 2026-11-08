"use client";

import {
  MEMBER_ADMIN_COPY_KEY,
} from "@/lib/admin-users/member-admin-copy-ssot";
import {
  memberDetailAccountStateLabel,
} from "@/lib/admin-users/member-detail-presentation";
import type { AdminUserDetailPayload } from "@/components/admin/users/AdminTestUserDetail";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

/**
 * P3 신고·제재 tab — current account state + history navigation.
 * P7 owns suspend/block/withdraw/purge workflows. No destructive CTAs here.
 */
export function AdminMemberReportsPanel({
  user,
  onOpenOps,
}: {
  user: AdminUserDetailPayload;
  onOpenOps: () => void;
}) {
  const { t, language } = useI18n();
  const accountState = memberDetailAccountStateLabel(user.moderation_status, user.status, language);

  return (
    <div className="space-y-3" data-member-detail-reports="1">
      <section className={`${ADMIN_USERS_LITE_CARD} space-y-2 p-4`}>
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-sam-muted">
          {t(MEMBER_ADMIN_COPY_KEY.moderation)}
        </h3>
        <dl className="space-y-2 text-[13px]">
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <dt className="text-sam-muted">{t("admin_users_account_state")}</dt>
            <dd className="font-semibold text-sam-fg" data-reports-account-state="1">
              {accountState}
            </dd>
          </div>
        </dl>
        <p className="text-[12px] text-sam-muted">
          {t("admin_users_reports_risk_actions_note")}
        </p>
        <p className="text-[12px] text-sam-muted" data-member-cap="CAP-MSG-SUPPORT" data-member-cap-phase="R8">
          {t("admin_users_reports_support_message_note")}
        </p>
        <AdminActionButton variant="ghost" size="sm" onClick={onOpenOps} data-reports-open-ops="1">
          {t("admin_users_reports_view_ops_history", { label: t(MEMBER_ADMIN_COPY_KEY.ops_history) })}
        </AdminActionButton>
      </section>
    </div>
  );
}
