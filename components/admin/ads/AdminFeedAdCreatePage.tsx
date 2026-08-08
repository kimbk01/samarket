"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { FeedAdDomain, FeedAdPlacement } from "@/lib/ads/feed-ad-placement";
import {
  FEED_AD_MEDIA_ASPECT_CLASS,
  FEED_AD_RECOMMENDED_UPLOAD,
} from "@/lib/ads/feed-ad-geometry";
import { FeedAdFramePreview } from "@/components/ads/FeedAdBannerCarousel";

type SlideDraft = {
  imageUrl: string;
  altText: string;
  headline: string;
  previewUrl: string;
};

type TradeCatOpt = { id: string; name: string; nameEn: string | null; slug: string };
type TopicOpt = { id: string; slug: string; name: string; nameEn: string | null };

const EMPTY_SLIDE: SlideDraft = { imageUrl: "", altText: "", headline: "", previewUrl: "" };

/**
 * Admin Feed Ad create — product UX order (not DB field order).
 * Category/Topic from SSOT APIs only (no raw id primary input).
 */
export function AdminFeedAdCreatePage() {
  const { safeT, t, language } = useI18n();
  const router = useRouter();
  const langEn = language === "en";

  const [name, setName] = useState("");
  const [domain, setDomain] = useState<FeedAdDomain>("trade");
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState<number | null>(null);

  const loadTargets = useCallback(async () => {
    setTargetsLoading(true);
    try {
      const res = await fetch("/api/admin/feed-ads/targets", { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as {
        tradeCategories?: TradeCatOpt[];
        communityTopics?: TopicOpt[];
      };
      setTradeCategories(Array.isArray(j.tradeCategories) ? j.tradeCategories : []);
      setCommunityTopics(Array.isArray(j.communityTopics) ? j.communityTopics : []);
    } finally {
      setTargetsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTargets();
  }, [loadTargets]);

  const placement: FeedAdPlacement = useMemo(() => {
    if (domain === "trade") {
      return surfaceMode === "home" ? "TRADE_HOME" : "TRADE_CATEGORY";
    }
    return surfaceMode === "home" ? "COMMUNITY_HOME" : "COMMUNITY_TOPIC";
  }, [domain, surfaceMode]);

  const uploadSlide = async (index: number, file: File) => {
    setUploading(index);
    setErr("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/admin/feed-ads/upload", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !j.ok || !j.url) {
        setErr(j.error ?? "upload_failed");
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

  const save = async () => {
    if (busy) return;
    setErr("");
    if (!name.trim()) {
      setErr(safeT("admin_feed_ads_err_name", { fallbackKo: "광고 이름을 입력하세요.", fallbackEn: "Enter a campaign name." }));
      return;
    }
    if (filledSlides < 1) {
      setErr(safeT("admin_feed_ads_err_slides", { fallbackKo: "이미지 1장 이상 필요합니다.", fallbackEn: "At least one image is required." }));
      return;
    }
    if (placement === "TRADE_CATEGORY" && !targetCategoryId.trim()) {
      setErr(safeT("admin_feed_ads_err_category", { fallbackKo: "거래 카테고리를 선택하세요.", fallbackEn: "Select a trade category." }));
      return;
    }
    if (placement === "COMMUNITY_TOPIC" && !targetTopicSlug.trim()) {
      setErr(safeT("admin_feed_ads_err_topic", { fallbackKo: "커뮤니티 주제를 선택하세요.", fallbackEn: "Select a community topic." }));
      return;
    }
    if (status === "active" && uploading != null) {
      setErr(safeT("admin_feed_ads_err_upload", { fallbackKo: "이미지 업로드가 끝날 때까지 기다려 주세요.", fallbackEn: "Wait for image upload to finish." }));
      return;
    }

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
          startAt: startAt ? new Date(startAt).toISOString() : undefined,
          endAt: endAt ? new Date(endAt).toISOString() : undefined,
          status,
          destinationType,
          destinationId,
          destinationUrl,
          slides: payloadSlides,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "save_failed");
        return;
      }
      router.push("/admin/feed-ads");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const labelCat = (c: TradeCatOpt) => (langEn && c.nameEn ? c.nameEn : c.name);
  const labelTopic = (t: TopicOpt) => (langEn && t.nameEn ? t.nameEn : t.name);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <AdminPageHeader titleKey="admin_menu_ads_feed" backHref="/admin/feed-ads" />

      {/* 1 기본정보 */}
      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="sam-text-body font-semibold text-sam-fg">
          {safeT("admin_feed_ads_sec_basic", { fallbackKo: "1. 광고 기본정보", fallbackEn: "1. Basics" })}
        </h2>
        <label className="block">
          <span className="mb-1 block sam-text-body font-medium">
            {safeT("admin_feed_ads_col_name", { fallbackKo: "이름", fallbackEn: "Name" })}
          </span>
          <input
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </section>

      {/* 2 Domain */}
      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="sam-text-body font-semibold text-sam-fg">
          {safeT("admin_feed_ads_sec_domain", {
            fallbackKo: "2. 어디에 보여줄까요?",
            fallbackEn: "2. Where to show?",
          })}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            className={`flex-1 rounded-ui-rect border px-3 py-3 font-medium ${
              domain === "trade" ? "border-sam-primary bg-sam-primary/5" : "border-sam-border"
            }`}
            onClick={() => {
              setDomain("trade");
              setSurfaceMode("home");
              setTargetTopicSlug("");
            }}
          >
            Trade
          </button>
          <button
            type="button"
            className={`flex-1 rounded-ui-rect border px-3 py-3 font-medium ${
              domain === "community" ? "border-sam-primary bg-sam-primary/5" : "border-sam-border"
            }`}
            onClick={() => {
              setDomain("community");
              setSurfaceMode("home");
              setTargetCategoryId("");
            }}
          >
            Community
          </button>
        </div>
      </section>

      {/* 3 Surface */}
      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="sam-text-body font-semibold text-sam-fg">
          {safeT("admin_feed_ads_sec_surface", {
            fallbackKo: "3. 어느 화면에 보여줄까요?",
            fallbackEn: "3. Which surface?",
          })}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            className={`flex-1 rounded-ui-rect border px-3 py-3 ${
              surfaceMode === "home" ? "border-sam-primary bg-sam-primary/5" : "border-sam-border"
            }`}
            onClick={() => setSurfaceMode("home")}
          >
            {domain === "trade"
              ? safeT("admin_feed_ads_trade_home", { fallbackKo: "거래 홈", fallbackEn: "Trade home" })
              : safeT("admin_feed_ads_community_home", {
                  fallbackKo: "커뮤니티 홈",
                  fallbackEn: "Community home",
                })}
          </button>
          <button
            type="button"
            className={`flex-1 rounded-ui-rect border px-3 py-3 ${
              surfaceMode === "targeted" ? "border-sam-primary bg-sam-primary/5" : "border-sam-border"
            }`}
            onClick={() => setSurfaceMode("targeted")}
          >
            {domain === "trade"
              ? safeT("admin_feed_ads_trade_cat", {
                  fallbackKo: "특정 카테고리",
                  fallbackEn: "Specific category",
                })
              : safeT("admin_feed_ads_community_topic", {
                  fallbackKo: "특정 주제",
                  fallbackEn: "Specific topic",
                })}
          </button>
        </div>
        <p className="sam-text-helper text-sam-muted">
          {domain === "trade"
            ? surfaceMode === "home"
              ? safeT("admin_feed_ads_hint_trade_home", {
                  fallbackKo: "거래 홈 피드 — 게시글 사이에 노출됩니다.",
                  fallbackEn: "Trade home feed — shown between listings.",
                })
              : safeT("admin_feed_ads_hint_trade_cat", {
                  fallbackKo: "거래 카테고리 피드 — 선택한 카테고리 게시글 사이에 노출됩니다.",
                  fallbackEn: "Trade category feed — shown between listings in that category.",
                })
            : surfaceMode === "home"
              ? safeT("admin_feed_ads_hint_community_home", {
                  fallbackKo: "커뮤니티 홈 피드 — 글 사이에 노출됩니다.",
                  fallbackEn: "Community home feed — shown between posts.",
                })
              : safeT("admin_feed_ads_hint_community_topic", {
                  fallbackKo: "커뮤니티 주제 피드 — 선택한 주제의 글 사이에 노출됩니다.",
                  fallbackEn: "Community topic feed — shown between posts in that topic.",
                })}
        </p>
      </section>

      {/* 4 Target SSOT */}
      {surfaceMode === "targeted" ? (
        <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-semibold text-sam-fg">
            {safeT("admin_feed_ads_sec_target", {
              fallbackKo: "4. 누구에게 보여줄까요?",
              fallbackEn: "4. Who should see it?",
            })}
          </h2>
          {targetsLoading ? (
            <p className="text-sam-muted">{t("common_loading")}</p>
          ) : domain === "trade" ? (
            <label className="block">
              <span className="mb-1 block sam-text-body font-medium">
                {safeT("admin_feed_ads_trade_cat", {
                  fallbackKo: "거래 카테고리",
                  fallbackEn: "Trade category",
                })}
              </span>
              <select
                className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
                value={targetCategoryId}
                onChange={(e) => setTargetCategoryId(e.target.value)}
              >
                <option value="">
                  {safeT("admin_feed_ads_select", { fallbackKo: "선택", fallbackEn: "Select" })}
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
                {safeT("admin_feed_ads_community_topic", {
                  fallbackKo: "커뮤니티 주제",
                  fallbackEn: "Community topic",
                })}
              </span>
              <select
                className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
                value={targetTopicSlug}
                onChange={(e) => setTargetTopicSlug(e.target.value)}
              >
                <option value="">
                  {safeT("admin_feed_ads_select", { fallbackKo: "선택", fallbackEn: "Select" })}
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
      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="sam-text-body font-semibold text-sam-fg">
          {safeT("admin_feed_ads_sec_images", {
            fallbackKo: "5. 광고 이미지 (1~3장)",
            fallbackEn: "5. Images (1–3)",
          })}
        </h2>
        <p className="sam-text-helper text-sam-muted">
          {safeT("admin_feed_ads_image_ratio_hint", {
            fallbackKo: `권장 비율 ${FEED_AD_RECOMMENDED_UPLOAD.aspectLabel} (예: ${FEED_AD_RECOMMENDED_UPLOAD.minWidthPx}×${FEED_AD_RECOMMENDED_UPLOAD.minHeightPx}). 피드에서는 같은 비율로 잘려 보입니다.`,
            fallbackEn: `Recommended ${FEED_AD_RECOMMENDED_UPLOAD.aspectLabel} (e.g. ${FEED_AD_RECOMMENDED_UPLOAD.minWidthPx}×${FEED_AD_RECOMMENDED_UPLOAD.minHeightPx}). Feed crops to the same ratio.`,
          })}
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {slides.map((s, i) => (
            <div key={i} className="rounded-ui-rect border border-sam-border-soft p-3">
              <p className="mb-2 font-semibold">Slide {i + 1}</p>
              {s.previewUrl || s.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin preview
                <img
                  src={s.previewUrl || s.imageUrl}
                  alt={s.altText || `slide ${i + 1}`}
                  className={`mb-2 ${FEED_AD_MEDIA_ASPECT_CLASS} w-full rounded-ui-rect object-cover`}
                />
              ) : (
                <div
                  className={`mb-2 flex ${FEED_AD_MEDIA_ASPECT_CLASS} items-center justify-center rounded-ui-rect bg-sam-app text-sam-muted`}
                >
                  {uploading === i ? t("common_loading") : "—"}
                </div>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="mb-2 block w-full sam-text-helper"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadSlide(i, f);
                  e.target.value = "";
                }}
              />
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
              <button type="button" className="sam-text-helper text-red-600" onClick={() => clearSlide(i)}>
                {t("common_delete")}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 6 Destination */}
      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="sam-text-body font-semibold text-sam-fg">
          {safeT("admin_feed_ads_sec_dest", {
            fallbackKo: "6. 누르면 어디로 이동할까요?",
            fallbackEn: "6. Destination",
          })}
        </h2>
        <select
          className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
          value={destinationType}
          onChange={(e) => setDestinationType(e.target.value)}
        >
          <option value="internal_page">Internal page</option>
          <option value="trade_listing">Trade listing</option>
          <option value="community_post">Community post</option>
          <option value="store">Store</option>
          <option value="external_url">External URL</option>
        </select>
        {destinationType === "external_url" || destinationType === "internal_page" ? (
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
      </section>

      {/* 7 Schedule */}
      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="sam-text-body font-semibold text-sam-fg">
          {safeT("admin_feed_ads_sec_schedule", {
            fallbackKo: "7. 언제 보여줄까요?",
            fallbackEn: "7. Schedule",
          })}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block sam-text-body font-medium">Start</span>
            <input
              type="datetime-local"
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block sam-text-body font-medium">End</span>
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
            {safeT("admin_feed_ads_col_status", { fallbackKo: "상태", fallbackEn: "Status" })}
          </span>
          <select
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            value={status}
            onChange={(e) => setStatus(e.target.value as "draft" | "active")}
          >
            <option value="draft">draft</option>
            <option value="active">active</option>
          </select>
        </label>
      </section>

      {/* 8 Preview — same FeedAd frame geometry as consumer */}
      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="sam-text-body font-semibold text-sam-fg">
          {safeT("admin_feed_ads_sec_preview", {
            fallbackKo: "8. 실제 피드에서 이렇게 보여요",
            fallbackEn: "8. How it looks in the feed",
          })}
        </h2>
        <p className="sam-text-helper text-sam-muted">
          {domain === "trade"
            ? surfaceMode === "home"
              ? safeT("admin_feed_ads_trade_home", { fallbackKo: "거래 홈", fallbackEn: "Trade home" })
              : `${safeT("admin_feed_ads_trade_cat", { fallbackKo: "거래 카테고리", fallbackEn: "Trade category" })}${
                  targetCategoryId
                    ? ` · ${labelCat(tradeCategories.find((c) => c.id === targetCategoryId) ?? { id: "", name: targetCategoryId, nameEn: null, slug: "" })}`
                    : ""
                }`
            : surfaceMode === "home"
              ? safeT("admin_feed_ads_community_home", {
                  fallbackKo: "커뮤니티 홈",
                  fallbackEn: "Community home",
                })
              : `${safeT("admin_feed_ads_community_topic", { fallbackKo: "커뮤니티 주제", fallbackEn: "Community topic" })}${
                  targetTopicSlug
                    ? ` · ${labelTopic(communityTopics.find((x) => x.slug === targetTopicSlug) ?? { id: "", slug: targetTopicSlug, name: targetTopicSlug, nameEn: null })}`
                    : ""
                }`}
          {` · ${filledSlides}/3`}
        </p>
        <div className="mx-auto w-full max-w-md space-y-2 rounded-ui-rect border border-dashed border-sam-border bg-sam-app p-2">
          <div className="h-10 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-2 sam-text-helper text-sam-muted">
            {safeT("admin_feed_ads_preview_row", {
              fallbackKo: "게시글 행 (예시)",
              fallbackEn: "Listing row (sample)",
            })}
          </div>
          {(() => {
            const first = slides.find((s) => s.imageUrl || s.previewUrl);
            if (!first) {
              return (
                <p className="py-4 text-center sam-text-helper text-sam-muted">
                  {safeT("admin_feed_ads_preview_empty", {
                    fallbackKo: "이미지를 올리면 피드 크기로 미리보기됩니다.",
                    fallbackEn: "Upload an image to preview at feed size.",
                  })}
                </p>
              );
            }
            return (
              <FeedAdFramePreview
                density={domain === "community" ? "community" : "trade"}
                imageUrl={first.previewUrl || first.imageUrl}
                headline={first.headline}
                alt={first.altText}
              />
            );
          })()}
          <div className="h-10 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-2 sam-text-helper text-sam-muted">
            {safeT("admin_feed_ads_preview_row", {
              fallbackKo: "게시글 행 (예시)",
              fallbackEn: "Listing row (sample)",
            })}
          </div>
        </div>
      </section>

      {err ? <p className="text-red-600">{err}</p> : null}

      <button
        type="button"
        disabled={busy || uploading != null}
        onClick={() => void save()}
        className="w-full rounded-ui-rect bg-signature px-4 py-3 font-medium text-white disabled:opacity-50"
      >
        {busy
          ? t("common_loading")
          : safeT("admin_feed_ads_publish", { fallbackKo: "9. 광고 게시", fallbackEn: "9. Publish" })}
      </button>
    </div>
  );
}
