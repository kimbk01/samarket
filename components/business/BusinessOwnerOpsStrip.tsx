"use client";

import type { BusinessProfile } from "@/lib/types/business";
import type { StoreRow } from "@/lib/stores/db-store-mapper";

const APPROVAL_LABEL: Record<string, string> = {
  pending: "심사 대기",
  under_review: "검토 중",
  revision_requested: "보완 요청",
  approved: "매장 승인됨",
  rejected: "반려",
  suspended: "정지",
};

const SALES_LABEL: Record<string, string> = {
  pending: "판매 심사 대기",
  approved: "판매 승인됨",
  rejected: "판매 불가",
  suspended: "판매 정지",
};

export function BusinessOwnerOpsStrip({
  row,
  profile,
  canSell,
}: {
  row: StoreRow;
  profile: BusinessProfile;
  canSell: boolean;
}) {
  const approval = row.approval_status ?? "";
  const sales = row.sales_permission?.sales_status ?? "pending";
  const visible = row.is_visible !== false;

  return (
    <section
      className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm"
      aria-label="매장 운영 상태"
    >
      <h2 className="sam-text-body-secondary font-semibold text-sam-muted">운영·심사 상태</h2>
      <dl className="mt-3 space-y-2 sam-text-body-secondary text-sam-fg">
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-sam-muted">매장 심사</dt>
          <dd className="text-right font-medium">{APPROVAL_LABEL[approval] ?? approval}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-sam-muted">공개 노출</dt>
          <dd className="text-right font-medium">{visible ? "노출 중" : "비공개"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-sam-muted">판매(주문)</dt>
          <dd className="text-right font-medium">
            {canSell ? "승인됨 · 상품 공개 가능" : SALES_LABEL[sales] ?? sales}
          </dd>
        </div>
        {(profile.storeCategoryName || profile.storeTopicName) && (
          <div className="flex justify-between gap-3 border-t border-sam-border-soft pt-2">
            <dt className="shrink-0 text-sam-muted">피드 분류</dt>
            <dd className="text-right">
              {[profile.storeCategoryName, profile.storeTopicName].filter(Boolean).join(" · ")}
            </dd>
          </div>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-sam-border-soft pt-2 sam-text-helper text-sam-muted">
          {row.delivery_available === true && <span>배달 가능</span>}
          {row.pickup_available !== false && <span>포장·픽업 가능</span>}
          {row.delivery_available !== true && row.pickup_available === false && (
            <span>서비스 형태 미설정 → 매장 설정에서 설정</span>
          )}
        </div>
      </dl>
    </section>
  );
}
