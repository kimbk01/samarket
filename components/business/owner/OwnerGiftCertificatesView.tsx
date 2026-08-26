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
import { Sam } from "@/lib/ui/css-vars";
import { OwnerGiftMoneyOpsPanel } from "@/components/business/owner/OwnerGiftMoneyOpsPanel";
import {
  aggregateOwnerRedemptionKpis,
  conversionPendingAmount,
  type OwnerGiftConversionRow,
  type OwnerGiftRedemptionRow,
} from "@/lib/gift-certificate/owner-gift-money-ops";
import { formatMoneyPhp } from "@/lib/utils/format";

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
      return safeT("gift_owner_status_submitted", {
        fallbackKo: "심사 대기",
        fallbackEn: "Awaiting review",
      });
    case "under_review":
      return safeT("gift_owner_status_under_review", {
        fallbackKo: "검토 중",
        fallbackEn: "Under review",
      });
    case "approved":
      return safeT("gift_owner_status_approved", {
        fallbackKo: "승인",
        fallbackEn: "Approved",
      });
    case "rejected":
      return safeT("gift_owner_status_rejected", {
        fallbackKo: "반려",
        fallbackEn: "Rejected",
      });
    case "suspended":
      return safeT("gift_owner_status_suspended", {
        fallbackKo: "판매 중지",
        fallbackEn: "Suspended",
      });
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
    | "history"
    | "money"
    | "redemptions"
    | "convert"
    | "convert-success"
    | "convert-history";
  const [resolvedStoreId, setResolvedStoreId] = useState(storeIdQ);
  const [apps, setApps] = useState<GiftApp[]>([]);
  const [products, setProducts] = useState<GiftProduct[]>([]);
  const [availableRevenue, setAvailableRevenue] = useState(0);
  const [storeCashBalance, setStoreCashBalance] = useState(0);
  const [outstandingBalance, setOutstandingBalance] = useState(0);
  const [redemptions, setRedemptions] = useState<OwnerGiftRedemptionRow[]>([]);
  const [conversions, setConversions] = useState<OwnerGiftConversionRow[]>([]);
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
      const id = j?.ok && j.stores?.[0]?.id ? String(j.stores[0].id) : "";
      setResolvedStoreId(id);
    })();
  }, [storeIdQ]);

  const load = useCallback(async () => {
    const sid = resolvedStoreId.trim();
    if (!sid) return;
    setLoaded(false);
    const [aRes, pRes, rRes, redRes, cRes] = await Promise.all([
      fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/applications`, {
        credentials: "include",
        cache: "no-store",
      }),
      fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/products`, {
        credentials: "include",
        cache: "no-store",
      }),
      fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/revenue`, {
        credentials: "include",
        cache: "no-store",
      }),
      fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/redemptions`, {
        credentials: "include",
        cache: "no-store",
      }),
      fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/conversions`, {
        credentials: "include",
        cache: "no-store",
      }),
    ]);
    const aJson = (await aRes.json()) as { ok?: boolean; applications?: GiftApp[] };
    const pJson = (await pRes.json()) as { ok?: boolean; products?: GiftProduct[] };
    const rJson = (await rRes.json()) as {
      ok?: boolean;
      availableRevenue?: number;
      storeCashBalance?: number;
      outstandingBalance?: number;
    };
    const redJson = (await redRes.json()) as { ok?: boolean; redemptions?: OwnerGiftRedemptionRow[] };
    const cJson = (await cRes.json()) as { ok?: boolean; conversions?: Record<string, unknown>[] };
    setApps(aJson.ok ? aJson.applications ?? [] : []);
    setProducts(pJson.ok ? pJson.products ?? [] : []);
    setAvailableRevenue(rJson.ok ? Math.trunc(Number(rJson.availableRevenue) || 0) : 0);
    setStoreCashBalance(rJson.ok ? Math.trunc(Number(rJson.storeCashBalance) || 0) : 0);
    setOutstandingBalance(rJson.ok ? Math.trunc(Number(rJson.outstandingBalance) || 0) : 0);
    setRedemptions(redJson.ok ? redJson.redemptions ?? [] : []);
    setConversions(
      cJson.ok
        ? (cJson.conversions ?? []).map((raw) => ({
            id: String(raw.id),
            amount: Math.trunc(Number(raw.amount) || 0),
            status: String(raw.status ?? ""),
            createdAt: String(raw.created_at ?? ""),
            approvedAt: raw.approved_at == null ? null : String(raw.approved_at),
          }))
        : []
    );
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
  const redeemKpis = useMemo(() => aggregateOwnerRedemptionKpis(redemptions), [redemptions]);
  const pendingConvAmt = useMemo(() => conversionPendingAmount(conversions), [conversions]);
  const soldFaceValue = useMemo(
    () =>
      products.reduce((s, p) => {
        const issued = Math.max(0, Math.trunc(Number(p.issued_count) || 0));
        return s + issued * Math.max(0, Math.trunc(Number(p.face_value) || 0));
      }, 0),
    [products]
  );
  const soldCount = useMemo(
    () => products.reduce((s, p) => s + Math.max(0, Math.trunc(Number(p.issued_count) || 0)), 0),
    [products]
  );

  const moneyViews = new Set([
    "money",
    "redemptions",
    "convert",
    "convert-success",
    "convert-history",
  ]);
  if (moneyViews.has(view) && resolvedStoreId.trim()) {
    return (
      <div className={`${OWNER_STORE_STACK_Y_CLASS} pb-8`} data-owner-gift-certificates="1" data-view={view}>
        <OwnerGiftMoneyOpsPanel
          storeId={resolvedStoreId.trim()}
          view={view as "money" | "redemptions" | "convert" | "convert-success" | "convert-history"}
          onGo={(next, extra) => go(next, extra)}
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
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/upload-image`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !json.ok || !json.url) {
        setError(
          safeT("gift_owner_upload_fail", {
            fallbackKo: "이미지를 올리지 못했습니다.",
            fallbackEn: "Image upload failed.",
          })
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
          safeT("gift_owner_submit_fail", {
            fallbackKo: "신청을 제출하지 못했습니다. 다시 시도해 주세요.",
            fallbackEn: "Could not submit application. Please try again.",
          })
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
            title={safeT("gift_owner_home_title", {
              fallbackKo: "상품권 판매 상태",
              fallbackEn: "Gift certificate sales",
            })}
          >
            {!loaded ? (
              <p className="text-sm text-sam-muted">…</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                  <p className="text-xs text-sam-muted">
                    {safeT("gift_owner_kpi_selling", {
                      fallbackKo: "판매 중",
                      fallbackEn: "On sale",
                    })}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{activeProducts.length}</p>
                </div>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                  <p className="text-xs text-sam-muted">
                    {safeT("gift_owner_kpi_pending", {
                      fallbackKo: "신청 심사 중",
                      fallbackEn: "In review",
                    })}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{pendingCount}</p>
                </div>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-owner-gift-kpi="sold-count">
                  <p className="text-xs text-sam-muted">
                    {safeT("gift_u5_kpi_sold_count", {
                      fallbackKo: "판매된 상품권 수량",
                      fallbackEn: "Gifts sold",
                    })}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{soldCount}</p>
                </div>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-owner-gift-kpi="sold-face">
                  <p className="text-xs text-sam-muted">
                    {safeT("gift_u5_kpi_sold_face", {
                      fallbackKo: "판매 Face Value",
                      fallbackEn: "Sold face value",
                    })}
                  </p>
                  <p className="mt-1 text-base font-semibold tabular-nums break-words">
                    {formatMoneyPhp(soldFaceValue)}
                  </p>
                </div>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-owner-gift-kpi="outstanding">
                  <p className="text-xs text-sam-muted">
                    {safeT("gift_u5_kpi_outstanding", {
                      fallbackKo: "미사용 상품권 잔액",
                      fallbackEn: "Unused gift balance",
                    })}
                  </p>
                  <p className="mt-1 text-base font-semibold tabular-nums break-words">
                    {formatMoneyPhp(outstandingBalance)}
                  </p>
                </div>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-owner-gift-kpi="redeemed">
                  <p className="text-xs text-sam-muted">
                    {safeT("gift_u5_kpi_redeemed", {
                      fallbackKo: "사용된 상품권 금액",
                      fallbackEn: "Redeemed gift amount",
                    })}
                  </p>
                  <p className="mt-1 text-base font-semibold tabular-nums break-words">
                    {formatMoneyPhp(redeemKpis.redeemedGross)}
                  </p>
                </div>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-owner-gift-kpi="merchant-net">
                  <p className="text-xs text-sam-muted">
                    {safeT("gift_u5_kpi_merchant_net", {
                      fallbackKo: "확정 상품권 수익",
                      fallbackEn: "Recognized gift revenue",
                    })}
                  </p>
                  <p className="mt-1 text-base font-semibold tabular-nums break-words">
                    {formatMoneyPhp(redeemKpis.recognizedMerchantNet)}
                  </p>
                </div>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-owner-gift-kpi="pending-merchant">
                  <p className="text-xs text-sam-muted">
                    {safeT("gift_u5_kpi_pending_merchant", {
                      fallbackKo: "수익 확정 대기",
                      fallbackEn: "Revenue pending recognition",
                    })}
                  </p>
                  <p className="mt-1 text-base font-semibold tabular-nums break-words">
                    {formatMoneyPhp(redeemKpis.pendingMerchantNet)}
                  </p>
                </div>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-owner-gift-kpi="available">
                  <p className="text-xs text-sam-muted">
                    {safeT("gift_owner_kpi_revenue", {
                      fallbackKo: "전환 가능 수익",
                      fallbackEn: "Available gift revenue",
                    })}
                  </p>
                  <p className="mt-1 text-base font-semibold tabular-nums break-words">
                    {formatMoneyPhp(availableRevenue)}
                  </p>
                </div>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-owner-gift-kpi="cash-pending">
                  <p className="text-xs text-sam-muted">
                    {safeT("gift_u5_kpi_cash_pending", {
                      fallbackKo: "Cash 전환 대기",
                      fallbackEn: "Cash conversion pending",
                    })}
                  </p>
                  <p className="mt-1 text-base font-semibold tabular-nums break-words">
                    {formatMoneyPhp(pendingConvAmt)}
                  </p>
                </div>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-owner-gift-kpi="store-cash">
                  <p className="text-xs text-sam-muted">
                    {safeT("gift_u5_kpi_store_cash", {
                      fallbackKo: "매장 Cash",
                      fallbackEn: "Store Cash",
                    })}
                  </p>
                  <p className="mt-1 text-base font-semibold tabular-nums break-words">
                    {formatMoneyPhp(storeCashBalance)}
                  </p>
                </div>
              </div>
            )}
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                className={`${Sam.btn.primary} min-h-[48px] w-full`}
                onClick={() => {
                  setDraft(emptyDraft());
                  go("apply");
                }}
              >
                {safeT("gift_owner_cta_apply", {
                  fallbackKo: "상품권 판매 신청",
                  fallbackEn: "Apply to sell gift certificates",
                })}
              </button>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => go("history")}>
                  {safeT("gift_owner_cta_history", {
                    fallbackKo: "신청 내역",
                    fallbackEn: "Applications",
                  })}
                </button>
                <button
                  type="button"
                  className={OWNER_ADMIN_OUTLINE_BTN_CLASS}
                  onClick={() => go("history")}
                >
                  {safeT("gift_owner_cta_products", {
                    fallbackKo: "판매 상품권 보기",
                    fallbackEn: "View products",
                  })}
                </button>
                <button
                  type="button"
                  className={OWNER_ADMIN_OUTLINE_BTN_CLASS}
                  onClick={() => go("money")}
                  data-owner-gift-money-cta="1"
                >
                  {safeT("gift_u5_cta_money", {
                    fallbackKo: "상품권 수익·Cash",
                    fallbackEn: "Gift revenue & cash",
                  })}
                </button>
                <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => go("redemptions")}>
                  {safeT("gift_u5_cta_redemptions", {
                    fallbackKo: "사용 내역",
                    fallbackEn: "Redemption history",
                  })}
                </button>
              </div>
            </div>
          </OwnerStoreAdminDashSection>

          <OwnerStoreAdminDashSection
            title={safeT("gift_owner_selling_list", {
              fallbackKo: "판매 중인 상품권",
              fallbackEn: "Products on sale",
            })}
          >
            {activeProducts.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-sam-muted">
                  {safeT("gift_owner_empty_products", {
                    fallbackKo: "판매 중인 상품권이 없습니다.",
                    fallbackEn: "No gift products on sale.",
                  })}
                </p>
                <button type="button" className={OWNER_ADMIN_PRIMARY_BTN_CLASS} onClick={() => go("apply")}>
                  {safeT("gift_owner_cta_apply", {
                    fallbackKo: "상품권 판매 신청",
                    fallbackEn: "Apply to sell gift certificates",
                  })}
                </button>
              </div>
            ) : (
              <ul className="space-y-2">
                {activeProducts.map((p) => (
                  <li
                    key={p.id}
                    className="flex gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3"
                    data-gift-product={p.id}
                  >
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image_url} alt="" className="h-14 w-14 rounded-ui-rect object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-ui-rect bg-sam-app text-xs text-sam-muted">
                        Gift
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{p.title}</p>
                      <p className="text-xs text-sam-muted">
                        {p.purchase_price.toLocaleString()} → {p.face_value.toLocaleString()}
                      </p>
                    </div>
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
              ? safeT("gift_owner_confirm_title", {
                  fallbackKo: "신청 내용 확인",
                  fallbackEn: "Confirm application",
                })
              : safeT("gift_owner_apply_title", {
                  fallbackKo: "상품권 판매 신청",
                  fallbackEn: "Gift sale application",
                })
          }
        >
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
          {view === "apply" ? (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-sam-muted">
                  {safeT("gift_owner_field_title", {
                    fallbackKo: "상품권 이름",
                    fallbackEn: "Gift title",
                  })}
                </span>
                <input
                  className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-sam-muted">
                  {safeT("gift_owner_field_face", {
                    fallbackKo: "희망 Face Value",
                    fallbackEn: "Requested face value",
                  })}
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
                  {safeT("gift_owner_field_price", {
                    fallbackKo: "희망 판매가 (Point)",
                    fallbackEn: "Requested purchase price (Points)",
                  })}
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
                  {safeT("gift_owner_field_notes", {
                    fallbackKo: "설명·사용 조건·메모",
                    fallbackEn: "Description, terms, notes",
                  })}
                </span>
                <textarea
                  className="min-h-[96px] w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                />
              </label>
              <div>
                <p className="mb-1 text-sm text-sam-muted">
                  {safeT("gift_owner_field_image", {
                    fallbackKo: "디자인 / 이미지",
                    fallbackEn: "Artwork / image",
                  })}
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
                {safeT("gift_owner_cta_review", {
                  fallbackKo: "신청 내용 확인",
                  fallbackEn: "Review application",
                })}
              </button>
              <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => go("home")}>
                {safeT("gift_owner_cta_back", { fallbackKo: "돌아가기", fallbackEn: "Back" })}
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
                  : safeT("gift_owner_cta_submit_confirm", {
                      fallbackKo: "이 내용으로 신청",
                      fallbackEn: "Submit this application",
                    })}
              </button>
              <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => go("apply")}>
                {safeT("gift_owner_cta_edit", { fallbackKo: "수정하기", fallbackEn: "Edit" })}
              </button>
            </div>
          )}
        </OwnerStoreAdminDashSection>
      ) : null}

      {view === "success" ? (
        <OwnerStoreAdminDashSection
          title={safeT("gift_owner_success_title", {
            fallbackKo: "신청 완료",
            fallbackEn: "Application submitted",
          })}
        >
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-gift-app-success={successId ?? ""}>
            <p className="font-semibold">
              {safeT("gift_owner_success_body", {
                fallbackKo: "상품권 판매 신청이 접수되었습니다.",
                fallbackEn: "Your gift sale application was received.",
              })}
            </p>
            <p className="mt-2 text-sm text-sam-muted">
              {safeT("gift_owner_success_status", {
                fallbackKo: "상태: 심사 대기",
                fallbackEn: "Status: awaiting review",
              })}
            </p>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <button type="button" className={`${Sam.btn.primary} min-h-[48px]`} onClick={() => go("history")}>
              {safeT("gift_owner_cta_history", {
                fallbackKo: "신청 내역 보기",
                fallbackEn: "View applications",
              })}
            </button>
            <button type="button" className={OWNER_ADMIN_OUTLINE_BTN_CLASS} onClick={() => go("home")}>
              {safeT("gift_owner_cta_home", {
                fallbackKo: "상품권 홈으로",
                fallbackEn: "Gift home",
              })}
            </button>
          </div>
        </OwnerStoreAdminDashSection>
      ) : null}

      {view === "history" ? (
        <OwnerStoreAdminDashSection
          title={safeT("gift_owner_history_title", {
            fallbackKo: "신청 내역",
            fallbackEn: "Application history",
          })}
        >
          {apps.length === 0 ? (
            <p className="text-sm text-sam-muted">
              {safeT("gift_owner_empty_apps", {
                fallbackKo: "신청 내역이 없습니다.",
                fallbackEn: "No applications yet.",
              })}
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
                        {safeT("gift_owner_face_label", { fallbackKo: "액면", fallbackEn: "Face" })}{" "}
                        {Number(a.requested_face_value).toLocaleString()} · {statusLabel(a.status, safeT)}
                      </p>
                      {a.status === "rejected" && a.rejection_reason ? (
                        <p className="mt-1 text-sm text-red-600">{a.rejection_reason}</p>
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
                          {safeT("gift_owner_cta_resubmit", {
                            fallbackKo: "내용 수정 후 다시 신청",
                            fallbackEn: "Edit and re-apply",
                          })}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} mt-4`} onClick={() => go("home")}>
            {safeT("gift_owner_cta_back", { fallbackKo: "돌아가기", fallbackEn: "Back" })}
          </button>
        </OwnerStoreAdminDashSection>
      ) : null}
    </div>
  );
}

export function OwnerGiftCertificatesView() {
  return <OwnerGiftCertificatesInner />;
}
