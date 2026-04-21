"use client";

import { forwardRef, useState } from "react";
import Link from "next/link";
import type { Product } from "@/lib/types/product";
import { listTradeStatusBadge } from "@/lib/products/seller-listing-state";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import {
  updatePostBumpAdmin,
  updatePostStatusAdmin,
} from "@/lib/admin-posts/updatePostAdmin";
import {
  getMarketCategoryPath,
  getPublicProductPath,
} from "@/lib/products/web-post-links";
import {
  getPostsManagementSectionLabel,
  inferPostsManagementSection,
} from "@/lib/admin-products/posts-management-utils";
import { getCarTradeLabelKo } from "@/lib/posts/car-trade-label";
import { formatPrice } from "@/lib/utils/format";

interface AdminPostsManagementTableProps {
  products: Product[];
  /** false면 상품 ID 열 숨김 (필터·정렬은 그대로 적용) */
  showProductIdColumn?: boolean;
  /** 가로 스크롤 동기화·측정용 (하단 고정 스크롤바) */
  onHorizontalScroll?: React.UIEventHandler<HTMLDivElement>;
  /** 액션 성공 시 어드민 목록을 즉시 갱신 */
  onActionSuccess?: () => void;
}

export const AdminPostsManagementTable = forwardRef<
  HTMLDivElement,
  AdminPostsManagementTableProps
>(function AdminPostsManagementTable(
  { products, showProductIdColumn = false, onHorizontalScroll, onActionSuccess },
  ref
) {
  const [actionRowId, setActionRowId] = useState<string | null>(null);

  const runTradeOverride = async (action: "cancel_sale" | "force_complete", p: Product) => {
    const label = action === "cancel_sale" ? "물품 판매 취소(목록 숨김)" : "거래완료로 강제";
    if (!window.confirm(`「${p.title.slice(0, 48)}${p.title.length > 48 ? "…" : ""}」\n${label} 처리할까요?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/posts/${encodeURIComponent(p.id)}/trade-override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        alert(data.error ?? "처리 실패");
        return;
      }
      setActionRowId(null);
      onActionSuccess?.();
    } catch (e) {
      alert((e as Error)?.message ?? "처리 실패");
    }
  };

  const runAction = async (action: "hide" | "restore" | "delete" | "bump", p: Product) => {
    try {
      let res: { ok: boolean; error?: string };
      if (action === "bump") {
        res = await updatePostBumpAdmin(p.id);
      } else {
        const toStatus =
          action === "hide" ? "hidden" : action === "restore" ? "active" : "deleted";
        res = await updatePostStatusAdmin(p.id, toStatus as any);
      }

      if (!res.ok) {
        alert(res.error ?? "처리 실패");
        return;
      }
      setActionRowId(null);
      onActionSuccess?.();
    } catch (e) {
      alert((e as Error)?.message ?? "처리 실패");
    }
  };

  return (
    <div
      ref={ref}
      onScroll={onHorizontalScroll}
      className="w-full max-w-full overflow-x-auto overflow-y-visible rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm [-webkit-overflow-scrolling:touch]"
    >
      <table
        className={`w-full border-collapse sam-text-body ${showProductIdColumn ? "min-w-[1240px]" : "min-w-[1120px]"}`}
      >
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            {showProductIdColumn && (
              <th className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-sam-fg">
                상품ID
              </th>
            )}
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-sam-fg">
              썸네일
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-sam-fg">
              제목 / 웹
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-sam-fg">
              판매자
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-sam-fg">
              웹 분류
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-sam-fg">
              카테고리
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-sam-fg">
              구분
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-sam-fg">
              가격
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-sam-fg">
              거래유형
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-sam-fg">
              상태
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-sam-fg">
              거래표시
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-sam-fg">
              관심
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-sam-fg">
              채팅
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-sam-fg">
              신고
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-sam-fg">
              등록일
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-sam-fg">
              노출상태
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-left font-medium text-sam-fg">
              액션
            </th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr
              key={p.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              {showProductIdColumn && (
                <td className="whitespace-nowrap px-3 py-2.5">
                  <Link
                    href={`/admin/products/${p.id}`}
                    className="font-mono sam-text-body-secondary text-signature hover:underline"
                    title={p.id}
                  >
                    {p.id.slice(0, 8)}…
                  </Link>
                </td>
              )}
              <td className="px-3 py-2.5">
                {p.thumbnail ? (
                  <img
                    src={p.thumbnail}
                    alt=""
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : (
                  <span className="text-sam-meta">-</span>
                )}
              </td>
              <td className="max-w-[220px] px-3 py-2.5 text-sam-fg">
                <div className="truncate font-medium">
                  <Link
                    href={getPublicProductPath(p.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-signature hover:underline"
                    title="상품 웹보기"
                  >
                    {p.title}
                  </Link>
                </div>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                <Link
                  href={`/admin/users/${p.sellerId}`}
                  className="text-signature hover:underline"
                >
                  {p.seller?.nickname ?? p.sellerId ?? "-"}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {(() => {
                  const market = getMarketCategoryPath(p.categorySlug);
                  const label = getPostsManagementSectionLabel(p);

                  const body = (
                    <>
                      <span className="inline-block rounded bg-sam-surface-muted px-2 py-0.5 sam-text-helper font-medium text-sam-fg">
                        {label}
                      </span>
                      {(p.serviceType || p.serviceSlug) && (
                        <div className="mt-1 font-mono sam-text-xxs leading-tight text-sam-meta">
                          {p.serviceType ?? ""}
                          {p.serviceSlug ? ` · ${p.serviceSlug}` : ""}
                        </div>
                      )}
                    </>
                  );

                  if (!market) return body;

                  return (
                    <Link
                      href={market}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block hover:opacity-90"
                      title="카테고리 목록"
                    >
                      {body}
                    </Link>
                  );
                })()}
              </td>
              <td className="max-w-[100px] truncate px-3 py-2.5 text-sam-muted">
                {(() => {
                  const label =
                    p.categoryName ?? p.category ?? p.categorySlug ?? "-";
                  const market = getMarketCategoryPath(p.categorySlug);
                  if (market && label !== "-") {
                    return (
                      <Link
                        href={market}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-signature hover:underline"
                      >
                        {label}
                      </Link>
                    );
                  }
                  return label;
                })()}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-sam-muted">
                {inferPostsManagementSection(p) === "used-car"
                  ? getCarTradeLabelKo(p.postMeta) ?? "—"
                  : "—"}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-sam-fg">
                {p.isFreeShare ? "나눔" : formatPrice(p.price ?? 0)}
              </td>
              <td className="px-3 py-2.5 text-sam-muted">
                {p.isFreeShare ? "무료나눔" : "판매"}
              </td>
              <td className="px-3 py-2.5">
                <AdminStatusBadge status={p.status} />
              </td>
              <td className="px-3 py-2.5">
                {(() => {
                  const badge = listTradeStatusBadge(p.sellerListingState, p.status);
                  if (!badge) {
                    return <span className="sam-text-helper text-sam-meta">—</span>;
                  }
                  return (
                    <span
                      className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  );
                })()}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-sam-muted">
                {p.likesCount ?? 0}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-sam-muted">
                {p.chatCount ?? 0}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right">
                {(p.reportCount ?? 0) > 0 ? (
                  <Link
                    href={`/admin/reports?target=${p.id}`}
                    className="font-medium text-amber-600 hover:underline"
                  >
                    {p.reportCount}
                  </Link>
                ) : (
                  <span className="text-sam-muted">0</span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(p.createdAt).toLocaleDateString("ko-KR")}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {p.visibility === "hidden" || p.status === "hidden" ? (
                  <span className="text-amber-600">숨김</span>
                ) : (
                  <span className="text-green-600">노출</span>
                )}
              </td>
              <td className="relative px-3 py-2.5">
                <button
                  type="button"
                  onClick={() =>
                    setActionRowId(actionRowId === p.id ? null : p.id)
                  }
                  className="rounded border border-sam-border bg-sam-surface px-2 py-1 sam-text-body-secondary text-sam-fg hover:bg-sam-app"
                >
                  액션 ▾
                </button>
                {actionRowId === p.id && (
                  <div className="absolute left-0 top-full z-10 mt-1 min-w-[180px] rounded border border-sam-border bg-sam-surface py-1 shadow-sam-elevated">
                    <Link
                      href={getPublicProductPath(p.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block px-3 py-2 text-left sam-text-body-secondary text-sam-fg hover:bg-sam-app"
                    >
                      웹에서 보기
                    </Link>
                    <button
                      type="button"
                      onClick={() => runTradeOverride("cancel_sale", p)}
                      className="block w-full px-3 py-2 text-left sam-text-body-secondary text-amber-800 hover:bg-amber-50"
                    >
                      물품 판매 취소(강제)
                    </button>
                    <button
                      type="button"
                      onClick={() => runTradeOverride("force_complete", p)}
                      className="block w-full px-3 py-2 text-left sam-text-body-secondary text-sam-fg hover:bg-signature/5"
                    >
                      거래완료(강제)
                    </button>
                    <button
                      type="button"
                      onClick={() => runAction("hide", p)}
                      className="block w-full px-3 py-2 text-left sam-text-body-secondary text-sam-fg hover:bg-sam-app"
                    >
                      숨김
                    </button>
                    <button
                      type="button"
                      onClick={() => runAction("restore", p)}
                      className="block w-full px-3 py-2 text-left sam-text-body-secondary text-sam-fg hover:bg-sam-app"
                    >
                      숨김 해제
                    </button>
                    <button
                      type="button"
                      onClick={() => runAction("delete", p)}
                      className="block w-full px-3 py-2 text-left sam-text-body-secondary text-red-600 hover:bg-sam-app"
                    >
                      강제 삭제
                    </button>
                    <Link
                      href={`/admin/reports?target=${p.id}`}
                      className="block px-3 py-2 text-left sam-text-body-secondary text-sam-fg hover:bg-sam-app"
                    >
                      신고 내역 보기
                    </Link>
                    <Link
                      href={`/admin/users/${p.sellerId}`}
                      className="block px-3 py-2 text-left sam-text-body-secondary text-sam-fg hover:bg-sam-app"
                    >
                      판매자 제재
                    </Link>
                    <button
                      type="button"
                      onClick={() => runAction("bump", p)}
                      className="block w-full px-3 py-2 text-left sam-text-body-secondary text-sam-fg hover:bg-sam-app"
                    >
                      추천/인기 노출 조정
                    </button>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left sam-text-body-secondary text-sam-fg hover:bg-sam-app"
                    >
                      금지품목 판정 메모
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {actionRowId && (
        <div
          className="fixed inset-0 z-0"
          aria-hidden
          onClick={() => setActionRowId(null)}
        />
      )}
    </div>
  );
});

AdminPostsManagementTable.displayName = "AdminPostsManagementTable";
