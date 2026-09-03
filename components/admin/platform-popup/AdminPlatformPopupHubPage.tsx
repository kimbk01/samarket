"use client";

/**
 * Admin Platform Popup Control Center hub.
 * Tabs: Owner requests vs campaigns. Ops chips + human-readable lists.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PlatformPopupOwnerRequestAdminPresentation } from "@/lib/platform-popup/enrich-admin-request-presentation";
import type { PlatformPopupAdminListItem } from "@/lib/platform-popup/admin-campaign-loader";
import { PLATFORM_POPUP_ADMIN_REQUEST_ROUTES } from "@/lib/platform-popup/platform-popup-owner-routes";
import {
  PLATFORM_POPUP_HUB_OPS_CHIPS,
  PLATFORM_POPUP_HUB_REQUEST_CHIPS,
  platformPopupCampaignStatusLabel,
  platformPopupOwnerPaymentStatusLabel,
  platformPopupOwnerRequestStatusLabel,
} from "@/lib/platform-popup/popup-product-labels";
import { describePlatformPopupCtaDestination } from "@/lib/platform-popup/popup-cta-destination-ux";
import { adminSurfaceModeLabel } from "@/lib/platform-popup/admin-surface-target-mode";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import type { PlatformPopupTargetSurface } from "@/lib/platform-popup/types";

type HubTab = "requests" | "campaigns";

export function AdminPlatformPopupHubPage() {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "campaigns" ? "campaigns" : "requests";
  const [tab, setTab] = useState<HubTab>(initialTab);
  const [requests, setRequests] = useState<PlatformPopupOwnerRequestAdminPresentation[]>([]);
  const [campaigns, setCampaigns] = useState<PlatformPopupAdminListItem[]>([]);
  const [campaignFilter, setCampaignFilter] = useState<string>("");
  const [requestFilter, setRequestFilter] = useState<string>("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const reqQs =
      requestFilter === "open"
        ? "status=open"
        : requestFilter
          ? `status=${encodeURIComponent(requestFilter)}`
          : "status=all";
    const campQs = campaignFilter ? `?status=${encodeURIComponent(campaignFilter)}` : "";
    const [reqRes, campRes] = await Promise.all([
      fetch(`/api/admin/platform-popup-requests?${reqQs}`, { credentials: "same-origin" }),
      fetch(`/api/admin/platform-popup-campaigns${campQs}`, { credentials: "same-origin" }),
    ]);
    const reqJson = (await reqRes.json().catch(() => ({}))) as {
      ok?: boolean;
      items?: PlatformPopupOwnerRequestAdminPresentation[];
      error?: string;
    };
    const campJson = (await campRes.json().catch(() => ({}))) as {
      ok?: boolean;
      items?: PlatformPopupAdminListItem[];
      error?: string;
    };
    if (!reqRes.ok || !reqJson.ok) setError(reqJson.error || "requests_load_failed");
    else setRequests(reqJson.items ?? []);
    if (!campRes.ok || !campJson.ok) setError(campJson.error || "campaigns_load_failed");
    else setCampaigns(campJson.items ?? []);
    setLoading(false);
  }, [campaignFilter, requestFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const requestCounts = useMemo(() => {
    const all = requests;
    return {
      submitted: all.filter((r) => r.requestStatus === "submitted").length,
      under_review: all.filter((r) => r.requestStatus === "under_review").length,
      revision_required: all.filter((r) => r.requestStatus === "revision_required").length,
    };
  }, [requests]);

  const campaignCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of campaigns) {
      map[c.status] = (map[c.status] ?? 0) + 1;
    }
    return map;
  }, [campaigns]);

  const setHubTab = (next: HubTab) => {
    setTab(next);
    const qs = next === "campaigns" ? "?tab=campaigns" : "";
    router.replace(`/admin/platform-popup${qs}`);
  };

  const createErrorMessage = (raw: string | undefined) => {
    if (!raw || raw === "create_failed") {
      return safeT("admin_platform_popup_create_failed", {
        fallbackKo: "팝업 광고를 만들지 못했습니다. 권한을 확인한 뒤 다시 시도해 주세요.",
        fallbackEn: "Could not create the popup ad. Check permissions and try again.",
      });
    }
    return raw;
  };

  const onCreate = async () => {
    setCreating(true);
    setError(null);
    const res = await fetch("/api/admin/platform-popup-campaigns", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: safeT("admin_platform_popup_untitled", {
          fallbackKo: "새 팝업 캠페인",
          fallbackEn: "New popup campaign",
        }),
        surfaces: ["GLOBAL"],
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
    setCreating(false);
    if (!res.ok || !json.ok || !json.id) {
      setError(createErrorMessage(json.error));
      return;
    }
    router.push(`/admin/platform-popup/${json.id}`);
  };

  const createCtaButton = (opts?: { fullWidth?: boolean; emptySlot?: boolean }) => (
    <button
      type="button"
      className={`min-h-11 rounded-ui-rect bg-sam-primary px-5 py-3 text-base font-bold text-sam-on-primary shadow-sm disabled:opacity-50 ${
        opts?.fullWidth !== false ? "w-full" : ""
      }`}
      disabled={creating}
      data-admin-popup-direct-create={opts?.emptySlot ? "empty" : "1"}
      onClick={() => void onCreate()}
    >
      {creating
        ? safeT("admin_platform_popup_creating", {
            fallbackKo: "등록 중…",
            fallbackEn: "Creating…",
          })
        : safeT("admin_platform_popup_create_cta", {
            fallbackKo: "팝업 광고 등록",
            fallbackEn: "Create popup ad",
          })}
    </button>
  );

  const emptyContractLine = safeT("admin_platform_popup_hub_contract_line", {
    fallbackKo: "소재 1440×1000(36:25) · 하단 팝업 · 노출 위치 선택",
    fallbackEn: "Creative 1440×1000 (36:25) · bottom popup · choose placement",
  });

  return (
    <div className="space-y-4" data-admin-platform-popup-hub="1">
      <AdminPageHeader
        title={safeT("admin_platform_popup_hub_title", {
          fallbackKo: "팝업 광고 운영",
          fallbackEn: "Popup Ad Operations",
        })}
        description={safeT("admin_platform_popup_hub_desc", {
          fallbackKo: "신청 심사 · 캠페인 운영 · 직접 등록",
          fallbackEn: "Request review · campaign ops · direct create",
        })}
      />

      <AdminCard>
        <div className="space-y-3">
          <div data-admin-popup-primary-create="1">{createCtaButton()}</div>
          <p className="text-xs text-sam-muted">{emptyContractLine}</p>
          <div className="flex flex-wrap items-center gap-2 border-t border-sam-border pt-3">
            <button
              type="button"
              data-hub-tab="requests"
              className={`rounded px-3 py-1.5 text-sm font-semibold ${
                tab === "requests" ? "bg-sam-primary text-sam-on-primary" : "border border-sam-border"
              }`}
              onClick={() => setHubTab("requests")}
            >
              {safeT("admin_platform_popup_tab_requests", {
                fallbackKo: "신청",
                fallbackEn: "Requests",
              })}
            </button>
            <button
              type="button"
              data-hub-tab="campaigns"
              className={`rounded px-3 py-1.5 text-sm font-semibold ${
                tab === "campaigns" ? "bg-sam-primary text-sam-on-primary" : "border border-sam-border"
              }`}
              onClick={() => setHubTab("campaigns")}
            >
              {safeT("admin_platform_popup_tab_campaigns", {
                fallbackKo: "캠페인",
                fallbackEn: "Campaigns",
              })}
            </button>
          </div>
        </div>
      </AdminCard>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {tab === "requests" ? (
        <>
          <div className="flex flex-wrap gap-2" data-admin-popup-request-ops="1">
            <button
              type="button"
              className={`rounded border px-2 py-1 text-xs ${
                requestFilter === "open" ? "border-sam-primary bg-sam-primary/10" : "border-sam-border"
              }`}
              onClick={() => setRequestFilter("open")}
            >
              {safeT("admin_platform_popup_chip_open", { fallbackKo: "처리 필요", fallbackEn: "Needs action" })}
            </button>
            {PLATFORM_POPUP_HUB_REQUEST_CHIPS.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={`rounded border px-2 py-1 text-xs ${
                  requestFilter === chip.status ? "border-sam-primary bg-sam-primary/10" : "border-sam-border"
                }`}
                onClick={() => setRequestFilter(chip.status)}
              >
                {platformPopupOwnerRequestStatusLabel(chip.status, lang)}
                {requestFilter === "open" || requestFilter === chip.status
                  ? ` · ${requestCounts[chip.key] ?? 0}`
                  : ""}
              </button>
            ))}
          </div>

          <AdminCard>
            {loading ? (
              <p className="text-sm text-sam-muted">…</p>
            ) : requests.length === 0 ? (
              <div className="space-y-3" data-admin-popup-requests-empty="1">
                <p className="text-sm text-sam-muted">
                  {safeT("admin_platform_popup_requests_empty", {
                    fallbackKo: "대기 중인 오너 신청이 없습니다.",
                    fallbackEn: "No open owner requests.",
                  })}
                </p>
                <p className="text-xs text-sam-muted">{emptyContractLine}</p>
                {createCtaButton({ emptySlot: true })}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-sam-border text-sam-muted">
                    <tr>
                      <th className="px-2 py-2">{lang === "en" ? "Status" : "상태"}</th>
                      <th className="px-2 py-2">{lang === "en" ? "Store" : "매장"}</th>
                      <th className="px-2 py-2">Owner</th>
                      <th className="px-2 py-2">{lang === "en" ? "Placement" : "노출"}</th>
                      <th className="px-2 py-2">CTA</th>
                      <th className="px-2 py-2">{lang === "en" ? "Cash" : "결제"}</th>
                      <th className="px-2 py-2">{lang === "en" ? "Price" : "금액"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((item) => {
                      const surface = (item.requestedSurfaces[0] ?? "GLOBAL") as PlatformPopupTargetSurface;
                      const cta = describePlatformPopupCtaDestination({
                        ctaType: item.ctaType,
                        ctaTarget: item.ctaTarget,
                        storeId: item.storeId,
                        storeName: item.storeName,
                        lang,
                      });
                      return (
                        <tr key={item.id} className="border-b border-sam-border/60 hover:bg-sam-app/60">
                          <td className="px-2 py-2">
                            <Link
                              href={PLATFORM_POPUP_ADMIN_REQUEST_ROUTES.detail(item.id)}
                              className="font-semibold text-sam-primary underline-offset-2 hover:underline"
                            >
                              {platformPopupOwnerRequestStatusLabel(item.requestStatus, lang)}
                            </Link>
                          </td>
                          <td className="px-2 py-2">{item.storeName || "—"}</td>
                          <td className="px-2 py-2">
                            {item.ownerLabel || "—"}
                            {item.ownerUsername ? (
                              <span className="block text-xs text-sam-muted">@{item.ownerUsername}</span>
                            ) : null}
                          </td>
                          <td className="px-2 py-2">{adminSurfaceModeLabel(surface, lang)}</td>
                          <td className="px-2 py-2">{cta.readable}</td>
                          <td className="px-2 py-2">
                            {platformPopupOwnerPaymentStatusLabel(item.paymentStatus, lang)}
                          </td>
                          <td className="px-2 py-2 tabular-nums">
                            {item.priceMinor != null ? formatDeliveryAdPhpMinor(item.priceMinor) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </AdminCard>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" data-admin-popup-campaign-ops="1">
            <button
              type="button"
              className={`rounded border px-2 py-1 text-xs ${
                !campaignFilter ? "border-sam-primary bg-sam-primary/10" : "border-sam-border"
              }`}
              onClick={() => setCampaignFilter("")}
            >
              {safeT("admin_platform_popup_filter_all", { fallbackKo: "전체", fallbackEn: "All" })}
            </button>
            {PLATFORM_POPUP_HUB_OPS_CHIPS.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={`rounded border px-2 py-1 text-xs ${
                  campaignFilter === chip.status ? "border-sam-primary bg-sam-primary/10" : "border-sam-border"
                }`}
                onClick={() => setCampaignFilter(chip.status)}
              >
                {platformPopupCampaignStatusLabel(chip.status, lang)}
                {` · ${campaignCounts[chip.status] ?? 0}`}
              </button>
            ))}
          </div>

          <AdminCard>
            {loading ? (
              <p className="text-sm text-sam-muted">…</p>
            ) : campaigns.length === 0 ? (
              <div className="space-y-3" data-admin-popup-campaigns-empty="1">
                <p className="text-sm text-sam-muted">
                  {safeT("admin_platform_popup_empty", {
                    fallbackKo: "아직 등록된 팝업이 없습니다.",
                    fallbackEn: "No popup ads yet.",
                  })}
                </p>
                <p className="text-xs text-sam-muted">{emptyContractLine}</p>
                {createCtaButton({ emptySlot: true })}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-sam-border text-sam-muted">
                    <tr>
                      <th className="px-2 py-2">{lang === "en" ? "Creative" : "소재"}</th>
                      <th className="px-2 py-2">{lang === "en" ? "Campaign" : "캠페인"}</th>
                      <th className="px-2 py-2">{lang === "en" ? "Status" : "상태"}</th>
                      <th className="px-2 py-2">{lang === "en" ? "Placement" : "노출"}</th>
                      <th className="px-2 py-2">{lang === "en" ? "Schedule" : "기간"}</th>
                      <th className="px-2 py-2">Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((item) => {
                      const surface = (item.surfaces[0] ?? "GLOBAL") as PlatformPopupTargetSurface;
                      return (
                        <tr key={item.id} className="border-b border-sam-border/60 hover:bg-sam-app/60">
                          <td className="px-2 py-2">
                            {item.creativeThumbUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.creativeThumbUrl}
                                alt=""
                                className="h-10 w-14 rounded-sm object-cover"
                              />
                            ) : (
                              <span className="inline-block h-10 w-14 rounded-sm bg-sam-border/40" />
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <Link
                              href={`/admin/platform-popup/${item.id}`}
                              className="font-semibold text-sam-primary underline-offset-2 hover:underline"
                            >
                              {item.name || "—"}
                            </Link>
                          </td>
                          <td className="px-2 py-2">
                            {platformPopupCampaignStatusLabel(item.status, lang)}
                          </td>
                          <td className="px-2 py-2">{adminSurfaceModeLabel(surface, lang)}</td>
                          <td className="px-2 py-2 text-xs">
                            {(item.startAt || "—").slice(0, 10)} → {(item.endAt || "—").slice(0, 10)}
                          </td>
                          <td className="px-2 py-2 tabular-nums">{item.priority}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </AdminCard>
        </>
      )}
    </div>
  );
}
