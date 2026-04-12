"use client";

import { useMemo, useState } from "react";
import { getProductBacklogItems } from "@/lib/product-backlog/mock-product-backlog-items";
import { ProductBacklogCard } from "./ProductBacklogCard";
import { getBacklogStatusLabel } from "@/lib/product-backlog/product-backlog-utils";
import type {
  ProductBacklogStatus,
  ProductFeedbackCategory,
} from "@/lib/types/product-backlog";

const STATUS_COLUMNS: ProductBacklogStatus[] = [
  "inbox",
  "triaged",
  "planned",
  "in_progress",
  "released",
];

export function ProductBacklogBoard() {
  const [categoryFilter, setCategoryFilter] = useState<ProductFeedbackCategory | "">("");
  const [statusFilter, setStatusFilter] = useState<ProductBacklogStatus | "">("");

  const allItems = useMemo(
    () =>
      getProductBacklogItems({
        ...(categoryFilter ? { category: categoryFilter } : {}),
      }),
    [categoryFilter]
  );

  const byStatus = useMemo(() => {
    const map: Record<ProductBacklogStatus, typeof allItems> = {
      inbox: [],
      triaged: [],
      planned: [],
      in_progress: [],
      released: [],
      rejected: [],
      archived: [],
    };
    allItems.forEach((i) => {
      if (i.status in map) map[i.status as ProductBacklogStatus].push(i);
    });
    return map;
  }, [allItems]);

  const columnsToShow = statusFilter ? [statusFilter] : STATUS_COLUMNS;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-sam-muted">카테고리</span>
        <select
          value={categoryFilter}
          onChange={(e) =>
            setCategoryFilter((e.target.value || "") as ProductFeedbackCategory | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 text-[13px] text-sam-fg"
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
        <span className="text-[13px] text-sam-muted">상태</span>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter((e.target.value || "") as ProductBacklogStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 text-[13px] text-sam-fg"
        >
          <option value="">전체 칸반</option>
          <option value="inbox">인박스</option>
          <option value="triaged">분류됨</option>
          <option value="planned">예정</option>
          <option value="in_progress">진행중</option>
          <option value="released">릴리즈</option>
        </select>
      </div>

      {allItems.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center text-[14px] text-sam-muted">
          백로그 항목이 없습니다.
        </div>
      ) : (
        <div className="grid gap-4 overflow-x-auto sm:grid-cols-2 lg:grid-cols-5">
          {columnsToShow.map((status) => (
            <div
              key={status}
              className="min-w-[200px] rounded-ui-rect border border-sam-border bg-sam-app/50 p-3"
            >
              <h3 className="mb-2 text-[13px] font-medium text-sam-fg">
                {getBacklogStatusLabel(status)}
                <span className="ml-1 text-sam-muted">
                  ({byStatus[status]?.length ?? 0})
                </span>
              </h3>
              <div className="space-y-2">
                {(byStatus[status] ?? []).map((item) => (
                  <ProductBacklogCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
