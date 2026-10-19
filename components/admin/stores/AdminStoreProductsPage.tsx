"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayPrompt } from "@/components/ui/dibay-overlay";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { MessageKey } from "@/lib/i18n/messages";
import { formatMoneyPhp } from "@/lib/utils/format";
import { businessCcBackToStoreHref } from "@/lib/admin-business/business-control-center-links";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
  AdminTechDetails,
} from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { confirmAdminAction, type AdminConfirmLevel } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminStatusLabel } from "@/lib/admin/status-labels/delivery-status-labels";

/** 상품 조치 확인 등급·문구 — 차단/숨김/검수 반려 = L2(사유 → memo), 나머지 L1. */
const PRODUCT_ACTIONS: Record<
  string,
  { level: AdminConfirmLevel; ko: string; en: string; titleKo: string; titleEn: string; destructive?: boolean; okKo: string; okEn: string }
> = {
  block: { level: "L2", ko: "차단", en: "Block", titleKo: "이 상품을 판매 차단할까요?", titleEn: "Block this product?", destructive: true, okKo: "상품을 차단했습니다.", okEn: "Product blocked." },
  hide: { level: "L2", ko: "숨김", en: "Hide", titleKo: "이 상품을 숨길까요?", titleEn: "Hide this product?", destructive: true, okKo: "상품을 숨겼습니다.", okEn: "Product hidden." },
  sold_out: { level: "L1", ko: "품절", en: "Sold out", titleKo: "이 상품을 품절로 바꿀까요?", titleEn: "Mark this product sold out?", okKo: "품절로 바꿨습니다.", okEn: "Marked sold out." },
  activate: { level: "L1", ko: "판매 활성", en: "Activate", titleKo: "이 상품을 판매 중으로 바꿀까요?", titleEn: "Put this product on sale?", okKo: "판매 중으로 바꿨습니다.", okEn: "Product activated." },
  approve_review: { level: "L1", ko: "검수 승인", en: "Approve", titleKo: "이 상품 검수를 승인할까요?", titleEn: "Approve this product?", okKo: "검수를 승인했습니다.", okEn: "Review approved." },
  reject_review: { level: "L2", ko: "검수 반려", en: "Reject", titleKo: "이 상품 검수를 반려할까요?", titleEn: "Reject this product?", destructive: true, okKo: "검수를 반려했습니다.", okEn: "Review rejected." },
  correct_name: { level: "L1", ko: "저장", en: "Save", titleKo: "상품명을 이렇게 바꿀까요?", titleEn: "Change the product name?", okKo: "상품명을 바꿨습니다.", okEn: "Name updated." },
  correct_price: { level: "L1", ko: "저장", en: "Save", titleKo: "가격을 이렇게 바꿀까요?", titleEn: "Change the price?", okKo: "가격을 바꿨습니다.", okEn: "Price updated." },
};

type Row = {
  id: string;
  store_id: string;
  title: string;
  price: number;
  product_status: string;
  admin_review_status: string;
  thumbnail_url: string | null;
  created_at: string;
  store: { store_name: string; slug: string } | null;
};

const FILTERS: { value: string; labelKey: MessageKey }[] = [
  { value: "all", labelKey: "admin_stores_product_filter_all" },
  { value: "active", labelKey: "admin_stores_product_filter_active" },
  { value: "draft", labelKey: "common_draft" },
  { value: "hidden", labelKey: "common_hidden" },
  { value: "blocked", labelKey: "common_block" },
  { value: "sold_out", labelKey: "admin_stores_product_filter_sold_out" },
];

export function AdminStoreProductsPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const searchParams = useSearchParams();
  const storeIdFilter = (searchParams.get("store_id") ?? "").trim();
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ code: string; status?: number } | null>(null);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(
    null
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const qs = useMemo(() => {
    const parts: string[] = [];
    if (filter !== "all") parts.push(`status=${encodeURIComponent(filter)}`);
    if (storeIdFilter) parts.push(`store_id=${encodeURIComponent(storeIdFilter)}`);
    return parts.length ? `?${parts.join("&")}` : "";
  }, [filter, storeIdFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/store-products${qs}`, { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setLoadError({ code: res.status === 403 ? "forbidden" : "load_failed", status: res.status });
        setRows([]);
        return;
      }
      setRows(json.products ?? []);
    } catch {
      setLoadError({ code: "network_error" });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 확인 팝업을 취소하면 아무 것도 실행하지 않는다 (DEF-37). L2 사유는 memo 로 전송. */
  const run = async (
    id: string,
    productTitle: string,
    action: string,
    extra?: { name?: string; price?: number },
    detail?: string
  ) => {
    const c = PRODUCT_ACTIONS[action];
    if (!c) return;
    const confirmed = await confirmAdminAction({
      level: c.level,
      ko,
      title: ko ? c.titleKo : c.titleEn,
      description: [productTitle, detail].filter(Boolean).join("\n") || undefined,
      confirmLabel: ko ? c.ko : c.en,
      destructive: c.destructive,
    });
    if (!confirmed.ok) return;
    setBusyId(id);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/store-products/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, memo: confirmed.reason, ...extra }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        const code = String(json?.error ?? "");
        setResult({
          ok: false,
          code: res.status === 403 ? "forbidden" : /^[a-z_]+$/.test(code) ? code : "action_failed",
        });
        // 상태가 바뀐 경우(409) 최신 목록으로 다시 불러온다.
        if (res.status === 409) await load();
        return;
      }
      setResult({ ok: true, message: ko ? c.okKo : c.okEn });
      await load();
    } catch {
      setResult({ ok: false, code: "network_error" });
    } finally {
      setBusyId(null);
    }
  };

  const runCorrectName = async (id: string, currentTitle: string) => {
    const name = (await dibayPrompt({ title: t("admin_stores_product_correct_name_prompt"), defaultValue: currentTitle }))?.trim();
    if (!name) return;
    await run(id, currentTitle, "correct_name", { name }, `→ ${name}`);
  };

  const runCorrectPrice = async (id: string, productTitle: string, currentPrice: number) => {
    const raw = (
      await dibayPrompt({
        title: t("admin_stores_product_correct_price_prompt"),
        defaultValue: String(Math.round(currentPrice)),
      })
    )?.trim();
    if (raw == null || raw === "") return;
    const price = Number(raw);
    if (!Number.isFinite(price) || price < 0) {
      setResult({ ok: false, code: "invalid_price" });
      return;
    }
    await run(id, productTitle, "correct_price", { price }, `→ ${formatMoneyPhp(price)}`);
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title={ko ? "메뉴·상품 검수" : "Menu & product review"} />
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_stores_products_desc")}</p>
      {storeIdFilter ? (
        <p className="sam-text-helper text-sam-muted">
          {ko ? "특정 매장 상품만 보는 중" : "Filtered to one store"}{" "}
          <Link href={businessCcBackToStoreHref(storeIdFilter)} className="text-signature hover:underline">
            {ko ? "매장 상세로" : "Back to store"}
          </Link>
          {" · "}
          <Link href="/admin/store-products" className="text-signature hover:underline">
            {ko ? "전체 상품 보기" : "Show all products"}
          </Link>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1.5 sam-text-body-secondary font-medium ${
              filter === f.value
                ? "bg-sam-ink text-white"
                : "border border-sam-border bg-sam-surface text-sam-fg"
            }`}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />

      {loading ? (
        <AdminLoadingState ko={ko} />
      ) : loadError ? (
        <AdminErrorState ko={ko} code={loadError.code} httpStatus={loadError.status} onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_stores_products_empty")} />
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="min-w-[900px] w-full border-collapse text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border bg-sam-app sam-text-helper text-sam-muted">
              <tr>
                <th className="px-3 py-2 font-medium">{t("admin_stores_products_th_product")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_products_th_store")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_products_th_status")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_products_th_review")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_products_th_action")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const dis = busyId === r.id;
                const ps = adminStatusLabel("product", r.product_status, ko);
                const rs = adminStatusLabel("product_review", r.admin_review_status || "none", ko);
                return (
                  <tr key={r.id} className="border-b border-sam-border-soft">
                    <td className="px-3 py-2 align-top">
                      <div className="flex gap-2">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-sam-surface-muted">
                          {r.thumbnail_url ? (
                            <img src={r.thumbnail_url} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div>
                          <div className="font-medium text-sam-fg">{r.title}</div>
                          <div className="sam-text-helper text-sam-muted">
                            {typeof r.price === "number" ? formatMoneyPhp(r.price) : r.price}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top sam-text-helper text-sam-fg">
                      {r.store_id ? (
                        <Link href={businessCcBackToStoreHref(r.store_id)} className="hover:text-signature hover:underline">
                          {r.store?.store_name || (ko ? "이름 없는 매장" : "Unnamed store")}
                        </Link>
                      ) : (
                        r.store?.store_name ?? "-"
                      )}
                      <AdminTechDetails ko={ko}>
                        <div>product_id: {r.id}</div>
                        <div>store_id: {r.store_id}</div>
                        <div>slug: {r.store?.slug ?? "—"}</div>
                        <div>
                          status: {r.product_status} / {r.admin_review_status}
                        </div>
                      </AdminTechDetails>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <AdminToneBadge tone={ps.tone}>{ps.label}</AdminToneBadge>
                    </td>
                    <td className="px-3 py-2 align-top sam-text-helper">
                      <AdminToneBadge tone={rs.tone}>{rs.label}</AdminToneBadge>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-col gap-1">
                        {r.product_status !== "blocked" && (
                          <button
                            type="button"
                            disabled={dis}
                            className="rounded border border-red-200 bg-red-50 px-2 py-1 text-left sam-text-helper text-red-900 disabled:opacity-50"
                            onClick={() => void run(r.id, r.title, "block")}
                          >
                            {ko ? "차단" : "Block"}
                          </button>
                        )}
                        {/* DEF-36: 「숨김」·「보관(숨김)」 은 같은 동작 → 「숨김」 하나 */}
                        {r.product_status !== "hidden" &&
                          r.product_status !== "deleted" &&
                          r.product_status !== "blocked" && (
                          <button
                            type="button"
                            disabled={dis}
                            className="rounded border border-sam-border bg-sam-app px-2 py-1 text-left sam-text-helper disabled:opacity-50"
                            onClick={() => void run(r.id, r.title, "hide")}
                          >
                            {ko ? "숨김" : "Hide"}
                          </button>
                        )}
                        {(r.product_status === "active" || r.product_status === "hidden") && (
                          <button
                            type="button"
                            disabled={dis}
                            className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-left sam-text-helper text-amber-950 disabled:opacity-50"
                            onClick={() => void run(r.id, r.title, "sold_out")}
                          >
                            {ko ? "품절" : "Sold out"}
                          </button>
                        )}
                        {r.product_status !== "active" && r.product_status !== "deleted" && (
                          <button
                            type="button"
                            disabled={dis}
                            className="rounded border border-green-200 bg-green-50 px-2 py-1 text-left sam-text-helper text-green-900 disabled:opacity-50"
                            onClick={() => void run(r.id, r.title, "activate")}
                          >
                            {ko ? "판매 활성" : "Activate"}
                          </button>
                        )}
                        {r.admin_review_status !== "approved" && (
                          <button
                            type="button"
                            disabled={dis}
                            className="rounded border border-sam-border bg-sam-surface px-2 py-1 text-left sam-text-helper disabled:opacity-50"
                            onClick={() => void run(r.id, r.title, "approve_review")}
                          >
                            {ko ? "검수 승인" : "Approve"}
                          </button>
                        )}
                        {r.admin_review_status !== "rejected" && (
                          <button
                            type="button"
                            disabled={dis}
                            className="rounded border border-sam-border bg-sam-surface px-2 py-1 text-left sam-text-helper disabled:opacity-50"
                            onClick={() => void run(r.id, r.title, "reject_review")}
                          >
                            {ko ? "검수 반려" : "Reject"}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={dis}
                          className="rounded border border-sam-border bg-sam-surface px-2 py-1 text-left sam-text-helper disabled:opacity-50"
                          onClick={() => void runCorrectName(r.id, r.title)}
                        >
                          {t("admin_stores_product_correct_name")}
                        </button>
                        <button
                          type="button"
                          disabled={dis}
                          className="rounded border border-sam-border bg-sam-surface px-2 py-1 text-left sam-text-helper disabled:opacity-50"
                          onClick={() => void runCorrectPrice(r.id, r.title, r.price)}
                        >
                          {t("admin_stores_product_correct_price")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
