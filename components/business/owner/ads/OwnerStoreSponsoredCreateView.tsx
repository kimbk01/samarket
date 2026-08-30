"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import {
  OWNER_STORE_PROFILE_CONTROL_CLASS,
  OWNER_STORE_PROFILE_FIELD_BLOCK_CLASS,
  OWNER_STORE_PROFILE_FIELD_EDGE_CLASS,
  OWNER_STORE_PROFILE_FIELD_LABEL_CLASS,
  OWNER_STORE_STACK_Y_CLASS,
} from "@/lib/business/owner-store-stack";
import {
  OWNER_STORE_ADMIN_FOOTER_ACTIONS_ROW_CLASS,
  OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS,
  OWNER_STORE_ADMIN_FOOTER_INNER_CLASS,
  OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS,
  ownerStoreAdminFooterFixedClass,
} from "@/lib/business/owner-admin-footer-actions";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import {
  OWNER_STORE_SPONSORED_INVENTORY_KEYS,
  isOwnerStoreSponsoredInventoryKey,
  ownerInventoryI18nKey,
  type OwnerStoreSponsoredInventoryKey,
} from "@/lib/stores/advertising/owner-store-sponsored-contract";
import type { OwnerSponsoredCampaignRow } from "@/lib/stores/advertising/owner-store-sponsored-writer";

type EligibleStore = {
  id: string;
  storeName: string;
  profileImageUrl: string | null;
  eligible: boolean;
  categoryLabel: string | null;
};

type Step = "store" | "setup" | "review" | "done";

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dateInputToStartIso(dateStr: string): string {
  return `${dateStr}T00:00:00.000Z`;
}

function dateInputToEndIso(dateStr: string): string {
  return `${dateStr}T23:59:59.999Z`;
}

export function OwnerStoreSponsoredCreateView() {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const formId = useId();
  const [step, setStep] = useState<Step>("store");
  const [stores, setStores] = useState<EligibleStore[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [storeId, setStoreId] = useState("");
  const [inventories, setInventories] = useState<OwnerStoreSponsoredInventoryKey[]>([]);
  const [startDate, setStartDate] = useState(() => toDateInputValue(new Date()));
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 7);
    return toDateInputValue(d);
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<OwnerSponsoredCampaignRow | null>(null);
  const [clientRequestId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `req_${Date.now()}`
  );
  const preloadCampaignId = searchParams.get("campaignId")?.trim() ?? "";
  const preloadStoreId = searchParams.get("storeId")?.trim() ?? "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/delivery-ads", { credentials: "include" });
        const json = (await res.json()) as { ok?: boolean; stores?: EligibleStore[] };
        if (cancelled) return;
        const list = (json.stores ?? []).filter((s) => s.eligible);
        setStores(list);
        if (preloadStoreId && list.some((s) => s.id === preloadStoreId)) {
          setStoreId(preloadStoreId);
        } else if (list.length === 1) {
          setStoreId(list[0]!.id);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preloadStoreId]);

  useEffect(() => {
    if (!preloadCampaignId || !preloadStoreId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/me/stores/${encodeURIComponent(preloadStoreId)}/delivery-ads/${encodeURIComponent(preloadCampaignId)}`,
          { credentials: "include" }
        );
        const json = (await res.json()) as {
          ok?: boolean;
          campaign?: OwnerSponsoredCampaignRow;
          meta?: { productKind?: string };
        };
        if (cancelled || !res.ok || !json.ok || !json.campaign) return;
        if (json.meta?.productKind === "banner") return;
        const row = json.campaign;
        if (row.lifecycleStatus !== "DRAFT" && row.lifecycleStatus !== "CHANGES_REQUESTED") {
          return;
        }
        setCampaign(row);
        setStoreId(row.storeId);
        setInventories(
          row.inventoryKeys.filter((k): k is OwnerStoreSponsoredInventoryKey =>
            isOwnerStoreSponsoredInventoryKey(k)
          )
        );
        setStartDate(row.startAt.slice(0, 10));
        setEndDate(row.endAt.slice(0, 10));
        setStep("setup");
      } catch {
        /* keep empty create */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preloadCampaignId, preloadStoreId]);

  const selectedStore = useMemo(
    () => stores.find((s) => s.id === storeId) ?? null,
    [stores, storeId]
  );

  const toggleInventory = (key: OwnerStoreSponsoredInventoryKey) => {
    setInventories((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const saveDraft = useCallback(async (): Promise<OwnerSponsoredCampaignRow | null> => {
    if (!storeId) {
      setError("store");
      return null;
    }
    if (!inventories.length) {
      setError("inventory");
      return null;
    }
    setBusy(true);
    setError(null);
    try {
      const path = campaign
        ? `/api/me/stores/${encodeURIComponent(storeId)}/delivery-ads/${encodeURIComponent(campaign.id)}`
        : `/api/me/stores/${encodeURIComponent(storeId)}/delivery-ads`;
      const method = campaign ? "PATCH" : "POST";
      const res = await fetch(path, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryKeys: inventories,
          startAt: dateInputToStartIso(startDate),
          endAt: dateInputToEndIso(endDate),
          clientRequestId: campaign ? undefined : clientRequestId,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        campaign?: OwnerSponsoredCampaignRow;
      };
      if (!res.ok || !json.ok || !json.campaign) {
        setError(json.error || "generic");
        return null;
      }
      setCampaign(json.campaign);
      return json.campaign;
    } catch {
      setError("generic");
      return null;
    } finally {
      setBusy(false);
    }
  }, [campaign, clientRequestId, endDate, inventories, startDate, storeId]);

  const submit = useCallback(async () => {
    const saved = await saveDraft();
    if (!saved) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/me/stores/${encodeURIComponent(saved.storeId)}/delivery-ads/${encodeURIComponent(saved.id)}/actions`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: saved.lifecycleStatus === "CHANGES_REQUESTED" ? "resubmit" : "submit",
          }),
        }
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        campaign?: OwnerSponsoredCampaignRow;
      };
      if (!res.ok || !json.ok || !json.campaign) {
        setError(json.error || "generic");
        return;
      }
      setCampaign(json.campaign);
      setStep("done");
    } catch {
      setError("generic");
    } finally {
      setBusy(false);
    }
  }, [saveDraft]);

  const errorText =
    error === "inventory"
      ? t("owner_ads_error_inventory")
      : error === "store"
        ? t("owner_ads_error_store")
        : error === "invalid_start_at" ||
            error === "invalid_end_at" ||
            error === "end_before_start" ||
            error === "start_in_past"
          ? t("owner_ads_error_dates")
          : error
            ? safeT("owner_ads_error_generic", {
                fallbackKo: "처리에 실패했습니다. 다시 시도해 주세요.",
                fallbackEn: "Something went wrong. Please try again.",
              })
            : null;

  const footerBottom = "calc(60px + var(--safe-bottom, 0px))";

  return (
    <div className={`${OWNER_STORE_STACK_Y_CLASS} px-4 pt-4`} style={{ paddingBottom: 88 }}>
      <h1 className="text-[18px] font-bold text-sam-fg">{t("owner_ads_product_store_sponsored")}</h1>
      <p className="mt-1 text-[12px] text-sam-muted">
        {step === "store"
          ? t("owner_ads_step_store")
          : step === "setup"
            ? t("owner_ads_step_setup")
            : step === "review"
              ? t("owner_ads_step_review")
              : t("owner_ads_step_done")}
      </p>

      {errorText ? (
        <p className="mt-3 text-[13px] text-red-600" role="alert">
          {errorText}
        </p>
      ) : null}

      {!loaded ? (
        <p className="mt-4 text-[13px] text-sam-muted">{t("owner_ads_loading")}</p>
      ) : step === "store" ? (
        <OwnerStoreAdminDashSection title={t("owner_ads_select_store")}>
          <p className="text-[13px] text-sam-muted">{t("owner_ads_select_store_hint")}</p>
          {stores.length === 0 ? (
            <p className="mt-3 text-[13px] text-sam-muted">{t("owner_ads_no_eligible_store")}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {stores.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setStoreId(s.id)}
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
                      {s.categoryLabel ? (
                        <p className="text-[12px] text-sam-muted">{s.categoryLabel}</p>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </OwnerStoreAdminDashSection>
      ) : null}

      {step === "setup" && selectedStore ? (
        <form id={formId} className="space-y-3" onSubmit={(e) => e.preventDefault()}>
          <OwnerStoreAdminDashSection title={t("owner_ads_store")}>
            <p className="text-[14px] font-semibold text-sam-fg">{selectedStore.storeName}</p>
            {selectedStore.categoryLabel ? (
              <p className="text-[12px] text-sam-muted">{selectedStore.categoryLabel}</p>
            ) : null}
          </OwnerStoreAdminDashSection>

          <OwnerStoreAdminDashSection title={t("owner_ads_inventory_title")}>
            <div className="space-y-2">
              {OWNER_STORE_SPONSORED_INVENTORY_KEYS.map((key) => (
                <label
                  key={key}
                  className="flex min-h-[44px] items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-app px-3"
                >
                  <input
                    type="checkbox"
                    checked={inventories.includes(key)}
                    onChange={() => toggleInventory(key)}
                    className="h-4 w-4"
                  />
                  <span className="text-[14px] text-sam-fg">{t(ownerInventoryI18nKey(key))}</span>
                </label>
              ))}
            </div>
          </OwnerStoreAdminDashSection>

          <OwnerStoreAdminDashSection title={t("owner_ads_schedule_title")}>
            <div className={OWNER_STORE_PROFILE_FIELD_BLOCK_CLASS}>
              <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS} htmlFor="owner-ads-start">
                {t("owner_ads_start_date")}
              </label>
              <input
                id="owner-ads-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={`${OWNER_STORE_PROFILE_CONTROL_CLASS} ${OWNER_STORE_PROFILE_FIELD_EDGE_CLASS}`}
              />
            </div>
            <div className={OWNER_STORE_PROFILE_FIELD_BLOCK_CLASS}>
              <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS} htmlFor="owner-ads-end">
                {t("owner_ads_end_date")}
              </label>
              <input
                id="owner-ads-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={`${OWNER_STORE_PROFILE_CONTROL_CLASS} ${OWNER_STORE_PROFILE_FIELD_EDGE_CLASS}`}
              />
            </div>
          </OwnerStoreAdminDashSection>
        </form>
      ) : null}

      {step === "review" && selectedStore ? (
        <OwnerStoreAdminDashSection title={t("owner_ads_review_title")}>
          <dl className="space-y-2 text-[13px]">
            <div>
              <dt className="text-sam-muted">{t("owner_ads_store")}</dt>
              <dd className="font-medium text-sam-fg">{selectedStore.storeName}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("owner_ads_type")}</dt>
              <dd className="font-medium text-sam-fg">{t("owner_ads_product_store_sponsored")}</dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("owner_ads_inventory_title")}</dt>
              <dd className="font-medium text-sam-fg">
                {inventories.map((k) => t(ownerInventoryI18nKey(k))).join(" · ")}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("owner_ads_period")}</dt>
              <dd className="font-medium text-sam-fg">
                {startDate} ~ {endDate}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("owner_ads_review_pricing")}</dt>
              <dd className="font-medium text-sam-fg">{t("owner_ads_pricing_not_configured")}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[12px] text-sam-muted">{t("owner_ads_review_admin_note")}</p>
        </OwnerStoreAdminDashSection>
      ) : null}

      {step === "done" && campaign ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-5 text-center">
          <p className="text-[16px] font-bold text-sam-fg">{t("owner_ads_success_title")}</p>
          <p className="mt-2 text-[13px] text-sam-muted">{t("owner_ads_success_body")}</p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              className={OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS}
              onClick={() =>
                router.push(
                  `${DELIVERY_AD_OWNER_ROUTES.detail(campaign.id)}?storeId=${encodeURIComponent(campaign.storeId)}`
                )
              }
            >
              {t("owner_ads_view_detail")}
            </button>
            <button
              type="button"
              className={OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS}
              onClick={() => router.push(DELIVERY_AD_OWNER_ROUTES.hub)}
            >
              {t("owner_ads_back_hub")}
            </button>
          </div>
        </div>
      ) : null}

      {step !== "done" ? (
        <BodyPortal>
          <footer
            className={ownerStoreAdminFooterFixedClass({ aboveBottomNav: true })}
            style={{ bottom: footerBottom }}
          >
            <div className={OWNER_STORE_ADMIN_FOOTER_INNER_CLASS}>
              <div className={OWNER_STORE_ADMIN_FOOTER_ACTIONS_ROW_CLASS}>
                <button
                  type="button"
                  className={OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS}
                  disabled={busy}
                  onClick={() => {
                    if (step === "store") router.push(DELIVERY_AD_OWNER_ROUTES.hub);
                    else if (step === "setup") setStep("store");
                    else setStep("setup");
                  }}
                >
                  {step === "store" ? t("owner_ads_cancel") : t("owner_ads_back")}
                </button>
                <button
                  type="button"
                  className={OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS}
                  disabled={busy || (step === "store" && !storeId)}
                  onClick={() => {
                    if (step === "store") setStep("setup");
                    else if (step === "setup") {
                      void (async () => {
                        const saved = await saveDraft();
                        if (saved) setStep("review");
                      })();
                    } else {
                      void submit();
                    }
                  }}
                >
                  {busy
                    ? step === "review"
                      ? t("owner_ads_submitting")
                      : t("owner_ads_saving")
                    : step === "review"
                      ? t("owner_ads_submit_cta")
                      : step === "setup"
                        ? t("owner_ads_next")
                        : t("owner_ads_next")}
                </button>
              </div>
            </div>
          </footer>
        </BodyPortal>
      ) : null}
    </div>
  );
}
