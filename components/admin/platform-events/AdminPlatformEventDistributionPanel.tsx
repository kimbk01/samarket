"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FeedAdFramePreview } from "@/components/ads/FeedAdBannerCarousel";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliveryAdBanner } from "@/components/stores/advertising/DeliveryAdBanner";
import { buildPlatformEventDetailPath } from "@/lib/platform-events/types";
import {
  eventBannerPresentationLabel,
  isEventBannerPlacementPresentationCompatible,
  normalizeEventBannerPresentation,
  type EventBannerPresentation,
} from "@/lib/platform-promotion-distribution/banner-presentation";
import type { PromotionDistributionToggleDraft } from "@/lib/platform-promotion-distribution/types";
import { emptyDistributionToggles } from "@/lib/platform-promotion-distribution/types";
import { inventoryViewFromKey } from "@/lib/stores/advertising/delivery-ad-banner-contract";

type Props = {
  eventId: string;
  eventTitle: string;
};

/**
 * Operator-facing distribution panel.
 * Independent channel toggles — not a developer settings dump.
 */
export function AdminPlatformEventDistributionPanel({ eventId, eventTitle }: Props) {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const [toggles, setToggles] = useState<PromotionDistributionToggleDraft>(emptyDistributionToggles);
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [bellTitle, setBellTitle] = useState("");
  const [bellBody, setBellBody] = useState("");
  const [bannerPresentation, setBannerPresentation] =
    useState<EventBannerPresentation>("INLINE_BANNER");
  const [bannerPlacement, setBannerPlacement] = useState("TRADE_HOME");
  const [bannerImageUrl, setBannerImageUrl] = useState("");
  const [bannerHeadline, setBannerHeadline] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const bannerCompatOk = useMemo(
    () => isEventBannerPlacementPresentationCompatible(bannerPlacement, bannerPresentation),
    [bannerPlacement, bannerPresentation]
  );

  const bannerHref = useMemo(() => buildPlatformEventDetailPath(eventId), [eventId]);
  const heroInventory = useMemo(() => inventoryViewFromKey("STORES_HOME_HERO"), []);
  const inlineDensity = bannerPlacement.startsWith("COMMUNITY") ? "community" : "trade";

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
        rows?: Array<{ channel: string; config?: Record<string, unknown> }>;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "load_failed");
        return;
      }
      if (json.toggles) setToggles(json.toggles);
      for (const row of json.rows ?? []) {
        const cfg = row.config ?? {};
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
          setBannerPlacement(String(cfg.placement ?? "TRADE_HOME"));
          setBannerImageUrl(String(cfg.imageUrl ?? ""));
          setBannerHeadline(String(cfg.headline ?? ""));
        }
      }
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
    setSaving(true);
    setError(null);
    setInfo(null);
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
            },
          }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        pushDispatchCount?: number;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "save_failed");
        return;
      }
      if (json.pushDispatchCount !== 0) {
        setError("push_dispatch_on_save_forbidden");
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
    pushTitle,
    pushBody,
    bellTitle,
    bellBody,
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

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {info ? <p className="text-sm text-sam-muted">{info}</p> : null}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={toggles.popup}
          onChange={(e) => setToggles((t) => ({ ...t, popup: e.target.checked }))}
        />
        {safeT("admin_platform_events_channel_popup", {
          fallbackKo: "팝업",
          fallbackEn: "Popup",
        })}
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={toggles.banner}
          onChange={(e) => setToggles((t) => ({ ...t, banner: e.target.checked }))}
        />
        {safeT("admin_platform_events_channel_banner", {
          fallbackKo: "배너",
          fallbackEn: "Banner",
        })}
      </label>
      {toggles.banner ? (
        <div className="ml-6 space-y-3" data-admin-event-banner-editor="1">
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["INLINE_BANNER", "인라인 배너", "Inline banner"],
                ["HERO_BANNER", "히어로 배너", "Hero banner"],
              ] as const
            ).map(([value, ko, en]) => (
              <button
                key={value}
                type="button"
                className={`rounded-ui-rect border px-3 py-2 text-left text-sm ${
                  bannerPresentation === value
                    ? "border-sam-fg bg-sam-fg/5"
                    : "border-sam-border"
                }`}
                data-admin-banner-presentation={value}
                onClick={() => setBannerPresentation(value)}
              >
                <div className="font-semibold">{lang === "en" ? en : ko}</div>
                <div className="mt-0.5 text-xs text-sam-muted">
                  {value === "INLINE_BANNER"
                    ? lang === "en"
                      ? "Feed flow · 3:1"
                      : "피드 흐름 · 3:1"
                    : lang === "en"
                      ? "Prominent · 39:16 geometry"
                      : "강조 배너 · 39:16 지오메트리"}
                </div>
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              {safeT("admin_platform_events_banner_placement", {
                fallbackKo: "배치",
                fallbackEn: "Placement",
              })}
              <select
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                value={bannerPlacement}
                onChange={(e) => setBannerPlacement(e.target.value)}
              >
                <option value="TRADE_HOME">
                  {lang === "en" ? "Trade home" : "거래 홈"}
                </option>
                <option value="COMMUNITY_HOME">
                  {lang === "en" ? "Community home" : "커뮤니티 홈"}
                </option>
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
            <p className="mb-2 text-xs font-medium text-sam-muted">
              {eventBannerPresentationLabel(bannerPresentation, lang)} · preview
            </p>
            {bannerPresentation === "INLINE_BANNER" ? (
              bannerImageUrl ? (
                <FeedAdFramePreview
                  density={inlineDensity}
                  imageUrl={bannerImageUrl}
                  headline={bannerHeadline || eventTitle}
                  alt={bannerHeadline || eventTitle}
                />
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
      ) : null}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={toggles.push}
          onChange={(e) => setToggles((t) => ({ ...t, push: e.target.checked }))}
        />
        {safeT("admin_platform_events_channel_push", {
          fallbackKo: "푸시 알림",
          fallbackEn: "Push notification",
        })}
      </label>
      {toggles.push ? (
        <div className="ml-6 grid gap-2">
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
          <button
            type="button"
            disabled={saving}
            className="w-fit rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
            onClick={() => void requestPushSend()}
          >
            {safeT("admin_platform_events_push_send_now", {
              fallbackKo: "지금 발송 (기존 엔진)",
              fallbackEn: "Send now (existing engine)",
            })}
          </button>
        </div>
      ) : null}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={toggles.bell}
          onChange={(e) => setToggles((t) => ({ ...t, bell: e.target.checked }))}
        />
        {safeT("admin_platform_events_channel_bell", {
          fallbackKo: "알림함",
          fallbackEn: "Notification inbox",
        })}
      </label>
      {toggles.bell ? (
        <div className="ml-6 grid gap-2">
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

      <button
        type="button"
        disabled={saving}
        className="rounded-ui-rect bg-sam-fg px-3 py-2 text-sm font-semibold text-sam-app"
        onClick={() => void save()}
      >
        {safeT("admin_platform_events_distribution_save", {
          fallbackKo: "배포 설정 저장",
          fallbackEn: "Save distribution",
        })}
      </button>
    </section>
  );
}
