"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  OWNER_STORE_PROFILE_CONTROL_CLASS,
  OWNER_STORE_PROFILE_FIELD_LABEL_CLASS,
  OWNER_STORE_PROFILE_SELECT_CLASS,
} from "@/lib/business/owner-store-stack";
import { getAppSettings } from "@/lib/app-settings";
import {
  formatPrice,
  formatPriceInput,
  getCurrencyUnitLabel,
} from "@/lib/utils/format";
import {
  approximateDiscountPercent,
  discountPriceFromPercent,
} from "@/lib/stores/store-product-pricing";
import {
  formGroupsToOptionsJson,
  optionsJsonToFormGroups,
  type ProductOptionGroup,
} from "@/lib/stores/owner-product-options-json";
import { parseMediaUrlsJson } from "@/lib/stores/parse-media-urls-json";
import { OWNER_PRODUCT_DETAIL_IMAGE_MAX, newOwnerProductImageSlotId } from "@/lib/stores/owner-product-images";
import { validateProductOptionGroups } from "@/lib/stores/owner-product-options-validate";
import {
  readImageFileDimensions,
  uploadStoreOwnerProductImage,
} from "@/lib/stores/upload-store-product-image-client";
import {
  OwnerProductImagesBlock,
  type OwnerProductImageSlot,
} from "@/components/business/owner/OwnerProductImagesBlock";
import { OwnerProductOptionsTab } from "@/components/business/owner/OwnerProductOptionsTab";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OwnerStoreMenuSectionPicker } from "@/components/business/owner/OwnerStoreMenuSectionPicker";
type FormValues = {
  title: string;
  summary: string;
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
  /** 사장님 추천(메뉴판 상단 + 카테고리 동시 노출) */
  is_owner_recommended: boolean;
  /** 대표 메뉴 배지·강조 */
  is_representative: boolean;
  sort_order: string;
  optionGroups: ProductOptionGroup[];
};

function ownerProductFileKey(f: File): string {
  return `${f.name}:${f.size}:${f.lastModified}`;
}

function serializeImageSlotsForSnapshot(rows: OwnerProductImageSlot[]): string {
  return rows
    .map((r) =>
      r.type === "url" && r.url
        ? `u:${r.url.trim()}`
        : r.type === "file" && r.file
          ? `f:${ownerProductFileKey(r.file)}`
          : "x"
    )
    .join("|");
}

function serializeProductFormSnapshot(
  v: FormValues,
  imageSlots: OwnerProductImageSlot[],
  representativeSlotId: string | null
): string {
  return JSON.stringify({
    title: v.title,
    summary: v.summary,
    price: v.price,
    discount_percent: v.discount_percent,
    stock_qty: v.stock_qty,
    track_inventory: v.track_inventory,
    product_status: v.product_status,
    thumbnail_url: v.thumbnail_url,
    image_slots: serializeImageSlotsForSnapshot(imageSlots),
    representative_slot_id: representativeSlotId,
    menu_section_id: v.menu_section_id,
    is_owner_recommended: v.is_owner_recommended,
    is_representative: v.is_representative,
    sort_order: v.sort_order,
    optionGroups: v.optionGroups.map((g) => ({
      i: g.groupLocalId,
      n: g.nameKo,
      d: g.description,
      s: g.sortOrder,
      kind: g.selectionKind,
      req: g.required,
      min: g.minSelect,
      max: g.maxSelect,
      o: g.options.map((o) => ({
        id: o.id,
        n: o.name,
        p: o.priceDelta,
        so: o.soldOut,
        def: o.defaultSelected,
      })),
    })),
  });
}

function StatusToggleBandedRow({
  label,
  checked,
  disabled,
  onToggle,
  band,
  title: ariaTitle,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  band: "a" | "b";
  title?: string;
}) {
  const bandClass =
    band === "a"
      ? "border-sam-border-soft bg-sam-app"
      : "border-signature/20 bg-signature/[0.08]";
  return (
    <div
      className={`flex min-w-0 items-center justify-between gap-3 rounded-ui-rect border px-3 py-2.5 ${bandClass}`}
    >
      <span className="min-w-0 sam-text-body text-sam-fg" title={ariaTitle}>
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaTitle ?? label}
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
    price: "",
    discount_percent: "",
    stock_qty: "0",
    track_inventory: false,
    /** 신규: 매장 노출(고객) 기본 OFF — 상품 목록에서 켠 뒤 판매 */
    product_status: defaultDraft ? "draft" : "hidden",
    thumbnail_url: "",
    menu_section_id: "",
    is_owner_recommended: false,
    is_representative: false,
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [categoryGateModal, setCategoryGateModal] = useState<"no_sections" | "pick_required" | null>(
    null
  );
  const [cancelDirtyConfirmOpen, setCancelDirtyConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baselineSnapshot, setBaselineSnapshot] = useState<string | null>(null);
  const [imageSlots, setImageSlots] = useState<OwnerProductImageSlot[]>([]);
  const [representativeSlotId, setRepresentativeSlotId] = useState<string | null>(null);
  const imageSlotsRef = useRef<OwnerProductImageSlot[]>([]);
  const representativeSlotIdRef = useRef<string | null>(null);
  imageSlotsRef.current = imageSlots;
  representativeSlotIdRef.current = representativeSlotId;
  const [menuSections, setMenuSections] = useState<
    { id: string; name: string; is_hidden?: boolean }[]
  >([]);
  /** `language` 만 본문을 갈아끼움. 기본·옵션은 한 스크롤 폼에서 이어짐 */
  const [formTab, setFormTab] = useState<"basic" | "language">("basic");
  /** 상단 탭 강조: 기본 폼 안에서 스크롤 앵커만 다름 */
  const [detailNav, setDetailNav] = useState<"top" | "options">("top");
  const formBodyScrollRef = useRef<HTMLDivElement | null>(null);
  const optionsSectionRef = useRef<HTMLDivElement | null>(null);
  const categoryStripRef = useRef<HTMLDivElement | null>(null);
  const menuSectionSelectRef = useRef<HTMLButtonElement | null>(null);
  const menuSectionSelectId = useId();
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const scrollBasicTop = useCallback(() => {
    setFormTab("basic");
    setDetailNav("top");
    requestAnimationFrame(() => {
      formBodyScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, []);

  const scrollToOptionsBlock = useCallback(() => {
    setFormTab("basic");
    setDetailNav("options");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const sc = formBodyScrollRef.current;
        const el = optionsSectionRef.current;
        if (!sc || !el) return;
        const nextTop =
          el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
        sc.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
      });
    });
  }, []);

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

  /** 등록·수정: 목록에 없는 menu_section_id면 비움 (삭제된 구역·잘못된 URL 등) */
  useEffect(() => {
    const sid = values.menu_section_id.trim();
    if (!sid || menuSections.length === 0) return;
    if (menuSections.some((s) => s.id === sid)) return;
    setValues((v) => ({ ...v, menu_section_id: "" }));
  }, [menuSections, values.menu_section_id]);

  /** 카테고리가 하나뿐이면 신규 등록 시 자동 선택(URL 미지정 시) */
  useEffect(() => {
    if (mode !== "new" || menuSections.length !== 1) return;
    if (initialMenuSectionId.trim()) return;
    setValues((v) => (v.menu_section_id.trim() ? v : { ...v, menu_section_id: menuSections[0]!.id }));
  }, [mode, menuSections, initialMenuSectionId]);

  /** 신규: 카테고리 목록 갱신 후 한 틱 뒤 기준선 동기화(자동 카테고리 선택 등 반영) */
  useEffect(() => {
    if (mode !== "new") return;
    const t = window.setTimeout(() => {
      setBaselineSnapshot(
        serializeProductFormSnapshot(
          valuesRef.current,
          imageSlotsRef.current,
          representativeSlotIdRef.current
        )
      );
    }, 0);
    return () => window.clearTimeout(t);
  }, [mode, menuSections]);

  const performDeleteProduct = async () => {
    if (mode !== "edit" || !productId) return;
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
      router.push(`/stores/owner/products?storeId=${encodeURIComponent(storeId)}`);
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
      const next: FormValues = {
        title: String(p.title ?? ""),
        summary: String(p.summary ?? ""),
        price: String(priceNum || ""),
        discount_percent: discPctStr,
        stock_qty: String(p.stock_qty ?? 0),
        track_inventory: p.track_inventory === true,
        product_status: String(p.product_status ?? "active"),
        thumbnail_url: "",
        menu_section_id: p.menu_section_id ? String(p.menu_section_id) : "",
        is_owner_recommended:
          typeof p.is_owner_recommended === "boolean"
            ? p.is_owner_recommended
            : !!p.is_featured,
        is_representative: typeof p.is_representative === "boolean" ? p.is_representative : false,
        sort_order: String(p.sort_order ?? 0),
        optionGroups: optionsJsonToFormGroups(p.options_json ?? []),
      };
      const thumb = String(p.thumbnail_url ?? "").trim();
      const extras = parseMediaUrlsJson(p.images_json, OWNER_PRODUCT_DETAIL_IMAGE_MAX);
      const seen = new Set<string>();
      const loadedSlots: OwnerProductImageSlot[] = [];
      if (thumb) {
        seen.add(thumb);
        loadedSlots.push({ id: newOwnerProductImageSlotId(), type: "url", url: thumb });
      }
      for (const u of extras) {
        const t = u.trim();
        if (!t || seen.has(t)) continue;
        seen.add(t);
        loadedSlots.push({ id: newOwnerProductImageSlotId(), type: "url", url: t });
      }
      setImageSlots(loadedSlots);
      setRepresentativeSlotId(null);
      setValues(next);
      setBaselineSnapshot(serializeProductFormSnapshot(next, loadedSlots, null));
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
    if (!values.title.trim()) {
      setError("상품명을 입력해 주세요.");
      setFormTab("basic");
      setSaving(false);
      return;
    }
    if (!values.price.trim()) {
      setError("가격을 입력해 주세요.");
      setFormTab("basic");
      setSaving(false);
      return;
    }
    const price = parseInt(values.price.replace(/\D/g, ""), 10);
    if (!Number.isFinite(price) || price < 0) {
      setError("가격을 올바르게 입력해 주세요.");
      setFormTab("basic");
      setSaving(false);
      return;
    }
    if (menuSections.length === 0) {
      setError("먼저 카테고리 관리에서 메뉴 구역을 추가해 주세요.");
      setCategoryGateModal("no_sections");
      setSaving(false);
      return;
    }
    if (!values.menu_section_id.trim()) {
      setError("저장하려면 카테고리를 선택해 주세요.");
      setCategoryGateModal("pick_required");
      setSaving(false);
      return;
    }
    const optRes = validateProductOptionGroups(values.optionGroups);
    if (!optRes.ok) {
      setError(optRes.message);
      scrollToOptionsBlock();
      setSaving(false);
      return;
    }
    const hasProductImage = imageSlots.some(
      (s) => (s.type === "file" && s.file) || (s.type === "url" && !!s.url?.trim())
    );
    if (!hasProductImage) {
      setError("이미지를 1장 이상 등록해 주세요.");
      setFormTab("basic");
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
      price,
      discount_percent,
      stock_qty: values.track_inventory ? stock : 0,
      track_inventory: values.track_inventory,
      product_status: values.product_status,
      menu_section_id: values.menu_section_id.trim() || null,
      category_id: null,
      item_type: "product" as const,
      is_owner_recommended: values.is_owner_recommended,
      is_representative: values.is_representative,
      sort_order,
      options_json,
    };

    setUploading(true);
    try {
      const resolvedUrls: string[] = [];
      for (const s of imageSlots) {
        if (s.type === "file" && s.file) {
          resolvedUrls.push(await uploadStoreOwnerProductImage(storeId, s.file));
        } else if (s.type === "url" && s.url?.trim()) {
          resolvedUrls.push(s.url.trim());
        } else {
          setError("이미지 정보가 올바르지 않습니다.");
          return;
        }
      }
      let repIdx = 0;
      if (representativeSlotId) {
        const ix = imageSlots.findIndex((s) => s.id === representativeSlotId);
        if (ix >= 0) repIdx = ix;
      }
      const thumbnail_url = resolvedUrls[repIdx] ?? "";
      if (!thumbnail_url) {
        setError("대표 이미지를 확인할 수 없습니다.");
        return;
      }
      const repSlot = imageSlots[repIdx];
      let thumbnail_width: number | undefined;
      let thumbnail_height: number | undefined;
      if (repSlot?.type === "file" && repSlot.file) {
        const dims = await readImageFileDimensions(repSlot.file);
        if (dims) {
          thumbnail_width = dims.width;
          thumbnail_height = dims.height;
        }
      }
      const images_json = imageSlots
        .map((_, i) => i)
        .filter((i) => i !== repIdx)
        .map((i) => resolvedUrls[i]!);
      const dimPayload =
        repSlot?.type === "file" &&
        thumbnail_width != null &&
        thumbnail_height != null
          ? ({ thumbnail_width, thumbnail_height } as const)
          : ({} as { thumbnail_width?: number; thumbnail_height?: number });
      const imagePayload = {
        thumbnail_url,
        images_json,
        ...dimPayload,
      };

      if (mode === "new") {
        const res = await fetch(`/api/me/stores/${storeId}/products`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payloadCore,
            ...imagePayload,
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
                : json?.error === "menu_sections_required"
                  ? "먼저 카테고리 관리에서 메뉴 구역을 추가한 뒤 등록해 주세요."
                  : json?.error === "menu_section_id_required"
                    ? "저장하려면 카테고리를 선택해 주세요."
                    : json?.error === "invalid_menu_section_id"
                      ? "선택한 카테고리가 없거나 매장에 속하지 않습니다. 다시 선택해 주세요."
                      : json?.error === "thumbnail_required"
                        ? "대표 이미지를 등록해 주세요."
                        : json?.error === "detail_image_overlaps_thumbnail" &&
                            typeof json?.message === "string"
                          ? json.message
                          : json?.error === "invalid_options_json" && typeof json?.message === "string"
                            ? json.message
                            : json?.error ?? "등록 실패"
          );
          if (json?.error === "invalid_options_json") scrollToOptionsBlock();
          if (
            json?.error === "menu_sections_required" ||
            json?.error === "menu_section_id_required" ||
            json?.error === "invalid_menu_section_id"
          ) {
            setCategoryGateModal(
              json?.error === "menu_sections_required" ? "no_sections" : "pick_required"
            );
          }
          return;
        }
      } else if (productId) {
        const res = await fetch(`/api/me/stores/${storeId}/products/${productId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payloadCore, ...imagePayload }),
        });
        const json = await res.json();
        if (!json?.ok) {
          setError(
            json?.error === "migration_pending"
              ? "DB 마이그레이션(store_menu_sections)을 적용한 뒤 다시 시도해 주세요."
              : json?.error === "menu_sections_required"
                ? "먼저 카테고리 관리에서 메뉴 구역을 추가한 뒤 저장해 주세요."
                : json?.error === "menu_section_id_required"
                  ? "저장하려면 카테고리를 선택해 주세요."
                  : json?.error === "invalid_menu_section_id"
                    ? "선택한 카테고리가 없거나 매장에 속하지 않습니다. 다시 선택해 주세요."
                    : json?.error === "thumbnail_required"
                      ? "대표 이미지를 등록해 주세요."
                      : json?.error === "detail_image_overlaps_thumbnail" &&
                          typeof json?.message === "string"
                        ? json.message
                        : json?.error === "invalid_options_json" && typeof json?.message === "string"
                          ? json.message
                          : json?.error ?? "저장 실패"
          );
          if (json?.error === "invalid_options_json") scrollToOptionsBlock();
          if (
            json?.error === "menu_sections_required" ||
            json?.error === "menu_section_id_required" ||
            json?.error === "invalid_menu_section_id"
          ) {
            setCategoryGateModal(
              json?.error === "menu_sections_required" ? "no_sections" : "pick_required"
            );
          }
          return;
        }
      }
      router.push(`/stores/owner/products?storeId=${encodeURIComponent(storeId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "network_error");
    } finally {
      setUploading(false);
      setSaving(false);
    }
  };

  const productsHubHref = `/stores/owner/products?storeId=${encodeURIComponent(storeId)}`;
  const categoriesHref = `/stores/owner/menu-categories?storeId=${encodeURIComponent(storeId)}`;
  const isDirty =
    baselineSnapshot != null &&
    serializeProductFormSnapshot(values, imageSlots, representativeSlotId) !== baselineSnapshot;

  const revertToSaved = useCallback(async () => {
    setError(null);
    if (mode === "edit" && productId) {
      await load();
      return;
    }
    const next: FormValues = {
      ...initialValues(defaultDraft),
      menu_section_id: initialMenuSectionId.trim(),
    };
    setValues(next);
    setImageSlots([]);
    setRepresentativeSlotId(null);
    setBaselineSnapshot(serializeProductFormSnapshot(next, [], null));
  }, [mode, productId, defaultDraft, initialMenuSectionId, load]);

  /** 취소: 미저장이면 확인 후 초기화, 없으면 상품 목록으로 나감(일반적인 나가기) */
  const requestCancel = useCallback(() => {
    if (saving || deleting || uploading) return;
    if (isDirty) {
      setCancelDirtyConfirmOpen(true);
      return;
    }
    router.push(productsHubHref);
  }, [deleting, isDirty, productsHubHref, router, saving, uploading]);

  useEffect(() => {
    if (!isDirty) return;
    const fn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [isDirty]);

  const isHidden = values.product_status === "hidden";
  const isSoldOut = values.product_status === "sold_out";
  const isListed = values.product_status === "active";

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-stretch justify-center px-4 py-6">
        <p className="sam-text-body text-sam-muted">불러오는 중…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--biz-app-bg)]">
      <div className="sticky top-0 z-20 shrink-0 border-b border-sam-border bg-sam-surface shadow-sm">
        <div
          ref={categoryStripRef}
          className="border-t border-sam-border-soft bg-sam-surface px-2 py-1.5"
          role="group"
          aria-label="등록 카테고리"
        >
          <label
            htmlFor={menuSectionSelectId}
            className="mb-1 block px-0.5 sam-text-xxs font-medium uppercase tracking-wide text-sam-meta"
          >
            {menuSections.length > 0 ? "카테고리 (필수)" : "카테고리"}
          </label>
          <OwnerStoreMenuSectionPicker
            ref={menuSectionSelectRef}
            id={menuSectionSelectId}
            sections={menuSections}
            value={menuSections.length === 0 ? "" : values.menu_section_id}
            onChange={(sectionId) => setValues((v) => ({ ...v, menu_section_id: sectionId }))}
            triggerClassName={OWNER_STORE_PROFILE_SELECT_CLASS}
            categoriesHref={categoriesHref}
          />
        </div>

        <nav className="flex border-t border-sam-border-soft px-2">
          <button
            type="button"
            onClick={() => void scrollBasicTop()}
            className={`min-w-0 flex-1 border-b-2 py-2 sam-text-body-secondary font-medium transition ${
              formTab === "basic" && detailNav === "top"
                ? "border-signature text-signature"
                : "border-transparent text-sam-muted"
            }`}
          >
            기본정보
          </button>
          <button
            type="button"
            onClick={() => void scrollToOptionsBlock()}
            className={`min-w-0 flex-1 border-b-2 py-2 sam-text-body-secondary font-medium transition ${
              formTab === "basic" && detailNav === "options"
                ? "border-signature text-signature"
                : "border-transparent text-sam-muted"
            }`}
          >
            옵션설정
          </button>
          <button
            type="button"
            onClick={() => {
              setFormTab("language");
            }}
            className={`min-w-0 flex-1 border-b-2 py-2 sam-text-body-secondary font-medium transition ${
              formTab === "language" ? "border-signature text-signature" : "border-transparent text-sam-muted"
            }`}
          >
            언어
          </button>
        </nav>
      </div>

      <div
        ref={formBodyScrollRef}
        className="min-h-0 flex-1 basis-0 overflow-x-hidden overflow-y-auto overscroll-y-contain bg-[var(--biz-app-bg)]"
      >
      <form
        id="owner-product-form"
        onSubmit={(e) => void handleSubmit(e)}
        className="min-w-0 space-y-2 px-0 py-2 pb-0"
      >
        {error ? (
          <div className="rounded-ui-rect bg-red-50 px-2 py-1.5 sam-text-body-secondary text-red-800">
            {error}
          </div>
        ) : null}

        {formTab === "basic" ? (
          <>
            <OwnerStoreAdminDashSection pad="narrow" title="필수 정보">
              <div className="space-y-2">
                <OwnerProductImagesBlock
                  slots={imageSlots}
                  onSlotsChange={setImageSlots}
                  representativeSlotId={representativeSlotId}
                  onRepresentativeChange={setRepresentativeSlotId}
                  disabled={saving || deleting || uploading}
                  onClientError={setError}
                />
                <div>
                  <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>상품명</label>
                  <input
                    required
                    value={values.title}
                    onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
                    className={OWNER_STORE_PROFILE_CONTROL_CLASS}
                  />
                </div>
                <div className="min-w-0">
                  <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>한 줄 설명</label>
                  <input
                    value={values.summary}
                    onChange={(e) => setValues((v) => ({ ...v, summary: e.target.value }))}
                    className={OWNER_STORE_PROFILE_CONTROL_CLASS}
                    placeholder="목록에 보이는 짧은 설명"
                  />
                </div>
                <div>
                  <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>
                    기본 가격 ({priceUnit}) *
                  </label>
                  <input
                    required
                    inputMode="numeric"
                    value={formatPriceInput(values.price)}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, price: e.target.value.replace(/\D/g, "") }))
                    }
                    className={OWNER_STORE_PROFILE_CONTROL_CLASS}
                    placeholder="0"
                  />
                </div>
              </div>
            </OwnerStoreAdminDashSection>

            <OwnerStoreAdminDashSection pad="narrow" title="할인">
              <div className="space-y-2">
                <div>
                  <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>할인율 (%)</label>
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
                      className={`${OWNER_STORE_PROFILE_CONTROL_CLASS} max-w-[120px]`}
                      placeholder="0"
                      maxLength={3}
                    />
                    <span className="sam-text-body font-semibold text-sam-fg">%</span>
                  </div>
                </div>
                <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app px-2 py-1.5">
                  <p className="sam-text-helper text-sam-muted">
                    할인 적용가(주문 단가)
                    {saleAfterDiscount != null ? (
                      <span className="ml-2 sam-text-body font-bold text-signature">
                        {formatPrice(saleAfterDiscount, previewCurrency)}
                      </span>
                    ) : (
                      <span className="ml-2 sam-text-body font-medium text-sam-meta">—</span>
                    )}
                  </p>
                </div>
              </div>
            </OwnerStoreAdminDashSection>

            <OwnerStoreAdminDashSection pad="narrow" title="재고">
              <div className="space-y-2">
                <div>
                  <p className="mb-2 sam-text-body-secondary font-medium text-sam-fg">재고 관리</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setValues((v) => ({ ...v, track_inventory: false }))}
                      className={`min-h-[44px] flex-1 rounded-ui-rect px-2 sam-text-body-secondary font-semibold ${
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
                      className={`min-h-[44px] flex-1 rounded-ui-rect px-2 sam-text-body-secondary font-semibold ${
                        values.track_inventory
                          ? "bg-sam-ink text-white"
                          : "border border-sam-border bg-sam-surface text-sam-fg"
                      }`}
                    >
                      재고 입력
                    </button>
                  </div>
                  {values.track_inventory ? (
                    <p className="mt-2 sam-text-xxs leading-relaxed text-sam-muted">
                      주문 확정 시 재고가 줄고, 0이 되면 자동으로 품절(판매 중지) 처리됩니다.
                    </p>
                  ) : null}
                </div>
                {values.track_inventory ? (
                  <div>
                    <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>재고 수량</label>
                    <input
                      inputMode="numeric"
                      value={formatPriceInput(values.stock_qty)}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, stock_qty: e.target.value.replace(/\D/g, "") }))
                      }
                      className={OWNER_STORE_PROFILE_CONTROL_CLASS}
                      placeholder="0"
                    />
                  </div>
                ) : null}
              </div>
            </OwnerStoreAdminDashSection>

            <div
              ref={optionsSectionRef}
              id="owner-product-options"
              className={
                detailNav === "options"
                  ? "rounded-ui-rect border-[3px] border-[var(--biz-primary)] bg-[var(--biz-primary-soft)] p-1.5 shadow-[0_4px_0_0_rgba(28,141,184,0.14),0_10px_28px_rgba(28,141,184,0.2)] ring-2 ring-[var(--biz-primary)]/45 ring-offset-2 ring-offset-[var(--biz-app-bg)]"
                  : "rounded-ui-rect border-[3px] border-[var(--biz-primary)] bg-[var(--biz-primary-soft)] p-1.5 shadow-[0_4px_0_0_rgba(28,141,184,0.08),0_8px_24px_rgba(15,23,42,0.08)]"
              }
            >
              <OwnerStoreAdminDashSection
                pad="narrow"
                title="옵션 설정"
                surfaceTone="bizSoft"
                className="border-0 shadow-md ring-1 ring-inset ring-[var(--biz-primary)]/30"
              >
                <OwnerProductOptionsTab
                  optionGroups={values.optionGroups}
                  onOptionGroupsChange={(fn) =>
                    setValues((v) => ({ ...v, optionGroups: fn(v.optionGroups) }))
                  }
                  priceUnitLabel={priceUnit}
                />
              </OwnerStoreAdminDashSection>
            </div>

            {mode === "edit" && productId ? (
              <div className="px-2">
                <button
                  type="button"
                  disabled={saving || deleting}
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="w-full rounded-ui-rect border border-red-200 bg-red-50 py-2.5 sam-text-body font-medium text-red-800 disabled:opacity-50"
                >
                  {deleting ? "처리 중…" : "상품 삭제(목록에서 제거)"}
                </button>
              </div>
            ) : null}

            <OwnerStoreAdminDashSection pad="narrow" title="주문·노출·품절·추천·대표">
              <div className="space-y-1.5">
                <div className="grid min-w-0 grid-cols-2 gap-1.5">
                  <StatusToggleBandedRow
                    band="a"
                    label="주문"
                    title="지금 주문 가능"
                    checked={isListed}
                    disabled={isHidden || isSoldOut}
                    onToggle={() =>
                      setValues((v) => ({
                        ...v,
                        product_status: v.product_status === "active" ? "draft" : "active",
                      }))
                    }
                  />
                  <StatusToggleBandedRow
                    band="b"
                    label="노출"
                    title="목록에 노출(숨김 해제)"
                    checked={!isHidden}
                    onToggle={() =>
                      setValues((v) => ({
                        ...v,
                        product_status: v.product_status === "hidden" ? "draft" : "hidden",
                      }))
                    }
                  />
                </div>
                <div className="grid min-w-0 grid-cols-2 gap-1.5">
                  <StatusToggleBandedRow
                    band="a"
                    label="품절"
                    checked={isSoldOut}
                    onToggle={() =>
                      setValues((v) => ({
                        ...v,
                        product_status: v.product_status === "sold_out" ? "draft" : "sold_out",
                      }))
                    }
                  />
                  <StatusToggleBandedRow
                    band="b"
                    label="사장님 추천"
                    title="메뉴판 상단 추천과 카테고리 목록에 함께 표시"
                    checked={values.is_owner_recommended}
                    onToggle={() =>
                      setValues((v) => ({ ...v, is_owner_recommended: !v.is_owner_recommended }))
                    }
                  />
                </div>
                <StatusToggleBandedRow
                  band="b"
                  label="대표 메뉴"
                  title="상품 상세 등에서 대표 배지로 표시"
                  checked={values.is_representative}
                  onToggle={() =>
                    setValues((v) => ({ ...v, is_representative: !v.is_representative }))
                  }
                />
                <p className="sam-text-caption leading-relaxed text-sam-muted">
                  인기 메뉴 순위는 최근 주문 집계로 자동 반영되며, 여기서는 켜거나 끌 수 없습니다.
                </p>
              </div>
            </OwnerStoreAdminDashSection>
          </>
        ) : null}

        {formTab === "language" ? (
          <OwnerStoreAdminDashSection pad="narrow" title="언어">
            <div className="py-2 text-center sam-text-body leading-relaxed text-sam-muted">
              상품명·옵션·한 줄 설명의 다국어 입력은 추후 지원 예정입니다.
            </div>
          </OwnerStoreAdminDashSection>
        ) : null}

        <OwnerStoreAdminDashSection pad="narrow">
          <div
            className="grid grid-cols-2 gap-2 pb-[max(0px,env(safe-area-inset-bottom,0px))]"
            role="group"
            aria-label="취소 및 저장"
          >
            <button
              type="button"
              onClick={() => void requestCancel()}
              disabled={saving || deleting || uploading}
              className="min-h-[48px] rounded-ui-rect border border-sam-border bg-sam-surface px-2 sam-text-body font-semibold text-signature disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!isDirty || saving || deleting || uploading}
              className="min-h-[48px] rounded-ui-rect border border-transparent bg-signature px-2 sam-text-body font-semibold text-white disabled:opacity-50"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </OwnerStoreAdminDashSection>
      </form>
      </div>

      <OwnerStoreAdminConfirmModal
        open={cancelDirtyConfirmOpen}
        titleId="owner-product-cancel-dirty-title"
        title="작성 내용을 취소할까요?"
        description={
          "이 화면에서 바꾼 내용이 아직 저장되지 않았습니다.\n" +
          "작성 내용을 지우면 마지막으로 저장된 상태로 되돌아가며, 신규 등록이면 빈 양식으로 초기화됩니다."
        }
        cancelLabel="계속 작성"
        confirmLabel="작성 내용 지우기"
        confirmTone="danger"
        onCancel={() => setCancelDirtyConfirmOpen(false)}
        onConfirm={async () => {
          setCancelDirtyConfirmOpen(false);
          await revertToSaved();
        }}
      />
      <OwnerStoreAdminConfirmModal
        open={deleteConfirmOpen}
        titleId="owner-product-delete-title"
        title="삭제 확인"
        description="삭제하시겠습니까??\n\n상품이 목록에서 사라집니다."
        cancelLabel="취소"
        confirmLabel="삭제"
        confirmBusyLabel="처리 중…"
        busy={deleting}
        disableActions={deleting || saving}
        confirmTone="danger"
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={async () => {
          setDeleteConfirmOpen(false);
          await performDeleteProduct();
        }}
      />
      <OwnerStoreAdminConfirmModal
        open={categoryGateModal === "no_sections"}
        titleId="owner-product-category-no-sections-title"
        title="카테고리가 필요합니다"
        description={
          "상품을 등록·저장하려면 먼저 카테고리 관리에서 메뉴 구역을 한 개 이상 만든 뒤,\n" +
          "이 화면 상단에서 선택해야 합니다."
        }
        cancelLabel="닫기"
        confirmLabel="카테고리 관리"
        confirmTone="primary"
        onCancel={() => setCategoryGateModal(null)}
        onConfirm={async () => {
          setCategoryGateModal(null);
          router.push(categoriesHref);
        }}
      />
      <OwnerStoreAdminConfirmModal
        open={categoryGateModal === "pick_required"}
        titleId="owner-product-category-pick-required-title"
        title="카테고리를 선택해 주세요"
        description={
          "저장하려면 화면 상단의 카테고리(메뉴 구역) 드롭다운에서\n" +
          "노출할 구역을 선택한 뒤 다시 저장해 주세요."
        }
        cancelLabel="닫기"
        confirmLabel="카테고리로 이동"
        confirmTone="primary"
        onCancel={() => setCategoryGateModal(null)}
        onConfirm={async () => {
          setCategoryGateModal(null);
          requestAnimationFrame(() => {
            categoryStripRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            menuSectionSelectRef.current?.focus();
          });
        }}
      />
    </div>
  );
}
