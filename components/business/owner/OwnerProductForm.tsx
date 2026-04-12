"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import {
  emptyOptionGroup,
  emptyOptionRow,
  formGroupsToOptionsJson,
  newLocalOptionId,
  optionsJsonToFormGroups,
  ownerOptionsClampInt,
  type OptionGroupForm,
  type OptionRowForm,
} from "@/lib/stores/owner-product-options-json";

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

type OptionPresetKey = "1-1" | "0-99" | "1-99" | "0-1" | "custom";

function optionGroupPresetKey(g: OptionGroupForm): OptionPresetKey {
  if (g.quantityMode) return "custom";
  const min = ownerOptionsClampInt(parseInt(g.minSelect, 10), 0, 99, -1);
  const max = ownerOptionsClampInt(parseInt(g.maxSelect, 10), 0, 99, -1);
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
    <div className={`overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm ${className}`}>
      <div className="border-b border-sam-border-soft px-4 py-3">
        <h2 className="text-[15px] font-semibold text-sam-fg">{title}</h2>
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
    <div className="flex items-center justify-between gap-3 border-b border-sam-border-soft px-4 py-2.5 last:border-0">
      <span className="text-[14px] text-sam-fg">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onToggle();
        }}
        className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-40 ${
          checked ? "bg-signature" : "bg-sam-border-soft"
        }`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-sam-surface shadow transition ${
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
    /** 신규: 매장 노출(고객) 기본 OFF — 상품 목록에서 켠 뒤 판매 */
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
  /** 상품 목록에서 탭 선택 후 들어올 때 미리 선택할 매장 카테고리(store_menu_sections id) */
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
  const categoryStripRef = useRef<HTMLDivElement | null>(null);

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

  /** 신규 등록: URL로 넘어온 카테고리 id가 목록에 없으면 비움 */
  useEffect(() => {
    if (mode !== "new") return;
    const sid = values.menu_section_id.trim();
    if (!sid || menuSections.length === 0) return;
    if (menuSections.some((s) => s.id === sid)) return;
    setValues((v) => ({ ...v, menu_section_id: "" }));
  }, [mode, menuSections, values.menu_section_id]);

  /** 카테고리가 하나뿐이면 신규 등록 시 자동 선택(URL 미지정 시) */
  useEffect(() => {
    if (mode !== "new" || menuSections.length !== 1) return;
    if (initialMenuSectionId.trim()) return;
    setValues((v) => (v.menu_section_id.trim() ? v : { ...v, menu_section_id: menuSections[0]!.id }));
  }, [mode, menuSections, initialMenuSectionId]);

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
      router.push(`/my/business/products?storeId=${encodeURIComponent(storeId)}`);
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
    if (mode === "new" && menuSections.length > 0 && !values.menu_section_id.trim()) {
      const line =
        "상품이 노출될 카테고리를 화면 상단에서 선택해 주세요.";
      setError(line);
      setSaving(false);
      if (typeof window !== "undefined") {
        window.alert(
          `${line}\n\n맨 위「카테고리 (필수)」줄에서 분류 칩을 한 번 눌러 선택한 뒤 다시 저장해 주세요.`
        );
        requestAnimationFrame(() => {
          categoryStripRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
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
      router.push(`/my/business/products?storeId=${encodeURIComponent(storeId)}`);
    } catch {
      setError("network_error");
    } finally {
      setSaving(false);
    }
  };

  const productsHubHref = `/my/business/products?storeId=${encodeURIComponent(storeId)}`;
  const categoriesHref = `/my/business/menu-categories?storeId=${encodeURIComponent(storeId)}`;
  const ordersQuickHref = buildStoreOrdersHref({ storeId });
  const dashboardHref = `/my/business?storeId=${encodeURIComponent(storeId)}`;
  const isHidden = values.product_status === "hidden";
  const isSoldOut = values.product_status === "sold_out";
  const isListed = values.product_status === "active";

  if (loading) {
    return (
      <div className="px-4 py-6">
        <p className="text-[14px] text-sam-muted">불러오는 중…</p>
      </div>
    );
  }

  const idTrim = values.menu_section_id.trim();

  return (
    <div className="bg-sam-app pb-[calc(8.75rem+env(safe-area-inset-bottom,0px))]">
      <div className="sticky top-0 z-20 border-b border-sam-border bg-sam-surface shadow-sm">
        <div
          ref={categoryStripRef}
          className="border-t border-sam-border-soft bg-sam-surface px-2 py-2"
          role="tablist"
          aria-label="등록 카테고리"
        >
          <p className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-sam-meta">
            {menuSections.length > 0 ? "카테고리 (필수 · 상품 목록과 동일)" : "카테고리"}
          </p>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {menuSections.length === 0 || mode === "edit" ? (
              <button
                type="button"
                role="tab"
                aria-selected={idTrim === ""}
                onClick={() => setValues((v) => ({ ...v, menu_section_id: "" }))}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium ${
                  idTrim === "" ? "bg-sam-ink text-white" : "bg-sam-surface-muted text-sam-fg"
                }`}
              >
                기타
              </button>
            ) : null}
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
                    on ? "bg-sam-ink text-white" : "bg-sam-surface-muted text-sam-fg"
                  }`}
                >
                  {s.name}
                  {s.is_hidden ? " ·숨김" : ""}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-sam-muted">
            {menuSections.length > 0 ? (
              <>
                카테고리를 고르지 않으면 저장할 수 없습니다. 새 카테고리는{" "}
                <Link href={categoriesHref} className="font-medium text-signature underline">
                  카테고리 관리
                </Link>
                에서 만듭니다.
              </>
            ) : (
              <>
                카테고리가 없으면 「기타」로 저장됩니다. 탭으로 나누려면{" "}
                <Link href={categoriesHref} className="font-medium text-signature underline">
                  카테고리 관리
                </Link>
                를 이용하세요.
              </>
            )}
          </p>
        </div>

        <nav className="flex border-t border-sam-border-soft px-2">
          <button
            type="button"
            onClick={() => setFormTab("basic")}
            className={`min-w-0 flex-1 border-b-2 py-2.5 text-[13px] font-medium transition ${
              formTab === "basic" ? "border-signature text-signature" : "border-transparent text-sam-muted"
            }`}
          >
            기본정보
          </button>
          <button
            type="button"
            onClick={() => setFormTab("options")}
            className={`min-w-0 flex-1 border-b-2 py-2.5 text-[13px] font-medium transition ${
              formTab === "options" ? "border-signature text-signature" : "border-transparent text-sam-muted"
            }`}
          >
            옵션설정
          </button>
          <button
            type="button"
            onClick={() => setFormTab("language")}
            className={`min-w-0 flex-1 border-b-2 py-2.5 text-[13px] font-medium transition ${
              formTab === "language" ? "border-signature text-signature" : "border-transparent text-sam-muted"
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
          <div className="rounded-ui-rect bg-red-50 px-3 py-2 text-[13px] text-red-800">{error}</div>
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
                  <label className="mb-1 block text-[14px] font-medium text-sam-fg">상품명</label>
                  <input
                    required
                    value={values.title}
                    onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
                    className={OWNER_STORE_CONTROL_CLASS}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[14px] font-medium text-sam-fg">
                    기본 가격 ({priceUnit}) *
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
                <p className="text-[12px] leading-relaxed text-sam-muted">
                  <strong className="font-medium text-sam-fg">카테고리</strong>는 화면 상단 칩에서만
                  지정합니다. (메뉴 분류·중복 선택 없음)
                </p>
              </div>
            </BaeminSectionCard>

            <BaeminSectionCard title="할인">
              <div className="space-y-3 px-4">
                <div>
                  <label className="mb-1 block text-[14px] font-medium text-sam-fg">할인율 (%)</label>
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
                    <span className="text-[15px] font-semibold text-sam-fg">%</span>
                  </div>
                </div>
                <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2">
                  <p className="text-[12px] text-sam-muted">
                    할인 적용가(주문 단가)
                    {saleAfterDiscount != null ? (
                      <span className="ml-2 text-[15px] font-bold text-signature">
                        {formatPrice(saleAfterDiscount, previewCurrency)}
                      </span>
                    ) : (
                      <span className="ml-2 text-[14px] font-medium text-sam-meta">—</span>
                    )}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-sam-muted">
                    판매가 × (100% − 할인율)로 자동 계산되어 저장됩니다. 고객 주문 금액에 반영됩니다.
                  </p>
                </div>
              </div>
            </BaeminSectionCard>

            <BaeminSectionCard title="재고 · 정렬 · 한 줄 설명">
              <div className="space-y-3 px-4">
                <div>
                  <p className="mb-2 text-[13px] font-medium text-sam-fg">재고 관리</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setValues((v) => ({ ...v, track_inventory: false }))}
                      className={`min-h-[44px] flex-1 rounded-ui-rect px-2 text-[13px] font-semibold ${
                        !values.track_inventory
                          ? "bg-sam-ink text-white"
                          : "border border-sam-border bg-sam-surface text-sam-fg"
                      }`}
                    >
                      재고 확인 안 함
                    </button>
                    <button
                      type="button"
                      onClick={() => setValues((v) => ({ ...v, track_inventory: true }))}
                      className={`min-h-[44px] flex-1 rounded-ui-rect px-2 text-[13px] font-semibold ${
                        values.track_inventory
                          ? "bg-sam-ink text-white"
                          : "border border-sam-border bg-sam-surface text-sam-fg"
                      }`}
                    >
                      재고 입력
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-sam-muted">
                    {values.track_inventory
                      ? "주문 확정 시 재고가 줄고, 0이 되면 자동으로 품절(판매 중지) 처리됩니다."
                      : "재고를 세지 않습니다. 주문해도 수량이 줄지 않으며 자동 품절도 없습니다."}
                  </p>
                </div>
                {values.track_inventory ? (
                  <div>
                    <label className="mb-1 block text-[14px] font-medium text-sam-fg">재고 수량</label>
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
                  <label className="mb-1 block text-[14px] font-medium text-sam-fg">목록 정렬</label>
                  <p className="mb-1 text-[11px] text-sam-muted">숫자가 작을수록 위쪽</p>
                  <input
                    inputMode="numeric"
                    value={values.sort_order}
                    onChange={(e) => setValues((v) => ({ ...v, sort_order: e.target.value }))}
                    className={OWNER_STORE_CONTROL_CLASS}
                    placeholder="0"
                  />
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block text-[14px] font-medium text-sam-fg">한 줄 설명</label>
                  <input
                    value={values.summary}
                    onChange={(e) => setValues((v) => ({ ...v, summary: e.target.value }))}
                    className={OWNER_STORE_CONTROL_CLASS}
                    placeholder="목록에 보이는 짧은 설명"
                  />
                </div>
              </div>
            </BaeminSectionCard>

            <BaeminSectionCard title="상품 이미지">
              <div className="space-y-3 px-4">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="cursor-pointer rounded-full border border-sam-border bg-sam-surface px-4 py-2 text-[13px] font-medium text-sam-fg">
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
                    <button
                      type="button"
                      onClick={() => setValues((v) => ({ ...v, thumbnail_url: "" }))}
                      className="rounded-full border border-sam-border bg-sam-surface px-3 py-2 text-[12px] font-medium text-sam-muted hover:bg-sam-app"
                    >
                      이미지 제거
                    </button>
                  ) : null}
                </div>
                {values.thumbnail_url ? (
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="shrink-0 space-y-1">
                      <p className="text-[11px] font-medium text-sam-muted">목록용</p>
                      <img
                        src={values.thumbnail_url}
                        alt=""
                        className="h-16 w-16 rounded-ui-rect border border-sam-border object-cover shadow-sm"
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-[11px] font-medium text-sam-muted">상세용</p>
                      <img
                        src={values.thumbnail_url}
                        alt=""
                        className="max-h-52 w-full max-w-[280px] rounded-ui-rect border border-sam-border object-cover shadow-sm"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-[12px] leading-relaxed text-sam-muted">
                    사진을 올리면 목록용·상세용 크기로 미리보기가 각각 표시됩니다.
                  </p>
                )}
              </div>
            </BaeminSectionCard>

            <BaeminSectionCard title="상품 소개">
              <div className="px-4">
                <label className="sr-only">상품 소개</label>
                <textarea
                  rows={4}
                  value={values.description_html}
                  onChange={(e) => setValues((v) => ({ ...v, description_html: e.target.value }))}
                  className={OWNER_STORE_CONTROL_CLASS}
                  placeholder="예) 공기밥 2, 라면사리 별도 (HTML 가능)"
                />
              </div>
            </BaeminSectionCard>

            <BaeminSectionCard title="대표 상품 (실물)">
              <p className="border-b border-sam-border-soft px-4 pb-2 text-[12px] leading-relaxed text-sam-muted">
                이 화면은 <strong className="font-medium text-sam-fg">실물 상품</strong> 기준입니다. 픽업·배달·택배
                여부는 매장 기본 정보·설정에서 다룹니다.
              </p>
              <StatusToggleRow
                label="대표 상품으로 강조 노출"
                checked={values.is_featured}
                onToggle={() => setValues((v) => ({ ...v, is_featured: !v.is_featured }))}
              />
            </BaeminSectionCard>

            {mode === "edit" && productId ? (
              <button
                type="button"
                disabled={saving || deleting}
                onClick={() => void handleDeleteProduct()}
                className="w-full rounded-ui-rect border border-red-200 bg-red-50 py-3 text-[15px] font-medium text-red-800 disabled:opacity-50"
              >
                {deleting ? "처리 중…" : "상품 삭제(목록에서 제거)"}
              </button>
            ) : null}
          </>
        ) : null}

        {formTab === "options" ? (
          <div className="space-y-4">
            <p className="px-1 text-[12px] leading-relaxed text-sam-muted">
              이 상품만의 옵션(맵기·토핑 등)을 여기서만 만듭니다. 저장하면 이 상품의{" "}
              <code className="rounded bg-sam-surface-muted px-0.5 text-[11px]">options_json</code>에만 반영되며,
              다른 메뉴와 따로 관리됩니다.
            </p>

            {values.optionGroups.length === 0 ? (
              <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface py-10 text-center">
                <p className="text-[13px] text-sam-muted">옵션이 없습니다</p>
                <button
                  type="button"
                  aria-label="옵션 그룹 추가"
                  onClick={() =>
                    setValues((v) => ({ ...v, optionGroups: [...v.optionGroups, emptyOptionGroup()] }))
                  }
                  className="mt-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-sam-border bg-sam-surface text-[22px] font-light leading-none text-sam-fg hover:bg-sam-app"
                >
                  +
                </button>
              </div>
            ) : (
              <ul className="space-y-4">
                {values.optionGroups.map((group, gi) => {
                  const preset = optionGroupPresetKey(group);
                  return (
                    <li
                      key={group.groupLocalId}
                      className="relative overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm"
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
                        className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full text-[18px] leading-none text-sam-meta hover:bg-sam-surface-muted hover:text-sam-fg"
                      >
                        ×
                      </button>
                      <div className="space-y-3 p-4 pr-12">
                        <div>
                          <label className="mb-1 block text-[13px] font-medium text-sam-fg">
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
                          <label className="mb-1 block text-[13px] font-medium text-sam-fg">그룹 설명 (선택)</label>
                          <input
                            value={group.description}
                            onChange={(e) =>
                              setValues((v) => {
                                const next = [...v.optionGroups];
                                next[gi] = { ...next[gi]!, description: e.target.value };
                                return { ...v, optionGroups: next };
                              })
                            }
                            className={OWNER_STORE_CONTROL_COMPACT_CLASS}
                            placeholder="고객에게 보이는 안내"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[13px] font-medium text-sam-fg">노출 순서</label>
                          <input
                            inputMode="numeric"
                            value={group.sortOrder}
                            onChange={(e) =>
                              setValues((v) => {
                                const next = [...v.optionGroups];
                                next[gi] = { ...next[gi]!, sortOrder: e.target.value.replace(/\D/g, "") };
                                return { ...v, optionGroups: next };
                              })
                            }
                            className={`${OWNER_STORE_CONTROL_COMPACT_CLASS} max-w-[100px]`}
                          />
                          <p className="mt-0.5 text-[11px] text-sam-muted">숫자가 작을수록 먼저 표시</p>
                        </div>
                        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-sam-fg">
                          <input
                            type="checkbox"
                            checked={group.quantityMode}
                            onChange={(e) =>
                              setValues((v) => {
                                const next = [...v.optionGroups];
                                const q = e.target.checked;
                                next[gi] = {
                                  ...next[gi]!,
                                  quantityMode: q,
                                  minSelect: q ? "0" : next[gi]!.minSelect,
                                  maxSelect: q ? "3" : next[gi]!.maxSelect,
                                };
                                return { ...v, optionGroups: next };
                              })
                            }
                            className="h-4 w-4 rounded border-sam-border"
                          />
                          수량형(스테퍼) — 공기밥 추가 등 개수 선택
                        </label>
                        <div>
                          <label className="mb-1 block text-[13px] font-medium text-sam-fg">선택 방식</label>
                          <select
                            value={preset}
                            disabled={group.quantityMode}
                            onChange={(e) => {
                              const v = e.target.value as OptionPresetKey;
                              setValues((prev) => {
                                const next = [...prev.optionGroups];
                                const mm =
                                  v === "custom"
                                    ? { minSelect: next[gi]!.minSelect, maxSelect: next[gi]!.maxSelect }
                                    : presetMinMax(v);
                                next[gi] = { ...next[gi]!, ...mm, quantityMode: false };
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
                        {preset === "custom" || group.quantityMode ? (
                          <div className={OWNER_STORE_FORM_GRID_2_CLASS}>
                            <div>
                              <label className="mb-0.5 block text-[11px] text-sam-muted">최소 선택</label>
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
                              <label className="mb-0.5 block text-[11px] text-sam-muted">최대 선택</label>
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
                        <p className="text-[11px] font-medium text-sam-muted">선택지 (이름 · 추가 금액 · 품절·기본선택)</p>
                        <ul className="space-y-2">
                          {group.options.map((opt, oi) => (
                            <li key={opt.id} className="flex flex-col gap-2 rounded-ui-rect border border-sam-border-soft bg-sam-app/80 p-2">
                              <div className="flex flex-wrap items-end gap-2">
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
                                  className="min-w-[120px] flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-2 text-[14px] text-sam-fg"
                                />
                                <div className="flex items-center gap-1">
                                  <span className="text-[12px] text-sam-muted">+</span>
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
                                    className="w-[4.5rem] rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-2 text-[14px] text-sam-fg"
                                  />
                                  <span className="text-[12px] text-sam-muted">{priceUnit}</span>
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
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-[12px] text-sam-fg">
                                <label className="inline-flex items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={opt.soldOut}
                                    onChange={(e) =>
                                      setValues((v) => {
                                        const next = [...v.optionGroups];
                                        const g = { ...next[gi]! };
                                        const opts = [...g.options];
                                        opts[oi] = { ...opts[oi]!, soldOut: e.target.checked };
                                        g.options = opts;
                                        next[gi] = g;
                                        return { ...v, optionGroups: next };
                                      })
                                    }
                                    className="h-4 w-4 rounded border-sam-border"
                                  />
                                  품절
                                </label>
                                <label className="inline-flex items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={opt.defaultSelected}
                                    onChange={(e) =>
                                      setValues((v) => {
                                        const next = [...v.optionGroups];
                                        const g = { ...next[gi]! };
                                        const opts = [...g.options];
                                        opts[oi] = { ...opts[oi]!, defaultSelected: e.target.checked };
                                        g.options = opts;
                                        next[gi] = g;
                                        return { ...v, optionGroups: next };
                                      })
                                    }
                                    className="h-4 w-4 rounded border-sam-border"
                                  />
                                  기본 선택
                                </label>
                              </div>
                            </li>
                          ))}
                        </ul>
                        <div className="flex justify-center pt-2">
                          <button
                            type="button"
                            aria-label="선택지 추가"
                            onClick={() =>
                              setValues((v) => {
                                const next = [...v.optionGroups];
                                const g = { ...next[gi]! };
                                g.options = [...g.options, emptyOptionRow()];
                                next[gi] = g;
                                return { ...v, optionGroups: next };
                              })
                            }
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-sam-border bg-sam-surface text-[20px] font-light leading-none text-sam-fg hover:bg-sam-app"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {values.optionGroups.length > 0 ? (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  aria-label="옵션 그룹 추가"
                  onClick={() =>
                    setValues((v) => ({ ...v, optionGroups: [...v.optionGroups, emptyOptionGroup()] }))
                  }
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-sam-border bg-sam-surface text-[22px] font-light leading-none text-sam-muted hover:border-sam-border hover:bg-sam-app"
                >
                  +
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {formTab === "language" ? (
          <BaeminSectionCard title="언어">
            <div className="px-4 py-4 text-center text-[14px] leading-relaxed text-sam-muted">
              상품명·옵션·소개의 다국어 입력은 추후 지원 예정입니다.
            </div>
          </BaeminSectionCard>
        ) : null}
      </form>
      <div
        className={`fixed left-0 right-0 z-30 border-t border-sam-border bg-sam-surface p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] ${BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS}`}
      >
        <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Link
            href={productsHubHref}
            className="flex items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface py-2.5 text-center text-[13px] font-semibold text-sam-fg"
          >
            메뉴 관리
          </Link>
          <Link
            href={ordersQuickHref}
            className="flex items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface py-2.5 text-center text-[13px] font-semibold text-sam-fg"
          >
            주문
          </Link>
          <Link
            href={categoriesHref}
            className="flex items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface py-2.5 text-center text-[13px] font-semibold text-sam-fg"
          >
            카테고리
          </Link>
          <Link
            href={dashboardHref}
            className="flex items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface py-2.5 text-center text-[13px] font-semibold text-sam-fg"
          >
            대시보드
          </Link>
        </div>
        <button
          type="submit"
          form="owner-product-form"
          disabled={saving || deleting}
          className="w-full rounded-ui-rect bg-signature py-3.5 text-[16px] font-semibold text-white disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}
