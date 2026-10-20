"use client";

import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminDetailDrawer } from "@/components/admin/ui/AdminDetailDrawer";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminStatusLabel } from "@/lib/admin/status-labels/delivery-status-labels";

/** 상품 조치 확인 등급(동작 표)·문구 — 차단/숨김(sanction)·검수 승인(approve)·검수 반려(reject) = L2(사유 → reason·memo), 나머지 L1. */
const PRODUCT_ACTIONS: Record<
  string,
  { level: AdminConfirmLevel; ko: string; en: string; titleKo: string; titleEn: string; destructive?: boolean; okKo: string; okEn: string }
> = {
  block: { level: adminActionLevel("sanction"), ko: "차단", en: "Block", titleKo: "이 상품을 판매 차단할까요?", titleEn: "Block this product?", destructive: true, okKo: "상품을 차단했습니다.", okEn: "Product blocked." },
  hide: { level: adminActionLevel("sanction"), ko: "숨김", en: "Hide", titleKo: "이 상품을 숨길까요?", titleEn: "Hide this product?", destructive: true, okKo: "상품을 숨겼습니다.", okEn: "Product hidden." },
  sold_out: { level: adminActionLevel("save"), ko: "품절", en: "Sold out", titleKo: "이 상품을 품절로 바꿀까요?", titleEn: "Mark this product sold out?", okKo: "품절로 바꿨습니다.", okEn: "Marked sold out." },
  activate: { level: adminActionLevel("resume"), ko: "판매 활성", en: "Activate", titleKo: "이 상품을 판매 중으로 바꿀까요?", titleEn: "Put this product on sale?", okKo: "판매 중으로 바꿨습니다.", okEn: "Product activated." },
  approve_review: { level: adminActionLevel("approve"), ko: "검수 승인", en: "Approve", titleKo: "이 상품 검수를 승인할까요?", titleEn: "Approve this product?", okKo: "검수를 승인했습니다.", okEn: "Review approved." },
  reject_review: { level: adminActionLevel("reject"), ko: "검수 반려", en: "Reject", titleKo: "이 상품 검수를 반려할까요?", titleEn: "Reject this product?", destructive: true, okKo: "검수를 반려했습니다.", okEn: "Review rejected." },
  correct_name: { level: adminActionLevel("save"), ko: "저장", en: "Save", titleKo: "상품명을 이렇게 바꿀까요?", titleEn: "Change the product name?", okKo: "상품명을 바꿨습니다.", okEn: "Name updated." },
  correct_price: { level: adminActionLevel("save"), ko: "저장", en: "Save", titleKo: "가격을 이렇게 바꿀까요?", titleEn: "Change the price?", okKo: "가격을 바꿨습니다.", okEn: "Price updated." },
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
  { value: "active", labelKey: "admin_stores_product_filter_active" },
  { value: "draft", labelKey: "common_draft" },
  { value: "hidden", labelKey: "common_hidden" },
  { value: "blocked", labelKey: "common_block" },
  { value: "sold_out", labelKey: "admin_stores_product_filter_sold_out" },
];

const PRODUCT_STATUSES = FILTERS.map((f) => f.value);
const LIST_CONFIG = { statuses: PRODUCT_STATUSES, extras: ["store_id"] as const };

export function AdminStoreProductsPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 상품명·가격 수정 — 상세 안 입력 폼 (값 입력 후 「저장」 → 실행 확인은 confirmAdminAction). */
  const [edit, setEdit] = useState<{ id: string; field: "name" | "price"; value: string } | null>(null);
  /** 목록 조건 = 주소 (`status`·`q`·`store_id`·`page`·`size`) — 새로고침·링크 공유·상세 복귀 시 유지. */
  const lq = useAdminListQuery(LIST_CONFIG);
  const storeIdFilter = lq.query.extras.store_id.trim();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ code: string; status?: number } | null>(null);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(
    null
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const openRow = openId ? rows.find((r) => r.id === openId) ?? null : null;

  const apiQs = lq.apiQueryString;
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/store-products?${apiQs}`, { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        // 실패해도 직전 목록은 지우지 않는다 (§8-5).
        setLoadError({ code: res.status === 403 ? "forbidden" : "load_failed", status: res.status });
        return;
      }
      setRows(json.products ?? []);
      setTotal(Number(json.total) || 0);
    } catch {
      setLoadError({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, [apiQs]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshKey 는 같은 조건 다시 불러오기 포함
  }, [lq.refreshKey]);

  /** 확인 팝업을 취소하면 아무 것도 실행하지 않는다 (DEF-37). L2 사유는 reason(감사)·memo(검수 메모)로 전송. */
  const run = async (
    id: string,
    productTitle: string,
    action: string,
    extra?: { name?: string; price?: number },
    detail?: string
  ): Promise<boolean> => {
    const c = PRODUCT_ACTIONS[action];
    if (!c) return false;
    const confirmed = await confirmAdminAction({
      level: c.level,
      ko,
      title: ko ? c.titleKo : c.titleEn,
      description: [productTitle, detail].filter(Boolean).join("\n") || undefined,
      confirmLabel: ko ? c.ko : c.en,
      destructive: c.destructive,
    });
    if (!confirmed.ok) return false;
    setBusyId(id);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/store-products/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        // 검수 승인 사유는 감사 기록 전용 — 검수 메모(admin_review_memo)는 예전처럼 건드리지 않는다.
        body: JSON.stringify({
          action,
          reason: confirmed.reason,
          memo: action === "approve_review" ? null : confirmed.reason,
          ...extra,
        }),
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
        return false;
      }
      setResult({ ok: true, message: ko ? c.okKo : c.okEn });
      await load();
      return true;
    } catch {
      setResult({ ok: false, code: "network_error" });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const saveEdit = async (r: Row) => {
    if (!edit || edit.id !== r.id) return;
    const raw = edit.value.trim();
    if (!raw) return;
    if (edit.field === "name") {
      if (await run(r.id, r.title, "correct_name", { name: raw }, `→ ${raw}`)) setEdit(null);
      return;
    }
    const price = Number(raw);
    if (!Number.isFinite(price) || price < 0) {
      setResult({ ok: false, code: "invalid_price" });
      return;
    }
    if (await run(r.id, r.title, "correct_price", { price }, `→ ${formatMoneyPhp(price)}`)) setEdit(null);
  };

  const actionButtons = (r: Row) => {
    const dis = busyId === r.id;
    return (
      <div className="flex flex-wrap gap-2">
        {r.product_status !== "blocked" && (
          <AdminActionButton variant="secondary" size="sm" disabled={dis} onClick={() => void run(r.id, r.title, "block")}>
            {ko ? "차단" : "Block"}
          </AdminActionButton>
        )}
        {/* DEF-36: 「숨김」·「보관(숨김)」 은 같은 동작 → 「숨김」 하나 */}
        {r.product_status !== "hidden" && r.product_status !== "deleted" && r.product_status !== "blocked" && (
          <AdminActionButton variant="secondary" size="sm" disabled={dis} onClick={() => void run(r.id, r.title, "hide")}>
            {ko ? "숨김" : "Hide"}
          </AdminActionButton>
        )}
        {(r.product_status === "active" || r.product_status === "hidden") && (
          <AdminActionButton variant="secondary" size="sm" disabled={dis} onClick={() => void run(r.id, r.title, "sold_out")}>
            {ko ? "품절" : "Sold out"}
          </AdminActionButton>
        )}
        {r.product_status !== "active" && r.product_status !== "deleted" && (
          <AdminActionButton variant="secondary" size="sm" disabled={dis} onClick={() => void run(r.id, r.title, "activate")}>
            {ko ? "판매 활성" : "Activate"}
          </AdminActionButton>
        )}
        {r.admin_review_status !== "rejected" && (
          <AdminActionButton variant="secondary" size="sm" disabled={dis} onClick={() => void run(r.id, r.title, "reject_review")}>
            {ko ? "검수 반려" : "Reject"}
          </AdminActionButton>
        )}
        <AdminActionButton variant="secondary" size="sm" disabled={dis} onClick={() => setEdit({ id: r.id, field: "name", value: r.title })}>
          {t("admin_stores_product_correct_name")}
        </AdminActionButton>
        <AdminActionButton
          variant="secondary"
          size="sm"
          disabled={dis}
          onClick={() => setEdit({ id: r.id, field: "price", value: String(Math.round(r.price)) })}
        >
          {t("admin_stores_product_correct_price")}
        </AdminActionButton>
      </div>
    );
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

      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        pending={loading}
        showPeriod={false}
        searchPlaceholder={ko ? "상품명" : "Product name"}
        status={{
          value: lq.query.status,
          onChange: lq.setStatus,
          options: FILTERS.map((f) => ({ value: f.value, label: t(f.labelKey) })),
        }}
      />

      <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />

      {loadError ? (
        <AdminErrorState ko={ko} code={loadError.code} httpStatus={loadError.status} onRetry={lq.refresh} />
      ) : null}

      {loading && rows.length === 0 ? (
        <AdminLoadingState ko={ko} />
      ) : rows.length === 0 ? (
        loadError ? null : (
          <AdminEmptyState ko={ko} message={lq.isFiltered ? undefined : t("admin_stores_products_empty")} onReset={lq.isFiltered ? lq.reset : undefined} />
        )
      ) : (
        <div className={`overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface ${loading ? "opacity-70" : ""}`} aria-busy={loading}>
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
                    </td>
                    <td className="px-3 py-2 align-top">
                      <AdminToneBadge tone={ps.tone}>{ps.label}</AdminToneBadge>
                    </td>
                    <td className="px-3 py-2 align-top sam-text-helper">
                      <AdminToneBadge tone={rs.tone}>{rs.label}</AdminToneBadge>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {/* 행 버튼은 「상세」 하나 — 차단·숨김·검수·수정은 상세에서 (행당 2개 이하) */}
                      <AdminActionButton
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEdit(null);
                          setOpenId(r.id);
                        }}
                      >
                        {adminCta("detail", ko)}
                      </AdminActionButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 ? (
        <AdminPagination
          ko={ko}
          page={lq.query.page}
          size={lq.query.size}
          total={total}
          onPageChange={lq.setPage}
          onSizeChange={lq.setSize}
          disabled={loading}
        />
      ) : null}

      <AdminDetailDrawer
        open={openRow != null}
        onClose={() => {
          setOpenId(null);
          setEdit(null);
        }}
        ko={ko}
        pending={openRow != null && busyId === openRow.id}
        title={openRow?.title ?? ""}
        subtitle={openRow?.store?.store_name ?? undefined}
        dangerActions={
          <AdminActionButton
            variant="secondary"
            disabled={openRow != null && busyId === openRow.id}
            onClick={() => {
              setOpenId(null);
              setEdit(null);
            }}
          >
            {adminCta("close", ko)}
          </AdminActionButton>
        }
        primaryActions={
          openRow && openRow.admin_review_status !== "approved" ? (
            <AdminActionButton
              variant="primary"
              disabled={busyId === openRow.id}
              onClick={() => void run(openRow.id, openRow.title, "approve_review")}
            >
              {ko ? "검수 승인" : "Approve"}
            </AdminActionButton>
          ) : null
        }
      >
        {openRow ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <AdminToneBadge tone={adminStatusLabel("product", openRow.product_status, ko).tone}>
                {adminStatusLabel("product", openRow.product_status, ko).label}
              </AdminToneBadge>
              <AdminToneBadge tone={adminStatusLabel("product_review", openRow.admin_review_status || "none", ko).tone}>
                {adminStatusLabel("product_review", openRow.admin_review_status || "none", ko).label}
              </AdminToneBadge>
              <span className="sam-text-helper text-sam-muted">
                {typeof openRow.price === "number" ? formatMoneyPhp(openRow.price) : openRow.price}
              </span>
            </div>
            {actionButtons(openRow)}
            {edit?.id === openRow.id ? (
              <form
                className="flex flex-col gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveEdit(openRow);
                }}
              >
                <label className="sam-text-helper text-sam-muted">
                  {edit.field === "name" ? t("admin_stores_product_correct_name") : t("admin_stores_product_correct_price")}
                  <input
                    className="mt-1 block w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1 text-[13px] text-sam-fg"
                    inputMode={edit.field === "price" ? "decimal" : undefined}
                    value={edit.value}
                    autoFocus
                    onChange={(e) => setEdit({ ...edit, value: e.target.value })}
                  />
                </label>
                <span className="sam-text-helper text-sam-muted">
                  {ko ? "현재: " : "Current: "}
                  {edit.field === "name" ? openRow.title : formatMoneyPhp(openRow.price)}
                </span>
                <div className="flex gap-1">
                  <AdminActionButton type="submit" variant="secondary" size="sm" disabled={busyId === openRow.id || !edit.value.trim()}>
                    {adminCta("save", ko)}
                  </AdminActionButton>
                  <AdminActionButton variant="quiet" size="sm" onClick={() => setEdit(null)}>
                    {adminCta("cancel", ko)}
                  </AdminActionButton>
                </div>
              </form>
            ) : null}
            <AdminTechDetails ko={ko}>
              <div>product_id: {openRow.id}</div>
              <div>store_id: {openRow.store_id}</div>
              <div>slug: {openRow.store?.slug ?? "—"}</div>
              <div>
                status: {openRow.product_status} / {openRow.admin_review_status}
              </div>
            </AdminTechDetails>
          </div>
        ) : null}
      </AdminDetailDrawer>
    </div>
  );
}
