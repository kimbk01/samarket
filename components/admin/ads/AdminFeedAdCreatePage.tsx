"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Image as ImageIcon } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { translateBy } from "@/lib/i18n/translate-by";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import type { FeedAdDomain, FeedAdPlacement } from "@/lib/ads/feed-ad-placement";
import { normalizeFeedAdTopicSlug } from "@/lib/ads/feed-ad-placement";
import { countFeedAdPoolOccupancy, feedAdPoolCapacity, feedAdPoolKey } from "@/lib/ads/feed-ad-pool-capacity";
import {
  FEED_AD_RECOMMENDED_UPLOAD,
  FEED_AD_UPLOAD_MAX_FILE_BYTES,
  feedAdMediaClass,
  feedAdMediaHeightClass,
} from "@/lib/ads/feed-ad-geometry";
import { FeedAdFramePreview } from "@/components/ads/FeedAdBannerCarousel";
import { AdminDestinationResolvedHint } from "@/components/admin/destination/AdminDestinationResolvedHint";
import { feedAdDestinationRef } from "@/lib/ads/feed-ad-destination";
import { FeedAdStoreDestinationPicker } from "@/components/admin/feed-ads/FeedAdStoreDestinationPicker";
import { destinationHref, eventDestinationPath } from "@/lib/destination/destination-contract";
import { adsCreateConfirmCopy } from "@/lib/admin/ads-exposure/admin-mutation-confirm-copy";
import { humanPlacementLabel } from "@/lib/admin/ads-exposure/human-placement-label";
import { adminManilaInputToIso } from "@/lib/admin/operator-ux/admin-manila-datetime-input";
import { feedAdAdvertiserDisplayName } from "@/lib/ads/feed-ad-advertiser-name";

type SlideDraft = {
  imageUrl: string;
  altText: string;
  headline: string;
  previewUrl: string;
  fileName: string;
};

type TradeCatOpt = { id: string; name: string; nameEn: string | null; slug: string };
type TopicOpt = { id: string; slug: string; name: string; nameEn: string | null };

const EMPTY_SLIDE: SlideDraft = {
  imageUrl: "",
  altText: "",
  headline: "",
  previewUrl: "",
  fileName: "",
};

function humanUploadError(raw: string, ko: boolean): string {
  const s = raw.toLowerCase();
  if (s.includes("too large") || s.includes("too_large") || s.includes("max") || s.includes("2mb") || s.includes("file_size")) {
    return translateBy(ko ? "ko" : "en", "admin_ads_file_too_large_max_2mb");
  }
  if (s.includes("invalid_type")) {
    return translateBy(ko ? "ko" : "en", "admin_ads_jpg_png_web_p_images");
  }
  if (s.includes("decode") || s.includes("invalid_dimensions")) {
    return translateBy(ko ? "ko" : "en", "admin_ads_could_not_read_image_use");
  }
  if (s.includes("aspect") || s.includes("ratio") || s.includes("geometry")) {
    return translateBy(ko ? "ko" : "en", "admin_ads_image_aspect_does_not_match");
  }
  if (s.includes("small") || s.includes("below") || s.includes("min") || s.includes("dimension")) {
    return translateBy(ko ? "ko" : "en", "admin_ads_image_too_small_recommended_1200");
  }
  // FA-3: 알 수 없는 코드값은 화면에 그대로 내보내지 않는다
  return translateBy(ko ? "ko" : "en", "admin_ads_could_not_upload_image");
}

/**
 * Admin Feed Ad create — product UX order (not DB field order).
 * CUT R2: lockable Community/Trade product entries from Ads Direct.
 */
export function AdminFeedAdCreatePage({
  lockedDomain,
  entry = "legacy",
}: {
  lockedDomain?: FeedAdDomain;
  entry?: "legacy" | "ads-direct";
} = {}) {
  const { safeT, t, language } = useI18n();
  const router = useRouter();
  const langEn = language === "en";
  const ko = !langEn;
  const fileRefs = useRef<Array<HTMLInputElement | null>>([null, null, null]);

  const [name, setName] = useState("");
  const [domain, setDomain] = useState<FeedAdDomain>(lockedDomain ?? "trade");
  const [surfaceMode, setSurfaceMode] = useState<"home" | "targeted">("home");
  const [targetCategoryId, setTargetCategoryId] = useState("");
  const [targetTopicSlug, setTargetTopicSlug] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [status, setStatus] = useState<"draft" | "active">("draft");
  const [destinationType, setDestinationType] = useState("internal_page");
  const [destinationId, setDestinationId] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [slides, setSlides] = useState<[SlideDraft, SlideDraft, SlideDraft]>([
    { ...EMPTY_SLIDE },
    { ...EMPTY_SLIDE },
    { ...EMPTY_SLIDE },
  ]);
  const [tradeCategories, setTradeCategories] = useState<TradeCatOpt[]>([]);
  const [communityTopics, setCommunityTopics] = useState<TopicOpt[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(true);
  /** 대상(카테고리·주제) 불러오기 실패 — 빈 목록과 구분 (AdminStateViews 4종) */
  const [targetsError, setTargetsError] = useState<{ code: string | null; httpStatus?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  /** IA-04 (K-2): 피드 배너 등록(POST·업로드) = ads 키 (접근표 action — API 403 과 같은 판정) */
  const feedAdAction = useAdminRouteAction("/admin/feed-ads");
  const [err, setErr] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [uploading, setUploading] = useState<number | null>(null);
  /** 풀별 점유 수 — 키 = 위치 + 대상(업종/주제) · 서버 검사·DB 트리거와 같은 풀 (광고 S-3) */
  const [usedByPool, setUsedByPool] = useState<Record<string, number>>({});

  useEffect(() => {
    if (lockedDomain) setDomain(lockedDomain);
  }, [lockedDomain]);

  const loadTargets = useCallback(async () => {
    setTargetsLoading(true);
    setTargetsError(null);
    try {
      const res = await fetch("/api/admin/feed-ads/targets", { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as {
        tradeCategories?: TradeCatOpt[];
        communityTopics?: TopicOpt[];
        error?: string;
      };
      if (!res.ok) setTargetsError({ code: j.error ?? null, httpStatus: res.status });
      setTradeCategories(Array.isArray(j.tradeCategories) ? j.tradeCategories : []);
      setCommunityTopics(Array.isArray(j.communityTopics) ? j.communityTopics : []);
    } catch {
      setTargetsError({ code: "network_error" });
    } finally {
      setTargetsLoading(false);
    }
  }, []);

  const loadCapacity = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/feed-ads", { cache: "no-store", credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        campaigns?: Array<{
          placement?: string;
          status?: string;
          endAt?: string | null;
          targetCategoryId?: string | null;
          targetTopicSlug?: string | null;
        }>;
      };
      if (!res.ok || !j.ok || !Array.isArray(j.campaigns)) return;
      // FB-A11: 위치 지도·서버 검사와 같은 함수로 센다 (풀 = 위치 + 업종/주제 · 종료 시각 지난 active 는 세지 않음)
      const counts = countFeedAdPoolOccupancy(
        j.campaigns.filter((c) => Boolean(c.placement)).map((c) => ({
          placement: c.placement,
          status: c.status,
          endAt: c.endAt,
          targetCategoryId: c.targetCategoryId,
          targetTopicSlug: c.targetTopicSlug,
        }))
      );
      setUsedByPool(Object.fromEntries(counts));
    } catch {
      /* capacity is informational */
    }
  }, []);

  useEffect(() => {
    void loadTargets();
    void loadCapacity();
  }, [loadTargets, loadCapacity]);

  const placement: FeedAdPlacement = useMemo(() => {
    if (domain === "trade") {
      return surfaceMode === "home" ? "TRADE_HOME" : "TRADE_CATEGORY";
    }
    return surfaceMode === "home" ? "COMMUNITY_HOME" : "COMMUNITY_TOPIC";
  }, [domain, surfaceMode]);

  const capacity = feedAdPoolCapacity(placement);
  const used =
    usedByPool[
      feedAdPoolKey(placement, {
        targetCategoryId: targetCategoryId.trim(),
        targetTopicSlug: normalizeFeedAdTopicSlug(targetTopicSlug),
      })
    ] ?? 0;
  const remaining = Math.max(0, capacity - used);
  const createCopy = adsCreateConfirmCopy(ko);
  const backHref = entry === "ads-direct" ? "/admin/advertising/direct" : "/admin/feed-ads";
  const productTitle =
    domain === "community"
      ? t("admin_ads_community_banner")
      : t("admin_ads_trade_banner");

  const uploadSlide = async (index: number, file: File) => {
    setUploading(index);
    setErr("");
    if (file.size > FEED_AD_UPLOAD_MAX_FILE_BYTES) {
      setErr(humanUploadError("file_size", ko));
      setUploading(null);
      return;
    }
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/admin/feed-ads/upload", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !j.ok || !j.url) {
        setErr(humanUploadError(j.error ?? "upload_failed", ko));
        return;
      }
      const preview = URL.createObjectURL(file);
      setSlides((prev) => {
        const next = [...prev] as [SlideDraft, SlideDraft, SlideDraft];
        if (next[index].previewUrl.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(next[index].previewUrl);
          } catch {
            /* ignore */
          }
        }
        next[index] = {
          ...next[index],
          imageUrl: j.url!,
          previewUrl: preview,
          altText: next[index].altText || file.name,
          fileName: file.name,
        };
        return next;
      });
    } finally {
      setUploading(null);
    }
  };

  const clearSlide = (index: number) => {
    setSlides((prev) => {
      const next = [...prev] as [SlideDraft, SlideDraft, SlideDraft];
      if (next[index].previewUrl.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(next[index].previewUrl);
        } catch {
          /* ignore */
        }
      }
      next[index] = { ...EMPTY_SLIDE };
      return next;
    });
  };

  const filledSlides = slides.filter((s) => s.imageUrl.trim()).length;

  const requestSave = async () => {
    setErr("");
    setSuccessMsg("");
    if (!name.trim()) {
      setErr(safeT("admin_feed_ads_err_name"));
      return;
    }
    if (filledSlides < 1) {
      setErr(safeT("admin_feed_ads_err_slides"));
      return;
    }
    if (placement === "TRADE_CATEGORY" && !targetCategoryId.trim()) {
      setErr(safeT("admin_feed_ads_err_category"));
      return;
    }
    if (placement === "COMMUNITY_TOPIC" && !targetTopicSlug.trim()) {
      setErr(safeT("admin_feed_ads_err_topic"));
      return;
    }
    if (uploading != null) {
      setErr(safeT("admin_feed_ads_err_upload"));
      return;
    }
    if (remaining <= 0 && status === "active") {
      setErr(
        t("admin_ads_cannot_register_more_placement_full")
      );
      return;
    }
    // 등록 확인 — 단계는 동작 표(createCopy.level = save)
    const confirmed = await confirmAdminAction({
      level: createCopy.level,
      ko,
      title: createCopy.title,
      description: createCopy.body,
      confirmLabel: createCopy.confirmLabel,
      destructive: createCopy.tone === "danger",
    });
    if (confirmed.ok) void save();
  };

  const save = async () => {
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      const payloadSlides = slides
        .map((s, i) => ({
          sortOrder: i + 1,
          imageUrl: s.imageUrl,
          altText: s.altText,
          headline: s.headline,
        }))
        .filter((s) => s.imageUrl.trim());

      const res = await fetch("/api/admin/feed-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          domain,
          placement,
          targetCategoryId: placement === "TRADE_CATEGORY" ? targetCategoryId : undefined,
          targetTopicSlug: placement === "COMMUNITY_TOPIC" ? targetTopicSlug : undefined,
          // FA-4: 입력은 PHT 벽시계 — 브라우저 시간대가 아니라 Asia/Manila 로 변환
          startAt: startAt ? adminManilaInputToIso(startAt) ?? undefined : undefined,
          endAt: endAt ? adminManilaInputToIso(endAt) ?? undefined : undefined,
          status,
          destinationType,
          destinationId,
          destinationUrl,
          slides: payloadSlides,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
        campaignId?: string;
      };
      if (!res.ok || !j.ok) {
        // FB-A10 · DS-2 · DS-3: 서버가 준 한국어 안내 우선 (영어 코드값을 보이지 않음)
        setErr(ko && j.message ? j.message : adminOperatorErrorMessage(j.error, ko));
        return;
      }
      setSuccessMsg(t("admin_ads_ad_registered"));
      await loadCapacity();
      router.push("/admin/advertising/operations");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const labelCat = (c: TradeCatOpt) => (langEn && c.nameEn ? c.nameEn : c.name);
  const labelTopic = (t: TopicOpt) => (langEn && t.nameEn ? t.nameEn : t.name);

  return (
    <div
      className="mx-auto max-w-3xl space-y-6"
      data-admin-feed-ad-create="1"
      data-admin-feed-ad-domain={domain}
      data-admin-ads-direct-entry={entry}
    >
      <AdminPageHeader title={productTitle} backHref={backHref} />

      {/* 1 기본정보 */}
      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="sam-text-body font-semibold text-sam-fg">
          {productTitle}
        </h2>
        <label className="block">
          <span className="mb-1 block sam-text-body font-medium">
            {safeT("admin_feed_ads_col_name")}
          </span>
          <input
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {/* FA-1: 이 이름이 거래·커뮤니티 피드 광고 머리줄에 광고주 이름으로 보인다 */}
          <span className="mt-1 block sam-text-helper text-sam-muted" data-admin-feed-name-hint="1">
            {safeT("ads_f_feed_name_hint")}
          </span>
        </label>
      </section>

      {/* 2 Domain — hidden when locked from Direct product entry */}
      {!lockedDomain ? (
      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="sam-text-body font-semibold text-sam-fg">
          {safeT("admin_feed_ads_sec_domain")}
        </h2>
        <div className="flex gap-2">
          <AdminChipButton
            selected={domain === "trade"}
            className="flex-1 justify-center"
            onClick={() => {
              setDomain("trade");
              setSurfaceMode("home");
              setTargetTopicSlug("");
            }}
          >
            Trade
          </AdminChipButton>
          <AdminChipButton
            selected={domain === "community"}
            className="flex-1 justify-center"
            onClick={() => {
              setDomain("community");
              setSurfaceMode("home");
              setTargetCategoryId("");
            }}
          >
            Community
          </AdminChipButton>
        </div>
      </section>
      ) : null}

      {/* 3 Surface */}
      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-feed-placement="1">
        <h2 className="sam-text-body font-semibold text-sam-fg">
          {t("admin_ads_label_placement")}
        </h2>
        <div className="flex gap-2">
          <AdminChipButton
            selected={surfaceMode === "home"}
            className="flex-1 justify-center"
            onClick={() => setSurfaceMode("home")}
          >
            {domain === "trade"
              ? t("admin_ads_trade_home_feed")
              : t("admin_ads_community_home_feed")}
          </AdminChipButton>
          <AdminChipButton
            selected={surfaceMode === "targeted"}
            className="flex-1 justify-center"
            onClick={() => setSurfaceMode("targeted")}
          >
            {domain === "trade"
              ? t("admin_ads_trade_category_feed")
              : t("admin_ads_community_topic_feed")}
          </AdminChipButton>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2" data-admin-feed-capacity="1">
          <p className="text-[13px] font-medium text-sam-fg">
            {humanPlacementLabel(placement, ko)}
          </p>
          <p className="text-[12px] text-sam-muted">{placement}</p>
          <p className="mt-1 text-[13px] text-sam-fg">
            {t("admin_ads_use_used_capacity", { used, capacity: String(capacity) })}
          </p>
          <p className="text-[13px] text-sam-muted">
            {remaining > 0
              ? t("admin_ads_available_remaining", { remaining })
              : t("admin_ads_status_cannot_add_more")}
          </p>
        </div>
        {/* FA-2: 커뮤니티 주제 배너는 커뮤니티 전체 피드에도 나온다 */}
        {placement === "COMMUNITY_TOPIC" ? (
          <p className="sam-text-helper text-sam-muted" data-admin-feed-topic-all-hint="1">
            {safeT("ads_f_feed_topic_also_all_hint")}
          </p>
        ) : null}
      </section>

      {/* 4 Target SSOT */}
      {surfaceMode === "targeted" ? (
        <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-semibold text-sam-fg">
            {safeT("admin_feed_ads_sec_target")}
          </h2>
          {targetsLoading ? (
            <AdminLoadingState ko={ko} label={t("common_loading")} />
          ) : targetsError ? (
            <AdminErrorState
              ko={ko}
              code={targetsError.code}
              httpStatus={targetsError.httpStatus}
              onRetry={() => void loadTargets()}
            />
          ) : (domain === "trade" ? tradeCategories.length : communityTopics.length) === 0 ? (
            <AdminEmptyState
              ko={ko}
              message={
                domain === "trade"
                  ? t("admin_ads_no_trade_categories_available")
                  : t("admin_ads_no_community_topics_available")
              }
            />
          ) : domain === "trade" ? (
            <label className="block">
              <span className="mb-1 block sam-text-body font-medium">
                {safeT("admin_feed_ads_trade_cat")}
              </span>
              <select
                className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
                value={targetCategoryId}
                onChange={(e) => setTargetCategoryId(e.target.value)}
              >
                <option value="">
                  {safeT("admin_feed_ads_select")}
                </option>
                {tradeCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {labelCat(c)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block">
              <span className="mb-1 block sam-text-body font-medium">
                {safeT("admin_feed_ads_community_topic")}
              </span>
              <select
                className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
                value={targetTopicSlug}
                onChange={(e) => setTargetTopicSlug(e.target.value)}
              >
                <option value="">
                  {safeT("admin_feed_ads_select")}
                </option>
                {communityTopics.map((tp) => (
                  <option key={tp.slug} value={tp.slug}>
                    {labelTopic(tp)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>
      ) : null}

      {/* 5 Images */}
      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-feed-creative="1">
        <h2 className="sam-text-body font-semibold text-sam-fg">
          {t("common_image")}
        </h2>
        <dl
          className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-3 text-[13px]"
          data-admin-feed-creative-spec="1"
        >
          <dt className="text-sam-muted">{t("admin_ads_aspect")}</dt>
          <dd className="font-semibold text-sam-fg">{FEED_AD_RECOMMENDED_UPLOAD.aspectLabel}</dd>
          <dt className="text-sam-muted">{t("admin_ads_recommended")}</dt>
          <dd className="font-semibold text-sam-fg">
            {FEED_AD_RECOMMENDED_UPLOAD.standardWidthPx} × {FEED_AD_RECOMMENDED_UPLOAD.standardHeightPx}px
          </dd>
          <dt className="text-sam-muted">{t("admin_ads_max_size")}</dt>
          <dd className="font-semibold text-sam-fg">2MB</dd>
          <dt className="text-sam-muted">{t("admin_ads_runtime_3")}</dt>
          <dd className="text-sam-fg">
            {t("admin_ads_feed_banner_placement_3_1")}
          </dd>
        </dl>
        <div className="grid gap-3 md:grid-cols-3">
          {slides.map((s, i) => (
            <div key={i} className="rounded-ui-rect border border-sam-border-soft p-3">
              <p className="mb-2 font-semibold">
                {i === 0 ? (t("admin_ads_primary_image")) : `Slide ${i + 1}`}
              </p>
              {s.previewUrl || s.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin preview
                <img
                  src={s.previewUrl || s.imageUrl}
                  alt={s.altText || `slide ${i + 1}`}
                  className={`mb-2 ${feedAdMediaClass(domain === "community" ? "community" : "trade")} rounded-ui-rect`}
                />
              ) : (
                <div
                  className={`mb-2 flex ${feedAdMediaHeightClass(domain === "community" ? "community" : "trade")} w-full items-center justify-center rounded-ui-rect bg-sam-app text-sam-muted`}
                >
                  {uploading === i
                    ? t("common_loading")
                    : t("admin_ads_no_image")}
                </div>
              )}
              {s.fileName ? (
                <p className="mb-2 truncate text-[12px] text-sam-muted">{s.fileName}</p>
              ) : null}
              <input
                ref={(el) => {
                  fileRefs.current[i] = el;
                }}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                data-admin-feed-file-input={i}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadSlide(i, f);
                  e.target.value = "";
                }}
              />
              <AdminActionButton
                variant="secondary"
                className="mb-2 w-full"
                data-admin-feed-image-picker={i}
                onClick={() => fileRefs.current[i]?.click()}
                disabled={uploading != null}
              >
                <ImageIcon className="h-4 w-4 shrink-0" aria-hidden />
                {s.imageUrl
                  ? t("admin_ads_replace_image")
                  : t("admin_ads_choose_image_from_pc")}
              </AdminActionButton>
              <input
                className="mb-2 w-full rounded-ui-rect border border-sam-border px-2 py-1.5 sam-text-helper"
                placeholder="alt"
                value={s.altText}
                onChange={(e) =>
                  setSlides((prev) => {
                    const next = [...prev] as [SlideDraft, SlideDraft, SlideDraft];
                    next[i] = { ...next[i], altText: e.target.value };
                    return next;
                  })
                }
              />
              <input
                className="mb-2 w-full rounded-ui-rect border border-sam-border px-2 py-1.5 sam-text-helper"
                placeholder="headline"
                value={s.headline}
                onChange={(e) =>
                  setSlides((prev) => {
                    const next = [...prev] as [SlideDraft, SlideDraft, SlideDraft];
                    next[i] = { ...next[i], headline: e.target.value };
                    return next;
                  })
                }
              />
              <AdminActionButton variant="danger"size="sm" onClick={() => clearSlide(i)}>
                {t("common_delete")}
              </AdminActionButton>
            </div>
          ))}
        </div>
      </section>

      {/* 6 Destination */}
      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="sam-text-body font-semibold text-sam-fg">
          {safeT("admin_feed_ads_sec_dest")}
        </h2>
        <select
          className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
          value={destinationType}
          onChange={(e) => setDestinationType(e.target.value)}
        >
          {/* DS-3 · C-1: 「없음」 선택지 없음 — 목적지 필수 */}
          <option value="internal_page">{t("admin_ads_app_screen")}</option>
          <option value="trade_listing">{t("admin_ads_trade_listing")}</option>
          <option value="community_post">{t("admin_ads_community_post")}</option>
          <option value="store">{t("common_store")}</option>
          <option value="event">
            {safeT("admin_feed_ad_destination_type_event")}
          </option>
          <option value="external_url">{t("admin_ads_external_url")}</option>
        </select>
        <p className="sam-text-helper text-sam-muted">
          {t("admin_ads_destination_required")}
        </p>
        {destinationType === "store" ? (
          /* DS-2: 매장은 선택기로 고르고 slug 로 저장 */
          <FeedAdStoreDestinationPicker value={destinationId} onChange={setDestinationId} />
        ) : destinationType === "external_url" || destinationType === "internal_page" ? (
          <input
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            placeholder={destinationType === "external_url" ? "https://..." : "/path"}
            value={destinationUrl}
            onChange={(e) => setDestinationUrl(e.target.value)}
          />
        ) : (
          <input
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            placeholder="id"
            value={destinationId}
            onChange={(e) => setDestinationId(e.target.value)}
          />
        )}
        {destinationUrl.trim() || destinationId.trim() ? (
          <AdminDestinationResolvedHint
            href={(() => {
              const ref = feedAdDestinationRef(
                destinationType === "event"
                  ? { destinationType: "internal_page", destinationUrl: eventDestinationPath(destinationId.trim()) }
                  : { destinationType, destinationId, destinationUrl }
              );
              return ref ? destinationHref(ref) : destinationUrl.trim() || destinationId.trim();
            })()}
            language={langEn ? "en" : "ko"}
          />
        ) : null}
      </section>

      {/* 7 Schedule */}
      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="sam-text-body font-semibold text-sam-fg">
          {safeT("admin_feed_ads_sec_schedule")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block sam-text-body font-medium">
              {safeT("ads_f_start_pht")}
            </span>
            <input
              type="datetime-local"
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block sam-text-body font-medium">
              {safeT("ads_f_end_pht")}
            </span>
            <input
              type="datetime-local"
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block sam-text-body font-medium">
            {safeT("admin_feed_ads_col_status")}
          </span>
          <select
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            value={status}
            onChange={(e) => setStatus(e.target.value as "draft" | "active")}
          >
            <option value="draft">
              {safeT("ads_f_status_draft")}
            </option>
            <option value="active">
              {safeT("ads_f_status_active")}
            </option>
          </select>
        </label>
      </section>

      {/* 8 Preview — same FeedAd frame geometry as consumer */}
      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-feed-runtime-preview="1">
        <h2 className="sam-text-body font-semibold text-sam-fg">
          {domain === "community"
            ? t("admin_ads_community_live_style_preview")
            : t("admin_ads_trade_live_style_preview")}
        </h2>
        <p className="sam-text-helper text-sam-muted">
          {humanPlacementLabel(placement, ko)} · {placement}
          {` · ${filledSlides}/3`}
        </p>
        <div className="mx-auto w-full max-w-md space-y-2 rounded-ui-rect border border-dashed border-sam-border bg-sam-app p-2">
          <div className="h-10 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-2 sam-text-helper text-sam-muted">
            {safeT("admin_feed_ads_preview_row")}
          </div>
          {(() => {
            const first = slides.find((s) => s.imageUrl || s.previewUrl);
            if (!first) {
              return (
                <p className="py-4 text-center sam-text-helper text-sam-muted">
                  {t("admin_ads_choose_image_preview_at_live")}
                </p>
              );
            }
            return (
              <FeedAdFramePreview
                density={domain === "community" ? "community" : "trade"}
                imageUrl={first.previewUrl || first.imageUrl}
                headline={first.headline}
                alt={first.altText}
                advertiserName={feedAdAdvertiserDisplayName(name)}
              />
            );
          })()}
          <div className="h-10 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-2 sam-text-helper text-sam-muted">
            {safeT("admin_feed_ads_preview_row")}
          </div>
        </div>
      </section>

      {err ? (
        <p className="whitespace-pre-line text-sam-danger" role="alert">
          {err}
        </p>
      ) : null}
      {successMsg ? (
        <p className="text-sam-success" role="status">
          {successMsg}
        </p>
      ) : null}

      {!feedAdAction.allowed && feedAdAction.reason ? (
        <p className="text-[12px] text-sam-muted" data-admin-action-denied="1">
          {feedAdAction.reason}
        </p>
      ) : null}
      <AdminActionButton
        variant="primary"
        disabled={busy || uploading != null || !feedAdAction.allowed}
        title={feedAdAction.reason ?? undefined}
        onClick={() => void requestSave()}
        className="w-full"
        data-admin-feed-register-cta="1"
      >
        {busy
          ? t("common_loading")
          : t("admin_ads_register_ad")}
      </AdminActionButton>

    </div>
  );
}
