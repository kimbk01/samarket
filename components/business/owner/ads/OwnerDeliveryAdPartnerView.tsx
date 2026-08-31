"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { useOwnerAdminBottomSheetKeyboard } from "@/lib/business/use-owner-admin-bottom-sheet-keyboard";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { DeliveryAdOwnerPartnerStepProgress } from "@/components/stores/advertising/DeliveryAdOwnerPartnerStepProgress";
import { DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS } from "@/lib/stores/advertising/delivery-ad-owner-ui-presentation";

type PartnerPayload = {
  ok?: boolean;
  error?: string;
  payment?: { status: string };
  config?: {
    enabled: boolean;
    acceptingNewMembers: boolean;
    monthlyFeeMinor: number | null;
    monthlyFeeLabel: string | null;
    advertisingDiscountPercent: number;
  } | null;
  membership?: {
    id: string;
    status: string;
    statusLabel: string;
    periodStart: string | null;
    periodEnd: string | null;
    feeSnapshotLabel: string | null;
    advertisingDiscountPercentSnapshot: number;
  } | null;
  canApply?: boolean;
  canRequestCancel?: boolean;
};

type HubStore = {
  id: string;
  storeName: string;
  profileImageUrl: string | null;
};

export function OwnerDeliveryAdPartnerView() {
  const { t, safeT } = useI18n();
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get("storeId")?.trim() || "";
  const [stores, setStores] = useState<HubStore[]>([]);
  const [storeId, setStoreId] = useState(storeIdParam);
  const [storeSheetOpen, setStoreSheetOpen] = useState(false);
  const { contentPaddingBottomPx } = useOwnerAdminBottomSheetKeyboard(storeSheetOpen);
  const [data, setData] = useState<PartnerPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStores = useCallback(async () => {
    const res = await fetch("/api/me/delivery-ads", { credentials: "include" });
    const json = (await res.json()) as {
      ok?: boolean;
      stores?: Array<{ id: string; storeName: string; profileImageUrl?: string | null }>;
    };
    if (res.ok && json.ok) {
      const list = (json.stores ?? []).map((s) => ({
        id: s.id,
        storeName: s.storeName,
        profileImageUrl: s.profileImageUrl ?? null,
      }));
      setStores(list);
      if (!storeId && list[0]) setStoreId(list[0].id);
      else if (storeIdParam && list.some((s) => s.id === storeIdParam)) {
        setStoreId(storeIdParam);
      }
    }
  }, [storeId, storeIdParam]);

  const load = useCallback(async (sid: string) => {
    if (!sid) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/me/delivery-ads/partner?storeId=${encodeURIComponent(sid)}`,
        { credentials: "include" }
      );
      const json = (await res.json()) as PartnerPayload;
      if (!res.ok || !json.ok) {
        setError(json.error ?? "load_failed");
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setError("network");
    }
  }, []);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  useEffect(() => {
    if (storeId) void load(storeId);
  }, [storeId, load]);

  const selectedStore = useMemo(
    () => stores.find((s) => s.id === storeId) ?? null,
    [stores, storeId]
  );

  const statusCopy = useMemo(() => {
    const st = data?.membership?.status;
    if (!st) return null;
    if (st === "PENDING_REVIEW") return t("owner_ads_partner_status_pending");
    if (st === "ACTIVE") return t("owner_ads_partner_status_active");
    if (st === "CANCEL_PENDING") return t("owner_ads_partner_status_cancel_pending");
    if (st === "ENDED") return t("owner_ads_partner_status_ended");
    return data?.membership?.statusLabel ?? st;
  }, [data, t]);

  const run = async (op: "apply" | "cancel_request") => {
    if (!storeId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/delivery-ads/partner", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op,
          storeId,
          membershipId: data?.membership?.id,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "action_failed");
        return;
      }
      await load(storeId);
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  };

  const activePartnerStep = useMemo((): 1 | 2 | 3 | 4 => {
    const st = data?.membership?.status;
    if (st === "ACTIVE") return 4;
    if (st === "PENDING_REVIEW" || st === "CANCEL_PENDING") return 3;
    if (data?.canApply) return 2;
    return 1;
  }, [data]);

  const discountPercent =
    data?.membership?.advertisingDiscountPercentSnapshot ??
    data?.config?.advertisingDiscountPercent ??
    0;

  return (
    <div
      className={`${OWNER_STORE_STACK_Y_CLASS} mx-auto w-full max-w-[min(100%,42rem)] md:max-w-[min(100%,52rem)] px-4 pb-8 pt-4`}
      data-owner-ads-partner="design-board"
    >
      <DeliveryAdOwnerPartnerStepProgress activeStep={activePartnerStep} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[18px] font-bold text-sam-fg">{t("owner_ads_partner_title")}</h1>
          <p className="mt-1 text-[13px] text-sam-muted">{t("owner_ads_partner_desc")}</p>
        </div>
        <Link
          href={DELIVERY_AD_OWNER_ROUTES.hub}
          className="shrink-0 text-[13px] font-medium text-signature"
        >
          {t("owner_ads_partner_back")}
        </Link>
      </div>

      {stores.length > 0 ? (
        <button
          type="button"
          className="mt-3 flex w-full items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-app p-3 text-left"
          onClick={() => stores.length > 1 && setStoreSheetOpen(true)}
          data-owner-ads-store-trigger="1"
          disabled={stores.length <= 1}
        >
          {selectedStore?.profileImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selectedStore.profileImageUrl}
              alt=""
              className="h-12 w-12 rounded-ui-rect object-cover"
            />
          ) : (
            <div className="h-12 w-12 rounded-ui-rect bg-sam-surface" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-sam-fg">
              {selectedStore?.storeName ?? t("owner_ads_select_store_hint")}
            </p>
          </div>
          {stores.length > 1 ? (
            <span className="shrink-0 text-[12px] font-medium text-signature">
              {t("owner_ads_change_store")}
            </span>
          ) : null}
        </button>
      ) : null}

      <section
        className="mt-3 rounded-ui-rect border border-[#0A823E]/30 bg-[#0A823E]/5 p-4"
        data-owner-ads-partner-benefits="1"
      >
        <p className="text-[15px] font-bold text-sam-fg">{t("owner_ads_partner_benefits_title")}</p>
        <ul className="mt-2 space-y-1.5 text-[13px] text-sam-fg">
          <li>
            · {t("owner_ads_partner_discount_label")}: {discountPercent}%
          </li>
          {data?.config?.monthlyFeeLabel ? (
            <li>
              · {t("owner_ads_partner_fee_label")}: {data.config.monthlyFeeLabel}
            </li>
          ) : null}
          <li>· {t("owner_ads_partner_desc")}</li>
        </ul>
      </section>

      {error ? (
        <p className="mt-3 text-[13px] text-red-600" role="alert">
          {safeT("owner_ads_error_generic", {
            fallbackKo: "처리에 실패했습니다. 다시 시도해 주세요.",
            fallbackEn: "Something went wrong. Please try again.",
          })}{" "}
          ({error})
        </p>
      ) : null}

      {!data ? (
        <p className="mt-3 text-[13px] text-sam-muted">{t("owner_ads_loading")}</p>
      ) : (
        <div className="mt-3 space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <div>
            <p className="text-[12px] text-sam-muted">{t("owner_ads_partner_status_label")}</p>
            <p className="mt-0.5 text-[15px] font-semibold text-sam-fg">
              {statusCopy ?? t("owner_ads_partner_status_none")}
            </p>
          </div>

          {data.membership?.periodEnd ? (
            <p className="text-[12px] text-sam-muted">
              {t("owner_ads_partner_period_label")}
              {": "}
              {(data.membership.periodStart ?? "").slice(0, 10)} ~{" "}
              {data.membership.periodEnd.slice(0, 10)}
            </p>
          ) : null}

          <p
            className="rounded-ui-rect bg-sam-app px-3 py-2 text-[12px] text-sam-muted"
            data-partner-payment="NOT_IMPLEMENTED"
          >
            {t("owner_ads_partner_payment_note")}
          </p>

          {data.canApply ? (
            <button
              type="button"
              disabled={busy}
              className={`${DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS} min-h-[44px] w-full text-[14px] font-semibold`}
              data-owner-partner-apply="1"
              onClick={() => void run("apply")}
            >
              {t("owner_ads_partner_apply_cta")}
            </button>
          ) : null}

          {data.canRequestCancel ? (
            <button
              type="button"
              disabled={busy}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-ui-rect border border-[#BDBDBD] bg-white px-4 text-[14px] font-semibold text-sam-fg"
              data-owner-partner-cancel="1"
              onClick={() => void run("cancel_request")}
            >
              {t("owner_ads_partner_cancel_cta")}
            </button>
          ) : null}
        </div>
      )}

      <DibayBottomSheet
        open={storeSheetOpen}
        onClose={() => setStoreSheetOpen(false)}
        title={t("owner_ads_select_store")}
        anchor="above-bottom-nav"
        ariaLabel={t("owner_ads_select_store")}
        panelClassName="!max-w-md"
        contentPaddingBottomPx={contentPaddingBottomPx}
      >
        <ul className="mt-3 space-y-2">
          {stores.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  setStoreId(s.id);
                  setStoreSheetOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-ui-rect border p-3 text-left ${
                  storeId === s.id
                    ? "border-signature bg-sam-app"
                    : "border-sam-border bg-sam-surface"
                }`}
              >
                {s.profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.profileImageUrl}
                    alt=""
                    className="h-12 w-12 rounded-ui-rect object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-ui-rect bg-sam-app" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-sam-fg">{s.storeName}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </DibayBottomSheet>
    </div>
  );
}
