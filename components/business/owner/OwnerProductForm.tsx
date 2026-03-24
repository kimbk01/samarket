"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  OWNER_STORE_CONTROL_CLASS,
  OWNER_STORE_CONTROL_COMPACT_CLASS,
  OWNER_STORE_FORM_GRID_2_CLASS,
  OWNER_STORE_SELECT_CLASS,
} from "@/lib/business/owner-store-stack";
import { getAppSettings } from "@/lib/app-settings";
import { BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS } from "@/lib/main-menu/bottom-nav-config";
import {
  formatPrice,
  formatPriceInput,
  getCurrencyUnitLabel,
} from "@/lib/utils/format";
import {
  approximateDiscountPercent,
  discountPriceFromPercent,
} from "@/lib/stores/store-product-pricing";

/** 폼 전용: 옵션 한 줄 */
type OptionRowForm = { name: string; priceDelta: string };
/** 폼 전용: 옵션 그룹 (저장 시 { nameKo, minSelect, maxSelect, options } 로 직렬화) */
type OptionGroupForm = {
  nameKo: string;
  minSelect: string;
  maxSelect: string;
  options: OptionRowForm[];
};

type FormValues = {
  title: string;
  summary: string;
  description_html: string;
  /** 숫자만 (콤마 없이 저장, 표시는 천단위) */
  price: string;
  /** 0–100 정수만, 표시는 숫자만 */
  discount_percent: string;
  stock_qty: string;
  /** false: 재고 미관리(무제한). true: 수량·주문 차감·자동 품절 */
  track_inventory: boolean;
  product_status: string;
  thumbnail_url: string;
  /** 매장 전용 메뉴 구역 (store_menu_sections) — 상단 카테고리와 동일 */
  menu_section_id: string;
  is_featured: boolean;
  sort_order: string;
  optionGroups: OptionGroupForm[];
};

function clampInt(n: unknown, lo: number, hi: number, fallback: number): number {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return fallback;
  return Math.max(lo, Math.min(hi, x));
}

function emptyOptionRow(): OptionRowForm {
  return { name: "", priceDelta: "0" };
}

function emptyOptionGroup(): OptionGroupForm {
  return {
    nameKo: "",
    minSelect: "1",
    maxSelect: "1",
    options: [emptyOptionRow()],
  };
}

/** DB/API options_json 배열 → 폼 상태 */
function optionsJsonToFormGroups(raw: unknown): OptionGroupForm[] {
  if (!Array.isArray(raw)) return [];
  const out: OptionGroupForm[] = [];
  for (const g of raw) {
    if (!g || typeof g !== "object") continue;
    const rec = g as Record<string, unknown>;
    const nameKo = String(rec.nameKo ?? rec.name ?? "").trim();
    const minSelect = String(clampInt(rec.minSelect, 0, 99, 0));
    let maxSelect = String(clampInt(rec.maxSelect, 0, 99, 1));
    if (parseInt(maxSelect, 10) < parseInt(minSelect, 10)) maxSelect = minSelect;
    const optsRaw = Array.isArray(rec.options) ? rec.options : [];
    const options: OptionRowForm[] = optsRaw.map((o) => {
      if (!o || typeof o !== "object") return emptyOptionRow();
      const or = o as Record<string, unknown>;
      return {
        name: String(or.name ?? "").trim(),
        priceDelta: String(Math.max(0, Math.floor(Number(or.priceDelta ?? 0)))),
      };
    });
    out.push({
      nameKo,
      minSelect,
      maxSelect,
      options: options.length > 0 ? options : [emptyOptionRow()],
    });
  }
  return out;
}

/** 폼 상태 → API options_json */
function formGroupsToOptionsJson(groups: OptionGroupForm[]): unknown[] {
  const out: unknown[] = [];
  for (const g of groups) {
    const nameKo = g.nameKo.trim();
    const minSelect = clampInt(parseInt(g.minSelect, 10), 0, 99, 0);
    let maxSelect = clampInt(parseInt(g.maxSelect, 10), 0, 99, 1);
    if (maxSelect < minSelect) maxSelect = minSelect;
    const options = g.options
      .map((o) => ({
        name: o.name.trim(),
        priceDelta: Math.max(0, Math.floor(parseInt(o.priceDelta, 10) || 0)),
      }))
      .filter((o) => o.name.length > 0);
    if (!nameKo || options.length === 0) continue;
    out.push({ nameKo, minSelect, maxSelect, options });
  }
  return out;
}

type OptionPresetKey = "1-1" | "0-99" | "1-99" | "0-1" | "custom";

function optionGroupPresetKey(g: OptionGroupForm): OptionPresetKey {
  const min = clampInt(parseInt(g.minSelect, 10), 0, 99, -1);
  const max = clampInt(parseInt(g.maxSelect, 10), 0, 99, -1);
  if (min < 0 || max < 0) return "custom";
  const key = `${min}-${max}`;
  if (key === "1-1" || key === "0-99" || key === "1-99" || key === "0-1") return key;
  return "custom";
}

function presetMinMax(key: OptionPresetKey): { minSelect: string; maxSelect: string } {
  switch (key) {
    case "1-1":
      return { minSelect: "1", maxSelect: "1" };
    case "0-99":
      return { minSelect: "0", maxSelect: "99" };
    case "1-99":
      return { minSelect: "1", maxSelect: "99" };
    case "0-1":
      return { minSelect: "0", maxSelect: "1" };
    default:
      return { minSelect: "0", maxSelect: "1" };
  }
}

/** 배달앱형 섹션 카드 */
function BaeminSectionCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm ${className}`}>
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="py-3">{children}</div>
    </div>
  );
}

function StatusToggleRow({
  label,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5 last:border-0">
      <span className="text-[14px] text-gray-800">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onToggle();
        }}
        className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-40 ${
          checked ? "bg-signature" : "bg-gray-200"
        }`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${
            checked ? "left-7" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

function initialValues(defaultDraft: boolean): FormValues {
  return {
    title: "",
    summary: "",
    description_html: "",
    price: "",
    discount_percent: "",
    stock_qty: "0",
    track_inventory: false,
    /** 신규: 매장 노출(고객) 기본 OFF — 메뉴 관리에서 켠 뒤 판매 */
    product_status: defaultDraft ? "draft" : "hidden",
    thumbnail_url: "",
    menu_section_id: "",
    is_featured: false,
    sort_order: "0",
    optionGroups: [],
  };
}

export function OwnerProductForm({
  mode,
  storeId,
  productId,
  defaultDraft = false,
  initialMenuSectionId = "",
}: {
  mode: "new" | "edit";
  storeId: string;
  productId?: string;
  /** 판매 미승인 시 초안으로 시작 */
  defaultDraft?: boolean;
  /** 메뉴 관리에서 탭 선택 후 들어올 때 미리 선택할 매장 카테고리(store_menu_sections id) */
  initialMenuSectionId?: string;
}) {
  const router = useRouter();
  const priceUnit = useMemo(() => getCurrencyUnitLabel(getAppSettings().defaultCurrency), []);
  const [values, setValues] = useState<FormValues>(() => ({
    ...initialValues(defaultDraft),
    menu_section_id: initialMenuSectionId.trim(),
  }));
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuSections, setMenuSections] = useState<
    { id: string; name: string; is_hidden?: boolean }[]
  >([]);
  const [formTab, setFormTab] = useState<"basic" | "options" | "language">("basic");

  const previewCurrency = useMemo(() => getAppSettings().defaultCurrency, []);
  const saleAfterDiscount = useMemo(() => {
    const p = parseInt(values.price.replace(/\D/g, ""), 10) || 0;
    const pct = parseInt(values.discount_percent.replace(/\D/g, ""), 10) || 0;
    if (pct <= 0 || pct > 100 || p <= 0) return null;
    return discountPriceFromPercent(p, pct);
  }, [values.price, values.discount_percent]);

  const refreshMenuSections = useCallback(async () => {
    try {
      const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/menu-sections`, {
        cache: "no-store",
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (j?.ok && Array.isArray(j.sections)) {
        setMenuSections(
          j.sections.map((s: { id: string; name: string; is_hidden?: boolean }) => ({
            id: String(s.id),
            name: String(s.name ?? ""),
            is_hidden: s.is_hidden === true,
          }))
        );
      } else {
        setMenuSections([]);
      }
    } catch {
      setMenuSections([]);
    }
  }, [storeId]);

  useEffect(() => {
    void refreshMenuSections();
  }, [refreshMenuSections]);

  /** 신규 등록: URL로 넘어온 카테고리 id가 목록에 없으면 기타로 정리 */
  useEffect(() => {
    if (mode !== "new") return;
    const sid = values.menu_section_id.trim();
    if (!sid || menuSections.length === 0) return;
    if (menuSections.some((s) => s.id === sid)) return;
    setValues((v) => ({ ...v, menu_section_id: "" }));
  }, [mode, menuSections, values.menu_section_id]);

  const onPickThumbnail = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/me/stores/${storeId}/upload-image`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const json = await res.json();
      if (!json?.ok || !json.url) {
        setError(
          typeof json?.message === "string" && json.message.trim()
            ? json.message
            : json?.error === "storage_bucket_missing"
              ? "Storage 버킷 store-product-images가 없습니다. Supabase에서 버킷을 만들거나 SQL 마이그레이션을 적용해 주세요."
              : (json?.error as string) ?? "이미지 업로드 실패 (버킷 store-product-images 확인)"
        );
        return;
      }
      setValues((v) => ({ ...v, thumbnail_url: json.url as string }));
    } catch {
      setError("network_error");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (mode !== "edit" || !productId) return;
    if (!window.confirm("상품을 삭제(숨김)할까요? 목록에서 사라집니다.")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/me/stores/${storeId}/products/${productId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_status: "deleted" }),
      });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.error ?? "삭제 실패");
        return;
      }
      router.push(`/my/business/menu?storeId=${encodeURIComponent(storeId)}`);
    } catch {
      setError("network_error");
    } finally {
      setDeleting(false);
    }
  };

  const load = useCallback(async () => {
    if (mode !== "edit" || !productId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/me/stores/${storeId}/products/${productId}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!json?.ok || !json.product) {
        setError(json?.error ?? "불러오기 실패");
        return;
      }
      const p = json.product as Record<string, unknown>;
      const priceNum = Math.floor(Number(p.price ?? 0));
      const discPctDb = p.discount_percent;
      let discPctStr = "";
      if (discPctDb != null && Number(discPctDb) > 0) {
        discPctStr = String(Math.floor(Number(discPctDb)));
      } else if (p.discount_price != null && priceNum > 0) {
        const apx = approximateDiscountPercent(priceNum, Math.floor(Number(p.discount_price)));
        if (apx > 0) discPctStr = String(apx);
      }
      setValues({
        title: String(p.title ?? ""),
        summary: String(p.summary ?? ""),
        description_html: String(p.description_html ?? ""),
        price: String(priceNum || ""),
        discount_percent: discPctStr,
        stock_qty: String(p.stock_qty ?? 0),
        track_inventory: p.track_inventory === true,
        product_status: String(p.product_status ?? "active"),
        thumbnail_url: String(p.thumbnail_url ?? ""),
        menu_section_id: p.menu_section_id ? String(p.menu_section_id) : "",
        is_featured: !!p.is_featured,
        sort_order: String(p.sort_order ?? 0),
        optionGroups: optionsJsonToFormGroups(p.options_json ?? []),
      });
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, [mode, productId, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const price = parseInt(values.price.replace(/\D/g, ""), 10) || 0;
    if (!values.title.trim() || price < 0) {
      setError("상품명과 가격을 확인해 주세요.");
      setSaving(false);
      return;
    }
    const pctRaw = values.discount_percent.replace(/\D/g, "");
    const pctParsed = pctRaw === "" ? 0 : parseInt(pctRaw, 10);
    let discount_percent: number | null = null;
    if (Number.isFinite(pctParsed) && pctParsed > 0 && pctParsed <= 100) {
      discount_percent = pctParsed;
    }
    const stock_qty = parseInt(values.stock_qty.replace(/\D/g, ""), 10);
    const stock = Number.isFinite(stock_qty) && stock_qty >= 0 ? stock_qty : 0;

    const so = parseInt(values.sort_order, 10);
    const sort_order = Number.isFinite(so) ? Math.max(0, Math.min(9999, so)) : 0;

    const options_json = formGroupsToOptionsJson(values.optionGroups);

    const payloadCore = {
      title: values.title.trim(),
      summary: values.summary.trim() || undefined,
      description_html: values.description_html.trim() || undefined,
      price,
      discount_percent,
      stock_qty: values.track_inventory ? stock : 0,
      track_inventory: values.track_inventory,
      product_status: values.product_status,
      thumbnail_url: values.thumbnail_url.trim() || null,
      menu_section_id: values.menu_section_id.trim() || null,
      category_id: null,
      item_type: "product" as const,
      is_featured: values.is_featured,
      sort_order,
      options_json,
    };

    try {
      if (mode === "new") {
        const res = await fetch(`/api/me/stores/${storeId}/products`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payloadCore,
            pickup_available: true,
            local_delivery_available: false,
            shipping_available: false,
          }),
        });
        const json = await res.json();
        if (!json?.ok) {
          setError(
            json?.error === "sales_not_approved"
              ? "판매 승인이 필요합니다. 관리자에게 판매 권한 승인을 요청하세요."
              : json?.error === "migration_pending"
                ? "DB 마이그레이션(store_menu_sections)을 적용한 뒤 다시 시도해 주세요."
                : json?.error ?? "등록 실패"
          );
          return;
        }
      } else if (productId) {
        const patch: Record<string, unknown> = { ...payloadCore };
        const res = await fetch(`/api/me/stores/${storeId}/products/${productId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const json = await res.json();
        if (!json?.ok) {
          setError(
            json?.error === "migration_pending"
              ? "DB 마이그레이션(store_menu_sections)을 적용한 뒤 다시 시도해 주세요."
              : json?.error ?? "저장 실패"
          );
          return;
        }
      }
      router.push(`/my/business/menu?storeId=${encodeURIComponent(storeId)}`);
    } catch {
      setError("network_error");
    } finally {
      setSaving(false);
    }
  };

  const menuHubHref = `/my/business/menu?storeId=${encodeURIComponent(storeId)}`;
  const categoriesHref = `/my/business/menu-categories?storeId=${encodeURIComponent(storeId)}`;
  const isHidden = values.product_status === "hidden";
  const isSoldOut = values.product_status === "sold_out";
  const isListed = values.product_status === "active";

  if (loading) {
    return (
      <div className="px-4 py-6">
        <p className="text-[14px] text-gray-500">불러오는 중…</p>
      </div>
    );
  }

  const idTrim = values.menu_section_id.trim();

  return (
    <div className="min-h-screen bg-gray-50 pb-[calc(8.75rem+env(safe-area-inset-bottom,0px))]">
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white shadow-sm">
        <header className="flex items-center px-1 py-2">
          <Link
            href={menuHubHref}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-700"
            aria-label="뒤로"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">
            {mode === "new" ? "메뉴 등록" : "메뉴 수정"}
          </h1>
          <span className="w-11 shrink-0" />
        </header>

        <div
          className="border-t border-gray-100 bg-white px-2 py-2"
          role="tablist"
          aria-label="등록 카테고리"
        >
          <p className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
            카테고리 (메뉴 관리 탭과 동일)
          </p>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              role="tab"
              aria-selected={idTrim === ""}
              onClick={() => setValues((v) => ({ ...v, menu_section_id: "" }))}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium ${
                idTrim === "" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              기타
            </button>
            {menuSections.map((s) => {
              const on = values.menu_section_id === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setValues((v) => ({ ...v, menu_section_id: s.id }))}
                  className={`max-w-[220px] shrink-0 truncate rounded-full px-3 py-1.5 text-[13px] font-medium ${
                    on ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {s.name}
                  {s.is_hidden ? " ·숨김" : ""}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-gray-500">
            저장 후 메뉴 관리에서 이 카테고리 탭으로 묶여 보입니다. 새 카테고리는{" "}
            <Link href={categoriesHref} className="font-medium text-signature underline">
              카테고리
            </Link>
            에서 만듭니다.
          </p>
        </div>

        <nav className="flex border-t border-gray-100 px-2">
          <button
            type="button"
            onClick={() => setFormTab("basic")}
            className={`min-w-0 flex-1 border-b-2 py-2.5 text-[13px] font-medium transition ${
              formTab === "basic" ? "border-signature text-signature" : "border-transparent text-gray-500"
            }`}
          >
            기본정보
          </button>
          <button
            type="button"
            onClick={() => setFormTab("options")}
            className={`min-w-0 flex-1 border-b-2 py-2.5 text-[13px] font-medium transition ${
              formTab === "options" ? "border-signature text-signature" : "border-transparent text-gray-500"
            }`}
          >
            옵션설정
          </button>
          <button
            type="button"
            onClick={() => setFormTab("language")}
            className={`min-w-0 flex-1 border-b-2 py-2.5 text-[13px] font-medium transition ${
              formTab === "language" ? "border-signature text-signature" : "border-transparent text-gray-500"
            }`}
          >
            언어
          </button>
        </nav>
      </div>

      <form
        id="owner-product-form"
        onSubmit={(e) => void handleSubmit(e)}
        className="space-y-[18px] px-4 py-4"
      >
        {error ? (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-800">{error}</div>
        ) : null}

        {formTab === "basic" ? (
          <>
            <BaeminSectionCard title="지금 주문 · 노출">
              <StatusToggleRow
                label="지금 주문 가능"
                checked={isListed}
                disabled={isHidden || isSoldOut}
                onToggle={() =>
                  setValues((v) => ({
                    ...v,
                    product_status: v.product_status === "active" ? "draft" : "active",
                  }))
                }
              />
              <StatusToggleRow
                label="숨김"
                checked={isHidden}
                onToggle={() =>
                  setValues((v) => ({
                    ...v,
                    product_status: v.product_status === "hidden" ? "draft" : "hidden",
                  }))
                }
              />
              <StatusToggleRow
                label="품절"
                checked={isSoldOut}
                onToggle={() =>
                  setValues((v) => ({
                    ...v,
                    product_status: v.product_status === "sold_out" ? "draft" : "sold_out",
                  }))
                }
              />
            </BaeminSectionCard>

            <BaeminSectionCard title="필수정보">
              <div className="space-y-3 px-4">
                <div>
                  <label className="mb-1 block text-[14px] font-medium text-gray-700">상품명</label>
                  <input
                    required
                    value={values.title}
                    onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
                    className={OWNER_STORE_CONTROL_CLASS}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[14px] font-medium text-gray-700">
                    가격 ({priceUnit}) *
                  </label>
                  <input
                    required
                    inputMode="numeric"
                    value={formatPriceInput(values.price)}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, price: e.target.value.replace(/\D/g, "") }))
                    }
                    className={OWNER_STORE_CONTROL_CLASS}
                    placeholder="0"
                  />
                </div>
                <p className="text-[12px] leading-relaxed text-gray-500">
                  <strong className="font-medium text-gray-700">카테고리</strong>는 화면 상단 칩에서만
                  지정합니다. (메뉴 분류·중복 선택 없음)
                </p>
              </div>
            </BaeminSectionCard>

            <BaeminSectionCard title="할인">
              <div className="space-y-3 px-4">
                <div>
                  <label className="mb-1 block text-[14px] font-medium text-gray-700">할인율 (%)</label>
                  <div className="flex items-center gap-2">
                    <input
                      inputMode="numeric"
                      value={values.discount_percent}
                      onChange={(e) =>
                        setValues((v) => ({
                          ...v,
                          discount_percent: e.target.value.replace(/\D/g, "").slice(0, 3),
                        }))
                      }
                      className={`${OWNER_STORE_CONTROL_CLASS} max-w-[120px]`}
                      placeholder="0"
                      maxLength={3}
                    />
                    <span className="text-[15px] font-semibold text-gray-700">%</span>
                  </div>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <p className="text-[12px] text-gray-600">
                    할인 적용가(주문 단가)
                    {saleAfterDiscount != null ? (
                      <span className="ml-2 text-[15px] font-bold text-signature">
                        {formatPrice(saleAfterDiscount, previewCurrency)}
                      </span>
                    ) : (
                      <span className="ml-2 text-[14px] font-medium text-gray-400">—</span>
                    )}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                    판매가 × (100% − 할인율)로 자동 계산되어 저장됩니다. 고객 주문 금액에 반영됩니다.
                  </p>
                </div>
              </div>
            </BaeminSectionCard>

            <BaeminSectionCard title="재고 · 정렬 · 한 줄 설명">
              <div className="space-y-3 px-4">
                <div>
                  <p className="mb-2 text-[13px] font-medium text-gray-800">재고 관리</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setValues((v) => ({ ...v, track_inventory: false }))}
                      className={`min-h-[44px] flex-1 rounded-xl px-2 text-[13px] font-semibold ${
                        !values.track_inventory
                          ? "bg-gray-900 text-white"
                          : "border border-gray-200 bg-white text-gray-700"
                      }`}
                    >
                      재고 확인 안 함
                    </button>
                    <button
                      type="button"
                      onClick={() => setValues((v) => ({ ...v, track_inventory: true }))}
                      className={`min-h-[44px] flex-1 rounded-xl px-2 text-[13px] font-semibold ${
                        values.track_inventory
                          ? "bg-gray-900 text-white"
                          : "border border-gray-200 bg-white text-gray-700"
                      }`}
                    >
                      재고 입력
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                    {values.track_inventory
                      ? "주문 확정 시 재고가 줄고, 0이 되면 자동으로 품절(판매 중지) 처리됩니다."
                      : "재고를 세지 않습니다. 주문해도 수량이 줄지 않으며 자동 품절도 없습니다."}
                  </p>
                </div>
                {values.track_inventory ? (
                  <div>
                    <label className="mb-1 block text-[14px] font-medium text-gray-700">재고 수량</label>
                    <input
                      inputMode="numeric"
                      value={formatPriceInput(values.stock_qty)}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, stock_qty: e.target.value.replace(/\D/g, "") }))
                      }
                      className={OWNER_STORE_CONTROL_CLASS}
                      placeholder="0"
                    />
                  </div>
                ) : null}
                <div>
                  <label className="mb-1 block text-[14px] font-medium text-gray-700">목록 정렬</label>
                  <p className="mb-1 text-[11px] text-gray-500">숫자가 작을수록 위쪽</p>
                  <input
                    inputMode="numeric"
                    value={values.sort_order}
                    onChange={(e) => setValues((v) => ({ ...v, sort_order: e.target.value }))}
                    className={OWNER_STORE_CONTROL_CLASS}
                    placeholder="0"
                  />
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block text-[14px] font-medium text-gray-700">한 줄 설명</label>
                  <input
                    value={values.summary}
                    onChange={(e) => setValues((v) => ({ ...v, summary: e.target.value }))}
                    className={OWNER_STORE_CONTROL_CLASS}
                    placeholder="목록에 보이는 짧은 설명"
                  />
                </div>
              </div>
            </BaeminSectionCard>

            <BaeminSectionCard title="메뉴 이미지">
              <div className="space-y-2 px-4">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="cursor-pointer rounded-full border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-800">
                    {uploading ? "업로드 중…" : "이미지 선택"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={uploading}
                      onChange={(ev) => void onPickThumbnail(ev)}
                    />
                  </label>
                  {values.thumbnail_url ? (
                     
                    <img
                      src={values.thumbnail_url}
                      alt=""
                      className="h-16 w-16 rounded-lg border border-gray-100 object-cover"
                    />
                  ) : null}
                </div>
                <input
                  value={values.thumbnail_url}
                  onChange={(e) => setValues((v) => ({ ...v, thumbnail_url: e.target.value }))}
                  className={`${OWNER_STORE_CONTROL_CLASS} text-[13px]`}
                  placeholder="또는 이미지 URL"
                />
              </div>
            </BaeminSectionCard>

            <BaeminSectionCard title="메뉴 소개">
              <div className="px-4">
                <label className="sr-only">메뉴 소개</label>
                <textarea
                  rows={4}
                  value={values.description_html}
                  onChange={(e) => setValues((v) => ({ ...v, description_html: e.target.value }))}
                  className={OWNER_STORE_CONTROL_CLASS}
                  placeholder="예) 공기밥 2, 라면사리 별도 (HTML 가능)"
                />
              </div>
            </BaeminSectionCard>

            <BaeminSectionCard title="대표 메뉴 (실물 상품)">
              <p className="border-b border-gray-100 px-4 pb-2 text-[12px] leading-relaxed text-gray-500">
                이 화면은 <strong className="font-medium text-gray-700">실물 상품</strong> 기준입니다. 픽업·배달·택배
                여부는 매장 기본 정보·설정에서 다룹니다.
              </p>
              <StatusToggleRow
                label="대표 메뉴로 강조 노출"
                checked={values.is_featured}
                onToggle={() => setValues((v) => ({ ...v, is_featured: !v.is_featured }))}
              />
            </BaeminSectionCard>

            {mode === "edit" && productId ? (
              <button
                type="button"
                disabled={saving || deleting}
                onClick={() => void handleDeleteProduct()}
                className="w-full rounded-xl border border-red-200 bg-red-50 py-3 text-[15px] font-medium text-red-800 disabled:opacity-50"
              >
                {deleting ? "처리 중…" : "메뉴 삭제(목록에서 제거)"}
              </button>
            ) : null}
          </>
        ) : null}

        {formTab === "options" ? (
          <div className="space-y-4">
            <p className="px-1 text-[12px] leading-relaxed text-gray-500">
              옵션 그룹마다 이름·선택 방식(타입)을 정한 뒤 항목을 추가합니다. 그룹 순서는 위에서 아래로
              표시됩니다.
            </p>

            {values.optionGroups.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-white py-10 text-center">
                <p className="text-[14px] text-gray-500">등록된 옵션 그룹이 없습니다.</p>
                <button
                  type="button"
                  onClick={() =>
                    setValues((v) => ({ ...v, optionGroups: [...v.optionGroups, emptyOptionGroup()] }))
                  }
                  className="mt-4 rounded-full border border-gray-300 bg-white px-5 py-2.5 text-[14px] font-semibold text-gray-900"
                >
                  + 옵션그룹추가
                </button>
              </div>
            ) : (
              <ul className="space-y-4">
                {values.optionGroups.map((group, gi) => {
                  const preset = optionGroupPresetKey(group);
                  return (
                    <li
                      key={gi}
                      className="relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                    >
                      <button
                        type="button"
                        aria-label="옵션 그룹 삭제"
                        onClick={() =>
                          setValues((v) => ({
                            ...v,
                            optionGroups: v.optionGroups.filter((_, j) => j !== gi),
                          }))
                        }
                        className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full text-[18px] leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      >
                        ×
                      </button>
                      <div className="space-y-3 p-4 pr-12">
                        <div>
                          <label className="mb-1 block text-[13px] font-medium text-gray-800">
                            옵션 그룹명
                          </label>
                          <input
                            value={group.nameKo}
                            onChange={(e) =>
                              setValues((v) => {
                                const next = [...v.optionGroups];
                                next[gi] = { ...next[gi]!, nameKo: e.target.value };
                                return { ...v, optionGroups: next };
                              })
                            }
                            placeholder="예) 매운맛 정도"
                            className={OWNER_STORE_CONTROL_COMPACT_CLASS}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[13px] font-medium text-gray-800">타입</label>
                          <select
                            value={preset}
                            onChange={(e) => {
                              const v = e.target.value as OptionPresetKey;
                              setValues((prev) => {
                                const next = [...prev.optionGroups];
                                const mm =
                                  v === "custom"
                                    ? { minSelect: next[gi]!.minSelect, maxSelect: next[gi]!.maxSelect }
                                    : presetMinMax(v);
                                next[gi] = { ...next[gi]!, ...mm };
                                return { ...prev, optionGroups: next };
                              });
                            }}
                            className={OWNER_STORE_SELECT_CLASS}
                          >
                            <option value="1-1">단일 선택 (1개 필수)</option>
                            <option value="0-99">복수 (선택 없음~여러 개)</option>
                            <option value="1-99">복수 (1개 이상)</option>
                            <option value="0-1">최대 1개 (선택)</option>
                            <option value="custom">직접 설정 (최소·최대)</option>
                          </select>
                        </div>
                        {preset === "custom" ? (
                          <div className={OWNER_STORE_FORM_GRID_2_CLASS}>
                            <div>
                              <label className="mb-0.5 block text-[11px] text-gray-600">최소 선택</label>
                              <input
                                inputMode="numeric"
                                value={group.minSelect}
                                onChange={(e) =>
                                  setValues((v) => {
                                    const next = [...v.optionGroups];
                                    next[gi] = { ...next[gi]!, minSelect: e.target.value };
                                    return { ...v, optionGroups: next };
                                  })
                                }
                                className={OWNER_STORE_CONTROL_COMPACT_CLASS}
                              />
                            </div>
                            <div>
                              <label className="mb-0.5 block text-[11px] text-gray-600">최대 선택</label>
                              <input
                                inputMode="numeric"
                                value={group.maxSelect}
                                onChange={(e) =>
                                  setValues((v) => {
                                    const next = [...v.optionGroups];
                                    next[gi] = { ...next[gi]!, maxSelect: e.target.value };
                                    return { ...v, optionGroups: next };
                                  })
                                }
                                className={OWNER_STORE_CONTROL_COMPACT_CLASS}
                              />
                            </div>
                          </div>
                        ) : null}
                        <p className="text-[11px] text-gray-500">숫자가 작을수록 위쪽에 붙는 항목부터 보입니다.</p>
                        <div>
                          <label className="mb-1 block text-[13px] font-medium text-gray-800">언어</label>
                          <select disabled className={OWNER_STORE_SELECT_CLASS}>
                            <option>다국어 · 추후 지원</option>
                          </select>
                        </div>
                        <p className="text-[11px] font-medium text-gray-600">선택지 (이름 · 추가 금액)</p>
                        <ul className="space-y-2">
                          {group.options.map((opt, oi) => (
                            <li key={oi} className="flex flex-wrap items-end gap-2">
                              <input
                                value={opt.name}
                                onChange={(e) =>
                                  setValues((v) => {
                                    const next = [...v.optionGroups];
                                    const g = { ...next[gi]! };
                                    const opts = [...g.options];
                                    opts[oi] = { ...opts[oi]!, name: e.target.value };
                                    g.options = opts;
                                    next[gi] = g;
                                    return { ...v, optionGroups: next };
                                  })
                                }
                                placeholder="예: 순한맛, 보통"
                                className="min-w-[120px] flex-1 rounded-none border border-gray-200 bg-white px-2 py-2 text-[14px] text-gray-900"
                              />
                              <div className="flex items-center gap-1">
                                <span className="text-[12px] text-gray-500">+</span>
                                <input
                                  inputMode="numeric"
                                  value={opt.priceDelta}
                                  onChange={(e) =>
                                    setValues((v) => {
                                      const next = [...v.optionGroups];
                                      const g = { ...next[gi]! };
                                      const opts = [...g.options];
                                      opts[oi] = { ...opts[oi]!, priceDelta: e.target.value };
                                      g.options = opts;
                                      next[gi] = g;
                                      return { ...v, optionGroups: next };
                                    })
                                  }
                                  className="w-[4.5rem] rounded-none border border-gray-200 bg-white px-2 py-2 text-[14px] text-gray-900"
                                />
                                <span className="text-[12px] text-gray-500">{priceUnit}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setValues((v) => {
                                    const next = [...v.optionGroups];
                                    const g = { ...next[gi]! };
                                    g.options = g.options.filter((_, j) => j !== oi);
                                    if (g.options.length === 0) g.options = [emptyOptionRow()];
                                    next[gi] = g;
                                    return { ...v, optionGroups: next };
                                  })
                                }
                                className="shrink-0 rounded-full border border-red-100 bg-red-50 px-2.5 py-1 text-[12px] text-red-700"
                              >
                                삭제
                              </button>
                            </li>
                          ))}
                        </ul>
                        <div className="flex justify-center pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              setValues((v) => {
                                const next = [...v.optionGroups];
                                const g = { ...next[gi]! };
                                g.options = [...g.options, emptyOptionRow()];
                                next[gi] = g;
                                return { ...v, optionGroups: next };
                              })
                            }
                            className="rounded-full border border-gray-300 bg-white px-5 py-2 text-[13px] font-semibold text-gray-900"
                          >
                            + 옵션추가
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {values.optionGroups.length > 0 ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() =>
                    setValues((v) => ({ ...v, optionGroups: [...v.optionGroups, emptyOptionGroup()] }))
                  }
                  className="rounded-full border border-gray-300 bg-white px-5 py-2.5 text-[14px] font-semibold text-gray-900"
                >
                  + 옵션그룹추가
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {formTab === "language" ? (
          <BaeminSectionCard title="언어">
            <div className="px-4 py-4 text-center text-[14px] leading-relaxed text-gray-600">
              메뉴 이름·옵션·소개의 다국어 입력은 추후 지원 예정입니다.
            </div>
          </BaeminSectionCard>
        ) : null}
      </form>
      <div
        className={`fixed left-0 right-0 z-30 border-t border-gray-200 bg-white p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] ${BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS}`}
      >
        <button
          type="submit"
          form="owner-product-form"
          disabled={saving || deleting}
          className="w-full rounded-xl bg-signature py-3.5 text-[16px] font-semibold text-white disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}
