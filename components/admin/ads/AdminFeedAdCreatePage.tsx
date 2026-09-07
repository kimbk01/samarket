"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Image as ImageIcon } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionConfirmDialog } from "@/components/admin/ui/AdminActionConfirmDialog";
import type { FeedAdDomain, FeedAdPlacement } from "@/lib/ads/feed-ad-placement";
import {
  BANNER_PLACEMENT_CAPACITY_SSOT,
  bannerPlacementDefaultCapacity,
} from "@/lib/ads/banner-placement-capacity-ssot";
import {
  FEED_AD_RECOMMENDED_UPLOAD,
  FEED_AD_UPLOAD_MAX_FILE_BYTES,
  feedAdMediaClass,
  feedAdMediaHeightClass,
} from "@/lib/ads/feed-ad-geometry";
import { FeedAdFramePreview } from "@/components/ads/FeedAdBannerCarousel";
import { adsCreateConfirmCopy } from "@/lib/admin/ads-exposure/admin-mutation-confirm-copy";
import { humanPlacementLabel } from "@/lib/admin/ads-exposure/human-placement-label";

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

function feedCapacityForPlacement(placement: FeedAdPlacement): number {
  if (placement === "TRADE_HOME" || placement === "COMMUNITY_HOME") {
    return bannerPlacementDefaultCapacity(placement);
  }
  // Topic/category pool uses the same 3-cap semantics as home (Owner R2).
  return BANNER_PLACEMENT_CAPACITY_SSOT.COMMUNITY_HOME.defaultCapacity;
}

function humanUploadError(raw: string, ko: boolean): string {
  const s = raw.toLowerCase();
  if (s.includes("too large") || s.includes("max") || s.includes("2mb") || s.includes("file_size")) {
    return ko ? "파일 용량이 너무 큽니다.\n최대 2MB" : "File is too large.\nMax 2MB";
  }
  if (s.includes("aspect") || s.includes("ratio") || s.includes("geometry")) {
    return ko
      ? "이미지 비율이 맞지 않습니다.\n권장 비율: 3:1"
      : "Image aspect does not match.\nRecommended: 3:1";
  }
  if (s.includes("small") || s.includes("below") || s.includes("min") || s.includes("dimension")) {
    return ko
      ? "이미지 크기가 너무 작습니다.\n권장 크기: 1200×400 이상"
      : "Image is too small.\nRecommended: 1200×400 or larger";
  }
  if (raw === "upload_failed" || !raw.trim()) {
    return ko ? "이미지를 업로드하지 못했습니다." : "Could not upload the image.";
  }
  return raw;
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [uploading, setUploading] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [usedByPlacement, setUsedByPlacement] = useState<Partial<Record<FeedAdPlacement, number>>>(
    {}
  );

  useEffect(() => {
    if (lockedDomain) setDomain(lockedDomain);
  }, [lockedDomain]);

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

  const loadCapacity = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/feed-ads", { cache: "no-store", credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        campaigns?: Array<{ placement?: string; status?: string }>;
      };
      if (!res.ok || !j.ok || !Array.isArray(j.campaigns)) return;
      const next: Partial<Record<FeedAdPlacement, number>> = {};
      for (const c of j.campaigns) {
        const p = String(c.placement || "") as FeedAdPlacement;
        const st = String(c.status || "").toLowerCase();
        if (!p) continue;
        if (st === "ended" || st === "rejected" || st === "draft") continue;
        next[p] = (next[p] ?? 0) + 1;
      }
      setUsedByPlacement(next);
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

  const capacity = feedCapacityForPlacement(placement);
  const used = usedByPlacement[placement] ?? 0;
  const remaining = Math.max(0, capacity - used);
  const createCopy = adsCreateConfirmCopy(ko);
  const backHref = entry === "ads-direct" ? "/admin/advertising/direct" : "/admin/feed-ads";
  const productTitle =
    domain === "community"
      ? ko
        ? "Community 배너"
        : "Community banner"
      : ko
        ? "거래 배너"
        : "Trade banner";

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

  const requestSave = () => {
    setErr("");
    setSuccessMsg("");
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
    if (uploading != null) {
      setErr(safeT("admin_feed_ads_err_upload", { fallbackKo: "이미지 업로드가 끝날 때까지 기다려 주세요.", fallbackEn: "Wait for image upload to finish." }));
      return;
    }
    if (remaining <= 0 && status === "active") {
      setErr(
        ko
          ? "추가 등록 불가 — 현재 위치가 가득 찼습니다."
          : "Cannot register more — this placement is full."
      );
      return;
    }
    setConfirmOpen(true);
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
          startAt: startAt ? new Date(startAt).toISOString() : undefined,
          endAt: endAt ? new Date(endAt).toISOString() : undefined,
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
        campaignId?: string;
      };
      if (!res.ok || !j.ok) {
        setErr(
          j.error ??
            (ko ? "처리하지 못했습니다. 다시 시도해 주세요." : "Could not complete. Try again.")
        );
        return;
      }
      setConfirmOpen(false);
      setSuccessMsg(ko ? "광고가 등록되었습니다." : "Ad registered.");
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
            {safeT("admin_feed_ads_col_name", { fallbackKo: "이름", fallbackEn: "Name" })}
          </span>
          <input
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </section>

      {/* 2 Domain — hidden when locked from Direct product entry */}
      {!lockedDomain ? (
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
      ) : null}

      {/* 3 Surface */}
      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-feed-placement="1">
        <h2 className="sam-text-body font-semibold text-sam-fg">
          {ko ? "노출 위치" : "Placement"}
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
              ? ko
                ? "거래 홈 피드"
                : "Trade home feed"
              : ko
                ? "Community 홈 피드"
                : "Community home feed"}
          </button>
          <button
            type="button"
            className={`flex-1 rounded-ui-rect border px-3 py-3 ${
              surfaceMode === "targeted" ? "border-sam-primary bg-sam-primary/5" : "border-sam-border"
            }`}
            onClick={() => setSurfaceMode("targeted")}
          >
            {domain === "trade"
              ? ko
                ? "거래 카테고리 피드"
                : "Trade category feed"
              : ko
                ? "Community 주제 피드"
                : "Community topic feed"}
          </button>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2" data-admin-feed-capacity="1">
          <p className="text-[13px] font-medium text-sam-fg">
            {humanPlacementLabel(placement, ko)}
          </p>
          <p className="text-[11px] text-sam-muted">{placement}</p>
          <p className="mt-1 text-[13px] text-sam-fg">
            {ko ? `현재 사용: ${used} / ${capacity}` : `In use: ${used} / ${capacity}`}
          </p>
          <p className="text-[13px] text-sam-muted">
            {remaining > 0
              ? ko
                ? `추가 가능: ${remaining}`
                : `Available: ${remaining}`
              : ko
                ? "상태: 추가 등록 불가"
                : "Status: cannot add more"}
          </p>
        </div>
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
      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-feed-creative="1">
        <h2 className="sam-text-body font-semibold text-sam-fg">
          {ko ? "이미지" : "Image"}
        </h2>
        <dl
          className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-3 text-[13px]"
          data-admin-feed-creative-spec="1"
        >
          <dt className="text-sam-muted">{ko ? "비율" : "Aspect"}</dt>
          <dd className="font-semibold text-sam-fg">{FEED_AD_RECOMMENDED_UPLOAD.aspectLabel}</dd>
          <dt className="text-sam-muted">{ko ? "권장 크기" : "Recommended"}</dt>
          <dd className="font-semibold text-sam-fg">
            {FEED_AD_RECOMMENDED_UPLOAD.standardWidthPx} × {FEED_AD_RECOMMENDED_UPLOAD.standardHeightPx}px
          </dd>
          <dt className="text-sam-muted">{ko ? "최대 용량" : "Max size"}</dt>
          <dd className="font-semibold text-sam-fg">2MB</dd>
          <dt className="text-sam-muted">{ko ? "노출 형태" : "Runtime"}</dt>
          <dd className="text-sam-fg">
            {domain === "community"
              ? ko
                ? "Community 피드 고정 높이 72–88px · object-cover"
                : "Community feed fixed height 72–88px · object-cover"
              : ko
                ? "거래 피드 고정 높이 100px · object-cover"
                : "Trade feed fixed height 100px · object-cover"}
          </dd>
        </dl>
        <div className="grid gap-3 md:grid-cols-3">
          {slides.map((s, i) => (
            <div key={i} className="rounded-ui-rect border border-sam-border-soft p-3">
              <p className="mb-2 font-semibold">
                {i === 0 ? (ko ? "대표 이미지" : "Primary image") : `Slide ${i + 1}`}
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
                    : ko
                      ? "이미지 없음"
                      : "No image"}
                </div>
              )}
              {s.fileName ? (
                <p className="mb-2 truncate text-[11px] text-sam-muted">{s.fileName}</p>
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
              <button
                type="button"
                className="mb-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-ui-rect border border-sam-border bg-sam-app px-3 text-[13px] font-semibold text-sam-fg"
                data-admin-feed-image-picker={i}
                onClick={() => fileRefs.current[i]?.click()}
                disabled={uploading != null}
              >
                <ImageIcon className="h-4 w-4 shrink-0" aria-hidden />
                {s.imageUrl
                  ? ko
                    ? "이미지 교체"
                    : "Replace image"
                  : ko
                    ? "내 PC에서 이미지 선택"
                    : "Choose image from PC"}
              </button>
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
      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-feed-runtime-preview="1">
        <h2 className="sam-text-body font-semibold text-sam-fg">
          {domain === "community"
            ? ko
              ? "Community 실제 노출 형태 미리보기"
              : "Community live-style preview"
            : ko
              ? "거래 실제 노출 형태 미리보기"
              : "Trade live-style preview"}
        </h2>
        <p className="sam-text-helper text-sam-muted">
          {humanPlacementLabel(placement, ko)} · {placement}
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
                  {ko
                    ? "이미지를 선택하면 실제 노출 높이로 미리보기됩니다."
                    : "Choose an image to preview at live feed height."}
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

      {err ? (
        <p className="whitespace-pre-line text-red-600" role="alert">
          {err}
        </p>
      ) : null}
      {successMsg ? (
        <p className="text-sam-success" role="status">
          {successMsg}
        </p>
      ) : null}

      <button
        type="button"
        disabled={busy || uploading != null}
        onClick={() => requestSave()}
        className="w-full rounded-ui-rect bg-signature px-4 py-3 font-medium text-white disabled:opacity-50"
        data-admin-feed-register-cta="1"
      >
        {busy
          ? t("common_loading")
          : ko
            ? "광고 등록"
            : "Register ad"}
      </button>

      <AdminActionConfirmDialog
        open={confirmOpen}
        title={createCopy.title}
        description={createCopy.body}
        confirmLabel={createCopy.confirmLabel}
        cancelLabel={createCopy.cancelLabel}
        tone={createCopy.tone}
        pending={busy}
        onCancel={() => {
          if (busy) return;
          setConfirmOpen(false);
        }}
        onConfirm={() => {
          if (busy) return;
          void save();
        }}
      />
    </div>
  );
}
