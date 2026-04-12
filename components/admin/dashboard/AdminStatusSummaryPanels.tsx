"use client";

import type {
  ProductStatusSummary,
  UserStatusSummary,
  ReportStatusSummary,
  ChatStatusSummary,
} from "@/lib/types/admin-dashboard";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  PRODUCT_STATUS_LABELS,
  USER_STATUS_LABELS,
  REPORT_STATUS_LABELS,
  CHAT_STATUS_LABELS,
} from "@/lib/admin-dashboard/admin-dashboard-utils";

interface AdminStatusSummaryPanelsProps {
  product: ProductStatusSummary;
  user: UserStatusSummary;
  report: ReportStatusSummary;
  chat: ChatStatusSummary;
}

function StatusRow({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <div className="flex justify-between text-[13px]">
      <span className="text-sam-muted">{label}</span>
      <span className="font-medium text-sam-fg">{count}</span>
    </div>
  );
}

function ProductSummary({ summary }: { summary: ProductStatusSummary }) {
  return (
    <AdminCard title="상품 상태">
      <div className="space-y-2">
        {(Object.keys(PRODUCT_STATUS_LABELS) as (keyof ProductStatusSummary)[]).map(
          (key) => (
            <StatusRow
              key={key}
              label={PRODUCT_STATUS_LABELS[key] ?? key}
              count={summary[key] ?? 0}
            />
          )
        )}
      </div>
    </AdminCard>
  );
}

function UserSummary({ summary }: { summary: UserStatusSummary }) {
  return (
    <AdminCard title="회원 상태">
      <div className="space-y-2">
        {(Object.keys(USER_STATUS_LABELS) as (keyof UserStatusSummary)[]).map(
          (key) => (
            <StatusRow
              key={key}
              label={USER_STATUS_LABELS[key] ?? key}
              count={summary[key] ?? 0}
            />
          )
        )}
      </div>
    </AdminCard>
  );
}

function ReportSummary({ summary }: { summary: ReportStatusSummary }) {
  return (
    <AdminCard title="신고 상태">
      <div className="space-y-2">
        {(Object.keys(REPORT_STATUS_LABELS) as (keyof ReportStatusSummary)[]).map(
          (key) => (
            <StatusRow
              key={key}
              label={REPORT_STATUS_LABELS[key] ?? key}
              count={summary[key] ?? 0}
            />
          )
        )}
      </div>
    </AdminCard>
  );
}

function ChatSummary({ summary }: { summary: ChatStatusSummary }) {
  return (
    <AdminCard title="채팅 상태">
      <div className="space-y-2">
        {(Object.keys(CHAT_STATUS_LABELS) as (keyof ChatStatusSummary)[]).map(
          (key) => (
            <StatusRow
              key={key}
              label={CHAT_STATUS_LABELS[key] ?? key}
              count={summary[key] ?? 0}
            />
          )
        )}
      </div>
    </AdminCard>
  );
}

export function AdminStatusSummaryPanels({
  product,
  user,
  report,
  chat,
}: AdminStatusSummaryPanelsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <ProductSummary summary={product} />
      <UserSummary summary={user} />
      <ReportSummary summary={report} />
      <ChatSummary summary={chat} />
    </div>
  );
}
