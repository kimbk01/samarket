"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { SafeTranslateOptions } from "@/lib/i18n/safe-translate";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import {
  OWNER_ADMIN_OUTLINE_BTN_CLASS,
  OWNER_ADMIN_PRIMARY_BTN_CLASS,
} from "@/lib/business/owner-admin-list-ui";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { resolveOwnerActiveStoreIdFromOwnedList } from "@/lib/delivery/owner/resolve-owner-active-store";
import { Sam } from "@/lib/ui/css-vars";
import { OwnerGiftMoneyOpsPanel } from "@/components/business/owner/OwnerGiftMoneyOpsPanel";
import { GiftVisualCard } from "@/components/gift-certificate/GiftVisualCard";
import { type OwnerGiftRedemptionPeriodSummary } from "@/lib/gift-certificate/owner-gift-money-ops";
import { formatGiftProductExpirationDisplay } from "@/lib/gift-certificate/format-gift-certificate-expiration";
import { formatMoneyPhp } from "@/lib/utils/format";
import { postStoreOwnerImageUpload } from "@/lib/stores/upload-store-product-image-client";

/** 홈 「상품권 사용」 칸 — 응답 전·실패 때 0 (이전과 같음) */
const EMPTY_REDEEM_KPIS = { redeemedGross: 0, pendingMerchantNet: 0, recognizedMerchantNet: 0 } as const;

type GiftApp = {
  id: string;
  title: string;
  requested_face_value: number;
  requested_purchase_price: number | null;
  image_url: string | null;
  status: string;
  design_notes: string | null;
  rejection_reason: string | null;
  created_at: string;
};

type GiftProduct = {
  id: string;
  title: string;
  face_value: number;
  purchase_price: number;
  active: boolean;
  image_url: string | null;
  issued_count?: number;
  expiry_policy?: string | null;
  validity_days?: number | null;
  fixed_valid_until?: string | null;
  stores?: { store_name?: string | null; profile_image_url?: string | null } | null;
};

type Draft = {
  title: string;
  face: string;
  price: string;
  notes: string;
  imageUrl: string | null;
  resubmitOf: string | null;
};

const emptyDraft = (): Draft => ({
  title: "",
  face: "",
  price: "",
  notes: "",
  imageUrl: null,
  resubmitOf: null,
});

function statusLabel(
  status: string,
  safeT: (key: MessageKey, fallbacks?: string | SafeTranslateOptions) => string
) {
  switch (status) {
    case "submitted":
      return safeT("gift_owner_status_submitted");
    case "under_review":
      return safeT("gift_owner_status_under_review");
    case "approved":
      return safeT("gift_owner_status_approved");
    case "rejected":
      return safeT("gift_owner_status_rejected");
    case "suspended":
      return safeT("gift_owner_status_suspended");
    default:
      return status;
  }
}

function OwnerGiftCertificatesInner() {
  const { safeT } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const storeIdQ = sp.get("storeId")?.trim() ?? "";
  const view = (sp.get("view")?.trim() || "home") as
    | "home"
    | "apply"
    | "confirm"
    | "success"
    | "applications"
    | "history"
    | "money"
    | "redemptions"
    | "convert"
    | "convert-success"
    | "convert-history"
    | "cash-out"
    | "cash-out-success"
    | "cash-out-history"
    | "products";
  const [resolvedStoreId, setResolvedStoreId] = useState(storeIdQ);
  const [apps, setApps] = useState<GiftApp[]>([]);
  const [products, setProducts] = useState<GiftProduct[]>([]);
  const [redeemSummary, setRedeemSummary] = useState<OwnerGiftRedemptionPeriodSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  useEffect(() => {
    if (storeIdQ) {
      setResolvedStoreId(storeIdQ);
      return;
    }
    void (async () => {
      const { json } = await fetchMeStoresListDeduped();
      const j = json as { ok?: boolean; stores?: { id: string }[] };
      const id =
        j?.ok && Array.isArray(j.stores)
          ? resolveOwnerActiveStoreIdFromOwnedList(j.stores, null) ?? ""
          : "";
      setResolvedStoreId(id);
    })();
  }, [storeIdQ]);

  const load = useCallback(async () => {
    const sid = resolvedStoreId.trim();
    if (!sid) return;
    setLoaded(false);
    const [aRes, pRes, redRes] = await Promise.all([
      fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/applications`, {
        credentials: "include",
        cache: "no-store",
      }),
      fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/products`, {
        credentials: "include",
        cache: "no-store",
      }),
      // 합계만 필요 — 서버가 기간 전체로 계산한 summary 사용 (목록은 쪽 나눔 · limit=0)
      fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/redemptions?limit=0`, {
        credentials: "include",
        cache: "no-store",
      }),
    ]);
    const aJson = (await aRes.json()) as { ok?: boolean; applications?: GiftApp[] };
    const pJson = (await pRes.json()) as { ok?: boolean; products?: GiftProduct[] };
    const redJson = (await redRes.json()) as { ok?: boolean; summary?: OwnerGiftRedemptionPeriodSummary };
    setApps(aJson.ok ? aJson.applications ?? [] : []);
    setProducts(pJson.ok ? pJson.products ?? [] : []);
    setRedeemSummary(redJson.ok && redJson.summary ? redJson.summary : null);
    setLoaded(true);
  }, [resolvedStoreId]);

  useEffect(() => {
    void load();
  }, [load]);

  const go = (next: string, extra?: Record<string, string>) => {
    const sid = resolvedStoreId.trim();
    const base = OwnerRoutes.giftCertificates(sid);
    const u = new URL(base, "https://local.invalid");
    if (next !== "home") u.searchParams.set("view", next);
    if (extra) {
      for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
    }
    router.push(`${u.pathname}?${u.searchParams.toString()}`);
  };

  const pendingCount = useMemo(
    () => apps.filter((a) => a.status === "submitted" || a.status === "under_review").length,
    [apps]
  );
  const activeProducts = useMemo(() => products.filter((p) => p.active), [products]);
  const redeemKpis = redeemSummary ?? EMPTY_REDEEM_KPIS;

  const moneyViews = new Set([
    "money",
    "history",
    "redemptions",
    "convert",
    "convert-success",
    "convert-history",
    "cash-out",
    "cash-out-success",
    "cash-out-history",
  ]);
  if (moneyViews.has(view) && resolvedStoreId.trim()) {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} pb-8`} data-owner-gift-certificates="1" data-view={view}>
        <OwnerGiftMoneyOpsPanel
          storeId={resolvedStoreId.trim()}
          view={view === "redemptions" ? "redemptions" : view === "history" ? "history" : "money"}
          onGo={(next) => go(next)}
          onBackHome={() => go("home")}
        />
      </div>
    );
  }

  const uploadImage = async (file: File) => {
    const sid = resolvedStoreId.trim();
    if (!sid) return;
    setUploadBusy(true);
    try {
      // IMG-02: 압축 후 전송 · 413(비 JSON)에서 예외 없이 실패 처리
      const { ok, json } = await postStoreOwnerImageUpload(sid, file);
      if (!ok || !json.url) {
        setError(
          safeT("gift_owner_upload_fail")
        );
        return;
      }
      setDraft((d) => ({ ...d, imageUrl: String(json.url) }));
    } finally {
      setUploadBusy(false);
    }
  };

  const submitApplication = async () => {
    const sid = resolvedStoreId.trim();
    if (!sid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/applications`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title.trim(),
          requestedFaceValue: Math.trunc(Number(draft.face)),
          requestedPurchasePrice: draft.price.trim() ? Math.trunc(Number(draft.price)) : null,
          designNotes: draft.notes.trim() || null,
          imageUrl: draft.imageUrl,
          submit: true,
          resubmitOf: draft.resubmitOf,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; application?: { id?: string }; error?: string };
      if (!res.ok || !json.ok) {
        setError(
          safeT("gift_owner_submit_fail")
        );
        return;
      }
      setSuccessId(String(json.application?.id ?? ""));
      setDraft(emptyDraft());
      await load();
      go("success");
    } finally {
      setBusy(false);
    }
  };

  const faceNum = Math.trunc(Number(draft.face));
  const priceNum = draft.price.trim() ? Math.trunc(Number(draft.price)) : null;
  const formValid =
    draft.title.trim().length > 0 && Number.isFinite(faceNum) && faceNum > 0;

  return (
    <div className={`${OWNER_STORE_STACK_Y_CLASS} pb-8`} data-owner-gift-certificates="1" data-view={view}>
      {view === "home" ? (
        <>
          <OwnerStoreAdminDashSection
            title={safeT("gift_owner_home_title")}
          >
            {!loaded ? (
              <p className="text-sm text-sam-muted">…</p>
            ) : (
              <>
              {/* 서버 기본 기간 = 이번 달(PHT) — 기간을 바꾸는 곳은 상품권 수익 화면 (Owner 2026-11-03 §6-3) */}
              <p className="mb-2 text-xs text-sam-muted" data-owner-gift-usage-basis="this_month">
                {safeT("gift_owner_usage_basis_this_month")}
              </p>
              <div className="grid grid-cols-2 gap-2" data-owner-gift-usage-kpis="1">
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-owner-gift-kpi="redeemed">
                  <p className="text-xs text-sam-muted">
                    {safeT("gift_u5_kpi_redeemed")}
                  </p>
                  <p className="mt-1 text-base font-semibold tabular-nums break-words">
                    {formatMoneyPhp(redeemKpis.redeemedGross)}
                  </p>
                </div>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-owner-gift-kpi="pending-merchant">
                  <p className="text-xs text-sam-muted">
                    {safeT("gift_u5_kpi_pending_merchant")}
                  </p>
                  <p className="mt-1 text-base font-semibold tabular-nums break-words">
                    {formatMoneyPhp(redeemKpis.pendingMerchantNet)}
                  </p>
                </div>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-owner-gift-kpi="merchant-net">
                  <p className="text-xs text-sam-muted">
                    {safeT("gift_u5_kpi_merchant_net")}
                  </p>
                  <p className="mt-1 text-base font-semibold tabular-nums break-words">
                    {formatMoneyPhp(redeemKpis.recognizedMerchantNet)}
                  </p>
                </div>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-owner-gift-kpi="coin-authority">
                  <p className="text-xs text-sam-muted">
                    {safeT("gift_owner_kpi_revenue")}
                  </p>
                  <p className="mt-1 text-base font-semibold">Coin</p>
                </div>
              </div>
              </>
            )}
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                className={`${Sam.btn.primary} min-h-[48px] w-full`}
                onClick={() => router.push(OwnerRoutes.finance(resolvedStoreId))}
                data-owner-gift-money-cta="1"
              >
                {safeT("gift_owner_cta_money")}
              </button>
              <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => go("redemptions")}>
                {safeT("gift_u5_cta_redemptions")}
              </button>
            </div>
          </OwnerStoreAdminDashSection>

          <OwnerStoreAdminDashSection
            title={safeT("gift_owner_product_mgmt_title")}
          >
            <div className="mb-3 grid grid-cols-2 gap-2 text-xs text-sam-muted">
              <p>
                {safeT("gift_owner_kpi_selling")}:{" "}
                <strong className="tabular-nums text-sam-fg">{activeProducts.length}</strong>
              </p>
              <p>
                {safeT("gift_owner_kpi_pending")}:{" "}
                <strong className="tabular-nums text-sam-fg">{pendingCount}</strong>
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className={OWNER_ADMIN_OUTLINE_BTN_CLASS}
                onClick={() => {
                  setDraft(emptyDraft());
                  go("apply");
                }}
              >
                {safeT("gift_owner_cta_apply")}
              </button>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => go("applications")}>
                  {safeT("gift_owner_cta_history")}
                </button>
                <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => go("home")}>
                  {safeT("gift_owner_cta_products")}
                </button>
              </div>
            </div>
          </OwnerStoreAdminDashSection>

          <OwnerStoreAdminDashSection
            title={safeT("gift_owner_product_list")}
          >
            {products.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-sam-muted">
                  {safeT("gift_owner_empty_products")}
                </p>
                <button type="button" className={OWNER_ADMIN_PRIMARY_BTN_CLASS} onClick={() => go("apply")}>
                  {safeT("gift_owner_cta_apply")}
                </button>
              </div>
            ) : (
              <ul className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                {products.map((p) => (
                  <li key={p.id} className="min-w-0" data-gift-product={p.id}>
                    <GiftVisualCard
                      visual={{
                        giftScope: "STORE",
                        imageUrl: p.image_url,
                        storeLogoUrl: p.stores?.profile_image_url ?? null,
                        storeName: p.stores?.store_name ?? "",
                        title: p.title,
                      }}
                      surface="mall"
                      size="sm"
                      title={p.title}
                      issuerName={p.stores?.store_name ?? ""}
                      faceValue={p.face_value}
                      purchasePrice={p.purchase_price}
                      expirationDisplay={formatGiftProductExpirationDisplay({
                        expiryPolicy: p.expiry_policy,
                        validityDays: p.validity_days,
                        fixedValidUntil: p.fixed_valid_until,
                        noExpiryLabel: safeT("gift_portrait_expiry_none"),
                        daysAfterIssueLabel: (days) =>
                          safeT("gift_portrait_expiry_days_after_issue", { vars: { days: String(days) } }),
                      })}
                      showValidity
                      footer={
                        <p className="text-xs text-sam-muted">
                          {p.active
                            ? safeT("gift_owner_product_active")
                            : safeT("gift_owner_product_paused")}
                          {typeof p.issued_count === "number"
                            ? ` · ${p.issued_count.toLocaleString()}`
                            : ""}
                        </p>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </OwnerStoreAdminDashSection>
        </>
      ) : null}

      {view === "apply" || view === "confirm" ? (
        <OwnerStoreAdminDashSection
          title={
            view === "confirm"
              ? safeT("gift_owner_confirm_title")
              : safeT("gift_owner_apply_title")
          }
        >
          {error ? <p className="mb-3 text-sm text-sam-danger">{error}</p> : null}
          {view === "apply" ? (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-sam-muted">
                  {safeT("gift_owner_field_title")}
                </span>
                <input
                  className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-sam-muted">
                  {safeT("gift_owner_field_face")}
                </span>
                <input
                  inputMode="numeric"
                  className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
                  value={draft.face}
                  onChange={(e) => setDraft((d) => ({ ...d, face: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-sam-muted">
                  {safeT("gift_owner_field_price")}
                </span>
                <input
                  inputMode="numeric"
                  className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
                  value={draft.price}
                  onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-sam-muted">
                  {safeT("gift_owner_field_notes")}
                </span>
                <textarea
                  className="min-h-[96px] w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                />
              </label>
              <div>
                <p className="mb-1 text-sm text-sam-muted">
                  {safeT("gift_owner_field_image")}
                </p>
                {draft.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draft.imageUrl} alt="" className="mb-2 h-24 w-24 rounded-ui-rect object-cover" />
                ) : null}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploadBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadImage(f);
                  }}
                />
              </div>
              <button
                type="button"
                className={`${Sam.btn.primary} min-h-[48px] w-full`}
                disabled={!formValid}
                onClick={() => go("confirm")}
              >
                {safeT("gift_owner_cta_review")}
              </button>
              <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => go("home")}>
                {safeT("gift_owner_cta_back")}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                {draft.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draft.imageUrl} alt="" className="mb-2 h-20 w-20 rounded-ui-rect object-cover" />
                ) : null}
                <p className="font-semibold">{draft.title}</p>
                <p className="text-sm text-sam-muted">
                  Face {faceNum.toLocaleString()}
                  {priceNum != null ? ` · Point ${priceNum.toLocaleString()}` : ""}
                </p>
                {draft.notes ? <p className="mt-2 whitespace-pre-wrap text-sm">{draft.notes}</p> : null}
              </div>
              <button
                type="button"
                className={`${Sam.btn.primary} min-h-[48px] w-full`}
                disabled={busy || !formValid}
                onClick={() => void submitApplication()}
              >
                {busy
                  ? "…"
                  : safeT("gift_owner_cta_submit_confirm")}
              </button>
              <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => go("apply")}>
                {safeT("gift_owner_cta_edit")}
              </button>
            </div>
          )}
        </OwnerStoreAdminDashSection>
      ) : null}

      {view === "success" ? (
        <OwnerStoreAdminDashSection
          title={safeT("gift_owner_success_title")}
        >
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-gift-app-success={successId ?? ""}>
            <p className="font-semibold">
              {safeT("gift_owner_success_body")}
            </p>
            <p className="mt-2 text-sm text-sam-muted">
              {safeT("gift_owner_success_status")}
            </p>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <button type="button" className={`${Sam.btn.primary} min-h-[48px]`} onClick={() => go("applications")}>
              {safeT("gift_owner_cta_history")}
            </button>
            <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => go("home")}>
              {safeT("gift_owner_cta_home")}
            </button>
          </div>
        </OwnerStoreAdminDashSection>
      ) : null}

      {view === "applications" ? (
        <OwnerStoreAdminDashSection
          title={safeT("gift_owner_history_title")}
        >
          {apps.length === 0 ? (
            <p className="text-sm text-sam-muted">
              {safeT("gift_owner_empty_apps")}
            </p>
          ) : (
            <ul className="space-y-2">
              {apps.map((a) => (
                <li key={a.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-gift-app={a.id}>
                  <div className="flex gap-3">
                    {a.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.image_url} alt="" className="h-12 w-12 rounded-ui-rect object-cover" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{a.title}</p>
                      <p className="text-xs text-sam-muted">
                        {safeT("gift_owner_face_label")}{" "}
                        {Number(a.requested_face_value).toLocaleString()} · {statusLabel(a.status, safeT)}
                      </p>
                      {a.status === "rejected" && a.rejection_reason ? (
                        <p className="mt-1 text-sm text-sam-danger">{a.rejection_reason}</p>
                      ) : null}
                      {a.status === "rejected" ? (
                        <button
                          type="button"
                          className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} mt-2`}
                          onClick={() => {
                            setDraft({
                              title: a.title,
                              face: String(a.requested_face_value),
                              price:
                                a.requested_purchase_price != null
                                  ? String(a.requested_purchase_price)
                                  : "",
                              notes: a.design_notes ?? "",
                              imageUrl: a.image_url,
                              resubmitOf: a.id,
                            });
                            go("apply");
                          }}
                        >
                          {safeT("gift_owner_cta_resubmit")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} mt-4`} onClick={() => go("home")}>
            {safeT("gift_owner_cta_back")}
          </button>
        </OwnerStoreAdminDashSection>
      ) : null}
    </div>
  );
}

export function OwnerGiftCertificatesView() {
  return <OwnerGiftCertificatesInner />;
}
