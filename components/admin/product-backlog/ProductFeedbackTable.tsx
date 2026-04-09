"use client";

import { useMemo, useState } from "react";
import { getProductFeedbackItems } from "@/lib/product-backlog/mock-product-feedback-items";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getSourceLabel,
  getCategoryLabel,
  getSeverityLabel,
  getFeedbackStatusLabel,
} from "@/lib/product-backlog/product-backlog-utils";
import type {
  ProductFeedbackCategory,
  ProductFeedbackSourceType,
  ProductFeedbackStatus,
} from "@/lib/types/product-backlog";
import Link from "next/link";

export function ProductFeedbackTable() {
  const [category, setCategory] = useState<ProductFeedbackCategory | "">("");
  const [sourceType, setSourceType] = useState<ProductFeedbackSourceType | "">("");
  const [feedbackStatus, setFeedbackStatus] = useState<ProductFeedbackStatus | "">("");

  const items = useMemo(
    () =>
      getProductFeedbackItems({
        ...(category ? { category: category as ProductFeedbackCategory } : {}),
        ...(sourceType ? { sourceType: sourceType as ProductFeedbackSourceType } : {}),
        ...(feedbackStatus ? { feedbackStatus: feedbackStatus as ProductFeedbackStatus } : {}),
      }),
    [category, sourceType, feedbackStatus]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-gray-600">카테고리</span>
        <select
          value={category}
          onChange={(e) =>
            setCategory((e.target.value || "") as ProductFeedbackCategory | "")
          }
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          <option value="">전체</option>
          <option value="onboarding">온보딩</option>
          <option value="product_posting">상품 등록</option>
          <option value="feed_quality">피드 품질</option>
          <option value="chat">채팅</option>
          <option value="moderation">신고/제재</option>
          <option value="points_payment">포인트/결제</option>
          <option value="ads_business">광고/비즈</option>
          <option value="admin_console">관리자</option>
          <option value="performance">성능</option>
          <option value="bug">버그</option>
        </select>
        <span className="text-[13px] text-gray-600">소스</span>
        <select
          value={sourceType}
          onChange={(e) =>
            setSourceType((e.target.value || "") as ProductFeedbackSourceType | "")
          }
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          <option value="">전체</option>
          <option value="user_feedback">사용자 피드백</option>
          <option value="cs_inquiry">CS 문의</option>
          <option value="report">신고</option>
          <option value="ops_note">운영 메모</option>
          <option value="qa_issue">QA 이슈</option>
          <option value="analytics_signal">분석 시그널</option>
        </select>
        <span className="text-[13px] text-gray-600">상태</span>
        <select
          value={feedbackStatus}
          onChange={(e) =>
            setFeedbackStatus((e.target.value || "") as ProductFeedbackStatus | "")
          }
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          <option value="">전체</option>
          <option value="new">신규</option>
          <option value="reviewed">검토됨</option>
          <option value="converted">백로그 전환</option>
          <option value="ignored">무시</option>
        </select>
      </div>

      {items.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
          해당 조건의 피드백이 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={[
            "제목",
            "소스",
            "카테고리",
            "심각도",
            "상태",
            "작성자",
            "연결",
          ]}
        >
          {items.map((i) => (
            <tr key={i.id} className="border-b border-gray-100">
              <td className="px-3 py-2.5 font-medium text-gray-900">{i.title}</td>
              <td className="px-3 py-2.5 text-[13px] text-gray-600">
                {getSourceLabel(i.sourceType)}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-600">
                {getCategoryLabel(i.category)}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[12px] ${
                    i.severity === "critical"
                      ? "bg-red-100 text-red-800"
                      : i.severity === "high"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {getSeverityLabel(i.severity)}
                </span>
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-600">
                {getFeedbackStatusLabel(i.feedbackStatus)}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-500">
                {i.sourceUserNickname ?? "-"}
              </td>
              <td className="px-3 py-2.5 text-[13px]">
                {i.linkedType === "qa_issue" && (
                  <Link href="/admin/qa-board" className="text-signature hover:underline">
                    QA
                  </Link>
                )}
                {i.linkedType === "report" && (
                  <Link href="/admin/reports" className="text-signature hover:underline">
                    신고
                  </Link>
                )}
                {i.linkedType === "action_item" && (
                  <Link href="/admin/ops-board" className="text-signature hover:underline">
                    액션
                  </Link>
                )}
                {!i.linkedType && "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
