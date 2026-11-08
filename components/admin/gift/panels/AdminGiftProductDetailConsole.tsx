"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminPhp } from "@/lib/admin/ui-standard/admin-format";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { GiftSalesDateTimeField } from "@/components/gift-certificate/GiftSalesDateTimeField";
import { GiftVisualCard } from "@/components/gift-certificate/GiftVisualCard";
import { formatGiftProductExpirationDisplay } from "@/lib/gift-certificate/format-gift-certificate-expiration";
import { dibayAlert } from "@/components/ui/dibay-overlay";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { buildAdminGiftOpsHref } from "@/lib/gift-certificate/admin-gift-ops-tabs";
import {
  isGiftDiscountFundingParty,
  isGiftExpiryPolicy,
  normalizeGiftExpiryPolicy,
  type GiftDiscountFundingParty,
  type GiftExpiryPolicy,
} from "@/lib/gift-certificate/gift-certificate-domain-contract";
import { Sam } from "@/lib/ui/css-vars";
import { isAdminConflictErrorCode } from "@/lib/admin/concurrency/admin-expected-updated-at";
import { adminConflictReloadedMessage } from "@/lib/admin/operator-ux/operator-labels";
import { formatAdminShortIdEllipsis } from "@/components/admin/ui/AdminTechId";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";

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
    return formatAdminManilaDateTime(v);
  } catch {
    return v;
  }
}

function shortId(id: string): string {
  return id.length > 10 ? formatAdminShortIdEllipsis(id) : id;
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
    return safeT("gift_ops_source_legacy");
  }
  /** 문구는 카탈로그 키만 (언어 SSOT S6 — 코드 안 사본 삭제) */
  const map: Record<string, { key: "gift_ops_source_owner_application" | "gift_ops_source_admin_direct_store" | "gift_ops_source_admin_direct_platform" }> = {
    OWNER_APPLICATION: { key: "gift_ops_source_owner_application" },
    ADMIN_DIRECT_STORE: { key: "gift_ops_source_admin_direct_store" },
    ADMIN_DIRECT_PLATFORM: { key: "gift_ops_source_admin_direct_platform" },
  };
  const row = map[source];
  if (!row) return source;
  return safeT(row.key);
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
    return safeT("gift_ops_expiry_no_expiry");
  }
  if (policy === "FIXED_DAYS") {
    const days = validityDays == null ? "—" : String(validityDays);
    return safeT("gift_ops_expiry_fixed_days_view");
  }
  const until = fixedUntil?.trim().slice(0, 10) || "—";
  return safeT("gift_ops_expiry_fixed_date_view");
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
  const { safeT, language } = useI18n();
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

  const load = useCallback(async (opts?: { background?: boolean; rehydrateEdit?: boolean }) => {
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
      if (!editOpenRef.current || opts?.rehydrateEdit) hydrateEditFromProduct(json.product);
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
      safeT("gift_admin_field_title"),
      product.title,
      editTitle.trim()
    );
    push(
      safeT("gift_ops_field_image_upload"),
      product.image_url ?? "—",
      editImage.trim() || "—"
    );
    push(
      safeT("gift_ops_field_face_amount"),
      formatAdminPhp(product.face_value),
      formatAdminPhp(Math.trunc(Number(editFace) || 0))
    );
    push(
      safeT("gift_ops_field_purchase"),
      formatAdminPhp(product.purchase_price),
      formatAdminPhp(Math.trunc(Number(editPrice) || 0))
    );
    push(
      safeT("gift_ops_field_fee_dibay"),
      `${product.platform_fee_rate}%`,
      `${Math.trunc(Number(editFee) || 0)}%`
    );
    push(
      safeT("gift_ops_field_promo_funding"),
      product.discount_funding_party ?? "NONE",
      fundingUnits.party
    );
    push(
      safeT("gift_ops_field_sales_start"),
      dt(product.sales_starts_at),
      editStart ? dt(new Date(editStart).toISOString()) : "—"
    );
    push(
      safeT("gift_ops_field_sales_end"),
      dt(product.sales_ends_at),
      editEnd ? dt(new Date(editEnd).toISOString()) : "—"
    );
    const maxCanon = product.max_issuance == null ? "" : String(product.max_issuance);
    push(
      safeT("gift_ops_field_max_issuance"),
      maxCanon || "—",
      editMaxIssuance.trim() || "—"
    );
    if (editTransferable !== (product.transferable !== false)) {
      lines.push(
        `${safeT("gift_admin_field_transferable")}\n${
          product.transferable ? "Yes" : "No"
        } → ${editTransferable ? "Yes" : "No"}`
      );
    }
    push(
      safeT("gift_ops_field_validity"),
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
          safeT("gift_ops_image_upload_fail")
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
      ? safeT("gift_ops_type_platform")
      : safeT("gift_ops_type_store");

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

  /** 409 stale_updated_at — 다른 관리자가 먼저 수정: 최신 상품을 다시 불러와 수정 폼도 최신 값으로 맞춘다. */
  const handleConflict = async (code: string | undefined): Promise<boolean> => {
    if (!isAdminConflictErrorCode(code) && code !== "expected_updated_at_required") return false;
    await load({ background: true, rehydrateEdit: true });
    onChanged();
    setError(adminConflictReloadedMessage(code, language !== "en"));
    return true;
  };

  const patchAction = async (action: string) => {
    if (!product || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/gift-certificates/products/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, expected_updated_at: product.updated_at }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        if (await handleConflict(json.error)) return;
        setError(safeT("gift_admin_action_fail"));
        return;
      }
      await load({ background: true });
      onChanged();
    } catch {
      setError(safeT("gift_admin_action_fail"));
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!product || busy || !isDirty) return;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko: language !== "en",
      title: safeT("gift_admin_save_confirm_title"),
      description:
        editDiffLines.join("\n\n") ||
        safeT("gift_admin_edit_confirm_body"),
      confirmLabel: safeT("gift_admin_save_confirm_ok"),
    });
    if (!confirmed.ok) return;

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
        body: JSON.stringify({ ...body, expected_updated_at: product.updated_at }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        if (await handleConflict(json.error)) return;
        setError(
          safeT("gift_admin_action_fail")
        );
        return;
      }
      await load({ background: true });
      onChanged();
      setEditOpen(false);
      await dibayAlert({
        title: safeT("gift_admin_edit_success_title"),
        confirmLabel: adminCta("close", language !== "en"),
      });
    } catch {
      setError(safeT("gift_admin_action_fail"));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!product || busy || product.issued_count > 0) return;
    const ok = await confirmAdminAction({
      level: adminActionLevel("delete"),
      ko: language !== "en",
      retypeValue: product.title,
      title: safeT("gift_ops_delete_confirm_title"),
      description: safeT("gift_ops_delete_confirm_body"),
      confirmLabel: safeT("gift_ops_cta_delete"),
      destructive: true,
    });
    if (!ok.ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/gift-certificates/products/${encodeURIComponent(product.id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: ok.reason }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        /** 발급 이력 409 만 전용 문구 — 권한·서버 오류를 「발급 이력」으로 오안내하지 않는다. */
        setError(
          json.error === "delete_forbidden_has_instances"
            ? safeT("gift_ops_delete_forbidden")
            : safeT("gift_admin_action_fail")
        );
        return;
      }
      onBack();
      onChanged();
    } catch {
      setError(safeT("gift_admin_action_fail"));
    } finally {
      setBusy(false);
    }
  };

  const handlePause = async () => {
    const ok = await confirmAdminAction({
      level: adminActionLevel("exposeStop"),
      ko: language !== "en",
      title: safeT("gift_ops_cta_pause"),
      description: safeT("gift_ops_pause_confirm"),
      confirmLabel: safeT("gift_ops_cta_pause"),
    });
    if (ok.ok) await patchAction("pause");
  };

  const handleArchive = async () => {
    const ok = await confirmAdminAction({
      level: adminActionLevel("disable"),
      ko: language !== "en",
      title: safeT("gift_ops_cta_archive"),
      description: safeT("gift_ops_archive_confirm"),
      confirmLabel: safeT("gift_ops_cta_archive"),
    });
    if (ok.ok) await patchAction("archive");
  };

  if (state === "loading" && !payload) {
    return (
      <p className="text-sm text-sam-muted">
        {safeT("gift_ops_loading")}
      </p>
    );
  }

  if (state === "error" || !product || !payload) {
    return (
      <div className="space-y-3">
        <AdminActionButton type="button" variant="secondary" onClick={onBack}>
          ← {safeT("gift_admin_cta_back_list")}
        </AdminActionButton>
        <p className="text-sm text-sam-danger">
          {safeT("gift_ops_detail_load_fail")}
        </p>
        <AdminActionButton type="button" variant="secondary" onClick={() => void load()}>
          {adminCta("refresh", language !== "en")}
        </AdminActionButton>
      </div>
    );
  }

  const canonStart = toLocalInput(product.sales_starts_at);
  const canonEnd = toLocalInput(product.sales_ends_at);
  const mallVisible = product.mall_visible !== false;
  const viewExpiryPolicy = productExpiryPolicy(product);

  return (
    <section className="space-y-4 pb-24" data-admin-gift-product-detail="1">
      <AdminActionButton type="button" variant="secondary" onClick={onBack}>
        ← {safeT("gift_admin_cta_back_list")}
      </AdminActionButton>

      {refreshing ? (
        <p className="text-xs text-sam-muted" aria-live="polite">
          {safeT("gift_ops_loading")}
        </p>
      ) : null}

      {product.issued_count > 0 ? (
        <p className="rounded-ui-rect border border-sam-warning/60 bg-sam-warning-soft px-3 py-2 text-xs text-sam-warning">
          {safeT("gift_ops_edit_issued_note")}
        </p>
      ) : null}

      <div
        className="flex flex-col gap-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4"
        data-admin-gift-live-preview="1"
      >
        <GiftVisualCard
          visual={{
            giftScope: scope,
            imageUrl: editOpen ? editImage || null : product.image_url,
            storeName: scope === "PLATFORM" ? "DIBAY" : product.store_name,
            title: editOpen ? editTitle : product.title,
          }}
          surface="admin_preview"
          size="md"
          title={editOpen ? editTitle : product.title}
          issuerName={scope === "PLATFORM" ? "DIBAY" : product.store_name}
          faceValue={
            editOpen ? Math.trunc(Number(editFace)) || product.face_value : product.face_value
          }
          purchasePrice={
            editOpen
              ? Math.trunc(Number(editPrice)) || product.purchase_price
              : product.purchase_price
          }
          expirationDisplay={formatGiftProductExpirationDisplay({
            expiryPolicy: editOpen ? editExpiryPolicy : productExpiryPolicy(product),
            validityDays: editOpen
              ? editValidityDays.trim()
                ? Math.trunc(Number(editValidityDays))
                : null
              : product.validity_days ?? null,
            fixedValidUntil: editOpen
              ? editFixedUntil.trim() || null
              : product.fixed_valid_until ?? null,
            noExpiryLabel: safeT("gift_portrait_expiry_none"),
            daysAfterIssueLabel: (days) =>
              safeT("gift_portrait_expiry_days_after_issue", { vars: { days: String(days) } }),
          })}
          showValidity
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-ui-rect bg-sam-app px-2 py-0.5 text-xs font-semibold">{labelScope}</span>
            <span className="rounded-ui-rect border border-sam-border px-2 py-0.5 text-xs">{status}</span>
            {!mallVisible ? (
              <span className="rounded-ui-rect border border-sam-border px-2 py-0.5 text-xs text-sam-muted">
                {safeT("gift_ops_mall_hidden_badge")}
              </span>
            ) : null}
          </div>
          <h2 className="text-[16px] font-semibold break-words">{editOpen ? editTitle : product.title}</h2>
          <p className="text-xs text-sam-muted break-all">
            {safeT("gift_ops_product_id")}: {product.id}
          </p>
          {scope === "STORE" ? (
            <p className="text-sm">
              {safeT("gift_ops_field_store")}: {product.store_name || "—"}
              {product.owner_label ? ` · ${product.owner_label}` : ""}
            </p>
          ) : (
            <p className="text-sm">{safeT("gift_ops_platform_issuer")}</p>
          )}

          {!editOpen ? (
            <div className="flex flex-wrap gap-2 pt-1" data-admin-gift-product-actions="1">
              <AdminActionButton
                type="button"
                variant="primary"
                data-admin-gift-product-edit="1"
                onClick={enterEdit}
              >
                {safeT("gift_ops_cta_edit")}
              </AdminActionButton>
              {product.active && !product.archived_at ? (
                <AdminActionButton
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void handlePause()}
                >
                  {safeT("gift_ops_cta_pause")}
                </AdminActionButton>
              ) : null}
              {!product.active && !product.archived_at ? (
                <AdminActionButton
                  type="button"
                  variant="primary"
                  disabled={busy}
                  data-admin-gift-product-activate="1"
                  onClick={() => void patchAction("activate")}
                >
                  {safeT("gift_ops_cta_resume")}
                </AdminActionButton>
              ) : null}
              {mallVisible ? (
                <AdminActionButton
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  data-admin-gift-product-hide="1"
                  onClick={() => void patchAction("hide")}
                >
                  {safeT("gift_ops_cta_mall_hide")}
                </AdminActionButton>
              ) : (
                <AdminActionButton
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  data-admin-gift-product-show="1"
                  onClick={() => void patchAction("show")}
                >
                  {safeT("gift_ops_cta_mall_show")}
                </AdminActionButton>
              )}
              {product.archived_at ? (
                <AdminActionButton
                  type="button"
                  variant="primary"
                  disabled={busy}
                  data-admin-gift-product-unarchive="1"
                  onClick={() => void patchAction("unarchive")}
                >
                  {safeT("gift_ops_cta_unarchive")}
                </AdminActionButton>
              ) : (
                <AdminActionButton
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void handleArchive()}
                >
                  {safeT("gift_ops_cta_archive")}
                </AdminActionButton>
              )}
              {product.issued_count === 0 ? (
                <AdminActionButton
                  variant="danger"
                  disabled={busy}
                  onClick={() => void confirmDelete()}
                >
                  {safeT("gift_ops_cta_delete")}
                </AdminActionButton>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-admin-gift-product-kpis="1">
        {[
          { label: safeT("gift_ops_kpi_issued"), value: String(payload.stats.issued) },
          { label: safeT("gift_ops_kpi_outstanding"), value: formatAdminPhp(payload.stats.outstanding) },
          { label: safeT("gift_ops_kpi_redeemed_gross"), value: formatAdminPhp(payload.stats.redeemedGross) },
          { label: safeT("gift_ops_detail_recognized_net"), value: formatAdminPhp(payload.stats.merchantNet) },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
            <p className="text-xs text-sam-muted">{kpi.label}</p>
            <p className="text-sm font-semibold tabular-nums">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto bg-sam-app/95 py-1 backdrop-blur-sm">
        {sections.map((sec) => (
          <AdminChipButton
            key={sec.id}
            data-admin-gift-product-section={sec.id}
            selected={section === sec.id}
            className="shrink-0"
            onClick={() => setSection(sec.id)}
          >
            {safeT(sec.key)}
          </AdminChipButton>
        ))}
      </div>

      {section === "info" ? (
        <div className="space-y-4" data-admin-gift-product-info="1">
          {editOpen ? (
            <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <label className="block space-y-1 text-sm">
                <span>{safeT("gift_admin_field_title")}</span>
                <input className={Sam.input.base} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                {editTitle.trim() !== product.title ? (
                  <p className="text-xs text-sam-muted">
                    {product.title} → <span className="font-semibold text-sam-fg">{editTitle.trim()}</span>
                  </p>
                ) : null}
              </label>
              <div className="space-y-2 text-sm">
                <span>{safeT("gift_ops_field_image_upload")}</span>
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
                {safeT("gift_admin_field_transferable")}
              </label>
              <label className="block space-y-1 text-sm">
                <span>{safeT("gift_ops_field_max_issuance")}</span>
                <input
                  className={Sam.input.base}
                  inputMode="numeric"
                  value={editMaxIssuance}
                  placeholder={safeT("gift_ops_max_issuance_unlimited")}
                  onChange={(e) => setEditMaxIssuance(e.target.value)}
                />
              </label>
              <p className="text-xs text-sam-muted">{creationSourceLabel(product.creation_source, safeT)}</p>
            </div>
          ) : (
            <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm space-y-2">
              <p>{product.title}</p>
              <p>{product.transferable ? safeT("gift_admin_field_transferable") : "—"}</p>
              <p>
                {safeT("gift_ops_field_max_issuance")}:{" "}
                {product.max_issuance ?? safeT("gift_ops_max_issuance_unlimited")}
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
                <span>{safeT("gift_ops_field_face_amount")}</span>
                <input className={Sam.input.base} inputMode="numeric" value={editFace} onChange={(e) => setEditFace(e.target.value)} />
              </label>
              <label className="block space-y-1 text-sm">
                <span>{safeT("gift_ops_field_purchase")}</span>
                <input className={Sam.input.base} inputMode="numeric" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
              </label>
              <label className="block space-y-1 text-sm">
                <span>{safeT("gift_ops_field_fee_dibay")}</span>
                <input className={Sam.input.base} inputMode="numeric" value={editFee} onChange={(e) => setEditFee(e.target.value)} />
              </label>
              <GiftSalesDateTimeField
                label={safeT("gift_ops_field_sales_start")}
                value={editStart}
                previousValue={canonStart}
                onChange={setEditStart}
                data-testid="edit-start"
              />
              <GiftSalesDateTimeField
                label={safeT("gift_ops_field_sales_end")}
                value={editEnd}
                previousValue={canonEnd}
                onChange={setEditEnd}
                data-testid="edit-end"
              />
              <label className="block space-y-1 text-sm">
                <span>{safeT("gift_ops_field_validity")}</span>
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
                    {safeT("gift_ops_expiry_no_expiry")}
                  </option>
                  <option value="FIXED_DAYS">
                    {safeT("gift_ops_expiry_fixed_days")}
                  </option>
                  <option value="FIXED_DATE">
                    {safeT("gift_ops_expiry_fixed_date")}
                  </option>
                </select>
              </label>
              {editExpiryPolicy === "FIXED_DAYS" ? (
                <label className="block space-y-1 text-sm">
                  <span>{safeT("gift_ops_field_validity_days")}</span>
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
                  <span>{safeT("gift_ops_field_fixed_valid_until")}</span>
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
                  <span>{safeT("gift_ops_field_promo_funding")}</span>
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
                      {safeT("gift_ops_funding_merchant")}
                    </option>
                    <option value="PLATFORM">
                      {safeT("gift_ops_funding_platform")}
                    </option>
                    <option value="SHARED">
                      {safeT("gift_ops_funding_shared")}
                    </option>
                  </select>
                  <p className="text-xs text-sam-muted tabular-nums">
                    P {fundingUnits.platform} / M {fundingUnits.merchant}
                  </p>
                </label>
              ) : (
                <p className="text-xs text-sam-muted">
                  {safeT("gift_ops_funding_none")}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm space-y-1">
              <p className="tabular-nums">
                {formatAdminPhp(product.face_value)} · {formatAdminPhp(product.purchase_price)} · {product.platform_fee_rate}%
              </p>
              <p>
                {dt(product.sales_starts_at)} → {dt(product.sales_ends_at)}
              </p>
              <p>
                {safeT("gift_ops_field_validity")}:{" "}
                {formatExpiryPolicyDisplay(
                  viewExpiryPolicy,
                  product.validity_days,
                  product.fixed_valid_until,
                  safeT
                )}
              </p>
              {(product.discount_funding_party ?? "NONE") !== "NONE" ? (
                <p className="text-xs text-sam-muted">
                  {safeT("gift_ops_field_promo_funding")}:{" "}
                  {product.discount_funding_party} (P {product.platform_funded_units ?? 0} / M{" "}
                  {product.merchant_funded_units ?? 0})
                </p>
              ) : (
                <p className="text-xs text-sam-muted">
                  {safeT("gift_ops_funding_none")}
                </p>
              )}
            </div>
          )}
        </div>
      ) : null}

      {error ? <p className="text-sm text-sam-danger">{error}</p> : null}

      {section === "instances" ? (
        <div className="space-y-2" data-admin-gift-product-instances="1">
          {payload.instances.map((row) => (
            <div key={String(row.id)} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-sm">
              <p className="font-semibold">{String(row.publicGiftNumber || row.id)}</p>
              <p className="text-xs text-sam-muted">
                {String(row.status)} · {formatAdminPhp(Number(row.remainingBalance) || 0)}
              </p>
              <p className="text-xs">{String(row.currentOwnerLabel || shortId(String(row.currentOwnerUserId)))}</p>
              <Link
                href={buildAdminGiftOpsHref({ tab: "instances", extra: { id: String(row.id) } })}
                className="mt-2 inline-block text-xs font-semibold text-sam-primary"
              >
                {safeT("gift_ops_cta_detail")}
              </Link>
            </div>
          ))}
          {!payload.instances.length ? (
            <p className="text-sm text-sam-muted">
              {safeT("gift_ops_instances_empty")}
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
                  {safeT("gift_ops_activity_transfer")}
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
                  {safeT("gift_ops_activity_redemption")}
                </p>
                <p className="font-semibold">{String(item.row.publicGiftNumber)}</p>
                <p>
                  {safeT("gift_ops_redeemed_store")}:{" "}
                  <span className="font-semibold">
                    {String(item.row.redeemedStoreName || item.row.redeemedStoreId || "—")}
                  </span>
                </p>
                <p className="tabular-nums text-xs">
                  {formatAdminPhp(Number(item.row.usedAmount) || 0)} · {String(item.row.recognitionState)} ·{" "}
                  {String(item.row.orderStatus || "—")}
                </p>
                <p className="text-xs text-sam-muted">{dt(item.at)}</p>
              </li>
            )
          )}
          {!activityItems.length ? (
            <li className="text-sm text-sam-muted">
              {safeT("gift_ops_activity_empty")}
            </li>
          ) : null}
        </ul>
      ) : null}

      {section === "settlement" ? (
        <div className="space-y-3" data-admin-gift-product-settlement="1">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <p>
              {safeT("gift_ops_money_pending")}:{" "}
              {formatAdminPhp(payload.stats.pendingGross)}
            </p>
            <p>
              {safeT("gift_ops_money_recognized")}:{" "}
              {formatAdminPhp(payload.stats.recognizedGross)}
            </p>
            <p>
              {safeT("gift_ops_kpi_recognized_fee")}:{" "}
              {formatAdminPhp(payload.stats.platformFee)}
            </p>
            <p>
              {safeT("gift_ops_detail_recognized_net")}:{" "}
              {formatAdminPhp(payload.stats.merchantNet)}
            </p>
          </div>
          {scope === "PLATFORM" && (product.redemption_by_store?.length ?? 0) > 0 ? (
            <div>
              <p className="mb-2 text-sm font-semibold">
                {safeT("gift_ops_redeem_by_store")}
              </p>
              <ul className="space-y-1 text-sm">
                {product.redemption_by_store!.map((row) => (
                  <li key={row.store_id} className="tabular-nums rounded-ui-rect border border-sam-border p-2">
                    {row.store_name || shortId(row.store_id)}: Gross {formatAdminPhp(row.gross)} · Fee {formatAdminPhp(row.fee)} · Net{" "}
                    {formatAdminPhp(row.net)}
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
                {safeT("gift_ops_edit_dirty_count")}
              </p>
            ) : null}
            <div className="flex gap-2">
              <AdminActionButton
                type="button"
                variant="secondary" className="flex-1"
                disabled={busy}
                data-admin-gift-product-cancel="1"
                onClick={cancelEdit}
              >
                {safeT("gift_admin_edit_confirm_cancel")}
              </AdminActionButton>
              <AdminActionButton
                type="button"
                variant="primary" className="flex-1"
                disabled={busy || !isDirty || uploading}
                data-admin-gift-product-save="1"
                onClick={() => void saveEdit()}
              >
                {safeT("gift_ops_cta_save")}
              </AdminActionButton>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
