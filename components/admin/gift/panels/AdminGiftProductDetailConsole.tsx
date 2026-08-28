"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { GiftSalesDateTimeField } from "@/components/gift-certificate/GiftSalesDateTimeField";
import { dibayAlert, dibayConfirm } from "@/components/ui/dibay-overlay";
import { buildAdminGiftOpsHref } from "@/lib/gift-certificate/admin-gift-ops-tabs";
import {
  ADMIN_GIFT_PRIMARY_BTN_STYLE,
  adminGiftPrimaryBtnClass,
} from "@/lib/gift-certificate/admin-gift-primary-button";
import {
  isGiftDiscountFundingParty,
  isGiftExpiryPolicy,
  normalizeGiftExpiryPolicy,
  type GiftDiscountFundingParty,
  type GiftExpiryPolicy,
} from "@/lib/gift-certificate/gift-certificate-domain-contract";
import { formatMoneyPhp } from "@/lib/utils/format";
import { Sam } from "@/lib/ui/css-vars";

type ProductDetail = {
  id: string;
  gift_scope: "STORE" | "PLATFORM";
  creation_source: string | null;
  store_id: string | null;
  store_name: string;
  owner_label?: string;
  title: string;
  face_value: number;
  purchase_price: number;
  platform_fee_rate: number;
  discount_funding_party?: string;
  platform_funded_units?: number;
  merchant_funded_units?: number;
  transferable: boolean;
  sales_starts_at: string | null;
  sales_ends_at: string | null;
  expiry_policy?: string;
  validity_days?: number | null;
  fixed_valid_until?: string | null;
  mall_visible?: boolean;
  active: boolean;
  archived_at: string | null;
  image_url: string | null;
  issued_count: number;
  max_issuance: number | null;
  created_at: string;
  updated_at: string;
  outstanding_balance: number;
  redeemed_gross: number;
  redemption_by_store?: Array<{ store_id: string; store_name: string; gross: number; fee: number; net: number }>;
  money_locked: boolean;
};

type DetailPayload = {
  product: ProductDetail;
  stats: {
    issued: number;
    active: number;
    giftLocked: number;
    partiallyRedeemed: number;
    fullyRedeemed: number;
    outstanding: number;
    redeemedGross: number;
    pendingGross: number;
    recognizedGross: number;
    platformFee: number;
    merchantNet: number;
  };
  instances: Array<Record<string, unknown>>;
  transfers: Array<Record<string, unknown>>;
  redemptions: Array<Record<string, unknown>>;
  auditEvents: Array<Record<string, unknown>>;
};

type SectionId = "info" | "sales" | "instances" | "activity" | "settlement" | "audit";

const SECTION_IDS: readonly SectionId[] = [
  "info",
  "sales",
  "instances",
  "activity",
  "settlement",
  "audit",
];

function mapPaneToSection(pane: string | undefined): SectionId | null {
  if (!pane) return null;
  const key = pane.trim().toLowerCase();
  if ((SECTION_IDS as readonly string[]).includes(key)) return key as SectionId;
  if (key === "basic") return "info";
  if (key === "pricing") return "sales";
  if (key === "transfers" || key === "redemptions") return "activity";
  if (key === "money") return "settlement";
  return null;
}

function dt(v: string | null | undefined): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return v;
  }
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function productStatus(p: ProductDetail): "ARCHIVED" | "ACTIVE" | "PAUSED" {
  if (p.archived_at) return "ARCHIVED";
  return p.active ? "ACTIVE" : "PAUSED";
}

function creationSourceLabel(
  source: string | null,
  safeT: ReturnType<typeof useI18n>["safeT"]
): string {
  if (!source) {
    return safeT("gift_ops_source_legacy", {
      fallbackKo: "기존 발급 / 기록 없음",
      fallbackEn: "Legacy issuance / no record",
    });
  }
  const map: Record<string, { key: string; ko: string; en: string }> = {
    OWNER_APPLICATION: { key: "gift_ops_source_owner_application", ko: "매장 신청", en: "Owner application" },
    ADMIN_DIRECT_STORE: { key: "gift_ops_source_admin_direct_store", ko: "Admin 직접 (매장)", en: "Admin direct (Store)" },
    ADMIN_DIRECT_PLATFORM: { key: "gift_ops_source_admin_direct_platform", ko: "Admin 직접 (DIBAY)", en: "Admin direct (DIBAY)" },
  };
  const row = map[source];
  if (!row) return source;
  return safeT(row.key as "gift_ops_source_owner_application", { fallbackKo: row.ko, fallbackEn: row.en });
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function productExpiryPolicy(p: ProductDetail): GiftExpiryPolicy {
  return normalizeGiftExpiryPolicy(p.expiry_policy) ?? "NO_EXPIRY";
}

function formatExpiryPolicyDisplay(
  policy: GiftExpiryPolicy,
  validityDays: number | null | undefined,
  fixedUntil: string | null | undefined,
  safeT: ReturnType<typeof useI18n>["safeT"]
): string {
  if (policy === "NO_EXPIRY") {
    return safeT("gift_ops_expiry_no_expiry", {
      fallbackKo: "만료 없음 (NO_EXPIRY)",
      fallbackEn: "No expiry (NO_EXPIRY)",
    });
  }
  if (policy === "FIXED_DAYS") {
    const days = validityDays == null ? "—" : String(validityDays);
    return safeT("gift_ops_expiry_fixed_days_view", {
      fallbackKo: `발급 후 ${days}일 (FIXED_DAYS)`,
      fallbackEn: `${days} days after issue (FIXED_DAYS)`,
    });
  }
  const until = fixedUntil?.trim().slice(0, 10) || "—";
  return safeT("gift_ops_expiry_fixed_date_view", {
    fallbackKo: `고정 만료일 ${until} (FIXED_DATE)`,
    fallbackEn: `Fixed end date ${until} (FIXED_DATE)`,
  });
}

export function AdminGiftProductDetailConsole({
  productId,
  onBack,
  onChanged,
  pane,
}: {
  productId: string;
  onBack: () => void;
  onChanged: () => void;
  pane?: string;
}) {
  const { safeT } = useI18n();
  const [payload, setPayload] = useState<DetailPayload | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [section, setSection] = useState<SectionId>(() => mapPaneToSection(pane) ?? "info");
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editTitle, setEditTitle] = useState("");
  const [editImage, setEditImage] = useState("");
  const [editFace, setEditFace] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editFee, setEditFee] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editTransferable, setEditTransferable] = useState(true);
  const [editMaxIssuance, setEditMaxIssuance] = useState("");
  const [editFundingParty, setEditFundingParty] = useState<GiftDiscountFundingParty>("NONE");
  const [editExpiryPolicy, setEditExpiryPolicy] = useState<GiftExpiryPolicy>("NO_EXPIRY");
  const [editValidityDays, setEditValidityDays] = useState("");
  const [editFixedUntil, setEditFixedUntil] = useState("");
  const editOpenRef = useRef(false);
  editOpenRef.current = editOpen;

  useEffect(() => {
    const mapped = mapPaneToSection(pane);
    if (mapped) setSection(mapped);
  }, [pane]);

  const hydrateEditFromProduct = useCallback((p: ProductDetail) => {
    setEditTitle(p.title);
    setEditImage(p.image_url ?? "");
    setEditFace(String(p.face_value));
    setEditPrice(String(p.purchase_price));
    setEditFee(String(p.platform_fee_rate));
    setEditStart(toLocalInput(p.sales_starts_at));
    setEditEnd(toLocalInput(p.sales_ends_at));
    setEditTransferable(p.transferable !== false);
    setEditMaxIssuance(p.max_issuance == null ? "" : String(p.max_issuance));
    setEditFundingParty(
      isGiftDiscountFundingParty(p.discount_funding_party) ? p.discount_funding_party : "NONE"
    );
    const policy = productExpiryPolicy(p);
    setEditExpiryPolicy(policy);
    setEditValidityDays(p.validity_days == null ? "" : String(p.validity_days));
    setEditFixedUntil(p.fixed_valid_until ? String(p.fixed_valid_until).slice(0, 10) : "");
  }, []);

  const load = useCallback(async (opts?: { background?: boolean }) => {
    if (!opts?.background) setState("loading");
    else setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/gift-certificates/products/${encodeURIComponent(productId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as DetailPayload & { ok?: boolean };
      if (!res.ok || !json.ok || !json.product) {
        if (!opts?.background) {
          setPayload(null);
          setState("error");
        }
        return;
      }
      setPayload(json as DetailPayload);
      if (!editOpenRef.current) hydrateEditFromProduct(json.product);
      setState("ready");
    } catch {
      if (!opts?.background) {
        setPayload(null);
        setState("error");
      }
    } finally {
      setRefreshing(false);
    }
  }, [hydrateEditFromProduct, productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const product = payload?.product;
  const scope = product?.gift_scope === "PLATFORM" ? "PLATFORM" : "STORE";
  const status = product ? productStatus(product) : "PAUSED";

  const fundingUnits = useMemo(() => {
    const faceN = Math.trunc(Number(editFace) || 0);
    const priceN = Math.trunc(Number(editPrice) || 0);
    const gap = Math.max(0, faceN - priceN);
    if (gap <= 0) return { party: "NONE" as GiftDiscountFundingParty, platform: 0, merchant: 0 };
    if (editFundingParty === "PLATFORM") return { party: "PLATFORM" as const, platform: gap, merchant: 0 };
    if (editFundingParty === "MERCHANT") return { party: "MERCHANT" as const, platform: 0, merchant: gap };
    if (editFundingParty === "SHARED") {
      const half = Math.floor(gap / 2);
      return { party: "SHARED" as const, platform: half, merchant: gap - half };
    }
    return { party: "NONE" as const, platform: 0, merchant: 0 };
  }, [editFace, editPrice, editFundingParty]);

  useEffect(() => {
    const faceN = Math.trunc(Number(editFace) || 0);
    const priceN = Math.trunc(Number(editPrice) || 0);
    const gap = Math.max(0, faceN - priceN);
    if (!editOpen) return;
    if (gap <= 0) {
      if (editFundingParty !== "NONE") setEditFundingParty("NONE");
      return;
    }
    if (editFundingParty === "NONE") {
      setEditFundingParty(scope === "PLATFORM" ? "PLATFORM" : "MERCHANT");
    }
  }, [editFace, editPrice, editFundingParty, editOpen, scope]);

  const canonExpiryPolicy = product ? productExpiryPolicy(product) : "NO_EXPIRY";
  const canonValidityDays = product?.validity_days == null ? "" : String(product.validity_days);
  const canonFixedUntil = product?.fixed_valid_until
    ? String(product.fixed_valid_until).slice(0, 10)
    : "";

  const isDirty = useMemo(() => {
    if (!product) return false;
    const startCanon = toLocalInput(product.sales_starts_at);
    const endCanon = toLocalInput(product.sales_ends_at);
    const maxCanon = product.max_issuance == null ? "" : String(product.max_issuance);
    const canonParty = isGiftDiscountFundingParty(product.discount_funding_party)
      ? product.discount_funding_party
      : "NONE";
    return (
      editTitle.trim() !== product.title ||
      (editImage.trim() || "") !== (product.image_url ?? "") ||
      editFace.trim() !== String(product.face_value) ||
      editPrice.trim() !== String(product.purchase_price) ||
      editFee.trim() !== String(product.platform_fee_rate) ||
      editStart !== startCanon ||
      editEnd !== endCanon ||
      editTransferable !== (product.transferable !== false) ||
      editMaxIssuance.trim() !== maxCanon ||
      fundingUnits.party !== canonParty ||
      editExpiryPolicy !== canonExpiryPolicy ||
      editValidityDays.trim() !== canonValidityDays ||
      editFixedUntil.trim() !== canonFixedUntil
    );
  }, [
    product,
    editTitle,
    editImage,
    editFace,
    editPrice,
    editFee,
    editStart,
    editEnd,
    editTransferable,
    editMaxIssuance,
    fundingUnits.party,
    editExpiryPolicy,
    editValidityDays,
    editFixedUntil,
    canonExpiryPolicy,
    canonValidityDays,
    canonFixedUntil,
  ]);

  const editDiffLines = useMemo(() => {
    if (!product || !isDirty) return [] as string[];
    const lines: string[] = [];
    const push = (label: string, from: string, to: string) => {
      if (from !== to) lines.push(`${label}\n${from} → ${to}`);
    };
    push(
      safeT("gift_admin_field_title", { fallbackKo: "상품명", fallbackEn: "Title" }),
      product.title,
      editTitle.trim()
    );
    push(
      safeT("gift_ops_field_image_upload", { fallbackKo: "이미지", fallbackEn: "Image" }),
      product.image_url ?? "—",
      editImage.trim() || "—"
    );
    push(
      safeT("gift_ops_field_face_amount", { fallbackKo: "표시 금액", fallbackEn: "Face value" }),
      formatMoneyPhp(product.face_value),
      formatMoneyPhp(Math.trunc(Number(editFace) || 0))
    );
    push(
      safeT("gift_ops_field_purchase", { fallbackKo: "판매 가격", fallbackEn: "Sale price" }),
      formatMoneyPhp(product.purchase_price),
      formatMoneyPhp(Math.trunc(Number(editPrice) || 0))
    );
    push(
      safeT("gift_ops_field_fee_dibay", { fallbackKo: "수수료", fallbackEn: "Fee" }),
      `${product.platform_fee_rate}%`,
      `${Math.trunc(Number(editFee) || 0)}%`
    );
    push(
      safeT("gift_ops_field_promo_funding", { fallbackKo: "할인 부담", fallbackEn: "Discount funding" }),
      product.discount_funding_party ?? "NONE",
      fundingUnits.party
    );
    push(
      safeT("gift_ops_field_sales_start", { fallbackKo: "판매 시작", fallbackEn: "Sales start" }),
      dt(product.sales_starts_at),
      editStart ? dt(new Date(editStart).toISOString()) : "—"
    );
    push(
      safeT("gift_ops_field_sales_end", { fallbackKo: "판매 종료", fallbackEn: "Sales end" }),
      dt(product.sales_ends_at),
      editEnd ? dt(new Date(editEnd).toISOString()) : "—"
    );
    const maxCanon = product.max_issuance == null ? "" : String(product.max_issuance);
    push(
      safeT("gift_ops_field_max_issuance", { fallbackKo: "발급 제한", fallbackEn: "Max issuance" }),
      maxCanon || "—",
      editMaxIssuance.trim() || "—"
    );
    if (editTransferable !== (product.transferable !== false)) {
      lines.push(
        `${safeT("gift_admin_field_transferable", { fallbackKo: "선물 가능", fallbackEn: "Transferable" })}\n${
          product.transferable ? "Yes" : "No"
        } → ${editTransferable ? "Yes" : "No"}`
      );
    }
    push(
      safeT("gift_ops_field_validity", { fallbackKo: "유효기간", fallbackEn: "Validity" }),
      formatExpiryPolicyDisplay(
        canonExpiryPolicy,
        product.validity_days,
        product.fixed_valid_until,
        safeT
      ),
      formatExpiryPolicyDisplay(
        editExpiryPolicy,
        editValidityDays.trim() ? Math.trunc(Number(editValidityDays)) : null,
        editFixedUntil.trim() || null,
        safeT
      )
    );
    return lines;
  }, [
    product,
    isDirty,
    editTitle,
    editImage,
    editFace,
    editPrice,
    editFee,
    editStart,
    editEnd,
    editMaxIssuance,
    editTransferable,
    fundingUnits.party,
    editExpiryPolicy,
    editValidityDays,
    editFixedUntil,
    canonExpiryPolicy,
    safeT,
  ]);

  const activityItems = useMemo(() => {
    if (!payload) return [] as Array<{ kind: "transfer" | "redemption"; at: string; row: Record<string, unknown> }>;
    const items: Array<{ kind: "transfer" | "redemption"; at: string; row: Record<string, unknown> }> = [];
    for (const t of payload.transfers) {
      items.push({ kind: "transfer", at: String(t.offeredAt || t.createdAt || ""), row: t });
    }
    for (const r of payload.redemptions) {
      items.push({ kind: "redemption", at: String(r.createdAt || r.offeredAt || ""), row: r });
    }
    items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return items;
  }, [payload]);

  const enterEdit = () => {
    if (!product || busy) return;
    hydrateEditFromProduct(product);
    setError(null);
    setEditOpen(true);
  };

  const cancelEdit = () => {
    if (busy) return;
    if (product) hydrateEditFromProduct(product);
    setError(null);
    setEditOpen(false);
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/admin/gift-certificates/upload-image", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = (await res.json()) as { ok?: boolean; url?: string };
      if (!res.ok || !json.ok || !json.url) {
        setError(
          safeT("gift_ops_image_upload_fail", {
            fallbackKo: "이미지 업로드에 실패했습니다.",
            fallbackEn: "Image upload failed.",
          })
        );
        return;
      }
      setEditImage(json.url);
    } finally {
      setUploading(false);
    }
  };

  const labelScope =
    scope === "PLATFORM"
      ? safeT("gift_ops_type_platform", { fallbackKo: "DIBAY 상품권", fallbackEn: "DIBAY Gift" })
      : safeT("gift_ops_type_store", { fallbackKo: "매장 상품권", fallbackEn: "Store Gift" });

  const sections = useMemo(
    () =>
      [
        { id: "info" as const, key: "gift_ops_detail_sec_info", ko: "상품 정보", en: "Product info" },
        { id: "sales" as const, key: "gift_ops_detail_sec_sales", ko: "판매 설정", en: "Sales settings" },
        { id: "instances" as const, key: "gift_ops_detail_sec_instances", ko: "발급 상품권", en: "Issued certificates" },
        { id: "activity" as const, key: "gift_ops_detail_sec_activity", ko: "활동", en: "Activity" },
        { id: "settlement" as const, key: "gift_ops_detail_sec_settlement", ko: "정산", en: "Settlement" },
        { id: "audit" as const, key: "gift_ops_detail_sec_audit", ko: "관리 기록", en: "Audit" },
      ] as const,
    []
  );

  const patchAction = async (action: string) => {
    if (!product || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/gift-certificates/products/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(safeT("gift_admin_action_fail", { fallbackKo: "처리에 실패했습니다.", fallbackEn: "Action failed." }));
        return;
      }
      await load({ background: true });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!product || busy || !isDirty) return;
    const confirmed = await dibayConfirm({
      title: safeT("gift_admin_save_confirm_title", {
        fallbackKo: "변경 내용을 저장할까요?",
        fallbackEn: "Save these changes?",
      }),
      description:
        editDiffLines.join("\n\n") ||
        safeT("gift_admin_edit_confirm_body", {
          fallbackKo: "변경 내용이 저장됩니다.",
          fallbackEn: "Your edits will be saved.",
        }),
      cancelLabel: safeT("gift_admin_edit_confirm_cancel", {
        fallbackKo: "취소",
        fallbackEn: "Cancel",
      }),
      confirmLabel: safeT("gift_admin_save_confirm_ok", {
        fallbackKo: "변경 저장",
        fallbackEn: "Save changes",
      }),
    });
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title: editTitle.trim(),
        imageUrl: editImage.trim() || null,
        transferable: editTransferable,
        salesStartsAt: editStart ? new Date(editStart).toISOString() : undefined,
        salesEndsAt: editEnd ? new Date(editEnd).toISOString() : null,
        faceValue: Math.trunc(Number(editFace)),
        purchasePrice: Math.trunc(Number(editPrice)),
        platformFeeRate: Math.trunc(Number(editFee) || 0),
        discountFundingParty: fundingUnits.party,
        platformFundedUnits: fundingUnits.platform,
        merchantFundedUnits: fundingUnits.merchant,
        maxIssuance: editMaxIssuance.trim() ? Math.trunc(Number(editMaxIssuance)) : null,
        expiryPolicy: editExpiryPolicy,
        validityDays: editExpiryPolicy === "FIXED_DAYS" ? Math.trunc(Number(editValidityDays) || 0) : null,
        fixedValidUntil: editExpiryPolicy === "FIXED_DATE" ? editFixedUntil.trim().slice(0, 10) || null : null,
      };
      const res = await fetch(`/api/admin/gift-certificates/products/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(
          safeT("gift_admin_action_fail", { fallbackKo: "처리에 실패했습니다.", fallbackEn: "Action failed." })
        );
        return;
      }
      await load({ background: true });
      onChanged();
      setEditOpen(false);
      await dibayAlert({
        title: safeT("gift_admin_edit_success_title", {
          fallbackKo: "수정이 완료되었습니다",
          fallbackEn: "Changes saved",
        }),
        confirmLabel: safeT("gift_admin_edit_success_ok", { fallbackKo: "확인", fallbackEn: "OK" }),
      });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!product || busy || product.issued_count > 0) return;
    const ok = await dibayConfirm({
      title: safeT("gift_ops_delete_confirm_title", { fallbackKo: "상품 삭제", fallbackEn: "Delete product" }),
      description: safeT("gift_ops_delete_confirm_body", {
        fallbackKo: "이 상품권 상품을 삭제합니다. 발급된 상품권이 없는 경우에만 삭제할 수 있습니다.",
        fallbackEn: "Delete this gift product. Only allowed when no instances have been issued.",
      }),
      confirmLabel: safeT("gift_ops_cta_delete", { fallbackKo: "삭제", fallbackEn: "Delete" }),
      cancelLabel: safeT("gift_admin_cta_back", { fallbackKo: "취소", fallbackEn: "Cancel" }),
      confirmTone: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/gift-certificates/products/${encodeURIComponent(product.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(
          safeT("gift_ops_delete_forbidden", {
            fallbackKo: "이미 발급 이력이 있어 삭제할 수 없습니다. 판매 중지 또는 보관을 사용하세요.",
            fallbackEn: "Cannot delete: instances exist. Pause or archive instead.",
          })
        );
        return;
      }
      onBack();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handlePause = async () => {
    const ok = await dibayConfirm({
      title: safeT("gift_ops_cta_pause", { fallbackKo: "판매 중지", fallbackEn: "Pause sales" }),
      description: safeT("gift_ops_pause_confirm", {
        fallbackKo: "이 상품권 판매를 중지합니다.",
        fallbackEn: "Pause sales for this gift product.",
      }),
      confirmLabel: safeT("gift_ops_cta_pause", { fallbackKo: "판매 중지", fallbackEn: "Pause" }),
      cancelLabel: safeT("gift_admin_cta_back", { fallbackKo: "취소", fallbackEn: "Cancel" }),
    });
    if (ok) await patchAction("pause");
  };

  const handleArchive = async () => {
    const ok = await dibayConfirm({
      title: safeT("gift_ops_cta_archive", { fallbackKo: "보관", fallbackEn: "Archive" }),
      description: safeT("gift_ops_archive_confirm", {
        fallbackKo: "이 상품권을 보관합니다. 신규 판매는 중지됩니다.",
        fallbackEn: "Archive this product. New sales will stop.",
      }),
      confirmLabel: safeT("gift_ops_cta_archive", { fallbackKo: "보관", fallbackEn: "Archive" }),
      cancelLabel: safeT("gift_admin_cta_back", { fallbackKo: "취소", fallbackEn: "Cancel" }),
    });
    if (ok) await patchAction("archive");
  };

  if (state === "loading" && !payload) {
    return (
      <p className="text-sm text-sam-muted">
        {safeT("gift_ops_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
      </p>
    );
  }

  if (state === "error" || !product || !payload) {
    return (
      <div className="space-y-3">
        <button type="button" className={`${Sam.btn.secondary} min-h-[44px] px-4 text-sm`} onClick={onBack}>
          ← {safeT("gift_admin_cta_back_list", { fallbackKo: "목록", fallbackEn: "List" })}
        </button>
        <p className="text-sm text-red-600">
          {safeT("gift_ops_detail_load_fail", {
            fallbackKo: "상품 상세를 불러오지 못했습니다.",
            fallbackEn: "Couldn’t load product detail.",
          })}
        </p>
        <button type="button" className={Sam.btn.secondary} onClick={() => void load()}>
          {safeT("gift_ops_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
        </button>
      </div>
    );
  }

  const canonStart = toLocalInput(product.sales_starts_at);
  const canonEnd = toLocalInput(product.sales_ends_at);
  const mallVisible = product.mall_visible !== false;
  const viewExpiryPolicy = productExpiryPolicy(product);

  return (
    <section className="space-y-4 pb-24" data-admin-gift-product-detail="1">
      <button type="button" className={`${Sam.btn.secondary} min-h-[44px] px-4 text-sm`} onClick={onBack}>
        ← {safeT("gift_admin_cta_back_list", { fallbackKo: "목록", fallbackEn: "List" })}
      </button>

      {refreshing ? (
        <p className="text-xs text-sam-muted" aria-live="polite">
          {safeT("gift_ops_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
        </p>
      ) : null}

      {product.issued_count > 0 ? (
        <p className="rounded-ui-rect border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          {safeT("gift_ops_edit_issued_note", {
            fallbackKo: "기존 발급 상품권은 변경되지 않습니다. 신규 발급분부터 적용됩니다.",
            fallbackEn: "Existing issued certificates are not changed. Changes apply from new issuances.",
          })}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4 sm:flex-row">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app">
          {(editOpen ? editImage : product.image_url) ? (
            <SamarketThumbnail
              src={(editOpen ? editImage : product.image_url) ?? ""}
              alt=""
              fill
              className="relative h-full w-full"
              imageClassName="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-sam-muted">
              {safeT("gift_ops_preview_no_image", { fallbackKo: "이미지 없음", fallbackEn: "No image" })}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-ui-rect bg-sam-app px-2 py-0.5 text-xs font-semibold">{labelScope}</span>
            <span className="rounded-ui-rect border border-sam-border px-2 py-0.5 text-xs">{status}</span>
            {!mallVisible ? (
              <span className="rounded-ui-rect border border-sam-border px-2 py-0.5 text-xs text-sam-muted">
                {safeT("gift_ops_mall_hidden_badge", { fallbackKo: "몰 숨김", fallbackEn: "Hidden from mall" })}
              </span>
            ) : null}
          </div>
          <h2 className="text-lg font-semibold break-words">{editOpen ? editTitle : product.title}</h2>
          <p className="text-xs text-sam-muted break-all">
            {safeT("gift_ops_product_id", { fallbackKo: "Product ID", fallbackEn: "Product ID" })}: {product.id}
          </p>
          {scope === "STORE" ? (
            <p className="text-sm">
              {safeT("gift_ops_field_store", { fallbackKo: "매장", fallbackEn: "Store" })}: {product.store_name || "—"}
              {product.owner_label ? ` · ${product.owner_label}` : ""}
            </p>
          ) : (
            <p className="text-sm">{safeT("gift_ops_platform_issuer", { fallbackKo: "발행 주체: DIBAY", fallbackEn: "Issuer: DIBAY" })}</p>
          )}

          {!editOpen ? (
            <div className="flex flex-wrap gap-2 pt-1" data-admin-gift-product-actions="1">
              <button
                type="button"
                className={adminGiftPrimaryBtnClass("min-h-[40px] px-3 text-sm")}
                style={ADMIN_GIFT_PRIMARY_BTN_STYLE}
                data-admin-gift-product-edit="1"
                onClick={enterEdit}
              >
                {safeT("gift_ops_cta_edit", { fallbackKo: "수정", fallbackEn: "Edit" })}
              </button>
              {product.active && !product.archived_at ? (
                <button
                  type="button"
                  className={`${Sam.btn.secondary} min-h-[40px] px-3 text-sm`}
                  disabled={busy}
                  onClick={() => void handlePause()}
                >
                  {safeT("gift_ops_cta_pause", { fallbackKo: "판매 중지", fallbackEn: "Pause" })}
                </button>
              ) : null}
              {!product.active && !product.archived_at ? (
                <button
                  type="button"
                  className={adminGiftPrimaryBtnClass("min-h-[40px] px-3 text-sm")}
                  style={ADMIN_GIFT_PRIMARY_BTN_STYLE}
                  disabled={busy}
                  data-admin-gift-product-activate="1"
                  onClick={() => void patchAction("activate")}
                >
                  {safeT("gift_ops_cta_resume", { fallbackKo: "판매 재개", fallbackEn: "Resume" })}
                </button>
              ) : null}
              {mallVisible ? (
                <button
                  type="button"
                  className={`${Sam.btn.secondary} min-h-[40px] px-3 text-sm`}
                  disabled={busy}
                  data-admin-gift-product-hide="1"
                  onClick={() => void patchAction("hide")}
                >
                  {safeT("gift_ops_cta_mall_hide", { fallbackKo: "몰 숨김", fallbackEn: "Hide from mall" })}
                </button>
              ) : (
                <button
                  type="button"
                  className={`${Sam.btn.secondary} min-h-[40px] px-3 text-sm`}
                  disabled={busy}
                  data-admin-gift-product-show="1"
                  onClick={() => void patchAction("show")}
                >
                  {safeT("gift_ops_cta_mall_show", { fallbackKo: "몰 노출", fallbackEn: "Show in mall" })}
                </button>
              )}
              {product.archived_at ? (
                <button
                  type="button"
                  className={adminGiftPrimaryBtnClass("min-h-[40px] px-3 text-sm")}
                  style={ADMIN_GIFT_PRIMARY_BTN_STYLE}
                  disabled={busy}
                  data-admin-gift-product-unarchive="1"
                  onClick={() => void patchAction("unarchive")}
                >
                  {safeT("gift_ops_cta_unarchive", { fallbackKo: "보관 해제", fallbackEn: "Unarchive" })}
                </button>
              ) : (
                <button
                  type="button"
                  className={`${Sam.btn.secondary} min-h-[40px] px-3 text-sm`}
                  disabled={busy}
                  onClick={() => void handleArchive()}
                >
                  {safeT("gift_ops_cta_archive", { fallbackKo: "보관", fallbackEn: "Archive" })}
                </button>
              )}
              {product.issued_count === 0 ? (
                <button
                  type="button"
                  className="min-h-[40px] rounded-ui-rect border border-red-300 px-3 text-sm font-semibold text-red-700"
                  disabled={busy}
                  onClick={() => void confirmDelete()}
                >
                  {safeT("gift_ops_cta_delete", { fallbackKo: "삭제", fallbackEn: "Delete" })}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-admin-gift-product-kpis="1">
        {[
          { label: safeT("gift_ops_kpi_issued", { fallbackKo: "발급 수", fallbackEn: "Issued" }), value: String(payload.stats.issued) },
          { label: safeT("gift_ops_kpi_outstanding", { fallbackKo: "미사용 잔액", fallbackEn: "Outstanding" }), value: formatMoneyPhp(payload.stats.outstanding) },
          { label: safeT("gift_ops_kpi_redeemed_gross", { fallbackKo: "누적 사용", fallbackEn: "Redeemed" }), value: formatMoneyPhp(payload.stats.redeemedGross) },
          { label: safeT("gift_ops_detail_recognized_net", { fallbackKo: "Merchant net", fallbackEn: "Merchant net" }), value: formatMoneyPhp(payload.stats.merchantNet) },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
            <p className="text-xs text-sam-muted">{kpi.label}</p>
            <p className="text-sm font-semibold tabular-nums">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto bg-sam-app/95 py-1 backdrop-blur-sm">
        {sections.map((sec) => (
          <button
            key={sec.id}
            type="button"
            data-admin-gift-product-section={sec.id}
            className={[
              "shrink-0 rounded-ui-rect px-3 py-2 text-xs font-semibold min-h-[40px]",
              section === sec.id ? "bg-sam-fg text-sam-app" : "border border-sam-border bg-sam-surface",
            ].join(" ")}
            onClick={() => setSection(sec.id)}
          >
            {safeT(sec.key, { fallbackKo: sec.ko, fallbackEn: sec.en })}
          </button>
        ))}
      </div>

      {section === "info" ? (
        <div className="space-y-4" data-admin-gift-product-info="1">
          {editOpen ? (
            <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <label className="block space-y-1 text-sm">
                <span>{safeT("gift_admin_field_title", { fallbackKo: "상품명", fallbackEn: "Title" })}</span>
                <input className={Sam.input.base} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                {editTitle.trim() !== product.title ? (
                  <p className="text-xs text-sam-muted">
                    {product.title} → <span className="font-semibold text-sam-fg">{editTitle.trim()}</span>
                  </p>
                ) : null}
              </label>
              <div className="space-y-2 text-sm">
                <span>{safeT("gift_ops_field_image_upload", { fallbackKo: "상품권 이미지", fallbackEn: "Gift image" })}</span>
                {editImage ? (
                  <div className="relative h-20 w-20 overflow-hidden rounded-ui-rect border border-sam-border">
                    <SamarketThumbnail src={editImage} alt="" fill className="relative h-full w-full" imageClassName="object-cover" />
                  </div>
                ) : null}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  className="block w-full text-xs"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadImage(f);
                  }}
                />
                <input className={Sam.input.base} value={editImage} onChange={(e) => setEditImage(e.target.value)} placeholder="URL" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editTransferable} onChange={(e) => setEditTransferable(e.target.checked)} />
                {safeT("gift_admin_field_transferable", { fallbackKo: "선물 가능", fallbackEn: "Transferable" })}
              </label>
              <label className="block space-y-1 text-sm">
                <span>{safeT("gift_ops_field_max_issuance", { fallbackKo: "발급 제한", fallbackEn: "Max issuance" })}</span>
                <input
                  className={Sam.input.base}
                  inputMode="numeric"
                  value={editMaxIssuance}
                  placeholder={safeT("gift_ops_max_issuance_unlimited", { fallbackKo: "제한 없음", fallbackEn: "Unlimited" })}
                  onChange={(e) => setEditMaxIssuance(e.target.value)}
                />
              </label>
              <p className="text-xs text-sam-muted">{creationSourceLabel(product.creation_source, safeT)}</p>
            </div>
          ) : (
            <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm space-y-2">
              <p>{product.title}</p>
              <p>{product.transferable ? safeT("gift_admin_field_transferable", { fallbackKo: "선물 가능", fallbackEn: "Transferable" }) : "—"}</p>
              <p>
                {safeT("gift_ops_field_max_issuance", { fallbackKo: "발급 제한", fallbackEn: "Max issuance" })}:{" "}
                {product.max_issuance ?? safeT("gift_ops_max_issuance_unlimited", { fallbackKo: "제한 없음", fallbackEn: "Unlimited" })}
              </p>
              <p className="text-xs text-sam-muted">{creationSourceLabel(product.creation_source, safeT)}</p>
            </div>
          )}
        </div>
      ) : null}

      {section === "sales" ? (
        <div className="space-y-4" data-admin-gift-product-sales="1">
          {editOpen ? (
            <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <label className="block space-y-1 text-sm">
                <span>{safeT("gift_ops_field_face_amount", { fallbackKo: "표시 금액", fallbackEn: "Face value" })}</span>
                <input className={Sam.input.base} inputMode="numeric" value={editFace} onChange={(e) => setEditFace(e.target.value)} />
              </label>
              <label className="block space-y-1 text-sm">
                <span>{safeT("gift_ops_field_purchase", { fallbackKo: "판매 가격", fallbackEn: "Sale price" })}</span>
                <input className={Sam.input.base} inputMode="numeric" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
              </label>
              <label className="block space-y-1 text-sm">
                <span>{safeT("gift_ops_field_fee_dibay", { fallbackKo: "플랫폼 수수료 %", fallbackEn: "Platform fee %" })}</span>
                <input className={Sam.input.base} inputMode="numeric" value={editFee} onChange={(e) => setEditFee(e.target.value)} />
              </label>
              <GiftSalesDateTimeField
                label={safeT("gift_ops_field_sales_start", { fallbackKo: "판매 시작", fallbackEn: "Sales start" })}
                value={editStart}
                previousValue={canonStart}
                onChange={setEditStart}
                data-testid="edit-start"
              />
              <GiftSalesDateTimeField
                label={safeT("gift_ops_field_sales_end", { fallbackKo: "판매 종료", fallbackEn: "Sales end" })}
                value={editEnd}
                previousValue={canonEnd}
                onChange={setEditEnd}
                data-testid="edit-end"
              />
              <label className="block space-y-1 text-sm">
                <span>{safeT("gift_ops_field_validity", { fallbackKo: "유효기간 정책", fallbackEn: "Expiry policy" })}</span>
                <select
                  className={Sam.input.base}
                  value={editExpiryPolicy}
                  data-admin-gift-product-expiry-policy="1"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (isGiftExpiryPolicy(v)) setEditExpiryPolicy(v);
                  }}
                >
                  <option value="NO_EXPIRY">
                    {safeT("gift_ops_expiry_no_expiry", {
                      fallbackKo: "만료 없음 (NO_EXPIRY)",
                      fallbackEn: "No expiry (NO_EXPIRY)",
                    })}
                  </option>
                  <option value="FIXED_DAYS">
                    {safeT("gift_ops_expiry_fixed_days", {
                      fallbackKo: "발급 후 N일 (FIXED_DAYS)",
                      fallbackEn: "N days after issue (FIXED_DAYS)",
                    })}
                  </option>
                  <option value="FIXED_DATE">
                    {safeT("gift_ops_expiry_fixed_date", {
                      fallbackKo: "고정 만료일 (FIXED_DATE)",
                      fallbackEn: "Fixed end date (FIXED_DATE)",
                    })}
                  </option>
                </select>
              </label>
              {editExpiryPolicy === "FIXED_DAYS" ? (
                <label className="block space-y-1 text-sm">
                  <span>{safeT("gift_ops_field_validity_days", { fallbackKo: "유효 일수", fallbackEn: "Validity days" })}</span>
                  <input
                    className={Sam.input.base}
                    inputMode="numeric"
                    value={editValidityDays}
                    data-admin-gift-product-validity-days="1"
                    onChange={(e) => setEditValidityDays(e.target.value)}
                  />
                </label>
              ) : null}
              {editExpiryPolicy === "FIXED_DATE" ? (
                <label className="block space-y-1 text-sm">
                  <span>{safeT("gift_ops_field_fixed_valid_until", { fallbackKo: "만료일", fallbackEn: "Valid until" })}</span>
                  <input
                    type="date"
                    className={Sam.input.base}
                    value={editFixedUntil}
                    data-admin-gift-product-fixed-until="1"
                    onChange={(e) => setEditFixedUntil(e.target.value)}
                  />
                </label>
              ) : null}
              {Math.max(0, Math.trunc(Number(editFace) || 0) - Math.trunc(Number(editPrice) || 0)) > 0 ? (
                <label className="block space-y-1 text-sm">
                  <span>{safeT("gift_ops_field_promo_funding", { fallbackKo: "할인 부담", fallbackEn: "Discount funding" })}</span>
                  <select
                    className={Sam.input.base}
                    value={editFundingParty}
                    data-admin-gift-product-funding="1"
                    onChange={(e) => {
                      const v = e.target.value;
                      if (isGiftDiscountFundingParty(v) && v !== "NONE") setEditFundingParty(v);
                    }}
                  >
                    <option value="MERCHANT">
                      {safeT("gift_ops_funding_merchant", { fallbackKo: "매장 부담", fallbackEn: "Merchant funded" })}
                    </option>
                    <option value="PLATFORM">
                      {safeT("gift_ops_funding_platform", { fallbackKo: "DIBAY 부담", fallbackEn: "DIBAY funded" })}
                    </option>
                    <option value="SHARED">
                      {safeT("gift_ops_funding_shared", { fallbackKo: "분담 (SHARED)", fallbackEn: "Shared" })}
                    </option>
                  </select>
                  <p className="text-xs text-sam-muted tabular-nums">
                    P {fundingUnits.platform} / M {fundingUnits.merchant}
                  </p>
                </label>
              ) : (
                <p className="text-xs text-sam-muted">
                  {safeT("gift_ops_funding_none", { fallbackKo: "할인 없음 (NONE)", fallbackEn: "No discount (NONE)" })}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm space-y-1">
              <p className="tabular-nums">
                {formatMoneyPhp(product.face_value)} · {formatMoneyPhp(product.purchase_price)} · {product.platform_fee_rate}%
              </p>
              <p>
                {dt(product.sales_starts_at)} → {dt(product.sales_ends_at)}
              </p>
              <p>
                {safeT("gift_ops_field_validity", { fallbackKo: "유효기간", fallbackEn: "Validity" })}:{" "}
                {formatExpiryPolicyDisplay(
                  viewExpiryPolicy,
                  product.validity_days,
                  product.fixed_valid_until,
                  safeT
                )}
              </p>
              {(product.discount_funding_party ?? "NONE") !== "NONE" ? (
                <p className="text-xs text-sam-muted">
                  {safeT("gift_ops_field_promo_funding", { fallbackKo: "할인 부담", fallbackEn: "Discount funding" })}:{" "}
                  {product.discount_funding_party} (P {product.platform_funded_units ?? 0} / M{" "}
                  {product.merchant_funded_units ?? 0})
                </p>
              ) : (
                <p className="text-xs text-sam-muted">
                  {safeT("gift_ops_funding_none", { fallbackKo: "할인 없음 (NONE)", fallbackEn: "No discount (NONE)" })}
                </p>
              )}
            </div>
          )}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {section === "instances" ? (
        <div className="space-y-2" data-admin-gift-product-instances="1">
          {payload.instances.map((row) => (
            <div key={String(row.id)} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-sm">
              <p className="font-semibold">{String(row.publicGiftNumber || row.id)}</p>
              <p className="text-xs text-sam-muted">
                {String(row.status)} · {formatMoneyPhp(Number(row.remainingBalance) || 0)}
              </p>
              <p className="text-xs">{String(row.currentOwnerLabel || shortId(String(row.currentOwnerUserId)))}</p>
              <Link
                href={buildAdminGiftOpsHref({ tab: "instances", extra: { id: String(row.id) } })}
                className="mt-2 inline-block text-xs font-semibold text-sam-brand"
              >
                {safeT("gift_ops_cta_detail", { fallbackKo: "상세", fallbackEn: "Detail" })}
              </Link>
            </div>
          ))}
          {!payload.instances.length ? (
            <p className="text-sm text-sam-muted">
              {safeT("gift_ops_instances_empty", { fallbackKo: "발급된 상품권이 없습니다.", fallbackEn: "No instances yet." })}
            </p>
          ) : null}
        </div>
      ) : null}

      {section === "activity" ? (
        <ul className="space-y-2" data-admin-gift-product-activity="1">
          {activityItems.map((item) =>
            item.kind === "transfer" ? (
              <li
                key={`t-${String(item.row.id)}`}
                className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-sm"
              >
                <p className="text-xs font-semibold text-sam-muted">
                  {safeT("gift_ops_activity_transfer", { fallbackKo: "선물", fallbackEn: "Transfer" })}
                </p>
                <p>
                  {String(item.row.publicGiftNumber)} · {String(item.row.status)}
                </p>
                <p className="text-xs">
                  {String(item.row.senderLabel)} → {String(item.row.recipientLabel)}
                </p>
                <p className="text-xs text-sam-muted">{dt(item.at)}</p>
              </li>
            ) : (
              <li
                key={`r-${String(item.row.id)}`}
                className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-sm"
              >
                <p className="text-xs font-semibold text-sam-muted">
                  {safeT("gift_ops_activity_redemption", { fallbackKo: "사용", fallbackEn: "Redemption" })}
                </p>
                <p className="font-semibold">{String(item.row.publicGiftNumber)}</p>
                <p>
                  {safeT("gift_ops_redeemed_store", { fallbackKo: "사용 매장", fallbackEn: "Redeemed store" })}:{" "}
                  <span className="font-semibold">
                    {String(item.row.redeemedStoreName || item.row.redeemedStoreId || "—")}
                  </span>
                </p>
                <p className="tabular-nums text-xs">
                  {formatMoneyPhp(Number(item.row.usedAmount) || 0)} · {String(item.row.recognitionState)} ·{" "}
                  {String(item.row.orderStatus || "—")}
                </p>
                <p className="text-xs text-sam-muted">{dt(item.at)}</p>
              </li>
            )
          )}
          {!activityItems.length ? (
            <li className="text-sm text-sam-muted">
              {safeT("gift_ops_activity_empty", {
                fallbackKo: "선물·사용 활동이 없습니다.",
                fallbackEn: "No transfer or redemption activity.",
              })}
            </li>
          ) : null}
        </ul>
      ) : null}

      {section === "settlement" ? (
        <div className="space-y-3" data-admin-gift-product-settlement="1">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <p>
              {safeT("gift_ops_money_pending", { fallbackKo: "확정 대기 Gross", fallbackEn: "Pending gross" })}:{" "}
              {formatMoneyPhp(payload.stats.pendingGross)}
            </p>
            <p>
              {safeT("gift_ops_money_recognized", { fallbackKo: "확정 Gross", fallbackEn: "Recognized gross" })}:{" "}
              {formatMoneyPhp(payload.stats.recognizedGross)}
            </p>
            <p>
              {safeT("gift_ops_kpi_recognized_fee", { fallbackKo: "DIBAY 수수료", fallbackEn: "DIBAY fee" })}:{" "}
              {formatMoneyPhp(payload.stats.platformFee)}
            </p>
            <p>
              {safeT("gift_ops_detail_recognized_net", { fallbackKo: "Merchant Net", fallbackEn: "Merchant net" })}:{" "}
              {formatMoneyPhp(payload.stats.merchantNet)}
            </p>
          </div>
          {scope === "PLATFORM" && (product.redemption_by_store?.length ?? 0) > 0 ? (
            <div>
              <p className="mb-2 text-sm font-semibold">
                {safeT("gift_ops_redeem_by_store", { fallbackKo: "매장별 정산", fallbackEn: "By redeemed store" })}
              </p>
              <ul className="space-y-1 text-sm">
                {product.redemption_by_store!.map((row) => (
                  <li key={row.store_id} className="tabular-nums rounded-ui-rect border border-sam-border p-2">
                    {row.store_name || shortId(row.store_id)}: Gross {formatMoneyPhp(row.gross)} · Fee {formatMoneyPhp(row.fee)} · Net{" "}
                    {formatMoneyPhp(row.net)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {section === "audit" ? (
        <ul className="space-y-2" data-admin-gift-product-audit="1">
          {payload.auditEvents.map((ev) => (
            <li key={String(ev.id)} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-sm">
              <p className="font-semibold">{String(ev.eventType)}</p>
              <p className="text-xs text-sam-muted">{dt(String(ev.at))}</p>
              <p className="text-xs">{String(ev.summary || "")}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {editOpen ? (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-sam-border bg-sam-app/95 p-3 backdrop-blur-sm"
          data-admin-gift-product-edit-bar="1"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-2">
            {isDirty ? (
              <p className="text-center text-xs text-sam-muted" data-admin-gift-product-dirty-count="1">
                {safeT("gift_ops_edit_dirty_count", {
                  fallbackKo: `${editDiffLines.length}개 항목 변경됨`,
                  fallbackEn: `${editDiffLines.length} fields changed`,
                })}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                className={`${Sam.btn.secondary} min-h-[48px] flex-1 px-4`}
                disabled={busy}
                data-admin-gift-product-cancel="1"
                onClick={cancelEdit}
              >
                {safeT("gift_admin_edit_confirm_cancel", {
                  fallbackKo: "취소",
                  fallbackEn: "Cancel",
                })}
              </button>
              <button
                type="button"
                className={adminGiftPrimaryBtnClass("min-h-[48px] flex-1")}
                style={ADMIN_GIFT_PRIMARY_BTN_STYLE}
                disabled={busy || !isDirty || uploading}
                data-admin-gift-product-save="1"
                onClick={() => void saveEdit()}
              >
                {safeT("gift_ops_cta_save", { fallbackKo: "저장", fallbackEn: "Save" })}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
