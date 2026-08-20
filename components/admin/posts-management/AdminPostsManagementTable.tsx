"use client";

import { dibayConfirm, dibayAlert, dibayPrompt } from "@/components/ui/dibay-overlay";
import { forwardRef, useState } from "react";
import Link from "next/link";
import type { Product } from "@/lib/types/product";
import {
  updatePostBumpAdmin,
} from "@/lib/admin-posts/updatePostAdmin";
import { confirmAndUpdateAdminPostStatus } from "@/lib/admin-posts/confirm-admin-post-moderation";
import {
  getMarketCategoryPath,
  getPublicProductPath,
} from "@/lib/products/web-post-links";
import { inferPostsManagementSection } from "@/lib/admin-products/posts-management-utils";
import {
  buildAdminTradeChatsHref,
  buildAdminTradeFlowHref,
} from "@/lib/admin-products/admin-trade-deep-link";
import { formatPrice } from "@/lib/utils/format";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { POSTS_MGMT_TAB_LABEL_KEY, postsMgmtLocale } from "./posts-management-i18n";
import {
  ConsoleButton,
  TradePromoBadge,
  TradeStatusBadge,
} from "@/components/admin/trade-console/trade-console-ui";

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
  const { t, language, safeT } = useI18n();
  const locale = postsMgmtLocale(language);
  const [actionRowId, setActionRowId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const moderationLabels = {
    hideTitle: safeT("admin_products_confirm_hide", {
      fallbackKo: "이 게시물을 숨기시겠습니까?",
      fallbackEn: "Hide this listing?",
    }),
    restoreTitle: safeT("admin_products_confirm_restore", {
      fallbackKo: "숨김을 해제할까요?",
      fallbackEn: "Restore this listing?",
    }),
    deleteTitle: safeT("admin_products_confirm_soft_delete", {
      fallbackKo: "소프트 삭제할까요? (영구 삭제 아님)",
      fallbackEn: "Soft-delete this listing? (not permanent)",
    }),
    markSoldTitle: safeT("admin_products_confirm_mark_sold", {
      fallbackKo: "판매완료로 표시할까요?",
      fallbackEn: "Mark as sold?",
    }),
    markActiveTitle: safeT("admin_products_confirm_mark_active", {
      fallbackKo: "판매중으로 되돌릴까요?",
      fallbackEn: "Mark as active?",
    }),
    reasonPlaceholder: safeT("admin_products_reason_placeholder", {
      fallbackKo: "사유를 입력하세요",
      fallbackEn: "Enter a reason",
    }),
    softDeleteHint: safeT("admin_products_soft_delete_hint", {
      fallbackKo: "status=deleted 로 표시됩니다. DB 영구 삭제가 아닙니다.",
      fallbackEn: "Sets status=deleted. Not a permanent DB delete.",
    }),
    cancelLabel: t("common_cancel"),
    confirmLabel: t("common_confirm"),
  };

  const runTradeOverride = async (action: "cancel_sale" | "force_complete", p: Product) => {
    const actionLabel =
      action === "cancel_sale"
        ? t("admin_posts_mgmt_confirm_cancel_sale_label")
        : t("admin_posts_mgmt_confirm_force_complete_label");
    const titleSnippet = `${p.title.slice(0, 48)}${p.title.length > 48 ? "…" : ""}`;
    if (
      !(await dibayConfirm({
        title: t("admin_posts_mgmt_confirm_trade_override", {
          title: titleSnippet,
          action: actionLabel,
        }),
      }))
    ) {
      return;
    }

    let buyerId: string | null =
      (typeof p.soldBuyerId === "string" && p.soldBuyerId.trim()) ||
      (typeof p.reservedBuyerId === "string" && p.reservedBuyerId.trim()) ||
      null;

    if (action === "force_complete" && !buyerId) {
      try {
        const br = await fetch(`/api/admin/posts/${encodeURIComponent(p.id)}/buyers`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const bj = (await br.json().catch(() => ({}))) as {
          ok?: boolean;
          uniqueBuyerIds?: string[];
          error?: string;
        };
        const ids = Array.isArray(bj.uniqueBuyerIds) ? bj.uniqueBuyerIds.filter(Boolean) : [];
        if (ids.length === 1) {
          buyerId = ids[0]!;
        } else if (ids.length > 1) {
          const picked = await dibayPrompt({
            title: safeT("admin_posts_mgmt_pick_buyer", {
              fallbackKo: "판매 확정 구매자 UUID",
              fallbackEn: "Confirmed buyer UUID",
            }),
            description: ids.map((id) => `· ${id}`).join("\n"),
            required: true,
            confirmTone: "destructive",
          });
          if (picked == null) return;
          buyerId = picked.trim();
        } else {
          await dibayAlert({
            title: safeT("admin_posts_mgmt_need_buyer", {
              fallbackKo: "판매 확정 구매자가 없어 완료 처리할 수 없습니다.",
              fallbackEn: "No confirmed buyer — cannot force complete.",
            }),
          });
          return;
        }
      } catch (e) {
        await dibayAlert({ title: (e as Error)?.message ?? t("admin_posts_mgmt_action_failed") });
        return;
      }
    }

    try {
      const res = await fetch(`/api/admin/posts/${encodeURIComponent(p.id)}/trade-override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action, buyerId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        await dibayAlert({ title: data.error ?? t("admin_posts_mgmt_action_failed") });
        return;
      }
      setActionRowId(null);
      onActionSuccess?.();
    } catch (e) {
      await dibayAlert({ title: (e as Error)?.message ?? t("admin_posts_mgmt_action_failed") });
    }
  };

  const runAction = async (action: "hide" | "restore" | "delete" | "bump", p: Product) => {
    try {
      if (action === "bump") {
        const res = await updatePostBumpAdmin(p.id);
        if (!res.ok) {
          await dibayAlert({ title: res.error ?? t("admin_posts_mgmt_action_failed") });
          return;
        }
        setActionRowId(null);
        onActionSuccess?.();
        return;
      }

      const res = await confirmAndUpdateAdminPostStatus({
        action,
        product: {
          id: p.id,
          title: p.title,
          sellerLabel: p.seller?.nickname ?? p.sellerId,
          reservedBuyerId: p.reservedBuyerId,
          soldBuyerId: p.soldBuyerId,
        },
        labels: moderationLabels,
      });
      if (res == null) return;
      if (!res.ok) {
        await dibayAlert({ title: res.error ?? t("admin_posts_mgmt_action_failed") });
        return;
      }
      setActionRowId(null);
      onActionSuccess?.();
    } catch (e) {
      await dibayAlert({ title: (e as Error)?.message ?? t("admin_posts_mgmt_action_failed") });
    }
  };

  const toggleAll = () => {
    if (selected.size === products.length) setSelected(new Set());
    else setSelected(new Set(products.map((p) => p.id)));
  };

  return (
    <div
      ref={ref}
      onScroll={onHorizontalScroll}
      className="w-full max-w-full overflow-x-auto overflow-y-visible rounded-ui-rect border border-sam-border bg-sam-surface [-webkit-overflow-scrolling:touch]"
    >
      {selected.size > 0 ? (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-sam-border bg-sam-surface px-3 py-2">
          <span className="sam-text-body-secondary font-medium">{selected.size}개 선택됨</span>
          <ConsoleButton
            variant="secondary"
            size="sm"
            onClick={() => {
              void (async () => {
                for (const id of selected) {
                  const p = products.find((x) => x.id === id);
                  if (p) await runAction("restore", p);
                }
              })();
            }}
          >
            {t("admin_posts_mgmt_action_unhide")}
          </ConsoleButton>
          <ConsoleButton
            variant="secondary"
            size="sm"
            onClick={() => {
              void (async () => {
                for (const id of selected) {
                  const p = products.find((x) => x.id === id);
                  if (p) await runAction("hide", p);
                }
              })();
            }}
          >
            {t("admin_posts_mgmt_action_hide")}
          </ConsoleButton>
          <ConsoleButton
            variant="secondary"
            size="sm"
            onClick={() => {
              void (async () => {
                for (const id of selected) {
                  const p = products.find((x) => x.id === id);
                  if (p) await runAction("delete", p);
                }
              })();
            }}
          >
            {t("admin_posts_mgmt_action_force_delete")}
          </ConsoleButton>
        </div>
      ) : null}

      <table className="w-full table-fixed text-left sam-text-body-secondary">
        <thead className="border-b border-sam-border bg-sam-surface-muted/80 sam-text-xxs text-sam-muted">
          <tr>
            <th className="w-8 px-2 py-2">
              <input
                type="checkbox"
                checked={selected.size === products.length && products.length > 0}
                onChange={toggleAll}
                aria-label="전체 선택"
              />
            </th>
            {showProductIdColumn ? (
              <th className="w-[8%] px-2 py-2">{t("admin_posts_mgmt_th_product_id")}</th>
            ) : null}
            <th className="w-[20%] px-2 py-2">상품</th>
            <th className="w-[11%] px-2 py-2">{t("admin_posts_mgmt_th_seller")}</th>
            <th className="w-[12%] px-2 py-2">{t("admin_posts_mgmt_th_category")}</th>
            <th className="w-[9%] px-2 py-2">{t("admin_posts_mgmt_th_price")}</th>
            <th className="w-[10%] px-2 py-2">지역</th>
            <th className="w-[8%] px-2 py-2">{t("admin_posts_mgmt_th_status")}</th>
            <th className="w-[5%] px-2 py-2 text-center">{t("admin_posts_mgmt_th_likes")}</th>
            <th className="w-[5%] px-2 py-2 text-center">{t("admin_posts_mgmt_th_chats")}</th>
            <th className="w-[5%] px-2 py-2 text-center">{t("admin_posts_mgmt_th_reports")}</th>
            <th className="w-[7%] px-2 py-2">광고</th>
            <th className="w-[8%] px-2 py-2">{t("admin_posts_mgmt_th_created")}</th>
            <th className="w-14 px-2 py-2 text-center">{t("admin_posts_mgmt_th_actions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sam-border-soft">
          {products.map((p) => {
            const section = inferPostsManagementSection(p);
            const catLabel = p.categoryName ?? p.category ?? p.categorySlug ?? "—";
            const market = getMarketCategoryPath(p.categorySlug);
            return (
              <tr key={p.id} className="hover:bg-sam-surface-muted/40">
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(p.id)) next.delete(p.id);
                        else next.add(p.id);
                        return next;
                      });
                    }}
                    aria-label={`${p.title} 선택`}
                  />
                </td>
                {showProductIdColumn ? (
                  <td className="px-2 py-2 font-mono sam-text-xxs">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="text-signature hover:underline"
                      title={p.id}
                    >
                      {p.id.slice(0, 8)}…
                    </Link>
                  </td>
                ) : null}
                <td className="px-2 py-2">
                  <Link
                    href={`/admin/products/${p.id}`}
                    className="flex min-w-0 items-center gap-2 hover:underline"
                  >
                    {p.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element -- admin ops thumb
                      <img
                        src={p.thumbnail}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-ui-rect object-cover"
                      />
                    ) : (
                      <span className="inline-flex h-10 w-10 shrink-0 rounded-ui-rect bg-sam-surface-muted" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-sam-fg">{p.title}</span>
                      <span className="block truncate sam-text-xxs text-sam-muted">
                        {t(POSTS_MGMT_TAB_LABEL_KEY[section])}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-2 py-2">
                  <Link
                    href={`/admin/users/${p.sellerId}?fromPost=${encodeURIComponent(p.id)}`}
                    className="text-signature hover:underline"
                  >
                    <span className="block truncate">{p.seller?.nickname ?? p.sellerId ?? "—"}</span>
                    {p.seller?.username ? (
                      <span className="block truncate font-mono sam-text-xxs text-sam-muted">
                        @{p.seller.username}
                      </span>
                    ) : null}
                  </Link>
                </td>
                <td className="truncate px-2 py-2 text-sam-muted">
                  {market && catLabel !== "—" ? (
                    <Link
                      href={market}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-signature hover:underline"
                    >
                      {catLabel}
                    </Link>
                  ) : (
                    catLabel
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-2 tabular-nums text-sam-fg">
                  {p.isFreeShare ? t("admin_posts_mgmt_price_free_share") : formatPrice(p.price ?? 0)}
                </td>
                <td className="truncate px-2 py-2 text-sam-muted">{p.location || "—"}</td>
                <td className="px-2 py-2">
                  <TradeStatusBadge status={p.status} />
                </td>
                <td className="px-2 py-2 text-center tabular-nums">{p.likesCount ?? 0}</td>
                <td className="px-2 py-2 text-center tabular-nums">{p.chatCount ?? 0}</td>
                <td className="px-2 py-2 text-center">
                  {(p.reportCount ?? 0) > 0 ? (
                    <Link
                      href={`/admin/reports?domain=trade&target_type=product&target=${encodeURIComponent(p.id)}`}
                      className="font-medium text-amber-600 hover:underline"
                    >
                      {p.reportCount}
                    </Link>
                  ) : (
                    <span className="text-sam-muted">0</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <TradePromoBadge
                    active={Boolean(p.hasPromotionOverlay || p.isPromoted || p.isBoosted)}
                  />
                </td>
                <td className="whitespace-nowrap px-2 py-2 sam-text-xxs text-sam-muted">
                  {new Date(p.createdAt).toLocaleDateString(locale)}
                </td>
                <td className="relative px-2 py-2 text-center">
                  <div className="inline-flex items-center gap-1">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="rounded border border-sam-border bg-sam-surface px-2 py-1 sam-text-xxs text-sam-fg hover:bg-sam-app"
                    >
                      관리
                    </Link>
                    <button
                      type="button"
                      onClick={() => setActionRowId(actionRowId === p.id ? null : p.id)}
                      className="rounded border border-sam-border bg-sam-surface px-2 py-1 sam-text-xxs text-sam-fg hover:bg-sam-app"
                      aria-label={t("admin_posts_mgmt_actions_menu")}
                    >
                      ⋯
                    </button>
                  </div>
                  {actionRowId === p.id ? (
                    <div className="absolute right-0 top-full z-10 mt-1 min-w-[200px] rounded-ui-rect border border-sam-border bg-sam-surface py-1 text-left shadow-sam-elevated">
                      <Link
                        href={getPublicProductPath(p.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block px-3 py-2 sam-text-body-secondary text-sam-fg hover:bg-sam-app"
                      >
                        {t("admin_posts_mgmt_action_view_web")}
                      </Link>
                      <Link
                        href={buildAdminTradeChatsHref(p)}
                        className="block px-3 py-2 sam-text-body-secondary text-sam-fg hover:bg-sam-app"
                      >
                        {t("admin_posts_mgmt_link_trade_chats")}
                      </Link>
                      <Link
                        href={buildAdminTradeFlowHref(p)}
                        className="block px-3 py-2 sam-text-body-secondary text-sam-fg hover:bg-sam-app"
                      >
                        {t("admin_posts_mgmt_link_trade_flow")}
                      </Link>
                      <button
                        type="button"
                        onClick={() => void runTradeOverride("cancel_sale", p)}
                        className="block w-full px-3 py-2 text-left sam-text-body-secondary text-amber-800 hover:bg-amber-50"
                      >
                        {t("admin_posts_mgmt_action_cancel_sale")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void runTradeOverride("force_complete", p)}
                        className="block w-full px-3 py-2 text-left sam-text-body-secondary text-sam-fg hover:bg-signature/5"
                      >
                        {t("admin_posts_mgmt_action_force_complete")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void runAction("hide", p)}
                        className="block w-full px-3 py-2 text-left sam-text-body-secondary text-sam-fg hover:bg-sam-app"
                      >
                        {t("admin_posts_mgmt_action_hide")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void runAction("restore", p)}
                        className="block w-full px-3 py-2 text-left sam-text-body-secondary text-sam-fg hover:bg-sam-app"
                      >
                        {t("admin_posts_mgmt_action_unhide")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void runAction("delete", p)}
                        className="block w-full px-3 py-2 text-left sam-text-body-secondary text-red-600 hover:bg-sam-app"
                      >
                        {t("admin_posts_mgmt_action_force_delete")}
                      </button>
                      <Link
                        href={`/admin/reports?domain=trade&target_type=product&target=${encodeURIComponent(p.id)}`}
                        className="block px-3 py-2 sam-text-body-secondary text-sam-fg hover:bg-sam-app"
                      >
                        {t("admin_posts_mgmt_action_view_reports")}
                      </Link>
                      <Link
                        href={`/admin/users/${p.sellerId}?fromPost=${encodeURIComponent(p.id)}`}
                        className="block px-3 py-2 sam-text-body-secondary text-sam-fg hover:bg-sam-app"
                      >
                        {t("admin_posts_mgmt_action_seller_sanction")}
                      </Link>
                      <button
                        type="button"
                        onClick={() => void runAction("bump", p)}
                        className="block w-full px-3 py-2 text-left sam-text-body-secondary text-sam-fg hover:bg-sam-app"
                      >
                        {t("admin_posts_mgmt_action_bump")}
                      </button>
                      <div className="my-1 border-t border-red-200" />
                      <button
                        type="button"
                        disabled
                        className="block w-full px-3 py-2 text-left sam-text-body-secondary text-red-700/50"
                      >
                        DB 영구 삭제 · NOT_READY
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {actionRowId ? (
        <div
          className="fixed inset-0 z-0"
          aria-hidden
          onClick={() => setActionRowId(null)}
        />
      ) : null}
    </div>
  );
});

AdminPostsManagementTable.displayName = "AdminPostsManagementTable";
