"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AppLanguageCode } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AdApplication, AdApplicationStatus, AdPaymentStatus } from "@/lib/types/ad-application";

const APP_STATUS_KEYS = {
  pending: "admin_ads_app_status_pending",
  waiting_payment: "admin_ads_app_status_waiting_payment",
  approved: "admin_ads_app_status_approved",
  rejected: "admin_ads_app_status_rejected",
  active: "admin_ads_app_status_active",
  expired: "admin_ads_app_status_expired",
  cancelled: "admin_ads_app_status_cancelled",
} as const satisfies Record<AdApplicationStatus, MessageKey>;

const PAYMENT_STATUS_KEYS = {
  unpaid: "admin_ads_payment_status_unpaid",
  waiting_confirm: "admin_ads_payment_status_waiting_confirm",
  paid: "admin_ads_payment_status_paid",
  refunded: "admin_ads_payment_status_refunded",
} as const satisfies Record<AdPaymentStatus, MessageKey>;

const STATUS_CLASS: Record<AdApplication["applicationStatus"], string> = {
  pending: "bg-sam-surface-muted text-sam-fg",
  waiting_payment: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-50 text-emerald-800",
  rejected: "bg-red-50 text-red-700",
  active: "bg-signature/10 text-signature",
  expired: "bg-sam-border-soft text-sam-muted",
  cancelled: "bg-sam-border-soft text-sam-muted",
};

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

interface AdminAdApplicationTableProps {
  applications: AdApplication[];
}

export function AdminAdApplicationTable({
  applications,
}: AdminAdApplicationTableProps) {
  const { t, language } = useI18n();
  const dateLocale = dateLocaleTag(language);

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_ads_col_target")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_ads_col_applicant")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_ads_col_plan_amount")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_ads_col_app_status")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_ads_col_payment_status")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_ads_col_applied_at")}
            </th>
          </tr>
        </thead>
        <tbody>
          {applications.map((a) => (
            <tr
              key={a.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/ad-applications/${a.id}`}
                  className="font-medium text-signature hover:underline"
                >
                  {a.targetTitle}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{a.applicantNickname}</td>
              <td className="px-3 py-2.5 text-sam-fg">
                {a.planName} / ₱{a.totalPrice.toLocaleString()}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${STATUS_CLASS[a.applicationStatus]}`}
                >
                  {t(APP_STATUS_KEYS[a.applicationStatus])}
                </span>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {t(PAYMENT_STATUS_KEYS[a.paymentStatus])}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(a.createdAt).toLocaleDateString(dateLocale)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
