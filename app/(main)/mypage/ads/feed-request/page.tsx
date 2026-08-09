"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FeedAdFramePreview } from "@/components/ads/FeedAdBannerCarousel";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import type { FeedAdDomain, FeedAdPlacement } from "@/lib/ads/feed-ad-placement";
import type { FeedAdProduct } from "@/lib/ads/feed-ad-products";
import { FEED_AD_RECOMMENDED_UPLOAD } from "@/lib/ads/feed-ad-geometry";

type Slide = { imageUrl: string; previewUrl: string; headline: string };
type Cat = { id: string; name: string; nameEn: string | null };
type Topic = { id: string; slug: string; name: string; nameEn: string | null };
type DestMode = "none" | "internal_page" | "external_url";

const EMPTY: Slide = { imageUrl: "", previewUrl: "", headline: "" };

export default function MemberFeedAdRequestPage() {
  const { safeT, t, language } = useI18n();
  const router = useRouter();
  const en = language === "en";

  const [domain, setDomain] = useState<FeedAdDomain>("trade");
  const [surface, setSurface] = useState<"home" | "targeted">("home");
  const [categoryId, setCategoryId] = useState("");
  const [topicSlug, setTopicSlug] = useState("");
  const [productId, setProductId] = useState("");
  const [catalog, setCatalog] = useState<FeedAdProduct[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [slides, setSlides] = useState<[Slide, Slide, Slide]>([{ ...EMPTY }, { ...EMPTY }, { ...EMPTY }]);
  const [destMode, setDestMode] = useState<DestMode>("none");
  const [destUrl, setDestUrl] = useState("");
  const [cats, setCats] = useState<Cat[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);
  const [err, setErr] = useState("");

  const placement: FeedAdPlacement = useMemo(() => {
    if (domain === "trade") return surface === "home" ? "TRADE_HOME" : "TRADE_CATEGORY";
    return surface === "home" ? "COMMUNITY_HOME" : "COMMUNITY_TOPIC";
  }, [domain, surface]);

  const load = useCallback(async () => {
    const [prodRes, balRes, tgtRes] = await Promise.all([
      fetch(`/api/me/feed-ad-requests?domain=${domain}`, { credentials: "include" }),
      fetch("/api/me/points", { credentials: "include", cache: "no-store" }),
      fetch("/api/me/feed-ad-targets", { credentials: "include" }).catch(() => null),
    ]);
    const pj = (await prodRes.json().catch(() => ({}))) as { catalog?: FeedAdProduct[] };
    const items = Array.isArray(pj.catalog) ? pj.catalog : [];
    setCatalog(items.filter((p) => p.domain === domain));
    if (items[0]?.id) setProductId(items.find((p) => p.domain === domain)?.id ?? "");
    const bj = (await balRes.json().catch(() => ({}))) as { balance?: number; points?: number };
    const bal = Number(bj.balance ?? bj.points);
    setBalance(Number.isFinite(bal) ? bal : null);
    if (tgtRes?.ok) {
      const tj = (await tgtRes.json().catch(() => ({}))) as {
        tradeCategories?: Cat[];
        communityTopics?: Topic[];
      };
      setCats(Array.isArray(tj.tradeCategories) ? tj.tradeCategories : []);
      setTopics(Array.isArray(tj.communityTopics) ? tj.communityTopics : []);
    }
  }, [domain]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = catalog.find((p) => p.id === productId) ?? catalog[0] ?? null;
  const filled = slides.filter((s) => s.imageUrl).length;
  const previewPersisted = slides.find((s) => s.imageUrl)?.imageUrl ?? "";

  const upload = async (index: number, file: File) => {
    setUploading(index);
    setErr("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/me/feed-ad-requests/upload", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !j.ok || !j.url) {
        setErr(
          j.error ??
            safeT("feed_ad_req_upload_failed", {
              fallbackKo: "이미지 업로드에 실패했습니다.",
              fallbackEn: "Image upload failed.",
            })
        );
        return;
      }
      const preview = URL.createObjectURL(file);
      setSlides((prev) => {
        const next = [...prev] as [Slide, Slide, Slide];
        next[index] = { ...next[index], imageUrl: j.url!, previewUrl: preview };
        return next;
      });
    } finally {
      setUploading(null);
    }
  };

  const submit = async () => {
    if (!selected || busy) return;
    if (filled < 1) {
      setErr(
        safeT("feed_ad_req_need_image", {
          fallbackKo: "이미지를 1장 이상 올려 주세요.",
          fallbackEn: "Upload at least one image.",
        })
      );
      return;
    }
    if (placement === "TRADE_CATEGORY" && !categoryId.trim()) {
      setErr(
        safeT("feed_ad_req_need_category", {
          fallbackKo: "카테고리를 선택하세요.",
          fallbackEn: "Select a category.",
        })
      );
      return;
    }
    if (placement === "COMMUNITY_TOPIC" && !topicSlug.trim()) {
      setErr(
        safeT("feed_ad_req_need_topic", {
          fallbackKo: "주제를 선택하세요.",
          fallbackEn: "Select a topic.",
        })
      );
      return;
    }
    if (destMode === "external_url" && !/^https?:\/\//i.test(destUrl.trim())) {
      setErr(
        safeT("feed_ad_req_need_https", {
          fallbackKo: "외부 링크는 https:// 로 시작해야 합니다.",
          fallbackEn: "External links must start with https://",
        })
      );
      return;
    }
    if (destMode === "internal_page" && destUrl.trim() && !destUrl.trim().startsWith("/")) {
      setErr(
        safeT("feed_ad_req_need_path", {
          fallbackKo: "내부 경로는 / 로 시작해야 합니다.",
          fallbackEn: "Internal paths must start with /",
        })
      );
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const idem =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `feed-ad-${Date.now()}`;
      const res = await fetch("/api/me/feed-ad-requests", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idem,
        },
        body: JSON.stringify({
          productId: selected.id,
          placement,
          targetCategoryId: categoryId || undefined,
          targetTopicSlug: topicSlug || undefined,
          destinationType: destMode,
          destinationUrl: destMode === "none" ? "" : destUrl.trim(),
          creatives: slides
            .filter((s) => s.imageUrl)
            .map((s) => ({ imageUrl: s.imageUrl, headline: s.headline })),
          idempotencyKey: idem,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        const code = j.error ?? "failed";
        if (code === "insufficient_balance") {
          setErr(t("points_ui_insufficient"));
        } else if (code === "invalid_url_scheme" || code === "invalid_url") {
          setErr(
            safeT("feed_ad_req_invalid_dest", {
              fallbackKo: "연결 대상이 올바르지 않습니다.",
              fallbackEn: "Invalid destination.",
            })
          );
        } else {
          setErr(code);
        }
        return;
      }
      router.push("/mypage/ads");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={safeT("feed_ad_req_title", {
          fallbackKo: "피드 광고 신청",
          fallbackEn: "Request feed ad",
        })}
        subtitle={safeT("feed_ad_req_subtitle", {
          fallbackKo: "관리자 승인 후 게시됩니다. 신청 시 D-Point가 보류됩니다.",
          fallbackEn: "Published after admin approval. D-Point is held on submit.",
        })}
        backHref="/mypage/ads"
        section="store"
        hideCtaStrip
      />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
        <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-semibold">
            {safeT("feed_ad_req_domain", { fallbackKo: "1. 광고 영역", fallbackEn: "1. Domain" })}
          </h2>
          <div className="flex gap-2">
            {(["trade", "community"] as const).map((d) => (
              <button
                key={d}
                type="button"
                className={`flex-1 rounded-ui-rect border px-3 py-2 ${
                  domain === d ? "border-sam-primary bg-sam-primary/5" : "border-sam-border"
                }`}
                onClick={() => {
                  setDomain(d);
                  setSurface("home");
                  setCategoryId("");
                  setTopicSlug("");
                }}
              >
                {d === "trade"
                  ? safeT("feed_ad_req_trade", { fallbackKo: "거래", fallbackEn: "Trade" })
                  : safeT("feed_ad_req_community", {
                      fallbackKo: "커뮤니티",
                      fallbackEn: "Community",
                    })}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-semibold">
            {safeT("feed_ad_req_place", { fallbackKo: "2. 광고 위치", fallbackEn: "2. Placement" })}
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              className={`flex-1 rounded-ui-rect border px-3 py-2 ${
                surface === "home" ? "border-sam-primary bg-sam-primary/5" : "border-sam-border"
              }`}
              onClick={() => setSurface("home")}
            >
              {domain === "trade"
                ? safeT("feed_ad_req_trade_home", { fallbackKo: "거래 홈", fallbackEn: "Trade home" })
                : safeT("feed_ad_req_community_home", {
                    fallbackKo: "커뮤니티 홈",
                    fallbackEn: "Community home",
                  })}
            </button>
            <button
              type="button"
              className={`flex-1 rounded-ui-rect border px-3 py-2 ${
                surface === "targeted" ? "border-sam-primary bg-sam-primary/5" : "border-sam-border"
              }`}
              onClick={() => setSurface("targeted")}
            >
              {domain === "trade"
                ? safeT("feed_ad_req_trade_cat", {
                    fallbackKo: "거래 카테고리",
                    fallbackEn: "Trade category",
                  })
                : safeT("feed_ad_req_community_topic", {
                    fallbackKo: "커뮤니티 주제",
                    fallbackEn: "Community topic",
                  })}
            </button>
          </div>
          {surface === "targeted" && domain === "trade" ? (
            <select
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">{en ? "Select" : "선택"}</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {en && c.nameEn ? c.nameEn : c.name}
                </option>
              ))}
            </select>
          ) : null}
          {surface === "targeted" && domain === "community" ? (
            <select
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
              value={topicSlug}
              onChange={(e) => setTopicSlug(e.target.value)}
            >
              <option value="">{en ? "Select" : "선택"}</option>
              {topics.map((tp) => (
                <option key={tp.slug} value={tp.slug}>
                  {en && tp.nameEn ? tp.nameEn : tp.name}
                </option>
              ))}
            </select>
          ) : null}
        </section>

        <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-semibold">
            {safeT("feed_ad_req_images", {
              fallbackKo: "3. 이미지 (1~3장)",
              fallbackEn: "3. Images (1–3)",
            })}
          </h2>
          <p className="sam-text-helper text-sam-muted">
            {safeT("feed_ad_req_ratio", {
              fallbackKo: `권장 비율 ${FEED_AD_RECOMMENDED_UPLOAD.aspectLabel}`,
              fallbackEn: `Recommended ${FEED_AD_RECOMMENDED_UPLOAD.aspectLabel}`,
            })}
          </p>
          <div className="grid gap-2">
            {slides.map((s, i) => (
              <div key={i} className="rounded-ui-rect border border-sam-border-soft p-2">
                <label className="mb-2 block cursor-pointer rounded-ui-rect border border-dashed border-sam-border px-3 py-2 text-center sam-text-helper">
                  {uploading === i
                    ? t("common_loading")
                    : safeT("feed_ad_req_pick_image", {
                        fallbackKo: "이미지 불러오기",
                        fallbackEn: "Choose image",
                      })}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(i, f);
                      e.target.value = "";
                    }}
                  />
                </label>
                {s.imageUrl ? (
                  <p className="mb-1 break-all sam-text-helper text-sam-muted" data-testid={`feed-ad-persisted-url-${i}`}>
                    {s.imageUrl}
                  </p>
                ) : null}
                <input
                  className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1 sam-text-helper"
                  placeholder={en ? "Headline (optional)" : "헤드라인 (선택)"}
                  value={s.headline}
                  onChange={(e) =>
                    setSlides((prev) => {
                      const next = [...prev] as [Slide, Slide, Slide];
                      next[i] = { ...next[i], headline: e.target.value };
                      return next;
                    })
                  }
                />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-semibold">
            {safeT("feed_ad_req_dest", { fallbackKo: "4. 연결 대상", fallbackEn: "4. Destination" })}
          </h2>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["none", en ? "No link" : "연결 없음"],
                ["internal_page", en ? "Internal page" : "내부 경로"],
                ["external_url", en ? "External URL" : "외부 URL"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={`rounded-ui-rect border px-3 py-1.5 sam-text-helper ${
                  destMode === mode ? "border-sam-primary bg-sam-primary/5" : "border-sam-border"
                }`}
                onClick={() => {
                  setDestMode(mode);
                  setDestUrl("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {destMode !== "none" ? (
            <input
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
              value={destUrl}
              onChange={(e) => setDestUrl(e.target.value)}
              placeholder={destMode === "external_url" ? "https://…" : "/market"}
            />
          ) : null}
        </section>

        <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-semibold">
            {safeT("feed_ad_req_product", {
              fallbackKo: "5. 기간 / Point",
              fallbackEn: "5. Period / Point",
            })}
          </h2>
          <div className="space-y-2">
            {catalog.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProductId(p.id)}
                className={`w-full rounded-ui-rect border px-3 py-2 text-left ${
                  productId === p.id ? "border-sam-primary bg-sam-primary/5" : "border-sam-border"
                }`}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{en ? p.titleEn : p.titleKo}</span>
                  <span className="font-semibold">{p.pointCost.toLocaleString()}P</span>
                </div>
                <p className="sam-text-helper text-sam-muted">
                  {p.durationDays}
                  {en ? " days" : "일"}
                </p>
              </button>
            ))}
          </div>
          <p className="sam-text-helper text-sam-muted">
            {safeT("promo_sheet_balance", {
              fallbackKo: "보유 D-Point",
              fallbackEn: "Your D-Point",
            })}
            {": "}
            {balance == null ? "—" : `${balance.toLocaleString()}P`}
          </p>
        </section>

        <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-semibold">
            {safeT("feed_ad_req_preview", {
              fallbackKo: "6. 미리보기 (저장된 이미지)",
              fallbackEn: "6. Preview (persisted image)",
            })}
          </h2>
          {previewPersisted ? (
            <FeedAdFramePreview
              density={domain === "community" ? "community" : "trade"}
              imageUrl={previewPersisted}
              headline={slides.find((s) => s.imageUrl)?.headline}
            />
          ) : (
            <p className="sam-text-helper text-sam-muted">
              {safeT("feed_ad_req_preview_empty", {
                fallbackKo: "이미지를 올리면 피드와 같은 미리보기가 표시됩니다.",
                fallbackEn: "Upload an image to see a feed-style preview.",
              })}
            </p>
          )}
        </section>

        {err ? <p className="text-sam-warning">{err}</p> : null}

        <button
          type="button"
          disabled={busy || !selected || uploading != null}
          onClick={() => void submit()}
          className="w-full rounded-ui-rect bg-signature py-3 font-medium text-white disabled:opacity-50"
        >
          {busy
            ? t("common_loading")
            : safeT("feed_ad_req_submit", {
                fallbackKo: selected
                  ? `${selected.pointCost.toLocaleString()}P 보류하고 신청`
                  : "신청",
                fallbackEn: selected
                  ? `Hold ${selected.pointCost.toLocaleString()}P & submit`
                  : "Submit",
              })}
        </button>
      </div>
    </div>
  );
}
