"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FeedAdFramePreview } from "@/components/ads/FeedAdBannerCarousel";
import {
  AdminPlatformPopupPreview,
  type AdminPlatformPopupPreviewSource,
} from "@/components/admin/platform-popup/AdminPlatformPopupPreview";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliveryAdBanner } from "@/components/stores/advertising/DeliveryAdBanner";
import { buildPlatformEventDetailPath } from "@/lib/platform-events/types";
import {
  eventBannerImageGuidance,
  eventBannerPlacementLabel,
  eventBannerPresentationLabel,
  isEventBannerPlacement,
  isEventBannerPlacementPresentationCompatible,
  listEventBannerPlacementsForPresentation,
  listEventBannerPresentations,
  normalizeEventBannerPresentation,
  type EventBannerPlacement,
  type EventBannerPresentation,
} from "@/lib/platform-promotion-distribution/banner-presentation";
import type { PromotionDistributionToggleDraft } from "@/lib/platform-promotion-distribution/types";
import { emptyDistributionToggles } from "@/lib/platform-promotion-distribution/types";
import { inventoryViewFromKey } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import {
  adminBannerPreviewDeviceOuterWidthPx,
  adminTradeInlinePreviewCellWidthPx,
} from "@/lib/admin/admin-banner-preview-geometry";
import {
  distributionPopupLifecycleNotice,
  popupCompositionOperatorLabel,
} from "@/lib/admin/promotion-ownership-visibility";
import { resolvePlatformPopupComposition } from "@/lib/platform-popup/resolve-presentation-composition";

type Props = {
  eventId: string;
  eventTitle: string;
  /** Live Event Benefit form state — drives Benefit presentation eligibility. */
  benefitTitle?: string;
  benefitBody?: string | null;
  heroImageUrl?: string | null;
};

type PopupPresentationChoice = "artwork" | "card" | "sheet" | "benefit";

type ChannelSaveResult = {
  ok: boolean;
  error?: string;
  action?: string;
  channelRefId?: string | null;
};

const POPUP_CHOICES: Array<{
  id: PopupPresentationChoice;
  ko: string;
  en: string;
  hintKo: string;
  hintEn: string;
  presentationType: "center_modal" | "bottom_sheet" | "benefit_dialog";
  creativeMode: "artwork" | "card";
}> = [
  {
    id: "artwork",
    ko: "아트워크 팝업",
    en: "Artwork popup",
    hintKo: "투명 PNG 등 비주얼 중심 소재를 강조합니다.",
    hintEn: "Highlights visual-first creatives such as transparent PNGs.",
    presentationType: "center_modal",
    creativeMode: "artwork",
  },
  {
    id: "card",
    ko: "프로모션 카드",
    en: "Promotion card",
    hintKo: "이미지·내용·CTA를 하나의 카드로 보여줍니다.",
    hintEn: "Shows image, copy, and CTA as one card.",
    presentationType: "center_modal",
    creativeMode: "card",
  },
  {
    id: "sheet",
    ko: "하단 프로모션 시트",
    en: "Bottom promotion sheet",
    hintKo: "화면 하단에서 자연스럽게 올라오는 프로모션입니다.",
    hintEn: "A promotion that rises naturally from the bottom of the screen.",
    presentationType: "bottom_sheet",
    creativeMode: "card",
  },
  {
    id: "benefit",
    ko: "혜택/쿠폰 다이얼로그",
    en: "Benefit / coupon dialog",
    hintKo: "연결된 이벤트의 쿠폰·혜택 정보를 중심으로 보여줍니다.",
    hintEn: "Focuses on coupon and benefit info from the linked Event.",
    presentationType: "benefit_dialog",
    creativeMode: "card",
  },
];

function choiceFromConfig(cfg: Record<string, unknown>): PopupPresentationChoice {
  const presentation = String(cfg.presentationType ?? "center_modal");
  const creative = String(cfg.creativeMode ?? "card");
  if (presentation === "benefit_dialog") return "benefit";
  if (presentation === "bottom_sheet") return "sheet";
  if (creative === "artwork") return "artwork";
  return "card";
}

function channelSummaryLabel(
  enabled: boolean,
  status: string | undefined,
  lang: "ko" | "en"
): string {
  if (!enabled) return lang === "en" ? "OFF" : "꺼짐";
  if (status === "active") return lang === "en" ? "Active" : "활성";
  if (status === "configured" || status === "draft") {
    return lang === "en" ? "Configured (inactive)" : "설정됨 (비활성)";
  }
  if (status === "disabled") return lang === "en" ? "Disabled" : "중지";
  return lang === "en" ? "Configured" : "설정됨";
}

/**
 * Operator-facing distribution panel.
 * Independent channel toggles — not a developer settings dump.
 */
export function AdminPlatformEventDistributionPanel({
  eventId,
  eventTitle,
  benefitTitle = "",
  benefitBody = null,
  heroImageUrl = null,
}: Props) {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const [toggles, setToggles] = useState<PromotionDistributionToggleDraft>(emptyDistributionToggles);
  const [channelStatuses, setChannelStatuses] = useState<
    Partial<Record<"popup" | "banner" | "push" | "bell", string>>
  >({});
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [bellTitle, setBellTitle] = useState("");
  const [bellBody, setBellBody] = useState("");
  const [bannerPresentation, setBannerPresentation] =
    useState<EventBannerPresentation>("INLINE_BANNER");
  const [bannerPlacement, setBannerPlacement] = useState<EventBannerPlacement>("TRADE_HOME");
  const [bannerImageUrl, setBannerImageUrl] = useState("");
  const [bannerHeadline, setBannerHeadline] = useState("");
  const [bannerPreviewDevice, setBannerPreviewDevice] = useState<
    "phone" | "tablet_portrait" | "tablet_landscape" | "desktop"
  >("phone");
  const [popupChoice, setPopupChoice] = useState<PopupPresentationChoice>("card");
  const [popupImageUrl, setPopupImageUrl] = useState("");
  const [popupImagePath, setPopupImagePath] = useState("");
  const [popupFrequency, setPopupFrequency] = useState("once_per_session");
  const [popupChannelRefId, setPopupChannelRefId] = useState<string | null>(null);
  const [popupDistStatus, setPopupDistStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [channelResults, setChannelResults] = useState<Record<
    string,
    ChannelSaveResult
  > | null>(null);

  const benefitEligible = Boolean(benefitTitle.trim());
  const bannerCompatOk = useMemo(
    () => isEventBannerPlacementPresentationCompatible(bannerPlacement, bannerPresentation),
    [bannerPlacement, bannerPresentation]
  );

  const bannerHref = useMemo(() => buildPlatformEventDetailPath(eventId), [eventId]);
  const heroInventory = useMemo(() => inventoryViewFromKey("STORES_HOME_HERO"), []);
  const inlineDensity = bannerPlacement.startsWith("COMMUNITY") ? "community" : "trade";

  const activePopupChoice = POPUP_CHOICES.find((c) => c.id === popupChoice) ?? POPUP_CHOICES[1]!;
  const popupLifecycle = distributionPopupLifecycleNotice({
    enabled: toggles.popup,
    channelRefId: popupChannelRefId,
    distributionStatus: popupDistStatus,
    lang,
  });
  const popupCompositionLabel = popupCompositionOperatorLabel(
    resolvePlatformPopupComposition({
      presentationType: activePopupChoice.presentationType,
      creativeMode: activePopupChoice.creativeMode,
    }),
    lang
  );

  const popupPreviewSource: AdminPlatformPopupPreviewSource | null = useMemo(() => {
    if (!toggles.popup) return null;
    const imageUrl = popupImageUrl.trim() || String(heroImageUrl ?? "").trim();
    if (!imageUrl && popupChoice !== "benefit") return null;
    return {
      campaignId: `event-dist-preview-${eventId}`,
      creativeId: "event-dist-preview-creative",
      imageUrl: imageUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
      altText: eventTitle,
      ctaHref: bannerHref,
      ctaType: "event_detail",
      ctaLabel: null,
      title: eventTitle,
      body: null,
      benefit: benefitEligible
        ? { title: benefitTitle.trim(), body: benefitBody?.trim() || null }
        : null,
      benefitEligible,
      surface: "GLOBAL",
      suppressionMode: "once_per_session",
      suppressionDurationSeconds: null,
      timezone: "Asia/Manila",
      presentationType: activePopupChoice.presentationType,
      frequencyMode: popupFrequency,
      creativeMode: activePopupChoice.creativeMode,
      unsaved: true,
    };
  }, [
    toggles.popup,
    popupImageUrl,
    heroImageUrl,
    popupChoice,
    eventId,
    eventTitle,
    bannerHref,
    benefitEligible,
    benefitTitle,
    benefitBody,
    activePopupChoice.presentationType,
    activePopupChoice.creativeMode,
    popupFrequency,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/platform-events/${encodeURIComponent(eventId)}/distribution`,
        { credentials: "same-origin" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        toggles?: PromotionDistributionToggleDraft;
        rows?: Array<{
          channel: string;
          status?: string;
          enabled?: boolean;
          config?: Record<string, unknown>;
          channelRefId?: string | null;
        }>;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "load_failed");
        return;
      }
      if (json.toggles) setToggles(json.toggles);
      const nextStatuses: Partial<Record<"popup" | "banner" | "push" | "bell", string>> = {};
      let nextPopupRef: string | null = null;
      let nextPopupStatus: string | null = null;
      for (const row of json.rows ?? []) {
        const cfg = row.config ?? {};
        const ch = row.channel as "popup" | "banner" | "push" | "bell";
        if (ch === "popup" || ch === "banner" || ch === "push" || ch === "bell") {
          nextStatuses[ch] = row.status ?? (row.enabled ? "configured" : "disabled");
        }
        if (row.channel === "push") {
          setPushTitle(String(cfg.title ?? ""));
          setPushBody(String(cfg.body ?? ""));
        }
        if (row.channel === "bell") {
          setBellTitle(String(cfg.title ?? ""));
          setBellBody(String(cfg.body ?? ""));
        }
        if (row.channel === "banner") {
          setBannerPresentation(normalizeEventBannerPresentation(String(cfg.presentation ?? "")));
          const nextPlacement = String(cfg.placement ?? "TRADE_HOME");
          setBannerPlacement(
            isEventBannerPlacement(nextPlacement) ? nextPlacement : "TRADE_HOME"
          );
          setBannerImageUrl(String(cfg.imageUrl ?? ""));
          setBannerHeadline(String(cfg.headline ?? ""));
        }
        if (row.channel === "popup") {
          setPopupChoice(choiceFromConfig(cfg));
          setPopupImageUrl(String(cfg.imageUrl ?? ""));
          setPopupImagePath(String(cfg.imagePath ?? ""));
          setPopupFrequency(String(cfg.frequencyMode ?? "once_per_session"));
          nextPopupRef = row.channelRefId ? String(row.channelRefId) : null;
          nextPopupStatus = row.status ?? null;
        }
      }
      setPopupChannelRefId(nextPopupRef);
      setPopupDistStatus(nextPopupStatus);
      setChannelStatuses(nextStatuses);
    } catch {
      setError("load_failed");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (toggles.popup && popupChoice === "benefit" && !benefitEligible) {
      setError(
        safeT("admin_platform_events_popup_benefit_required", {
          fallbackKo: "혜택 팝업을 쓰려면 이벤트에 혜택 정보를 먼저 입력해 주세요.",
          fallbackEn: "Add Event Benefit content before selecting Benefit popup.",
        })
      );
      return;
    }
    if (toggles.banner && !bannerCompatOk) {
      setError(
        safeT("admin_platform_events_banner_compat_fail", {
          fallbackKo: "이 배치와 배너 형태 조합은 허용되지 않습니다.",
          fallbackEn: "This placement + presentation combination is not allowed.",
        })
      );
      return;
    }
    if (toggles.push && !pushTitle.trim() && !pushBody.trim()) {
      setError(
        safeT("admin_platform_events_push_copy_required", {
          fallbackKo: "푸시 제목 또는 본문을 입력해 주세요.",
          fallbackEn: "Push title or body is required.",
        })
      );
      return;
    }

    setSaving(true);
    setError(null);
    setInfo(null);
    setChannelResults(null);
    try {
      const res = await fetch(
        `/api/admin/platform-events/${encodeURIComponent(eventId)}/distribution`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventTitle,
            toggles,
            banner: {
              presentation: bannerPresentation,
              placement: bannerPlacement,
              imageUrl: bannerImageUrl || undefined,
              headline: bannerHeadline || eventTitle,
            },
            push: {
              title: pushTitle || eventTitle,
              body: pushBody,
            },
            bell: {
              title: bellTitle || eventTitle,
              body: bellBody,
            },
            popup: {
              surfaces: ["GLOBAL"],
              presentationType: activePopupChoice.presentationType,
              creativeMode: activePopupChoice.creativeMode,
              frequencyMode: popupFrequency,
              imageUrl: popupImageUrl || heroImageUrl || undefined,
              imagePath: popupImagePath || undefined,
            },
          }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        pushDispatchCount?: number;
        channels?: Record<string, ChannelSaveResult>;
      };
      if (json.channels) setChannelResults(json.channels);
      const popupResult = json.channels?.popup;
      if (popupResult?.ok && popupResult.channelRefId) {
        setPopupChannelRefId(String(popupResult.channelRefId));
      }
      if (json.pushDispatchCount !== 0 && json.pushDispatchCount != null) {
        setError("push_dispatch_on_save_forbidden");
        return;
      }
      if (!res.ok || !json.ok) {
        setError(
          json.error ||
            safeT("admin_platform_events_distribution_partial_fail", {
              fallbackKo: "일부 채널 저장에 실패했습니다. 채널별 결과를 확인하세요.",
              fallbackEn: "Some channels failed. Check per-channel results.",
            })
        );
        return;
      }
      setInfo(
        safeT("admin_platform_events_distribution_saved", {
          fallbackKo: "배포 설정이 저장되었습니다. 푸시는 별도 발송이 필요합니다.",
          fallbackEn: "Distribution saved. Push still requires an explicit send.",
        })
      );
      await load();
    } catch {
      setError("save_failed");
    } finally {
      setSaving(false);
    }
  }, [
    eventId,
    eventTitle,
    toggles,
    bannerPresentation,
    bannerPlacement,
    bannerImageUrl,
    bannerHeadline,
    bannerCompatOk,
    pushTitle,
    pushBody,
    bellTitle,
    bellBody,
    popupChoice,
    benefitEligible,
    activePopupChoice.presentationType,
    activePopupChoice.creativeMode,
    popupFrequency,
    popupImageUrl,
    popupImagePath,
    heroImageUrl,
    load,
    safeT,
  ]);

  const requestPushSend = useCallback(async () => {
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(
        `/api/admin/platform-events/${encodeURIComponent(eventId)}/distribution/push/send`,
        { method: "POST", credentials: "same-origin" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        sendPath?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "push_send_blocked");
        return;
      }
      setInfo(
        safeT("admin_platform_events_distribution_push_handoff", {
          fallbackKo: `기존 알림 캠페인 발송으로 연결됩니다: ${json.sendPath ?? ""}`,
          fallbackEn: `Hand off to existing notification campaign send: ${json.sendPath ?? ""}`,
        })
      );
    } catch {
      setError("push_send_blocked");
    }
  }, [eventId, safeT]);

  if (loading) {
    return <p className="text-sm text-sam-muted">…</p>;
  }

  return (
    <section
      className="space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4"
      data-admin-event-distribution="1"
    >
      <h2 className="text-base font-semibold">
        {safeT("admin_platform_events_distribution_title", {
          fallbackKo: "이 이벤트를 어디에 알릴까요?",
          fallbackEn: "Where should we announce this event?",
        })}
      </h2>
      <p className="text-xs text-sam-muted">
        {safeT("admin_platform_events_distribution_hint", {
          fallbackKo: "각 채널은 독립입니다. 이벤트 게시만으로 푸시가 나가지 않습니다.",
          fallbackEn: "Channels are independent. Publishing the event never sends push.",
        })}
      </p>

      <div
        className="grid gap-2 rounded-ui-rect border border-sam-border bg-sam-app/30 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4"
        data-admin-dist-channel-summary="1"
      >
        {(
          [
            ["popup", "팝업", "Popup"],
            ["banner", "배너", "Banner"],
            ["push", "Push", "Push"],
            ["bell", "앱 알림", "Bell"],
          ] as const
        ).map(([key, ko, en]) => (
          <div key={key} data-admin-dist-channel-summary-item={key}>
            <span className="font-semibold">{lang === "en" ? en : ko}</span>
            {": "}
            {channelSummaryLabel(toggles[key], channelStatuses[key], lang)}
          </div>
        ))}
      </div>

      {error ? (
        <p className="text-sm text-red-600" data-admin-dist-error="1">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="text-sm text-sam-muted" data-admin-dist-info="1">
          {info}
        </p>
      ) : null}
      {channelResults ? (
        <ul
          className="space-y-1 rounded-ui-rect border border-sam-border bg-sam-app/20 p-3 text-xs"
          data-admin-dist-partial-results="1"
        >
          {(["popup", "banner", "push", "bell"] as const).map((ch) => {
            const r = channelResults[ch];
            if (!r) return null;
            return (
              <li key={ch} data-admin-dist-channel-result={ch} data-ok={r.ok ? "1" : "0"}>
                {ch}: {r.ok ? "OK" : r.error || "FAIL"}
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* POPUP */}
      <div className="space-y-2" data-admin-event-popup-editor="1">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={toggles.popup}
            onChange={(e) => setToggles((t) => ({ ...t, popup: e.target.checked }))}
            data-admin-popup-toggle={toggles.popup ? "on" : "off"}
          />
          {safeT("admin_platform_events_channel_popup", {
            fallbackKo: "팝업",
            fallbackEn: "Popup",
          })}
        </label>
        {toggles.popup ? (
          <div className="ml-6 space-y-3" data-admin-popup-config="1">
            <div
              className="rounded border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm"
              data-admin-popup-dist-lifecycle="1"
              data-admin-popup-dist-lifecycle-kind={popupLifecycle.kind}
            >
              <p className="text-xs text-sam-muted">
                {lang === "en" ? "Configured form" : "설정 형태"}: {popupCompositionLabel}
              </p>
              <p className="mt-1" data-admin-popup-dist-draft-notice="1">
                {popupLifecycle.message}
              </p>
              {popupLifecycle.manageHref ? (
                <p className="mt-1">
                  <Link
                    href={popupLifecycle.manageHref}
                    className="font-medium underline"
                    data-admin-popup-dist-manage-link="1"
                  >
                    {safeT("admin_platform_events_popup_manage", {
                      fallbackKo: "팝업 승인·노출 관리로 이동",
                      fallbackEn: "Open Popup approval / exposure",
                    })}
                  </Link>
                </p>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2" data-admin-popup-presentation-selector="1">
              {POPUP_CHOICES.map((choice) => {
                const disabled = choice.id === "benefit" && !benefitEligible;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    disabled={disabled}
                    className={`rounded-ui-rect border px-3 py-2 text-left text-sm ${
                      popupChoice === choice.id
                        ? "border-sam-fg bg-sam-fg/5"
                        : "border-sam-border"
                    } ${disabled ? "opacity-50" : ""}`}
                    data-admin-popup-presentation={choice.id}
                    data-admin-popup-presentation-disabled={disabled ? "1" : "0"}
                    onClick={() => {
                      if (!disabled) setPopupChoice(choice.id);
                    }}
                  >
                    <div className="font-semibold">{lang === "en" ? choice.en : choice.ko}</div>
                    <div className="mt-0.5 text-xs text-sam-muted">
                      {lang === "en" ? choice.hintEn : choice.hintKo}
                    </div>
                    {disabled ? (
                      <div
                        className="mt-1 text-xs text-red-600"
                        data-admin-popup-benefit-disabled-reason="1"
                      >
                        {safeT("admin_platform_events_popup_benefit_disabled", {
                          fallbackKo: "혜택 정보가 없어 선택할 수 없습니다.",
                          fallbackEn: "Unavailable — Event has no Benefit content.",
                        })}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-sam-muted" data-admin-popup-image-guidance="1">
              {lang === "en" ? activePopupChoice.hintEn : activePopupChoice.hintKo}
            </p>

            <label className="block text-sm">
              {safeT("admin_platform_events_popup_image", {
                fallbackKo: "팝업 이미지 URL (없으면 이벤트 히어로 사용)",
                fallbackEn: "Popup image URL (falls back to Event hero)",
              })}
              <input
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                value={popupImageUrl}
                onChange={(e) => setPopupImageUrl(e.target.value)}
                data-admin-popup-image-url="1"
              />
            </label>

            <label className="block text-sm">
              {safeT("admin_platform_events_popup_frequency", {
                fallbackKo: "노출 빈도",
                fallbackEn: "Frequency",
              })}
              <select
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                value={popupFrequency}
                onChange={(e) => setPopupFrequency(e.target.value)}
                data-admin-popup-frequency="1"
              >
                <option value="once_per_session">
                  {lang === "en" ? "Once per session" : "세션당 1회"}
                </option>
                <option value="once_per_day">
                  {lang === "en" ? "Once per day" : "하루 1회"}
                </option>
                <option value="always">
                  {lang === "en" ? "Every visit" : "방문마다"}
                </option>
              </select>
            </label>

            <div data-admin-popup-preview="1">
              <AdminPlatformPopupPreview source={popupPreviewSource} />
            </div>
          </div>
        ) : (
          <p className="ml-6 text-xs text-sam-muted" data-admin-popup-off="1">
            {popupLifecycle.message}
          </p>
        )}
      </div>

      {/* BANNER */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={toggles.banner}
            onChange={(e) => setToggles((t) => ({ ...t, banner: e.target.checked }))}
            data-admin-banner-toggle={toggles.banner ? "on" : "off"}
          />
          {safeT("admin_platform_events_channel_banner", {
            fallbackKo: "배너",
            fallbackEn: "Banner",
          })}
        </label>
        {toggles.banner ? (
          <div className="ml-6 space-y-3" data-admin-event-banner-editor="1">
            <div className="grid gap-2 sm:grid-cols-2" data-admin-banner-presentation-from-registry="1">
              {listEventBannerPresentations().map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`rounded-ui-rect border px-3 py-2 text-left text-sm ${
                    bannerPresentation === value
                      ? "border-sam-fg bg-sam-fg/5"
                      : "border-sam-border"
                  }`}
                  data-admin-banner-presentation={value}
                  onClick={() => {
                    setBannerPresentation(value);
                    const legal = listEventBannerPlacementsForPresentation(value);
                    if (!legal.includes(bannerPlacement) && legal[0]) {
                      setBannerPlacement(legal[0]);
                    }
                  }}
                >
                  <div className="font-semibold">
                    {eventBannerPresentationLabel(value, lang)}
                  </div>
                  <div className="mt-0.5 text-xs text-sam-muted">
                    {eventBannerImageGuidance(value, lang)}
                  </div>
                </button>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-sm">
                {safeT("admin_platform_events_banner_placement", {
                  fallbackKo: "위치",
                  fallbackEn: "Placement",
                })}
                <select
                  className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                  value={bannerPlacement}
                  data-admin-banner-placement-from-registry="1"
                  onChange={(e) => {
                    const next = e.target.value;
                    if (isEventBannerPlacement(next)) setBannerPlacement(next);
                  }}
                >
                  {listEventBannerPlacementsForPresentation(bannerPresentation).map((p) => (
                    <option key={p} value={p}>
                      {eventBannerPlacementLabel(p, lang)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                {safeT("admin_platform_events_banner_image", {
                  fallbackKo: "배너 이미지 URL",
                  fallbackEn: "Banner image URL",
                })}
                <input
                  className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                  value={bannerImageUrl}
                  onChange={(e) => setBannerImageUrl(e.target.value)}
                />
              </label>
            </div>
            <p className="text-xs text-sam-muted" data-admin-banner-image-guidance="1">
              {eventBannerImageGuidance(bannerPresentation, lang)}
            </p>
            <label className="block text-sm">
              {safeT("admin_platform_events_banner_headline", {
                fallbackKo: "배너 문구 (선택)",
                fallbackEn: "Banner headline (optional)",
              })}
              <input
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                value={bannerHeadline}
                onChange={(e) => setBannerHeadline(e.target.value)}
              />
            </label>
            {!bannerCompatOk ? (
              <p className="text-sm text-red-600" data-admin-banner-compat-fail="1">
                {safeT("admin_platform_events_banner_compat_fail", {
                  fallbackKo: "이 배치와 배너 형태 조합은 허용되지 않습니다.",
                  fallbackEn: "This placement + presentation combination is not allowed.",
                })}
              </p>
            ) : null}

            <div
              className="rounded-ui-rect border border-sam-border bg-sam-app/40 p-3"
              data-admin-banner-preview={bannerPresentation}
            >
              <div className="mb-2 flex flex-wrap gap-2">
                {(
                  [
                    ["phone", "휴대폰", "Phone"],
                    ["tablet_portrait", "태블릿 세로", "Tablet portrait"],
                    ["tablet_landscape", "태블릿 가로", "Tablet landscape"],
                    ["desktop", "데스크톱", "Desktop"],
                  ] as const
                ).map(([mode, ko, en]) => (
                  <button
                    key={mode}
                    type="button"
                    className={`rounded px-2 py-1 text-xs ${
                      bannerPreviewDevice === mode
                        ? "bg-sam-fg text-white"
                        : "border border-sam-border"
                    }`}
                    data-admin-banner-preview-device={mode}
                    onClick={() => setBannerPreviewDevice(mode)}
                  >
                    {lang === "en" ? en : ko}
                  </button>
                ))}
              </div>
              <p className="mb-2 text-xs font-medium text-sam-muted">
                {eventBannerPresentationLabel(bannerPresentation, lang)} ·{" "}
                {eventBannerPlacementLabel(bannerPlacement, lang)} · preview
                {bannerPreviewDevice === "tablet_landscape"
                  ? lang === "en"
                    ? " · landscape allowed"
                    : " · 가로에서도 노출"
                  : ""}
              </p>
              <div
                className="mx-auto overflow-hidden rounded-ui-rect border border-sam-border bg-slate-200/50 p-2"
                style={{
                  width: adminBannerPreviewDeviceOuterWidthPx(bannerPreviewDevice),
                  maxWidth: "100%",
                }}
                data-admin-banner-preview-frame={bannerPreviewDevice}
              >
                {bannerPresentation === "INLINE_BANNER" ? (
                  bannerImageUrl ? (
                    <div
                      className={
                        inlineDensity === "trade" ? "mx-auto w-full" : "w-full"
                      }
                      style={
                        inlineDensity === "trade"
                          ? {
                              width: adminTradeInlinePreviewCellWidthPx(
                                bannerPreviewDevice
                              ),
                              maxWidth: "100%",
                            }
                          : undefined
                      }
                      data-admin-banner-preview-host={
                        inlineDensity === "trade" ? "trade-grid-cell" : "feed-column"
                      }
                    >
                      <FeedAdFramePreview
                        density={inlineDensity}
                        imageUrl={bannerImageUrl}
                        headline={bannerHeadline || eventTitle}
                        alt={bannerHeadline || eventTitle}
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-sam-muted">—</p>
                  )
                ) : bannerImageUrl ? (
                  <DeliveryAdBanner
                    inventory={heroInventory}
                    creative={{
                      assetUrl: bannerImageUrl,
                      headline: bannerHeadline || eventTitle,
                      alt: bannerHeadline || eventTitle,
                    }}
                    destination={{ href: bannerHref, ctaLabel: null }}
                    adLabel="dibaY"
                    renderContext="admin_preview"
                    campaignId={`event-dist-preview-${eventId}`}
                    exposureToken={null}
                  />
                ) : (
                  <p className="text-xs text-sam-muted">—</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="ml-6 text-xs text-sam-muted" data-admin-banner-off="1">
            {safeT("admin_platform_events_banner_off", {
              fallbackKo: "배너 꺼짐",
              fallbackEn: "Banner OFF",
            })}
          </p>
        )}
      </div>

      {/* PUSH */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={toggles.push}
            onChange={(e) => setToggles((t) => ({ ...t, push: e.target.checked }))}
            data-admin-push-toggle={toggles.push ? "on" : "off"}
          />
          {safeT("admin_platform_events_channel_push", {
            fallbackKo: "푸시 알림",
            fallbackEn: "Push notification",
          })}
        </label>
        {toggles.push ? (
          <div className="ml-6 grid gap-2" data-admin-push-config="1">
            <label className="block text-sm">
              {safeT("admin_platform_events_push_title", {
                fallbackKo: "푸시 제목",
                fallbackEn: "Push title",
              })}
              <input
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                value={pushTitle}
                onChange={(e) => setPushTitle(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              {safeT("admin_platform_events_push_body", {
                fallbackKo: "푸시 본문",
                fallbackEn: "Push body",
              })}
              <textarea
                className="mt-1 h-20 w-full rounded border border-sam-border px-2 py-1.5"
                value={pushBody}
                onChange={(e) => setPushBody(e.target.value)}
              />
            </label>
            <div
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
              data-admin-push-preview="1"
            >
              <p className="text-[11px] font-medium text-sam-muted">dibaY · Push preview</p>
              <p className="mt-1 text-sm font-semibold">{pushTitle || "—"}</p>
              <p className="text-xs text-sam-muted">{pushBody || "—"}</p>
              <p className="mt-1 text-[10px] text-sam-muted">
                {safeT("admin_platform_events_push_preview_note", {
                  fallbackKo: "미리보기만 · 저장해도 발송되지 않습니다.",
                  fallbackEn: "Visual only · Save does not dispatch.",
                })}
              </p>
            </div>
            <AdminActionButton
              variant="danger"
              disabled={saving}
              onClick={() => void requestPushSend()}
              data-admin-push-send="1"
            >
              {safeT("admin_platform_events_push_send_now", {
                fallbackKo: "Push 보내기",
                fallbackEn: "Send Push",
              })}
            </AdminActionButton>
          </div>
        ) : null}
      </div>

      {/* BELL */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={toggles.bell}
            onChange={(e) => setToggles((t) => ({ ...t, bell: e.target.checked }))}
            data-admin-bell-toggle={toggles.bell ? "on" : "off"}
          />
          {safeT("admin_platform_events_channel_bell", {
            fallbackKo: "앱 알림",
            fallbackEn: "App notification",
          })}
        </label>
        {toggles.bell ? (
          <div className="ml-6 grid gap-2" data-admin-bell-config="1">
            <label className="block text-sm">
              {safeT("admin_platform_events_bell_title", {
                fallbackKo: "알림함 제목",
                fallbackEn: "Inbox title",
              })}
              <input
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                value={bellTitle}
                onChange={(e) => setBellTitle(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              {safeT("admin_platform_events_bell_body", {
                fallbackKo: "알림함 본문",
                fallbackEn: "Inbox body",
              })}
              <textarea
                className="mt-1 h-20 w-full rounded border border-sam-border px-2 py-1.5"
                value={bellBody}
                onChange={(e) => setBellBody(e.target.value)}
              />
            </label>
            <div
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
              data-admin-bell-preview="1"
            >
              <p className="text-[11px] font-medium text-sam-muted">Bell · inbox row preview</p>
              <p className="mt-1 text-sm font-semibold">{bellTitle || "—"}</p>
              <p className="text-xs text-sam-muted">{bellBody || "—"}</p>
              <p className="mt-1 text-[10px] text-sam-muted">
                {safeT("admin_platform_events_bell_preview_note", {
                  fallbackKo: "알림함 행 미리보기 · Push와 독립.",
                  fallbackEn: "Inbox row preview · independent of Push.",
                })}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <AdminActionButton
        variant="primary"
        disabled={saving}
        onClick={() => void save()}
        data-admin-dist-save="1"
      >
        {saving
          ? safeT("admin_platform_events_distribution_saving", {
              fallbackKo: "저장 중…",
              fallbackEn: "Saving…",
            })
          : safeT("admin_platform_events_distribution_save", {
              fallbackKo: "노출 설정 저장",
              fallbackEn: "Save exposure settings",
            })}
      </AdminActionButton>
    </section>
  );
}
