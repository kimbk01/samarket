"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { useBusinessAdminStore } from "@/components/business/admin/business-admin-store-context";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { storeRowCanSell } from "@/lib/business/store-can-sell";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { getAppSettings } from "@/lib/app-settings";
import { getCurrencyUnitLabel } from "@/lib/utils/format";

type Section = { id: string; name: string; sort_order?: number; is_hidden?: boolean };

type HubProduct = {
  id: string;
  title: string;
  price: number;
  discount_price?: number | null;
  thumbnail_url?: string | null;
  product_status: string;
  menu_section_id?: string | null;
  store_menu_sections?: Section | Section[] | null;
};

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

/** 매장 상품 목록·노출·신규 등록 진입 — 구 메뉴 관리 화면과 동일 기능 */
export function OwnerProductsHubClient({ storeId }: { storeId: string }) {
  const adminStore = useBusinessAdminStore();
  const priceUnit = useMemo(() => getCurrencyUnitLabel(getAppSettings().defaultCurrency), []);
  const [sections, setSections] = useState<Section[]>([]);
  const [products, setProducts] = useState<HubProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const canSell = useMemo(() => {
    const r = adminStore?.storeRow;
    if (!r || r.id !== storeId) return true;
    return storeRowCanSell(r);
  }, [adminStore?.storeRow, storeId]);

  const q = `storeId=${encodeURIComponent(storeId)}`;
  const draftQ = canSell ? "" : "&draft=1";
  const newProductBase = `/my/business/products/new?${q}${draftQ}`;
  /** 특정 탭이면 해당 카테고리까지 URL로 넘김. 전체 탭은 등록 화면 상단에서 카테고리 선택 */
  const newProductHrefForTab =
    tab !== "all" ? `${newProductBase}&menuSectionId=${encodeURIComponent(tab)}` : newProductBase;
  const categoriesHref = `/my/business/menu-categories?${q}`;

  const addProductCtaClass =
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-signature/40 bg-signature px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-signature/90 active:bg-signature/95";

  const loadAll = useCallback(async () => {
    setLoading(true);
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
      if (!pj?.ok) {
        setError(typeof pj?.error === "string" ? pj.error : "상품 목록을 불러오지 못했습니다.");
        setProducts([]);
      } else {
        setProducts((pj.products ?? []) as HubProduct[]);
      }
      if (sj?.ok && Array.isArray(sj.sections)) {
        setSections(
          sj.sections.map((s: Section) => ({
            id: String(s.id),
            name: String(s.name ?? ""),
            sort_order: Number(s.sort_order) || 0,
            is_hidden: s.is_hidden === true,
          }))
        );
      } else {
        setSections([]);
      }
    } catch {
      setError("network_error");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const filtered = useMemo(() => {
    const qy = search.trim().toLowerCase();
    let list = products;
    if (tab !== "all") {
      list = list.filter((p) => sectionIdOf(p) === tab);
    }
    if (qy.length > 0) {
      list = list.filter((p) => (p.title ?? "").toLowerCase().includes(qy));
    }
    return list;
  }, [products, tab, search]);

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
          setToast("판매 승인 전에는 상품을 노출(판매중)로 바꿀 수 없습니다. 초안·숨김만 가능합니다.");
        } else {
          setError(typeof j?.error === "string" ? j.error : "처리 실패");
        }
        return;
      }
      await loadAll();
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

  const onDelete = (p: HubProduct) => {
    if (!window.confirm(`「${p.title}」을(를) 삭제(목록에서 제거)할까요?`)) return;
    void patchProduct(p.id, { product_status: "deleted" });
  };

  const ordersHref = buildStoreOrdersHref({ storeId });
  const inquiriesHref = `/my/business/inquiries?storeId=${encodeURIComponent(storeId)}`;

  return (
    <div className="max-w-full overflow-x-hidden bg-gray-50 pb-8">
      <div className="flex flex-wrap gap-2 border-b border-gray-100 bg-white px-3 py-2">
        <Link
          href={ordersHref}
          className="rounded-full border border-gray-200 bg-[#F9FAFB] px-3 py-1.5 text-[12px] font-semibold text-gray-900"
        >
          주문 관리
        </Link>
        <Link
          href={inquiriesHref}
          className="rounded-full border border-gray-200 bg-[#F9FAFB] px-3 py-1.5 text-[12px] font-semibold text-gray-900"
        >
          문의
        </Link>
        <Link
          href={`/my/business?storeId=${encodeURIComponent(storeId)}`}
          className="rounded-full border border-gray-200 bg-[#F9FAFB] px-3 py-1.5 text-[12px] font-semibold text-gray-900"
        >
          운영 대시보드
        </Link>
      </div>
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white shadow-sm">
        <HorizontalDragScroll
          className="flex items-center gap-2 overflow-x-auto px-2 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="상품 카테고리 탭"
        >
          <Link
            href={categoriesHref}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#E5E7EB] bg-[#F9FAFB] text-signature"
            aria-label="카테고리 추가"
            title="카테고리 추가"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </Link>
          <button
            type="button"
            onClick={() => setTab("all")}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium ${
              tab === "all" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            전체
          </button>
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setTab(s.id)}
              className={`max-w-[200px] shrink-0 truncate rounded-full px-3 py-1.5 text-[13px] font-medium ${
                tab === s.id ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {s.name}
              {s.is_hidden ? " · 숨김" : ""}
            </button>
          ))}
        </HorizontalDragScroll>
      </div>

      <div className={`px-3 pt-3 ${OWNER_STORE_STACK_Y_CLASS}`}>
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
          <svg
            className="h-5 w-5 shrink-0 text-gray-400"
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
            placeholder="상품 검색"
            className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-gray-900 outline-none placeholder:text-gray-400"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-gray-900">
              {tab === "all" ? "새 상품 등록" : `「${sections.find((s) => s.id === tab)?.name ?? "카테고리"}」에 추가`}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
              {tab === "all"
                ? sections.length > 0
                  ? "등록 화면 맨 위에서 카테고리를 선택한 뒤 입력·저장하면 해당 탭에 표시됩니다."
                  : "먼저 카테고리를 만든 뒤 등록하세요."
                : "저장하면 이 탭에 바로 나타납니다."}
            </p>
          </div>
          <Link href={newProductHrefForTab} className={addProductCtaClass}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            신규 등록
          </Link>
        </div>

        <p className="text-[12px] leading-relaxed text-gray-600">
          상단 탭 줄의 <span className="font-semibold text-gray-800">+</span>는{" "}
          <strong className="font-medium text-gray-800">카테고리 추가</strong>입니다. 카테고리가 없으면{" "}
          <Link href={categoriesHref} className="font-medium text-signature underline">
            카테고리 관리
          </Link>
          에서 먼저 만드세요.
        </p>

        {toast ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            {toast}
          </p>
        ) : null}
        {error ? <p className="text-[13px] text-red-600">{error}</p> : null}

        {loading ? (
          <p className="text-[14px] text-gray-500">불러오는 중…</p>
        ) : filtered.length === 0 ? (
          <div
            className={`rounded-xl border border-dashed border-gray-200 bg-white py-10 text-center text-[14px] text-gray-500`}
          >
            {products.length === 0 ? (
              <>
                <p>등록된 상품이 없습니다.</p>
                <Link href={newProductHrefForTab} className={`${addProductCtaClass} mt-3`}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  신규 등록
                </Link>
              </>
            ) : (
              <p>조건에 맞는 상품이 없습니다.</p>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((p) => {
              const listed = isActiveListed(p.product_status);
              const busy = busyId === p.id;
              const editHref = `/my/business/products/${encodeURIComponent(p.id)}/edit?${q}`;
              return (
                <li
                  key={p.id}
                  className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-gray-100 px-3 py-2">
                    <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-gray-900">
                      {p.title}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-[11px] text-gray-500">노출</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={listed}
                        disabled={busy}
                        onClick={() => onToggleListed(p, !listed)}
                        className={`relative h-7 w-12 rounded-full transition focus-visible:outline focus-visible:ring-2 focus-visible:ring-signature disabled:opacity-50 ${
                          listed ? "bg-emerald-500" : "bg-gray-200"
                        }`}
                      >
                        <span
                          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                            listed ? "left-6" : "left-1"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3">
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                      {p.thumbnail_url ? (
                        <img
                          src={p.thumbnail_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">
                          이미지 없음
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[18px] font-semibold text-gray-900">
                        {displayPrice(p).toLocaleString()}
                        <span className="ml-1 text-[13px] font-normal text-gray-500">{priceUnit}</span>
                      </p>
                      {p.product_status !== "active" ? (
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          상태:{" "}
                          {p.product_status === "draft"
                            ? "초안"
                            : p.product_status === "hidden"
                              ? "숨김"
                              : p.product_status === "sold_out"
                                ? "품절"
                                : p.product_status}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 border-t border-gray-100 px-3 py-2">
                    <Link
                      href={editHref}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-medium text-signature"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                      수정
                    </Link>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onDelete(p)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-[13px] font-medium text-red-700 disabled:opacity-50"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                      삭제
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
