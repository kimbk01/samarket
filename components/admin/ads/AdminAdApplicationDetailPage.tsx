"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AppLanguageCode } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import type {
  AdApplicationStatus,
  AdPaymentMethod,
  AdPaymentStatus,
  AdPlacement,
  AdTargetType,
} from "@/lib/types/ad-application";
import {
  getAdApplicationById,
  setAdApplicationAdminMemo,
} from "@/lib/ads/mock-ad-applications";
import { getAdApplicationLogs } from "@/lib/ads/mock-ad-logs";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminAdActionPanel } from "./AdminAdActionPanel";
import { AdminAdLogList } from "./AdminAdLogList";

const TARGET_KEYS = {
  product: "admin_ads_target_product",
  shop: "admin_ads_target_shop",
  banner: "admin_ads_target_banner",
} as const satisfies Record<AdTargetType, MessageKey>;

const PLACEMENT_KEYS = {
  home_top: "admin_ads_placement_home_top",
  home_middle: "admin_ads_placement_home_middle",
  search_top: "admin_ads_placement_search_top",
  product_detail: "admin_ads_placement_product_detail",
  shop_featured: "admin_ads_placement_shop_featured",
} as const satisfies Record<AdPlacement, MessageKey>;

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

const PAYMENT_METHOD_KEYS = {
  bank_transfer: "admin_ads_payment_method_bank_transfer",
  gcash: "admin_ads_payment_method_gcash",
  manual_confirm: "admin_ads_payment_method_manual_confirm",
} as const satisfies Record<AdPaymentMethod, MessageKey>;

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

interface AdminAdApplicationDetailPageProps {
  applicationId: string;
}

export function AdminAdApplicationDetailPage({
  applicationId,
}: AdminAdApplicationDetailPageProps) {
  const { t, language } = useI18n();
  const dateLocale = dateLocaleTag(language);
  const [, setRefresh] = useState(0);
  const [memoInput, setMemoInput] = useState("");
  const application = getAdApplicationById(applicationId);
  const logs = getAdApplicationLogs(applicationId);
  const refreshDetail = useCallback(() => setRefresh((r) => r + 1), []);

  if (!application) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">
        {t("admin_ads_application_not_found")}
      </div>
    );
  }

  const handleSaveMemo = () => {
    setAdApplicationAdminMemo(applicationId, memoInput);
    setMemoInput("");
    refreshDetail();
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        titleKey="admin_page_ad_application_detail"
        backHref="/admin/ad-applications"
      />
      <AdminAdActionPanel application={application} onActionSuccess={refreshDetail} />
      <AdminCard titleKey="admin_ads_card_application_info">
        <dl className="grid gap-2 sam-text-body">
          <div>
            <dt className="text-sam-muted">{t("admin_ads_label_target")}</dt>
            <dd>
              {t(TARGET_KEYS[application.targetType])} · {application.targetTitle}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_ads_label_placement")}</dt>
            <dd>{t(PLACEMENT_KEYS[application.placement])}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_ads_label_plan_duration_amount")}</dt>
            <dd>
              {application.planName} · {t("admin_ads_duration_days", { days: application.durationDays })} · ₩
              {application.totalPrice.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_ads_label_payment_method")}</dt>
            <dd>{t(PAYMENT_METHOD_KEYS[application.paymentMethod])}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_ads_label_payment_status")}</dt>
            <dd>{t(PAYMENT_STATUS_KEYS[application.paymentStatus])}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_ads_label_application_status")}</dt>
            <dd>
              <span
                className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                  application.applicationStatus === "active"
                    ? "bg-signature/10 text-signature"
                    : application.applicationStatus === "rejected"
                      ? "bg-red-50 text-red-700"
                      : "bg-sam-surface-muted text-sam-fg"
                }`}
              >
                {t(APP_STATUS_KEYS[application.applicationStatus])}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_ads_label_applicant")}</dt>
            <dd>
              {application.applicantNickname} ({application.applicantUserId})
            </dd>
          </div>
          {(application.startAt || application.endAt) && (
            <div>
              <dt className="text-sam-muted">{t("admin_ads_label_exposure_period")}</dt>
              <dd className="sam-text-body-secondary text-sam-muted">
                {application.startAt &&
                  new Date(application.startAt).toLocaleString(dateLocale)}
                {" ~ "}
                {application.endAt && new Date(application.endAt).toLocaleString(dateLocale)}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-sam-muted">{t("admin_ads_label_applied_at")}</dt>
            <dd className="sam-text-body-secondary text-sam-muted">
              {new Date(application.createdAt).toLocaleString(dateLocale)}
            </dd>
          </div>
          {application.applicantMemo && (
            <div>
              <dt className="text-sam-muted">{t("admin_ads_label_applicant_memo")}</dt>
              <dd className="whitespace-pre-wrap text-sam-fg">{application.applicantMemo}</dd>
            </div>
          )}
        </dl>
      </AdminCard>
      <AdminCard titleKey="admin_ads_card_admin_memo">
        <div className="flex gap-2">
          <input
            type="text"
            value={memoInput}
            onChange={(e) => setMemoInput(e.target.value)}
            placeholder={t("admin_ads_memo_placeholder")}
            className="flex-1 rounded border border-sam-border px-3 py-2 sam-text-body"
          />
          <button
            type="button"
            onClick={handleSaveMemo}
            className="rounded border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg hover:bg-sam-surface-muted"
          >
            {t("common_save")}
          </button>
        </div>
        {application.adminMemo && (
          <p className="mt-2 sam-text-body-secondary text-sam-muted">{application.adminMemo}</p>
        )}
      </AdminCard>
      <AdminCard titleKey="admin_ads_card_change_log">
        <AdminAdLogList logs={logs} />
      </AdminCard>
    </div>
  );
}
