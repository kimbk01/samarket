"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { getAppSettings } from "@/lib/app-settings";
import { getCurrencyUnitLabel } from "@/lib/utils/format";

type Section = { id: string; name: string; sort_order?: number; is_hidden?: boolean };

type MenuProduct = {
  id: string;
  title: string;
  price: number;
  discount_price?: number | null;
  thumbnail_url?: string | null;
  product_status: string;
  menu_section_id?: string | null;
  store_menu_sections?: Section | Section[] | null;
};

function sectionIdOf(p: MenuProduct): string | null {
  if (p.menu_section_id) return String(p.menu_section_id);
  const emb = p.store_menu_sections;
  if (!emb) return null;
  const one = Array.isArray(emb) ? emb[0] : emb;
  return one?.id ? String(one.id) : null;
}

function displayPrice(p: MenuProduct): number {
  const d = p.discount_price;
  if (d != null && Number.isFinite(Number(d)) && Number(d) >= 0) {
    return Math.floor(Number(d));
  }
  return Math.floor(Number(p.price) || 0);
}

function isActiveListed(status: string): boolean {
  return status === "active";
}

export function OwnerMenuManageClient({ storeId }: { storeId: string }) {
  const priceUnit = useMemo(() => getCurrencyUnitLabel(getAppSettings().defaultCurrency), []);
  const [sections, setSections] = useState<Section[]>([]);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const q = `storeId=${encodeURIComponent(storeId)}`;
  const newProductHref =
    tab !== "all"
      ? `/my/business/products/new?${q}&menuSectionId=${encodeURIComponent(tab)}`
      : `/my/business/products/new?${q}`;
  const categoriesHref = `/my/business/menu-categories?${q}`;

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
        setProducts((pj.products ?? []) as MenuProduct[]);
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
          setToast("판매 승인 전에는 메뉴를 노출(판매중)로 바꿀 수 없습니다. 초안·숨김만 가능합니다.");
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

  const onToggleListed = (p: MenuProduct, nextOn: boolean) => {
    if (nextOn) {
      void patchProduct(p.id, { product_status: "active" });
    } else {
      void patchProduct(p.id, { product_status: "hidden" });
    }
  };

  const onDelete = (p: MenuProduct) => {
    if (!window.confirm(`「${p.title}」을(를) 삭제(목록에서 제거)할까요?`)) return;
    void patchProduct(p.id, { product_status: "deleted" });
  };

  return (
    <div className="min-h-screen max-w-full overflow-x-hidden bg-gray-50 pb-8">
      <header className="sticky top-0 z-20 flex items-center border-b border-gray-100 bg-white px-1 py-2">
        <AppBackButton backHref="/my/business" />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">메뉴 관리</h1>
        <Link
          href={categoriesHref}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-signature"
          aria-label="카테고리 추가"
          title="카테고리 추가"
        >
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </Link>
      </header>

      <div className="sticky top-[52px] z-10 border-b border-gray-100 bg-white shadow-sm">
        <div className="flex gap-1 overflow-x-auto px-2 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setTab("all")}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium ${
              tab === "all"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700"
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
                tab === s.id
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {s.name}
              {s.is_hidden ? " · 숨김" : ""}
            </button>
          ))}
        </div>
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
            placeholder="메뉴 검색"
            className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-gray-900 outline-none placeholder:text-gray-400"
          />
        </div>

        <p className="text-[12px] leading-relaxed text-gray-600">
          우측 <span className="font-semibold text-gray-800">+</span>는{" "}
          <strong className="font-medium text-gray-800">카테고리 추가</strong>입니다. 탭이 비어 있으면
          먼저 카테고리를 만든 뒤 메뉴를 등록하세요. 새 메뉴(상품)는{" "}
          <Link href={newProductHref} className="font-medium text-signature underline">
            메뉴 추가
          </Link>
          에서 등록합니다.
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
          <div className={`rounded-xl border border-dashed border-gray-200 bg-white py-10 text-center text-[14px] text-gray-500`}>
            {products.length === 0 ? (
              <>
                <p>등록된 메뉴가 없습니다.</p>
                <Link href={newProductHref} className="mt-2 inline-block font-medium text-signature underline">
                  메뉴 추가
                </Link>
              </>
            ) : (
              <p>조건에 맞는 메뉴가 없습니다.</p>
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
