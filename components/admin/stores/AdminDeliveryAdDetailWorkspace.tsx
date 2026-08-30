"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminCard } from "@/components/admin/AdminCard";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliveryAdCampaignPlacementPreviews } from "@/components/stores/advertising/DeliveryAdCampaignPlacementPreviews";
import {
  adminActionAllowed,
  adminActionRequiresReason,
  type AdminDeliveryAdAction,
  type AdminDeliveryAdProduct,
} from "@/lib/stores/advertising/admin-delivery-ad-contract";
import type {
  AdminDeliveryAdAuditRow,
  AdminDeliveryAdListItem,
} from "@/lib/stores/advertising/admin-delivery-ad-loader";
import {
  deliveryAdPlacementI18nKey,
  deliveryAdPolicyScreenHref,
} from "@/lib/stores/advertising/delivery-ad-placement-language";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  OWNER_BANNER_INVENTORY_KEYS,
  type OwnerBannerInventoryKey,
} from "@/lib/stores/advertising/owner-banner-contract";
import { DeliveryAdPerformancePanel } from "@/components/stores/advertising/DeliveryAdPerformancePanel";
import type {
  DeliveryAdAnalyticsDateRange,
  DeliveryAdPerformancePayload,
} from "@/lib/stores/advertising/analytics/delivery-ad-analytics-contract";
import type { DeliveryAdPlacementPreviewPayload } from "@/lib/stores/advertising/load-delivery-ad-placement-preview-bundle";

const ACTIONS: AdminDeliveryAdAction[] = [
  "start_review",
  "request_changes",
  "approve",
  "reject",
  "pause",
  "resume",
  "end",
  "terminate",
  "archive",
  "delete_safe_draft",
];

type Props = {
  campaignId: string;
  productHint: AdminDeliveryAdProduct | null;
};

export function AdminDeliveryAdDetailWorkspace({ campaignId, productHint }: Props) {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<AdminDeliveryAdListItem | null>(null);
  const [audits, setAudits] = useState<AdminDeliveryAdAuditRow[]>([]);
  const [creative, setCreative] = useState<{
    id: string;
    assetPath: string;
    headline: string | null;
    subcopy: string | null;
    version: number;
    ctaLabel: string | null;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [confirmAction, setConfirmAction] = useState<AdminDeliveryAdAction | null>(null);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [editInventoryKey, setEditInventoryKey] = useState<OwnerBannerInventoryKey>("STORES_HOME_HERO");
  const [perfRange, setPerfRange] = useState<DeliveryAdAnalyticsDateRange>("last_30d");
  const [performance, setPerformance] = useState<DeliveryAdPerformancePayload | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [placementPreview, setPlacementPreview] =
    useState<DeliveryAdPlacementPreviewPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = productHint ? `?product=${productHint}` : "";
      const res = await fetch(`/api/admin/delivery-ads/${encodeURIComponent(campaignId)}${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        campaign?: AdminDeliveryAdListItem;
        audits?: AdminDeliveryAdAuditRow[];
        creative?: typeof creative;
        placementPreview?: DeliveryAdPlacementPreviewPayload | null;
      };
      if (!res.ok || !json.ok || !json.campaign) {
        setError(json.error || "load_failed");
        setCampaign(null);
        return;
      }
      setCampaign(json.campaign);
      setAudits(json.audits ?? []);
      setCreative(json.creative ?? null);
      setPlacementPreview(json.placementPreview ?? null);
      setStartAt(json.campaign.startAt.slice(0, 16));
      setEndAt(json.campaign.endAt.slice(0, 16));
      const inv0 = json.campaign.inventoryKeys[0];
      if (
        inv0 &&
        (OWNER_BANNER_INVENTORY_KEYS as readonly string[]).includes(inv0)
      ) {
        setEditInventoryKey(inv0 as OwnerBannerInventoryKey);
      } else {
        setEditInventoryKey("STORES_HOME_HERO");
      }
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, [campaignId, productHint]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!campaign) return;
    let cancelled = false;
    setPerfLoading(true);
    const qs = new URLSearchParams({
      range: perfRange,
      productKind: campaign.productKind,
    });
    void fetch(
      `/api/admin/delivery-ads/${encodeURIComponent(campaignId)}/performance?${qs.toString()}`,
      { credentials: "include", cache: "no-store" }
    )
      .then(async (res) => {
        const json = (await res.json()) as {
          ok?: boolean;
          performance?: DeliveryAdPerformancePayload;
        };
        if (cancelled) return;
        if (res.ok && json.ok && json.performance) setPerformance(json.performance);
        else setPerformance(null);
      })
      .catch(() => {
        if (!cancelled) setPerformance(null);
      })
      .finally(() => {
        if (!cancelled) setPerfLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaign, campaignId, perfRange]);

  const allowedActions = useMemo(() => {
    if (!campaign) return [];
    return ACTIONS.filter((a) =>
      adminActionAllowed(a, campaign.lifecycleStatus as DeliveryAdLifecycleStatus)
    );
  }, [campaign]);

  async function runAction(action: AdminDeliveryAdAction) {
    if (!campaign || busy) return;
    if (adminActionRequiresReason(action) && !reason.trim()) {
      setError("reason_required");
      return;
    }
    const needsConfirm =
      action === "reject" ||
      action === "pause" ||
      action === "end" ||
      action === "terminate" ||
      action === "archive" ||
      action === "delete_safe_draft";
    if (needsConfirm && confirmAction !== action) {
      setConfirmAction(action);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/delivery-ads/${encodeURIComponent(campaignId)}/actions`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productKind: campaign.productKind,
            action,
            expectedLifecycle: campaign.lifecycleStatus,
            expectedUpdatedAt: campaign.updatedAt,
            reason: reason.trim() || null,
            ownerVisibleNotes: reason.trim() || null,
          }),
        }
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || "action_failed");
        setConfirmAction(null);
        return;
      }
      setConfirmAction(null);
      setReason("");
      if (action === "delete_safe_draft") {
        router.push(DELIVERY_AD_ADMIN_ROUTES.hub);
        return;
      }
      await load();
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }

  async function saveSchedule() {
    if (!campaign || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/delivery-ads/${encodeURIComponent(campaignId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productKind: campaign.productKind,
          op: "schedule",
          expectedUpdatedAt: campaign.updatedAt,
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          reason: reason.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || "update_failed");
        return;
      }
      await load();
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }

  async function saveInventory() {
    if (!campaign || busy || campaign.productKind !== "banner") return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/delivery-ads/${encodeURIComponent(campaignId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productKind: campaign.productKind,
          op: "inventory",
          expectedUpdatedAt: campaign.updatedAt,
          inventoryKey: editInventoryKey,
          reason: reason.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || "update_failed");
        return;
      }
      await load();
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminDeliveryCmsChrome help="home">
      <div className="space-y-4 pb-24">
        <div>
          <Link
            href={DELIVERY_AD_ADMIN_ROUTES.hub}
            className="text-[12px] text-sam-brand underline-offset-2 hover:underline"
          >
            ←{" "}
            {safeT("admin_delivery_ads_back", {
              fallbackKo: "목록",
              fallbackEn: "Back",
            })}
          </Link>
          <h1 className="mt-1 text-[20px] font-bold text-sam-fg">
            {safeT("admin_delivery_ads_detail_title", {
              fallbackKo: "광고 상세",
              fallbackEn: "Campaign detail",
            })}
          </h1>
        </div>

        {loading ? (
          <p className="text-[13px] text-sam-muted" role="status">
            {safeT("admin_delivery_ads_loading", {
              fallbackKo: "불러오는 중…",
              fallbackEn: "Loading…",
            })}
          </p>
        ) : null}
        {error ? (
          <p className="text-[13px] text-sam-danger" role="alert">
            {error}
          </p>
        ) : null}

        {campaign ? (
          <>
            <AdminCard titleKey="admin_delivery_ads_section_basic">
              <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
                <div>
                  <dt className="text-sam-muted">ID</dt>
                  <dd className="break-all font-mono text-[12px]">{campaign.id}</dd>
                </div>
                <div>
                  <dt className="text-sam-muted">
                    {safeT("admin_delivery_ads_product_label", {
                      fallbackKo: "상품",
                      fallbackEn: "Product",
                    })}
                  </dt>
                  <dd>{campaign.productKind}</dd>
                </div>
                <div>
                  <dt className="text-sam-muted">Owner</dt>
                  <dd>{campaign.ownerDisplayName || campaign.ownerUserId || "—"}</dd>
                </div>
                <div>
                  <dt className="text-sam-muted">Store</dt>
                  <dd>{campaign.storeName || campaign.storeId || "—"}</dd>
                </div>
                <div>
                  <dt className="text-sam-muted">Lifecycle</dt>
                  <dd>
                    {campaign.lifecycleStatus}
                    {campaign.scheduleHint !== "in_window" ? (
                      <span className="ml-2 text-[11px] text-sam-muted">
                        ({campaign.scheduleHint})
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-sam-muted">Review</dt>
                  <dd>{campaign.reviewStatus}</dd>
                </div>
              </dl>
            </AdminCard>

            <AdminCard titleKey="delivery_ads_perf_section_title">
              <DeliveryAdPerformancePanel
                performance={performance}
                loading={perfLoading}
                range={perfRange}
                onRangeChange={setPerfRange}
              />
            </AdminCard>

            <AdminCard titleKey="admin_delivery_ads_section_settings">
              {campaign.productKind === "banner" ? (
                <div className="mb-3 space-y-2">
                  <label className="flex flex-col gap-1 text-[12px]">
                    {safeT("admin_delivery_ads_inventory_label", {
                      fallbackKo: "광고 지면",
                      fallbackEn: "Placement",
                    })}
                    <select
                      className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px]"
                      value={editInventoryKey}
                      onChange={(e) =>
                        setEditInventoryKey(e.target.value as OwnerBannerInventoryKey)
                      }
                      disabled={busy}
                    >
                      {OWNER_BANNER_INVENTORY_KEYS.map((key) => (
                        <option key={key} value={key}>
                          {key === "STORES_SEARCH_TOP"
                            ? safeT("owner_ads_inventory_search_top", {
                                fallbackKo: "검색 결과 상단",
                                fallbackEn: "Search results top",
                              })
                            : safeT("owner_ads_inventory_home_hero", {
                                fallbackKo: "배달 홈 히어로",
                                fallbackEn: "Delivery home hero",
                              })}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-[12px]"
                    onClick={() => void saveInventory()}
                  >
                    {safeT("admin_delivery_ads_save_inventory", {
                      fallbackKo: "지면 저장",
                      fallbackEn: "Save placement",
                    })}
                  </button>
                </div>
              ) : (
                <p className="text-[13px] text-sam-fg">
                  {safeT("admin_delivery_ads_inventory_label", {
                    fallbackKo: "광고 지면",
                    fallbackEn: "Placement",
                  })}
                  :{" "}
                  {(campaign.inventoryKeys ?? [])
                    .map((k) => t(deliveryAdPlacementI18nKey(k) as MessageKey))
                    .join(" · ") || "—"}
                </p>
              )}
              <div className="mt-3 rounded-ui-rect border border-sam-border bg-sam-app p-3">
                <p className="text-[12px] font-bold text-sam-fg">
                  {t("admin_delivery_ads_policy_section")}
                </p>
                <ul className="mt-2 space-y-2 text-[12px] text-sam-fg">
                  {(campaign.inventoryKeys.length
                    ? campaign.inventoryKeys
                    : [editInventoryKey]
                  ).map((key) => {
                    const href = deliveryAdPolicyScreenHref(key, {
                      primarySlug: campaign.storePrimarySlug,
                      subSlug: campaign.storeSubSlug,
                    });
                    const label = t(deliveryAdPlacementI18nKey(key) as MessageKey);
                    return (
                      <li key={key} className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{label}</span>
                        {href ? (
                          <Link
                            href={href}
                            className="text-signature underline underline-offset-2"
                          >
                            {key === "STORES_CATEGORY_FEED"
                              ? t("admin_delivery_ads_policy_view_browse")
                              : t("admin_delivery_ads_policy_view_home")}
                          </Link>
                        ) : (
                          <span className="text-sam-muted">
                            {t("admin_delivery_ads_policy_no_screen")}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <p className="mt-1 text-[13px] text-sam-muted">
                {safeT("admin_delivery_ads_pricing_not_configured", {
                  fallbackKo: "과금: NOT_CONFIGURED (CUT H 이전)",
                  fallbackEn: "Pricing: NOT_CONFIGURED (before CUT H)",
                })}
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <label className="flex flex-1 flex-col gap-1 text-[12px]">
                  Start
                  <input
                    type="datetime-local"
                    className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1 text-[12px]">
                  End
                  <input
                    type="datetime-local"
                    className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5"
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={busy}
                className="mt-2 rounded-ui-rect border border-sam-border px-3 py-1.5 text-[12px]"
                onClick={() => void saveSchedule()}
              >
                {safeT("admin_delivery_ads_save_schedule", {
                  fallbackKo: "일정 저장",
                  fallbackEn: "Save schedule",
                })}
              </button>
            </AdminCard>

            <AdminCard titleKey="admin_delivery_ads_section_creative">
              <DeliveryAdCampaignPlacementPreviews
                productKind={campaign.productKind}
                inventoryKeys={campaign.inventoryKeys}
                renderContext="admin_preview"
                placementPreview={placementPreview}
                bannerCreative={
                  campaign.productKind === "banner"
                    ? {
                        assetUrl: creative?.assetPath || campaign.imageUrl || "",
                        headline: creative?.headline ?? campaign.title,
                        subcopy: creative?.subcopy ?? campaign.headline,
                        alt: campaign.title || "banner",
                      }
                    : null
                }
                ctaLabel={creative?.ctaLabel ?? null}
              />
              {creative ? (
                <p className="mt-2 text-[11px] text-sam-muted">
                  creative v{creative.version} · {creative.id.slice(0, 8)}
                </p>
              ) : null}
            </AdminCard>

            <AdminCard titleKey="admin_delivery_ads_section_review">
              {campaign.reviewNotes ? (
                <p className="mb-2 text-[13px] text-sam-fg">
                  {safeT("admin_delivery_ads_owner_visible_notes", {
                    fallbackKo: "Owner 공개 메모",
                    fallbackEn: "Owner-visible notes",
                  })}
                  : {campaign.reviewNotes}
                </p>
              ) : null}
              <label className="flex flex-col gap-1 text-[12px]">
                {safeT("admin_delivery_ads_reason", {
                  fallbackKo: "사유 (수정요청·거절·중지·강제중단 필수)",
                  fallbackEn: "Reason (required for changes/reject/pause/terminate)",
                })}
                <textarea
                  className="min-h-[72px] rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px]"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            </AdminCard>

            <div className="sticky bottom-0 z-10 -mx-1 border-t border-sam-border bg-sam-app/95 p-3 backdrop-blur">
              <div className="flex flex-wrap gap-2">
                {allowedActions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    disabled={busy}
                    className={`rounded-ui-rect px-3 py-2 text-[12px] font-medium ${
                      action === "terminate" || action === "reject" || action === "delete_safe_draft"
                        ? "bg-sam-danger text-white"
                        : action === "approve"
                          ? "bg-sam-brand text-white"
                          : "border border-sam-border bg-sam-surface text-sam-fg"
                    }`}
                    onClick={() => void runAction(action)}
                  >
                    {safeT(`admin_delivery_ads_action_${action}` as MessageKey, {
                      fallbackKo: action,
                      fallbackEn: action,
                    })}
                    {confirmAction === action
                      ? ` · ${safeT("admin_delivery_ads_confirm_again", {
                          fallbackKo: "다시 눌러 확인",
                          fallbackEn: "Tap again to confirm",
                        })}`
                      : ""}
                  </button>
                ))}
              </div>
            </div>

            <AdminCard titleKey="admin_delivery_ads_section_history">
              {audits.length === 0 ? (
                <p className="text-[13px] text-sam-muted">—</p>
              ) : (
                <ul className="space-y-2">
                  {audits.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[12px]"
                    >
                      <div className="font-medium text-sam-fg">
                        {a.action} · {a.actorType}
                      </div>
                      <div className="text-sam-muted">{a.createdAt}</div>
                      {a.reason ? <div className="mt-0.5 text-sam-fg">{a.reason}</div> : null}
                    </li>
                  ))}
                </ul>
              )}
            </AdminCard>
          </>
        ) : null}
      </div>
    </AdminDeliveryCmsChrome>
  );
}
