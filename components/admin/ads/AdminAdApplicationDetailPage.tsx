"use client";

import { useCallback, useState } from "react";
import type { AdApplication } from "@/lib/types/ad-application";
import {
  getAdApplicationById,
  setAdApplicationAdminMemo,
} from "@/lib/ads/mock-ad-applications";
import { getAdApplicationLogs } from "@/lib/ads/mock-ad-logs";
import {
  AD_APPLICATION_STATUS_LABELS,
  AD_PAYMENT_STATUS_LABELS,
  AD_PAYMENT_METHOD_LABELS,
  AD_TARGET_LABELS,
  AD_PLACEMENT_LABELS,
} from "@/lib/ads/ad-utils";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminAdActionPanel } from "./AdminAdActionPanel";
import { AdminAdLogList } from "./AdminAdLogList";

interface AdminAdApplicationDetailPageProps {
  applicationId: string;
}

export function AdminAdApplicationDetailPage({
  applicationId,
}: AdminAdApplicationDetailPageProps) {
  const [refresh, setRefresh] = useState(0);
  const [memoInput, setMemoInput] = useState("");
  const application = getAdApplicationById(applicationId);
  const logs = getAdApplicationLogs(applicationId);
  const refreshDetail = useCallback(() => setRefresh((r) => r + 1), []);

  if (!application) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">
        광고 신청을 찾을 수 없습니다.
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
        title="광고 신청 상세"
        backHref="/admin/ad-applications"
      />
      <AdminAdActionPanel application={application} onActionSuccess={refreshDetail} />
      <AdminCard title="신청 정보">
        <dl className="grid gap-2 sam-text-body">
          <div>
            <dt className="text-sam-muted">대상</dt>
            <dd>
              {AD_TARGET_LABELS[application.targetType]} ·{" "}
              {application.targetTitle}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">노출 위치</dt>
            <dd>{AD_PLACEMENT_LABELS[application.placement]}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">플랜 / 기간 / 금액</dt>
            <dd>
              {application.planName} · {application.durationDays}일 · ₩
              {application.totalPrice.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">결제 방식</dt>
            <dd>{AD_PAYMENT_METHOD_LABELS[application.paymentMethod]}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">결제 상태</dt>
            <dd>{AD_PAYMENT_STATUS_LABELS[application.paymentStatus]}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">신청 상태</dt>
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
                {AD_APPLICATION_STATUS_LABELS[application.applicationStatus]}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">신청자</dt>
            <dd>
              {application.applicantNickname} ({application.applicantUserId})
            </dd>
          </div>
          {(application.startAt || application.endAt) && (
            <div>
              <dt className="text-sam-muted">노출 기간</dt>
              <dd className="sam-text-body-secondary text-sam-muted">
                {application.startAt &&
                  new Date(application.startAt).toLocaleString("ko-KR")}
                {" ~ "}
                {application.endAt &&
                  new Date(application.endAt).toLocaleString("ko-KR")}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-sam-muted">신청일</dt>
            <dd className="sam-text-body-secondary text-sam-muted">
              {new Date(application.createdAt).toLocaleString("ko-KR")}
            </dd>
          </div>
          {application.applicantMemo && (
            <div>
              <dt className="text-sam-muted">신청자 메모</dt>
              <dd className="whitespace-pre-wrap text-sam-fg">
                {application.applicantMemo}
              </dd>
            </div>
          )}
        </dl>
      </AdminCard>
      <AdminCard title="관리자 메모 (placeholder)">
        <div className="flex gap-2">
          <input
            type="text"
            value={memoInput}
            onChange={(e) => setMemoInput(e.target.value)}
            placeholder="메모 입력"
            className="flex-1 rounded border border-sam-border px-3 py-2 sam-text-body"
          />
          <button
            type="button"
            onClick={handleSaveMemo}
            className="rounded border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg hover:bg-sam-surface-muted"
          >
            저장
          </button>
        </div>
        {application.adminMemo && (
          <p className="mt-2 sam-text-body-secondary text-sam-muted">
            {application.adminMemo}
          </p>
        )}
      </AdminCard>
      <AdminCard title="변경 이력">
        <AdminAdLogList logs={logs} />
      </AdminCard>
    </div>
  );
}
