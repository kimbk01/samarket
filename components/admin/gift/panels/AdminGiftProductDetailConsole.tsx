"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { GiftSalesDateTimeField } from "@/components/gift-certificate/GiftSalesDateTimeField";
import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { buildAdminGiftOpsHref } from "@/lib/gift-certificate/admin-gift-ops-tabs";
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
  transferable: boolean;
  sales_starts_at: string | null;
  sales_ends_at: string | null;
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

type SectionId = "config" | "instances" | "transfers" | "redemptions" | "money" | "audit";

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

export function AdminGiftProductDetailConsole({
  productId,
  onBack,
  onChanged,
}: {
  productId: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { safeT } = useI18n();
  const [payload, setPayload] = useState<DetailPayload | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [section, setSection] = useState<SectionId>("config");
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editTitle, setEditTitle] = useState("");
  const [editImage, setEditImage] = useState("");
  const [editFace, setEditFace] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editFee, setEditFee] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editTransferable, setEditTransferable] = useState(true);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch(`/api/admin/gift-certificates/products/${encodeURIComponent(productId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as DetailPayload & { ok?: boolean };
      if (!res.ok || !json.ok || !json.product) {
        setPayload(null);
        setState("error");
        return;
      }
      setPayload(json as DetailPayload);
      const p = json.product;
      setEditTitle(p.title);
      setEditImage(p.image_url ?? "");
      setEditFace(String(p.face_value));
      setEditPrice(String(p.purchase_price));
      setEditFee(String(p.platform_fee_rate));
      setEditStart(toLocalInput(p.sales_starts_at));
      setEditEnd(toLocalInput(p.sales_ends_at));
      setEditTransferable(p.transferable !== false);
      setState("ready");
    } catch {
      setPayload(null);
      setState("error");
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const product = payload?.product;
  const scope = product?.gift_scope === "PLATFORM" ? "PLATFORM" : "STORE";
  const status = product ? productStatus(product) : "PAUSED";
  const moneyLocked = product?.money_locked === true;

  const labelScope =
    scope === "PLATFORM"
      ? safeT("gift_ops_type_platform", { fallbackKo: "DIBAY 상품권", fallbackEn: "DIBAY Gift" })
      : safeT("gift_ops_type_store", { fallbackKo: "매장 상품권", fallbackEn: "Store Gift" });

  const sections = useMemo(
    () =>
      [
        { id: "config" as const, key: "gift_ops_detail_sec_config", ko: "상품 설정", en: "Configuration" },
        { id: "instances" as const, key: "gift_ops_detail_sec_instances", ko: "발급 현황", en: "Instances" },
        { id: "transfers" as const, key: "gift_ops_detail_sec_transfers", ko: "선물 이력", en: "Transfers" },
        { id: "redemptions" as const, key: "gift_ops_detail_sec_redemptions", ko: "사용 내역", en: "Redemptions" },
        { id: "money" as const, key: "gift_ops_detail_sec_money", ko: "정산", en: "Settlement" },
        { id: "audit" as const, key: "gift_ops_detail_sec_audit", ko: "관리 이력", en: "Audit" },
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
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!product || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title: editTitle.trim(),
        imageUrl: editImage.trim() || null,
        transferable: editTransferable,
        salesStartsAt: editStart ? new Date(editStart).toISOString() : undefined,
        salesEndsAt: editEnd ? new Date(editEnd).toISOString() : null,
      };
      if (!moneyLocked) {
        body.faceValue = Math.trunc(Number(editFace));
        body.purchasePrice = Math.trunc(Number(editPrice));
        body.platformFeeRate = Math.trunc(Number(editFee) || 0);
      }
      const res = await fetch(`/api/admin/gift-certificates/products/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(
          json.error === "money_fields_locked_after_issuance"
            ? safeT("gift_ops_edit_money_locked", {
                fallbackKo: "발급 이력이 있어 금액·수수료는 수정할 수 없습니다.",
                fallbackEn: "Money fields are locked after issuance.",
              })
            : safeT("gift_admin_action_fail", { fallbackKo: "처리에 실패했습니다.", fallbackEn: "Action failed." })
        );
        return;
      }
      setEditOpen(false);
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!product || busy || product.issued_count > 0) return;
    const ok = await dibayConfirm({
      title: safeT("gift_ops_delete_confirm_title", { fallbackKo: "상품 삭제", fallbackEn: "Delete product" }),
      description: safeT("gift_ops_delete_confirm_body", {
        fallbackKo:
          "이 상품권 상품을 삭제합니다. 발급된 상품권이 없는 경우에만 삭제할 수 있습니다.",
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
        setError(safeT("gift_ops_delete_forbidden", {
          fallbackKo: "이미 발급 이력이 있어 삭제할 수 없습니다. 판매 중지 또는 보관을 사용하세요.",
          fallbackEn: "Cannot delete: instances exist. Pause or archive instead.",
        }));
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

  if (state === "loading") {
    return (
      <p className="text-sm text-sam-muted">
        {safeT("gift_ops_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
      </p>
    );
  }

  if (state === "error" || !product || !payload) {
    return (
      <div className="space-y-3">
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

  return (
    <section className="space-y-4" data-admin-gift-product-detail="1">
      <div className="flex flex-col gap-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4 sm:flex-row">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app">
          {product.image_url ? (
            <SamarketThumbnail src={product.image_url} alt="" fill className="relative h-full w-full" imageClassName="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-sam-muted">
              {safeT("gift_ops_preview_no_image", { fallbackKo: "이미지 없음", fallbackEn: "No image" })}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-ui-rect bg-sam-app px-2 py-0.5 text-xs font-semibold">{labelScope}</span>
            <span className="rounded-ui-rect border border-sam-border px-2 py-0.5 text-xs">{status}</span>
          </div>
          <h2 className="text-lg font-semibold break-words">{product.title}</h2>
          <p className="text-xs text-sam-muted break-all">ID: {product.id}</p>
          <p className="text-xs text-sam-muted">
            {creationSourceLabel(product.creation_source, safeT)} · {dt(product.created_at)} · {dt(product.updated_at)}
          </p>
          {scope === "STORE" ? (
            <p className="text-sm">
              {safeT("gift_ops_field_store", { fallbackKo: "매장", fallbackEn: "Store" })}: {product.store_name || "—"}
              {product.owner_label ? ` · ${product.owner_label}` : ""}
            </p>
          ) : (
            <p className="text-sm">
              {safeT("gift_ops_platform_issuer", { fallbackKo: "발행 주체: DIBAY", fallbackEn: "Issuer: DIBAY" })} ·{" "}
              {safeT("gift_ops_usable_platform", {
                fallbackKo: "사용 범위: DIBAY eligible stores",
                fallbackEn: "Usable at: DIBAY eligible stores",
              })}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-admin-gift-product-kpis="1">
        {[
          { label: safeT("gift_ops_kpi_issued", { fallbackKo: "발급", fallbackEn: "Issued" }), value: String(payload.stats.issued) },
          { label: safeT("gift_ops_kpi_outstanding", { fallbackKo: "미사용 잔액", fallbackEn: "Outstanding" }), value: formatMoneyPhp(payload.stats.outstanding) },
          { label: safeT("gift_ops_kpi_redeemed_gross", { fallbackKo: "사용 금액", fallbackEn: "Redeemed" }), value: formatMoneyPhp(payload.stats.redeemedGross) },
          { label: safeT("gift_ops_detail_recognized_net", { fallbackKo: "확정 Merchant Net", fallbackEn: "Recognized net" }), value: formatMoneyPhp(payload.stats.merchantNet) },
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

      {section === "config" ? (
        <div className="space-y-4" data-admin-gift-product-config="1">
          {editOpen ? (
            <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <label className="block space-y-1 text-sm">
                <span>{safeT("gift_admin_field_title", { fallbackKo: "상품명", fallbackEn: "Title" })}</span>
                <input className={Sam.input.base} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </label>
              <label className="block space-y-1 text-sm">
                <span>{safeT("gift_ops_field_image_upload", { fallbackKo: "상품권 이미지 URL", fallbackEn: "Image URL" })}</span>
                <input className={Sam.input.base} value={editImage} onChange={(e) => setEditImage(e.target.value)} />
              </label>
              <label className="block space-y-1 text-sm">
                <span>{safeT("gift_ops_field_face_amount", { fallbackKo: "표시 금액", fallbackEn: "Face value" })}</span>
                <input className={Sam.input.base} inputMode="numeric" value={editFace} disabled={moneyLocked} onChange={(e) => setEditFace(e.target.value)} />
              </label>
              <label className="block space-y-1 text-sm">
                <span>{safeT("gift_ops_field_purchase", { fallbackKo: "판매 가격", fallbackEn: "Sale price" })}</span>
                <input className={Sam.input.base} inputMode="numeric" value={editPrice} disabled={moneyLocked} onChange={(e) => setEditPrice(e.target.value)} />
              </label>
              <label className="block space-y-1 text-sm">
                <span>{safeT("gift_ops_field_fee_dibay", { fallbackKo: "플랫폼 수수료 %", fallbackEn: "Platform fee %" })}</span>
                <input className={Sam.input.base} inputMode="numeric" value={editFee} disabled={moneyLocked} onChange={(e) => setEditFee(e.target.value)} />
              </label>
              {moneyLocked ? (
                <p className="text-xs text-amber-700">
                  {safeT("gift_ops_edit_money_locked", {
                    fallbackKo: "발급 이력이 있어 금액·수수료는 수정할 수 없습니다.",
                    fallbackEn: "Money fields are locked after issuance.",
                  })}
                </p>
              ) : null}
              <GiftSalesDateTimeField
                label={safeT("gift_ops_field_sales_start", { fallbackKo: "판매 시작", fallbackEn: "Sales start" })}
                value={editStart}
                onChange={setEditStart}
                data-testid="edit-start"
              />
              <GiftSalesDateTimeField
                label={safeT("gift_ops_field_sales_end", { fallbackKo: "판매 종료", fallbackEn: "Sales end" })}
                value={editEnd}
                onChange={setEditEnd}
                data-testid="edit-end"
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editTransferable} onChange={(e) => setEditTransferable(e.target.checked)} />
                {safeT("gift_admin_field_transferable", { fallbackKo: "선물 가능", fallbackEn: "Transferable" })}
              </label>
            </div>
          ) : (
            <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm space-y-1">
              <p className="tabular-nums">{formatMoneyPhp(product.face_value)} · {formatMoneyPhp(product.purchase_price)} · {product.platform_fee_rate}%</p>
              <p>{dt(product.sales_starts_at)} → {dt(product.sales_ends_at)}</p>
              <p>{product.transferable ? safeT("gift_admin_field_transferable", { fallbackKo: "선물 가능", fallbackEn: "Transferable" }) : "—"}</p>
            </div>
          )}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          {editOpen ? (
            <div
              className="sticky bottom-0 z-20 -mx-1 flex gap-2 border-t border-sam-border bg-sam-app/95 p-3 backdrop-blur-sm"
              data-admin-gift-product-edit-actions="1"
            >
              <button
                type="button"
                className={`${Sam.btn.secondary} min-h-[48px] flex-1 px-4`}
                disabled={busy}
                onClick={() => setEditOpen(false)}
              >
                {safeT("gift_admin_cta_back", { fallbackKo: "취소", fallbackEn: "Cancel" })}
              </button>
              <button
                type="button"
                className={`${Sam.btn.primary} min-h-[48px] flex-1 px-4 text-sam-on-primary`}
                disabled={busy}
                data-admin-gift-product-save="1"
                onClick={() => void saveEdit()}
              >
                {safeT("gift_ops_cta_save", { fallbackKo: "저장", fallbackEn: "Save" })}
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2" data-admin-gift-product-actions="1">
            {!editOpen ? (
              <button type="button" className={`${Sam.btn.primary} min-h-[44px] px-4 text-sam-on-primary`} onClick={() => setEditOpen(true)}>
                {safeT("gift_ops_cta_edit", { fallbackKo: "수정", fallbackEn: "Edit" })}
              </button>
            ) : null}
            {product.active ? (
              <button type="button" className={`${Sam.btn.secondary} min-h-[44px] px-4`} disabled={busy} onClick={() => void handlePause()}>
                {safeT("gift_ops_cta_pause", { fallbackKo: "판매 중지", fallbackEn: "Pause" })}
              </button>
            ) : (
              <button
                type="button"
                className={`${Sam.btn.primary} min-h-[44px] px-4`}
                disabled={busy || !!product.archived_at}
                onClick={() => void patchAction(product.archived_at ? "unarchive" : "activate")}
              >
                {product.archived_at
                  ? safeT("gift_ops_cta_unarchive", { fallbackKo: "보관 해제", fallbackEn: "Unarchive" })
                  : safeT("gift_ops_cta_resume", { fallbackKo: "판매 재개", fallbackEn: "Resume" })}
              </button>
            )}
            {!product.archived_at ? (
              <button type="button" className={`${Sam.btn.secondary} min-h-[44px] px-4`} disabled={busy} onClick={() => void handleArchive()}>
                {safeT("gift_ops_cta_archive", { fallbackKo: "보관", fallbackEn: "Archive" })}
              </button>
            ) : null}
            {product.issued_count === 0 ? (
              <button type="button" className="min-h-[44px] rounded-ui-rect border border-red-300 px-4 text-sm font-semibold text-red-700" disabled={busy} onClick={() => void confirmDelete()}>
                {safeT("gift_ops_cta_delete", { fallbackKo: "삭제", fallbackEn: "Delete" })}
              </button>
            ) : (
              <p className="text-xs text-sam-muted self-center">
                {safeT("gift_ops_delete_forbidden", {
                  fallbackKo: "이미 발급 이력이 있어 삭제할 수 없습니다. 판매 중지 또는 보관을 사용하세요.",
                  fallbackEn: "Cannot delete: instances exist. Pause or archive instead.",
                })}
              </p>
            )}
          </div>
        </div>
      ) : null}

      {section === "instances" ? (
        <div className="space-y-2" data-admin-gift-product-instances="1">
          {(payload.instances.length ? payload.instances : []).map((row) => (
            <div key={String(row.id)} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-sm">
              <p className="font-semibold">{String(row.publicGiftNumber || row.id)}</p>
              <p className="text-xs text-sam-muted">{String(row.status)} · {formatMoneyPhp(Number(row.remainingBalance) || 0)}</p>
              <p className="text-xs">{String(row.currentOwnerLabel || shortId(String(row.currentOwnerUserId)))}</p>
              <Link href={buildAdminGiftOpsHref({ tab: "instances", extra: { id: String(row.id) } })} className="mt-2 inline-block text-xs font-semibold text-sam-brand">
                {safeT("gift_ops_cta_instance_trace", { fallbackKo: "전체 추적", fallbackEn: "Full trace" })}
              </Link>
            </div>
          ))}
          {!payload.instances.length ? (
            <p className="text-sm text-sam-muted">{safeT("gift_ops_instances_empty", { fallbackKo: "발급된 상품권이 없습니다.", fallbackEn: "No instances yet." })}</p>
          ) : null}
        </div>
      ) : null}

      {section === "transfers" ? (
        <ul className="space-y-2" data-admin-gift-product-transfers="1">
          {payload.transfers.map((t) => (
            <li key={String(t.id)} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-sm">
              <p>{String(t.publicGiftNumber)} · {String(t.status)}</p>
              <p className="text-xs">{String(t.senderLabel)} → {String(t.recipientLabel)}</p>
              <p className="text-xs text-sam-muted">{dt(String(t.offeredAt))}</p>
            </li>
          ))}
          {!payload.transfers.length ? (
            <li className="text-sm text-sam-muted">{safeT("gift_ops_transfers_empty", { fallbackKo: "선물 이력이 없습니다.", fallbackEn: "No transfers." })}</li>
          ) : null}
        </ul>
      ) : null}

      {section === "redemptions" ? (
        <ul className="space-y-2" data-admin-gift-product-redemptions="1">
          {payload.redemptions.map((r) => (
            <li key={String(r.id)} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-sm">
              <p className="font-semibold">{String(r.publicGiftNumber)}</p>
              <p>
                {safeT("gift_ops_redeemed_store", { fallbackKo: "사용 매장", fallbackEn: "Redeemed store" })}:{" "}
                <span className="font-semibold">{String(r.redeemedStoreName || r.redeemedStoreId || "—")}</span>
              </p>
              <p className="tabular-nums text-xs">
                {formatMoneyPhp(Number(r.usedAmount) || 0)} · {String(r.recognitionState)} · {String(r.orderStatus || "—")}
              </p>
              {r.orderId ? (
                <p className="text-xs break-all">
                  Order: {String(r.orderNo || r.orderId)}
                </p>
              ) : null}
            </li>
          ))}
          {!payload.redemptions.length ? (
            <li className="text-sm text-sam-muted">{safeT("gift_ops_redemptions_empty", { fallbackKo: "사용 내역이 없습니다.", fallbackEn: "No redemptions." })}</li>
          ) : null}
        </ul>
      ) : null}

      {section === "money" ? (
        <div className="space-y-3" data-admin-gift-product-money="1">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <p>{safeT("gift_ops_money_pending", { fallbackKo: "확정 대기 Gross", fallbackEn: "Pending gross" })}: {formatMoneyPhp(payload.stats.pendingGross)}</p>
            <p>{safeT("gift_ops_money_recognized", { fallbackKo: "확정 Gross", fallbackEn: "Recognized gross" })}: {formatMoneyPhp(payload.stats.recognizedGross)}</p>
            <p>{safeT("gift_ops_kpi_recognized_fee", { fallbackKo: "DIBAY 수수료", fallbackEn: "DIBAY fee" })}: {formatMoneyPhp(payload.stats.platformFee)}</p>
            <p>{safeT("gift_ops_detail_recognized_net", { fallbackKo: "Merchant Net", fallbackEn: "Merchant net" })}: {formatMoneyPhp(payload.stats.merchantNet)}</p>
          </div>
          {scope === "PLATFORM" && (product.redemption_by_store?.length ?? 0) > 0 ? (
            <div>
              <p className="mb-2 text-sm font-semibold">{safeT("gift_ops_redeem_by_store", { fallbackKo: "매장별 정산", fallbackEn: "By redeemed store" })}</p>
              <ul className="space-y-1 text-sm">
                {product.redemption_by_store!.map((row) => (
                  <li key={row.store_id} className="tabular-nums rounded-ui-rect border border-sam-border p-2">
                    {row.store_name || shortId(row.store_id)}: Gross {formatMoneyPhp(row.gross)} · Fee {formatMoneyPhp(row.fee)} · Net {formatMoneyPhp(row.net)}
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

      <button type="button" className="min-h-[44px] w-full rounded-ui-rect border border-sam-border text-sm font-semibold" onClick={onBack}>
        {safeT("gift_admin_cta_back_list", { fallbackKo: "목록으로", fallbackEn: "Back to list" })}
      </button>
    </section>
  );
}
