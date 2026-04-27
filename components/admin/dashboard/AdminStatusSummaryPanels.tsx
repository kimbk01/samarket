"use client";

import type {
  ProductStatusSummary,
  UserStatusSummary,
  ReportStatusSummary,
  ChatStatusSummary,
} from "@/lib/types/admin-dashboard";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  PRODUCT_STATUS_LABEL_KEYS,
  USER_STATUS_LABEL_KEYS,
  REPORT_STATUS_LABEL_KEYS,
  CHAT_STATUS_LABEL_KEYS,
} from "@/lib/admin-dashboard/admin-dashboard-utils";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { translate } from "@/lib/i18n/messages";

const PRODUCT_STATUS_ORDER: (keyof ProductStatusSummary)[] = [
  "active",
  "reserved",
  "sold",
  "hidden",
  "blinded",
  "deleted",
];
const USER_STATUS_ORDER: (keyof UserStatusSummary)[] = [
  "active",
  "warned",
  "suspended",
  "banned",
  "premium",
  "admin",
];
const REPORT_STATUS_ORDER: (keyof ReportStatusSummary)[] = ["pending", "reviewed", "rejected"];
const CHAT_STATUS_ORDER: (keyof ChatStatusSummary)[] = ["active", "blocked", "reported", "archived"];

interface AdminStatusSummaryPanelsProps {
  product: ProductStatusSummary;
  user: UserStatusSummary;
  report: ReportStatusSummary;
  chat: ChatStatusSummary;
  loading?: boolean;
}

function StatusRow({
  label,
  count,
  loading,
}: {
  label: string;
  count: number;
  loading?: boolean;
}) {
  return (
    <div className="flex justify-between sam-text-body-secondary">
      <span className="text-sam-muted">{label}</span>
      {loading ? (
        <span
          className="inline-block h-4 w-10 animate-pulse rounded bg-sam-border"
          aria-hidden
        />
      ) : (
        <span className="font-medium text-sam-fg">{count}</span>
      )}
    </div>
  );
}

function ProductSummary({
  summary,
  loading,
}: {
  summary: ProductStatusSummary;
  loading?: boolean;
}) {
  const { t } = useI18n();
  return (
    <AdminCard title={translate("ko", "admin_dashboard_card_product_status")}>
      <div className="space-y-2">
        {PRODUCT_STATUS_ORDER.map((key) => {
          const labelKey = PRODUCT_STATUS_LABEL_KEYS[key];
          return (
            <StatusRow
              key={key}
              label={labelKey ? t(labelKey) : key}
              count={summary[key] ?? 0}
              loading={loading}
            />
          );
        })}
      </div>
    </AdminCard>
  );
}

function UserSummary({
  summary,
  loading,
}: {
  summary: UserStatusSummary;
  loading?: boolean;
}) {
  const { t } = useI18n();
  return (
    <AdminCard title={translate("ko", "admin_dashboard_card_user_status")}>
      <div className="space-y-2">
        {USER_STATUS_ORDER.map((key) => {
          const labelKey = USER_STATUS_LABEL_KEYS[key];
          return (
            <StatusRow
              key={key}
              label={labelKey ? t(labelKey) : key}
              count={summary[key] ?? 0}
              loading={loading}
            />
          );
        })}
      </div>
    </AdminCard>
  );
}

function ReportSummary({
  summary,
  loading,
}: {
  summary: ReportStatusSummary;
  loading?: boolean;
}) {
  const { t } = useI18n();
  return (
    <AdminCard title={translate("ko", "admin_dashboard_card_report_status")}>
      <div className="space-y-2">
        {REPORT_STATUS_ORDER.map((key) => {
          const labelKey = REPORT_STATUS_LABEL_KEYS[key];
          return (
            <StatusRow
              key={key}
              label={labelKey ? t(labelKey) : key}
              count={summary[key] ?? 0}
              loading={loading}
            />
          );
        })}
      </div>
    </AdminCard>
  );
}

function ChatSummary({
  summary,
  loading,
}: {
  summary: ChatStatusSummary;
  loading?: boolean;
}) {
  const { t } = useI18n();
  return (
    <AdminCard title={translate("ko", "admin_dashboard_card_chat_status")}>
      <div className="space-y-2">
        {CHAT_STATUS_ORDER.map((key) => {
          const labelKey = CHAT_STATUS_LABEL_KEYS[key];
          return (
            <StatusRow
              key={key}
              label={labelKey ? t(labelKey) : key}
              count={summary[key] ?? 0}
              loading={loading}
            />
          );
        })}
      </div>
    </AdminCard>
  );
}

export function AdminStatusSummaryPanels({
  product,
  user,
  report,
  chat,
  loading,
}: AdminStatusSummaryPanelsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <ProductSummary summary={product} loading={loading} />
      <UserSummary summary={user} loading={loading} />
      <ReportSummary summary={report} loading={loading} />
      <ChatSummary summary={chat} loading={loading} />
    </div>
  );
}
