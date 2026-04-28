import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * 관리자 미인증 시 안내 — `AdminGuard`(클라)와 `app/admin/layout`(서버 게이트) 공통.
 */
export function AdminAccessDeniedPanel() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="sam-text-body font-medium text-sam-fg">{t("admin_access_denied_title")}</p>
      <p className="mt-2 sam-text-body-secondary text-sam-muted">
        {t("admin_access_denied_desc")}
      </p>
      <Link href="/philife" className="mt-4 sam-text-body font-medium text-signature underline">
        {t("common_homepage")}
      </Link>
    </div>
  );
}
