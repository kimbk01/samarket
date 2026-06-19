"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useBusinessAdminStore } from "@/components/business/admin/business-admin-store-context";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { storeRowCanSell } from "@/lib/business/store-can-sell";
import { getAppSettings } from "@/lib/app-settings";
import { getCurrencyUnitLabel } from "@/lib/utils/format";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  readOwnerProductsHubSessionCache,
  writeOwnerProductsHubSessionCache,
} from "@/lib/business/owner-products-hub-session-cache";

type Section = { id: string; name: string; sort_order?: number; is_hidden?: boolean };

type HubProduct = {
  id: string;
  title: string;
  summary?: string | null;
  price: number;
  discount_price?: number | null;
  thumbnail_url?: string | null;
  product_status: string;
  menu_section_id?: string | null;
  store_menu_sections?: Section | Section[] | null;
};

const INTRO_PREVIEW_LEN = 96;

/** 목록 한 줄 소개: 요약(summary)만 사용 */
function oneLineProductIntro(p: HubProduct): string {
  const sum = typeof p.summary === "string" ? p.summary.trim() : "";
  if (!sum) return "";
  return sum.length > INTRO_PREVIEW_LEN ? `${sum.slice(0, INTRO_PREVIEW_LEN)}…` : sum;
}

function sectionIdOf(p: HubProduct): string | null {
  if (p.menu_section_id) return String(p.menu_section_id);
  const emb = p.store_menu_sections;
  if (!emb) return null;
  const one = Array.isArray(emb) ? emb[0] : emb;
  return one?.id ? String(one.id) : null;
}

function displayPrice(p: HubProduct): number {
  const d = p.discount_price;
  if (d != null && Number.isFinite(Number(d)) && Number(d) >= 0) {
    return Math.floor(Number(d));
  }
  return Math.floor(Number(p.price) || 0);
}

function isActiveListed(status: string): boolean {
  return status === "active";
}

/** 카테고리 = 1차(크기·시그니처), 상태 = 2차(작고 중립) — 동일 알약 톤만 쓰지 않음 */
const OWNER_HUB_FILTER_SCROLL_ROW =
  "flex snap-x snap-proximity flex-nowrap items-center gap-2 overflow-x-auto py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function ownerHubCategoryPillClass(active: boolean): string {
  return [
    "snap-start shrink-0 touch-manipulation whitespace-nowrap rounded-full border px-3.5 py-2 sam-text-body-secondary font-semibold leading-none transition-[color,background-color,border-color,transform] active:scale-[0.98]",
    active
      ? "border-signature bg-signature text-white shadow-sm"
      : "border-transparent bg-sam-surface text-sam-fg shadow-sm ring-1 ring-sam-border/50",
  ].join(" ");
}

function ownerHubStatusPillClass(active: boolean): string {
  return [
    "snap-start shrink-0 touch-manipulation whitespace-nowrap rounded-full border px-2.5 py-1 sam-text-xxs font-semibold leading-none transition-[color,background-color,border-color,transform] active:scale-[0.98]",
    active
      ? "border-sam-ink bg-sam-ink text-white shadow-sm"
      : "border-transparent bg-sam-surface/95 text-sam-muted shadow-sm ring-1 ring-sam-border/40",
  ].join(" ");
}

import type { OwnerRscHubProduct, OwnerRscMenuSection } from "@/lib/stores/owner/load-owner-store-read-bootstrap";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";

/** 매장 상품 목록·노출·신규 등록 진입 — RSC `initial*` 으로 첫 페인트부터 데이터 표시 */
export function OwnerProductsHubClient({
  storeId,
  initialSections,
  initialProducts,
  rscBootstrapError,
}: {
  storeId: string;
  initialSections?: OwnerRscMenuSection[];
  initialProducts?: OwnerRscHubProduct[];
  /** RSC 부트스트랩 실패 시 클라에서 API 재시도 */
  rscBootstrapError?: string;
}) {
  const { t } = useI18n();
  const hasRscPayload = initialSections != null && initialProducts != null;

  const adminStore = useBusinessAdminStore();
  const priceUnit = useMemo(() => getCurrencyUnitLabel(getAppSettings().defaultCurrency), []);
  const [sections, setSections] = useState<Section[]>(() => {
    if (hasRscPayload) {
      return initialSections.map((s) => ({
        id: s.id,
        name: s.name,
        sort_order: s.sort_order,
        is_hidden: s.is_hidden,
      }));
    }
    return (readOwnerProductsHubSessionCache(storeId)?.sections ?? []) as Section[];
  });
  const [products, setProducts] = useState<HubProduct[]>(() => {
    if (hasRscPayload) return initialProducts as HubProduct[];
    return (readOwnerProductsHubSessionCache(storeId)?.products ?? []) as HubProduct[];
  });
  const [loading, setLoading] = useState(() => {
    if (hasRscPayload) return false;
    if (rscBootstrapError) return true;
    return readOwnerProductsHubSessionCache(storeId) == null;
  });
  const [error, setError] = useState<string | null>(() => {
    if (!rscBootstrapError) return null;
    if (rscBootstrapError === "session_invalid") {
      return t("business_phase7_422");
    }
    if (rscBootstrapError === "supabase_unconfigured") {
      return t("business_phase7_423");
    }
    return rscBootstrapError;
  });
  const [tab, setTab] = useState<string>("all");
  /** 전체·판매중·품절·숨김(초안 포함) — 카테고리 탭과 AND 필터 */
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "sold_out" | "hidden">("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HubProduct | null>(null);

  const canSell = useMemo(() => {
    const r = adminStore?.storeRow;
    if (!r || r.id !== storeId) return true;
    return storeRowCanSell(r);
  }, [adminStore?.storeRow, storeId]);

  const q = `storeId=${encodeURIComponent(storeId)}`;
  const draftQ = canSell ? "" : "&draft=1";
  const newProductBase = `/stores/owner/products/new?${q}${draftQ}`;
  /** 특정 탭이면 해당 카테고리까지 URL로 넘김. 전체 탭은 등록 화면 상단에서 카테고리 선택 */
  const newProductHrefForTab =
    tab !== "all" ? `${newProductBase}&menuSectionId=${encodeURIComponent(tab)}` : newProductBase;
  const categoriesHref = `/stores/owner/menu-categories?${q}`;

  const loadAll = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const [secRes, prodRes] = await Promise.all([
        fetch(`/api/me/stores/${encodeURIComponent(storeId)}/menu-sections`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(`/api/me/stores/${encodeURIComponent(storeId)}/products`, {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      const sj = await secRes.json().catch(() => ({}));
      const pj = await prodRes.json().catch(() => ({}));
      let nextProducts: HubProduct[] = [];
      let nextSections: Section[] = [];
      if (!pj?.ok) {
        setError(typeof pj?.error === "string" ? pj.error : t("business_phase7_424"));
        setProducts([]);
        nextProducts = [];
      } else {
        nextProducts = (pj.products ?? []) as HubProduct[];
        setProducts(nextProducts);
      }
      if (sj?.ok && Array.isArray(sj.sections)) {
        nextSections = sj.sections.map((s: Section) => ({
          id: String(s.id),
          name: String(s.name ?? ""),
          sort_order: Number(s.sort_order) || 0,
          is_hidden: s.is_hidden === true,
        }));
        setSections(nextSections);
      } else {
        setSections([]);
        nextSections = [];
      }
      if (pj?.ok) {
        writeOwnerProductsHubSessionCache(storeId, nextSections, nextProducts);
      }
    } catch {
      if (!opts?.silent) {
        setError("network_error");
        setProducts([]);
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [storeId, t]);

  useEffect(() => {
    const clientCached = readOwnerProductsHubSessionCache(storeId) != null;
    const silent = hasRscPayload || clientCached;
    void loadAll(silent ? { silent: true } : undefined);
  }, [hasRscPayload, loadAll, storeId]);

  /** 카테고리가 삭제되거나 목록이 바뀌어 선택 탭이 없어지면 전체 상품 보기로 복귀 */
  useEffect(() => {
    if (tab !== "all" && !sections.some((s) => s.id === tab)) {
      setTab("all");
    }
  }, [sections, tab]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const filtered = useMemo(() => {
    const qy = search.trim().toLowerCase();
    let list = products;
    if (tab !== "all") {
      list = list.filter((p) => sectionIdOf(p) === tab);
    }
    if (statusFilter === "active") {
      list = list.filter((p) => p.product_status === "active");
    } else if (statusFilter === "sold_out") {
      list = list.filter((p) => p.product_status === "sold_out");
    } else if (statusFilter === "hidden") {
      list = list.filter((p) => p.product_status === "hidden" || p.product_status === "draft");
    }
    if (qy.length > 0) {
      list = list.filter((p) => {
        const blob = [p.title ?? "", p.summary ?? "", oneLineProductIntro(p)].join(" ").toLowerCase();
        return blob.includes(qy);
      });
    }
    return list;
  }, [products, tab, search, statusFilter]);

  const patchProduct = async (productId: string, body: Record<string, unknown>) => {
    setBusyId(productId);
    setError(null);
    try {
      const res = await fetch(
        `/api/me/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        if (j?.error === "sales_not_approved") {
          setToast(t("business_phase7_425"));
        } else {
          setError(typeof j?.error === "string" ? j.error : t("business_phase7_426"));
        }
        return;
      }
      await loadAll({ silent: true });
    } catch {
      setError("network_error");
    } finally {
      setBusyId(null);
    }
  };

  const onToggleListed = (p: HubProduct, nextOn: boolean) => {
    if (nextOn) {
      void patchProduct(p.id, { product_status: "active" });
    } else {
      void patchProduct(p.id, { product_status: "hidden" });
    }
  };

  const onToggleSoldOut = (p: HubProduct) => {
    if (p.product_status === "sold_out") {
      void patchProduct(p.id, { product_status: "active" });
      return;
    }
    if (p.product_status === "active") {
      void patchProduct(p.id, { product_status: "sold_out" });
      return;
    }
    setToast(t("business_phase7_427"));
  };

  const onDeleteClick = (p: HubProduct) => {
    setDeleteTarget(p);
  };

  const hubTopActionClass =
    "min-h-11 min-w-0 flex-1 touch-manipulation select-none rounded-ui-rect px-3 py-2.5 text-center sam-text-body-secondary font-semibold no-underline";

  return (
    <div className="max-w-full overflow-x-hidden bg-sam-app pb-[max(0px,var(--safe-bottom))]">
      <div
        className="flex gap-2 border-b border-sam-border-soft bg-sam-surface py-2.5"
      >
        <Link
          href={categoriesHref}
          className={`${Sam.btn.secondaryCombo} ${hubTopActionClass} shadow-sm active:scale-[0.98]`}
        >
          {t("business_phase7_307")}
        </Link>
        <Link
          href={newProductHrefForTab}
          className={`${Sam.btn.primaryCombo} ${hubTopActionClass} !text-white shadow-sm active:scale-[0.98]`}
        >
          {t("business_phase7_408")}
        </Link>
      </div>

      <section
        className="sticky top-0 z-10 border-b border-sam-border-soft bg-gradient-to-b from-sam-surface-muted to-sam-surface-muted/90 pt-2 pb-2 backdrop-blur-[6px]"
        aria-label={t("business_phase7_300")}
      >
        <p className="mb-1 sam-text-xxs font-medium text-sam-meta">{t("business_phase7_299")}</p>
        <nav className={OWNER_HUB_FILTER_SCROLL_ROW} aria-label={t("business_phase7_154")} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "all"}
            onClick={() => setTab("all")}
            className={ownerHubCategoryPillClass(tab === "all")}
          >
            {t("store_owner_tab_all")}
          </button>
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={tab === s.id}
              onClick={() => setTab(s.id)}
              className={`max-w-[min(220px,82vw)] truncate ${ownerHubCategoryPillClass(tab === s.id)}`}
            >
              {s.name}
              {s.is_hidden ? t("business_phase7_397") : ""}
            </button>
          ))}
        </nav>
        <p className="mb-1 mt-2 border-t border-sam-border/40 pt-2 sam-text-xxs font-medium text-sam-meta">
          {t("business_phase7_410")}
        </p>
        <div
          className={OWNER_HUB_FILTER_SCROLL_ROW}
          role="group"
          aria-label={t("business_phase7_096")}
        >
          {(
            [
              { id: "all" as const, label: t("business_phase7_411") },
              { id: "active" as const, label: t("business_phase7_412") },
              { id: "sold_out" as const, label: t("business_phase7_317") },
              { id: "hidden" as const, label: t("business_phase7_413") },
            ] as const
          ).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStatusFilter(s.id)}
              className={ownerHubStatusPillClass(statusFilter === s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <div className="space-y-2 pt-2 pb-1">
        <div className="flex items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 shadow-sm">
          <svg
            className="h-5 w-5 shrink-0 text-sam-meta"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("business_phase7_150")}
            className="min-w-0 flex-1 border-0 bg-transparent sam-text-body text-sam-fg outline-none placeholder:text-sam-meta"
          />
        </div>

        {sections.length === 0 ? (
          <p className="sam-text-helper leading-relaxed text-sam-muted">
            {t("business_phase7_414", { v1: t("business_phase7_307") })}{" "}
            {t("business_phase7_415")}{" "}
            <Link href={categoriesHref} className="font-medium text-signature underline">
              {t("business_phase7_391")}
            </Link>
            {t("business_phase7_416")}
          </p>
        ) : null}

        {toast ? (
          <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-body-secondary text-amber-900">
            {toast}
          </p>
        ) : null}
        {error ? <p className="sam-text-body-secondary text-red-600">{resolveOwnerApiErrorMessage(error, t)}</p> : null}

        {loading ? (
          <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>
        ) : filtered.length === 0 ? (
          <div
            className={`rounded-ui-rect border border-dashed border-sam-border bg-sam-surface py-6 text-center sam-text-body-secondary text-sam-muted`}
          >
            {products.length === 0 ? (
              <p>{t("business_phase7_058")}</p>
            ) : (
              <p>{t("business_phase7_255")}</p>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((p) => {
              const listed = isActiveListed(p.product_status);
              const busy = busyId === p.id;
              const editHref = `/stores/owner/products/${encodeURIComponent(p.id)}/edit?${q}`;
              const intro = oneLineProductIntro(p);
              const statusLabel =
                p.product_status === "draft"
                  ? t("business_phase7_417")
                  : p.product_status === "hidden"
                    ? t("business_phase7_418")
                    : p.product_status !== "active" && p.product_status !== "sold_out"
                      ? p.product_status
                      : null;
              return (
                <li
                  key={p.id}
                  className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm"
                >
                  <div className="flex gap-2 px-2 py-1.5">
                    {/** 정사각 썸네일 80×80px — img 프리플라이트(height:auto) 무력화 후 object-cover로 상하좌우 꽉 참 */}
                    <div className="relative size-20 shrink-0 overflow-hidden rounded-md bg-sam-surface-muted">
                      {p.thumbnail_url ? (
                        <img
                          src={p.thumbnail_url}
                          alt=""
                          className="pointer-events-none absolute inset-0 block !h-full !w-full max-w-none object-cover object-center select-none"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center px-0.5 text-center sam-text-xxs leading-tight text-sam-meta">
                          {t("business_phase7_419")}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate sam-text-body-secondary font-semibold leading-tight text-sam-fg">
                        {p.title}
                      </p>
                      {intro ? (
                        <p className="mt-0.5 truncate sam-text-xxs leading-snug text-sam-muted" title={intro}>
                          {intro}
                        </p>
                      ) : null}
                      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                        <span className="sam-text-body-secondary font-semibold tabular-nums text-sam-fg">
                          {displayPrice(p).toLocaleString()}
                          <span className="ml-0.5 sam-text-xxs font-normal text-sam-muted">{priceUnit}</span>
                        </span>
                        {statusLabel ? (
                          <span className="sam-text-xxs text-sam-muted">· {statusLabel}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex min-h-8 w-full flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-sam-border-soft px-2 py-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-0.5">
                        <span className="whitespace-nowrap sam-text-xxs text-sam-muted">{t("business_phase7_317")}</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={p.product_status === "sold_out"}
                          disabled={busy || (!listed && p.product_status !== "sold_out")}
                          title={
                            p.product_status === "draft" || p.product_status === "hidden"
                              ? t("business_phase7_420")
                              : t("business_phase7_421")
                          }
                          onClick={() => onToggleSoldOut(p)}
                          className={`relative h-6 w-11 shrink-0 rounded-full transition focus-visible:outline focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50 ${
                            p.product_status === "sold_out" ? "bg-amber-500" : "bg-sam-border-soft"
                          }`}
                        >
                          <span
                            className={`absolute top-1 h-4 w-4 rounded-full bg-sam-surface shadow transition ${
                              p.product_status === "sold_out" ? "left-6" : "left-1"
                            }`}
                          />
                        </button>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <span className="whitespace-nowrap sam-text-xxs text-sam-muted">{t("business_phase7_047")}</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={listed}
                          disabled={busy}
                          onClick={() => onToggleListed(p, !listed)}
                          className={`relative h-6 w-11 shrink-0 rounded-full transition focus-visible:outline focus-visible:ring-2 focus-visible:ring-signature disabled:opacity-50 ${
                            listed ? "bg-emerald-500" : "bg-sam-border-soft"
                          }`}
                        >
                          <span
                            className={`absolute top-1 h-4 w-4 rounded-full bg-sam-surface shadow transition ${
                              listed ? "left-6" : "left-1"
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-1.5">
                      <Link
                        href={editHref}
                        className="inline-flex min-h-8 items-center gap-0.5 rounded-md border border-sam-border bg-sam-surface px-2 py-0.5 sam-text-xxs font-medium text-signature"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                        {t("common_edit")}
                      </Link>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onDeleteClick(p)}
                        className="inline-flex min-h-8 items-center gap-0.5 rounded-md border border-red-100 bg-red-50 px-2 py-0.5 sam-text-xxs font-medium text-red-700 disabled:opacity-50"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                        {t("common_delete")}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <OwnerStoreAdminConfirmModal
        open={deleteTarget != null}
        titleId="owner-products-hub-delete-title"
        title={t("business_phase7_151")}
        description={
          deleteTarget ? t("business_phase7_428", { v1: deleteTarget.title }) : undefined
        }
        cancelLabel={t("common_cancel")}
        confirmLabel={t("common_delete")}
        confirmBusyLabel={t("common_processing")}
        busy={deleteTarget != null && busyId === deleteTarget.id}
        disableActions={busyId !== null}
        confirmTone="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const p = deleteTarget;
          setDeleteTarget(null);
          await patchProduct(p.id, { product_status: "deleted" });
        }}
      />
    </div>
  );
}
