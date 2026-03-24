"use client";

import Link from "next/link";
import type { OrderReport } from "@/lib/admin/delivery-orders-mock/types";

const STATUS_KO: Record<OrderReport["status"], string> = {
  open: "접수",
  reviewing: "검토중",
  resolved: "처리완료",
  rejected: "반려",
};

export function OrderReportDetail({
  report,
  orderNo,
  storeName,
}: {
  report: OrderReport | null;
  orderNo: string;
  storeName: string;
}) {
  if (!report) {
    return <p className="text-sm text-gray-500">왼쪽 목록에서 신고를 선택하세요.</p>;
  }
  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="text-xs text-gray-500">신고번호</p>
        <p className="font-mono font-medium">{report.id}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">주문</p>
        <p>
          <Link href={`/admin/delivery-orders/${encodeURIComponent(report.orderId)}`} className="text-signature underline">
            {orderNo}
          </Link>
          <span className="ml-2 text-gray-500">{storeName}</span>
        </p>
      </div>
      <div>
        <p className="text-xs text-gray-500">신고자</p>
        <p>
          {report.reporterName}{" "}
          <span className="text-xs text-gray-500">({report.reporterUserId})</span>
        </p>
      </div>
      <div>
        <p className="text-xs text-gray-500">유형 · 상태</p>
        <p>
          {report.reportType} · {STATUS_KO[report.status]}
        </p>
      </div>
      <div>
        <p className="text-xs text-gray-500">내용</p>
        <p className="whitespace-pre-wrap rounded border border-gray-100 bg-gray-50/80 p-2">{report.content}</p>
      </div>
      {report.adminResult ? (
        <div>
          <p className="text-xs text-gray-500">조치결과</p>
          <p className="whitespace-pre-wrap">{report.adminResult}</p>
        </div>
      ) : null}
    </div>
  );
}
