"use client";

import { useCallback, useState } from "react";
import type { PointChargeRequest } from "@/lib/types/point";
import {
  getPointChargeRequestById,
  setPointChargeRequestAdminMemo,
} from "@/lib/points/mock-point-charge-requests";
import { getPointActionLogsByRelatedId } from "@/lib/points/mock-point-action-logs";
import {
  POINT_CHARGE_STATUS_LABELS,
  POINT_PAYMENT_METHOD_LABELS,
} from "@/lib/points/point-utils";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPointActionPanel } from "./AdminPointActionPanel";

interface AdminPointChargeDetailPageProps {
  requestId: string;
}

export function AdminPointChargeDetailPage({
  requestId,
}: AdminPointChargeDetailPageProps) {
  const [refresh, setRefresh] = useState(0);
  const [memoInput, setMemoInput] = useState("");
  const request = getPointChargeRequestById(requestId);
  const logs = getPointActionLogsByRelatedId(requestId);
  const refreshDetail = useCallback(() => setRefresh((r) => r + 1), []);

  if (!request) {
    return (
      <div className="py-8 text-center text-[14px] text-sam-muted">
        충전 신청을 찾을 수 없습니다.
      </div>
    );
  }

  const handleSaveMemo = () => {
    setPointChargeRequestAdminMemo(requestId, memoInput);
    setMemoInput("");
    refreshDetail();
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="포인트 충전 상세"
        backHref="/admin/point-charges"
      />
      <AdminPointActionPanel request={request} onActionSuccess={refreshDetail} />
      <AdminCard title="신청 정보">
        <dl className="grid gap-2 text-[14px]">
          <div>
            <dt className="text-sam-muted">신청자</dt>
            <dd>
              {request.userNickname} ({request.userId})
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">상품</dt>
            <dd>{request.planName}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">결제 금액 / 지급 포인트</dt>
            <dd>
              ₩{request.paymentAmount.toLocaleString()} → {request.pointAmount}P
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">결제 방식</dt>
            <dd>{POINT_PAYMENT_METHOD_LABELS[request.paymentMethod]}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">상태</dt>
            <dd>
              <span
                className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${
                  request.requestStatus === "approved"
                    ? "bg-emerald-50 text-emerald-800"
                    : request.requestStatus === "rejected"
                      ? "bg-red-50 text-red-700"
                      : "bg-sam-surface-muted text-sam-fg"
                }`}
              >
                {POINT_CHARGE_STATUS_LABELS[request.requestStatus]}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">입금자명</dt>
            <dd>{request.depositorName || "-"}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">신청일 / 수정일</dt>
            <dd className="text-[13px] text-sam-muted">
              {new Date(request.requestedAt).toLocaleString("ko-KR")} /{" "}
              {new Date(request.updatedAt).toLocaleString("ko-KR")}
            </dd>
          </div>
          {request.userMemo && (
            <div>
              <dt className="text-sam-muted">신청자 메모</dt>
              <dd className="whitespace-pre-wrap text-sam-fg">
                {request.userMemo}
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
            className="flex-1 rounded border border-sam-border px-3 py-2 text-[14px]"
          />
          <button
            type="button"
            onClick={handleSaveMemo}
            className="rounded border border-sam-border bg-sam-app px-3 py-2 text-[14px] text-sam-fg hover:bg-sam-surface-muted"
          >
            저장
          </button>
        </div>
        {request.adminMemo && (
          <p className="mt-2 text-[13px] text-sam-muted">{request.adminMemo}</p>
        )}
      </AdminCard>
      <AdminCard title="포인트 수동 조정 (placeholder)">
        <p className="text-[13px] text-sam-muted">
          특정 사용자 포인트 증감은 원장 화면에서 연결 예정
        </p>
      </AdminCard>
      <AdminCard title="변경 이력">
        <ul className="space-y-2 text-[13px]">
          {logs.length === 0 ? (
            <li className="text-sam-muted">이력 없음</li>
          ) : (
            logs.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap gap-2 border-b border-sam-border-soft pb-2"
              >
                <span className="font-medium text-sam-fg">{l.actionType}</span>
                <span className="text-sam-muted">{l.actorNickname}</span>
                <span className="text-sam-muted">{l.note}</span>
                <span className="ml-auto text-sam-meta">
                  {new Date(l.createdAt).toLocaleString("ko-KR")}
                </span>
              </li>
            ))
          )}
        </ul>
      </AdminCard>
    </div>
  );
}
