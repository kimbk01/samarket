"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FeedAdFramePreview } from "@/components/ads/FeedAdBannerCarousel";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { SupportContextProvider } from "@/components/support/SupportContextProvider";
import { buildMemberSupportContext } from "@/lib/support/support-context";
import {
  FEED_AD_SLOT_GAP_MIN,
  FEED_AD_SLOT_GAP_MAX,
} from "@/lib/ads/feed-ad-slot-policy";
import type { FeedAdDomain, FeedAdPlacement } from "@/lib/ads/feed-ad-placement";
import {
  feedAdPlacementHumanLabel,
  isFeedAdCommunityTopicTargetAllowed,
} from "@/lib/ads/feed-ad-placement";
import type { FeedAdProduct } from "@/lib/ads/feed-ad-products";
import {
  feedAdStandardPixelLabel,
} from "@/lib/ads/feed-ad-geometry";
import { checkFeedAdMemberImageFile } from "@/lib/ads/feed-ad-member-image-check";
import type { FeedAdMemberDisplayStatus } from "@/lib/ads/feed-ad-member-presentation";
import { FEED_AD_SAMPLE_ASSET } from "@/lib/ads/feed-ad-sample-assets";
import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";

type Cat = { id: string; name: string; nameEn: string | null };
type Topic = { id: string; slug: string; name: string; nameEn: string | null };
type DestMode = "none" | "own_content" | "external_url";
type OwnKind = "community_post" | "trade_listing";

type CreativeState = {
  imageUrl: string;
  previewUrl: string;
  headline: string;
  width: number | null;
  height: number | null;
  belowStandard: boolean;
};

type OwnCommunity = { id: string; title: string; createdAt: string };
type OwnTrade = {
  id: string;
  title: string;
  price: number;
  status: string;
  sellerListingState?: string;
  createdAt: string;
};

const EMPTY_CREATIVE: CreativeState = {
  imageUrl: "",
  previewUrl: "",
  headline: "",
  width: null,
  height: null,
  belowStandard: false,
};

function isTradeListingDestEligible(p: OwnTrade): boolean {
  const st = String(p.status ?? "").toLowerCase();
  if (st === "hidden" || st === "blinded" || st === "deleted" || st === "sold" || st === "inactive") {
    return false;
  }
  const ls = normalizeSellerListingState(p.sellerListingState, p.status);
  if (ls === "completed") return false;
  return st === "active" || st === "" || st === "available";
}

export default function MemberFeedAdRequestPage() {
  const { safeT, t, language } = useI18n();
  const router = useRouter();
  const en = language === "en";
  const pixelLabel = feedAdStandardPixelLabel();

  const [domain, setDomain] = useState<FeedAdDomain>("community");
  const [surface, setSurface] = useState<"home" | "targeted">("home");
  const [categoryId, setCategoryId] = useState("");
  const [topicSlug, setTopicSlug] = useState("");
  const [productId, setProductId] = useState("");
  const [catalog, setCatalog] = useState<FeedAdProduct[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [creatives, setCreatives] = useState<CreativeState[]>([{ ...EMPTY_CREATIVE }]);
  const [uploadSlot, setUploadSlot] = useState(0);
  const [showSample, setShowSample] = useState(false);
  const [currentBanner, setCurrentBanner] = useState<{
    requestId: string;
    displayStatus: FeedAdMemberDisplayStatus | string;
  } | null>(null);
  const [destMode, setDestMode] = useState<DestMode>("none");
  const [destUrl, setDestUrl] = useState("");
  const [ownKind, setOwnKind] = useState<OwnKind>("community_post");
  const [ownId, setOwnId] = useState("");
  const [ownTitle, setOwnTitle] = useState("");
  const [ownCommunity, setOwnCommunity] = useState<OwnCommunity[]>([]);
  const [ownTrade, setOwnTrade] = useState<OwnTrade[]>([]);
  const [ownLoading, setOwnLoading] = useState(false);
  const [cats, setCats] = useState<Cat[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [imgWarn, setImgWarn] = useState("");

  const placement: FeedAdPlacement = useMemo(() => {
    if (domain === "trade") return surface === "home" ? "TRADE_HOME" : "TRADE_CATEGORY";
    return surface === "home" ? "COMMUNITY_HOME" : "COMMUNITY_TOPIC";
  }, [domain, surface]);

  const sample = FEED_AD_SAMPLE_ASSET[domain];
  const density = domain === "community" ? "community" : "trade";

  const load = useCallback(async () => {
    const [prodRes, balRes, tgtRes] = await Promise.all([
      fetch(`/api/me/feed-ad-requests?domain=${domain}`, { credentials: "include" }),
      fetch("/api/me/points", { credentials: "include", cache: "no-store" }),
      fetch("/api/me/feed-ad-targets", { credentials: "include" }).catch(() => null),
    ]);
    const pj = (await prodRes.json().catch(() => ({}))) as {
      catalog?: FeedAdProduct[];
      canCreateBanner?: boolean;
      currentBanner?: { requestId?: string; displayStatus?: string } | null;
    };
    const items = (Array.isArray(pj.catalog) ? pj.catalog : []).filter((p) => p.domain === domain);
    setCatalog(items);
    if (pj.canCreateBanner === false && pj.currentBanner?.requestId) {
      setCurrentBanner({
        requestId: String(pj.currentBanner.requestId),
        displayStatus: String(pj.currentBanner.displayStatus ?? "active"),
      });
    } else {
      setCurrentBanner(null);
    }
    const bj = (await balRes.json().catch(() => ({}))) as { balance?: number; points?: number };
    const bal = Number(bj.balance ?? bj.points);
    const balN = Number.isFinite(bal) ? bal : null;
    setBalance(balN);
    const affordable = items.filter((p) => balN == null || p.pointCost <= balN);
    const preferred = affordable[0] ?? null;
    setProductId((prev) => {
      if (prev && items.some((p) => p.id === prev && (balN == null || p.pointCost <= balN))) {
        return prev;
      }
      return preferred?.id ?? "";
    });
    if (tgtRes?.ok) {
      const tj = (await tgtRes.json().catch(() => ({}))) as {
        tradeCategories?: Cat[];
        communityTopics?: Topic[];
      };
      setCats(Array.isArray(tj.tradeCategories) ? tj.tradeCategories : []);
      const nextTopics = (Array.isArray(tj.communityTopics) ? tj.communityTopics : []).filter((t) =>
        isFeedAdCommunityTopicTargetAllowed(String(t.slug ?? ""))
      );
      setTopics(nextTopics);
      setTopicSlug((prev) => (prev && nextTopics.some((t) => t.slug === prev) ? prev : ""));
    }
  }, [domain]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadOwnContent = useCallback(async () => {
    setOwnLoading(true);
    try {
      const [cRes, tRes] = await Promise.all([
        fetch("/api/me/community-posts?limit=20", { credentials: "include", cache: "no-store" }),
        fetch("/api/my/posts", { credentials: "include", cache: "no-store" }),
      ]);
      const cj = (await cRes.json().catch(() => ({}))) as {
        posts?: { id?: string; title?: string; created_at?: string; createdAt?: string }[];
      };
      const tj = (await tRes.json().catch(() => ({}))) as { posts?: OwnTrade[] };
      setOwnCommunity(
        (Array.isArray(cj.posts) ? cj.posts : [])
          .map((p) => ({
            id: String(p.id ?? ""),
            title: String(p.title ?? "").trim() || (en ? "(untitled)" : "(제목 없음)"),
            createdAt: String(p.createdAt ?? p.created_at ?? ""),
          }))
          .filter((p) => p.id)
      );
      setOwnTrade(
        (Array.isArray(tj.posts) ? tj.posts : [])
          .filter(isTradeListingDestEligible)
          .map((p) => ({
            id: String(p.id),
            title: String(p.title ?? "").trim() || (en ? "(untitled)" : "(제목 없음)"),
            price: Number(p.price) || 0,
            status: String(p.status ?? "active"),
            sellerListingState: p.sellerListingState,
            createdAt: String(p.createdAt ?? ""),
          }))
      );
    } finally {
      setOwnLoading(false);
    }
  }, [en]);

  useEffect(() => {
    if (destMode === "own_content") void loadOwnContent();
  }, [destMode, loadOwnContent]);

  const selected = catalog.find((p) => p.id === productId) ?? null;
  const affordableCatalog = useMemo(() => {
    if (balance == null) return catalog;
    return catalog.filter((p) => p.pointCost <= balance);
  }, [catalog, balance]);
  const allUnaffordable =
    balance != null && catalog.length > 0 && affordableCatalog.length === 0;

  const selectedTopic = topics.find((tp) => tp.slug === topicSlug) ?? null;
  const selectedCat = cats.find((c) => c.id === categoryId) ?? null;

  const placementExplain = useMemo(() => {
    if (en) {
      return `Shown in mid-feed ad slots with ${FEED_AD_SLOT_GAP_MIN}–${FEED_AD_SLOT_GAP_MAX} posts between each slot in the selected feed.`;
    }
    return `선택한 피드에서 일반 콘텐츠 ${FEED_AD_SLOT_GAP_MIN}~${FEED_AD_SLOT_GAP_MAX}개마다 중간 광고 슬롯에 노출됩니다.`;
  }, [en]);

  const targetSummary = useMemo(() => {
    if (placement === "COMMUNITY_HOME") {
      return en ? "Community home feed" : "커뮤니티 홈 피드";
    }
    if (placement === "COMMUNITY_TOPIC") {
      const name = selectedTopic
        ? en && selectedTopic.nameEn
          ? selectedTopic.nameEn
          : selectedTopic.name
        : en
          ? "(select topic)"
          : "(주제 선택)";
      return en ? `${name} topic feed` : `${name} 주제 피드`;
    }
    if (placement === "TRADE_HOME") {
      return en ? "Trade home feed" : "거래 홈 피드";
    }
    const name = selectedCat
      ? en && selectedCat.nameEn
        ? selectedCat.nameEn
        : selectedCat.name
      : en
        ? "(select category)"
        : "(카테고리 선택)";
    return en ? `${name} category feed` : `${name} 카테고리 피드`;
  }, [placement, selectedTopic, selectedCat, en]);

  const destSummary = useMemo(() => {
    if (destMode === "none") return en ? "No link" : "연결 없음";
    if (destMode === "external_url") return destUrl.trim() || (en ? "External URL" : "외부 링크");
    if (!ownId) return en ? "Own content (select)" : "내 게시글/상품 (선택)";
    const kindLabel =
      ownKind === "community_post"
        ? en
          ? "Community post"
          : "내 커뮤니티 글"
        : en
          ? "Trade listing"
          : "내 거래 상품";
    return `${kindLabel} — "${ownTitle || ownId}"`;
  }, [destMode, destUrl, ownId, ownKind, ownTitle, en]);

  const afterBalance =
    balance != null && selected ? Math.max(0, balance - selected.pointCost) : null;

  const upload = async (file: File, slotIndex: number) => {
    setUploading(true);
    setUploadSlot(slotIndex);
    setErr("");
    setImgWarn("");
    try {
      const check = await checkFeedAdMemberImageFile(file);
      if (!check.ok) {
        if (check.error === "file_too_large") {
          setErr(
            safeT("feed_ad_req_file_too_large", {
              fallbackKo: "이미지는 최대 2MB까지 업로드할 수 있습니다.",
              fallbackEn: "Images must be 2MB or smaller.",
            })
          );
        } else if (check.error === "invalid_type") {
          setErr(
            safeT("feed_ad_req_invalid_type", {
              fallbackKo: "JPG · PNG · WebP 만 업로드할 수 있습니다.",
              fallbackEn: "Only JPG, PNG, or WebP are allowed.",
            })
          );
        } else {
          setErr(
            safeT("feed_ad_req_upload_failed", {
              fallbackKo: "이미지 업로드에 실패했습니다.",
              fallbackEn: "Image upload failed.",
            })
          );
        }
        return;
      }
      if (check.belowStandard) {
        setImgWarn(
          en
            ? `This image is smaller than the recommended size and ad quality may be lower. Recommended: ${pixelLabel}. Current: ${check.width} × ${check.height} px`
            : `이 이미지는 권장 크기보다 작아 광고 품질이 낮아질 수 있습니다. 권장: ${pixelLabel}. 현재: ${check.width} × ${check.height} px`
        );
      }
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
      setCreatives((prev) => {
        const next = [...prev];
        while (next.length <= slotIndex) next.push({ ...EMPTY_CREATIVE });
        const prevSlot = next[slotIndex] ?? EMPTY_CREATIVE;
        next[slotIndex] = {
          imageUrl: j.url!,
          previewUrl: preview,
          headline: prevSlot.headline,
          width: check.width,
          height: check.height,
          belowStandard: check.belowStandard,
        };
        return next.slice(0, 3);
      });
      setShowSample(false);
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!selected || busy || allUnaffordable) return;
    if (balance != null && selected.pointCost > balance) {
      setErr(t("points_ui_insufficient"));
      return;
    }
    if (!creatives.some((c) => c.imageUrl.trim())) {
      setErr(
        safeT("feed_ad_req_need_image", {
          fallbackKo: "배너 이미지를 최소 1장 올려 주세요.",
          fallbackEn: "Upload at least one banner image.",
        })
      );
      return;
    }
    if (placement === "TRADE_CATEGORY" && !categoryId.trim()) {
      setErr(
        safeT("feed_ad_req_need_category", {
          fallbackKo: "광고할 카테고리를 선택하세요.",
          fallbackEn: "Select a category.",
        })
      );
      return;
    }
    if (placement === "COMMUNITY_TOPIC" && !topicSlug.trim()) {
      setErr(
        safeT("feed_ad_req_need_topic", {
          fallbackKo: "광고할 주제를 선택하세요.",
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
    if (destMode === "own_content" && !ownId.trim()) {
      setErr(
        safeT("feed_ad_req_need_own", {
          fallbackKo: "연결할 내 게시글/상품을 선택하세요.",
          fallbackEn: "Select your post or listing.",
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

      let destinationType: string = "none";
      let destinationId = "";
      let destinationUrl = "";
      if (destMode === "external_url") {
        destinationType = "external_url";
        destinationUrl = destUrl.trim();
      } else if (destMode === "own_content") {
        destinationType = ownKind;
        destinationId = ownId.trim();
      }

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
          destinationType,
          destinationId: destinationId || undefined,
          destinationUrl: destinationUrl || undefined,
          creatives: creatives
            .filter((c) => c.imageUrl.trim())
            .slice(0, 3)
            .map((c) => ({
              imageUrl: c.imageUrl,
              headline: c.headline,
            })),
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
        } else if (code === "creatives_max_three" || code === "creatives_max_one") {
          setErr(
            safeT("feed_ad_req_need_image", {
              fallbackKo: "배너 이미지는 최대 3장까지 등록할 수 있습니다.",
              fallbackEn: "You can upload up to 3 banner images.",
            })
          );
        } else if (code === "current_banner_exists") {
          setErr(
            safeT("feed_ad_req_current_exists", {
              fallbackKo: "현재 진행 중인 배너 광고가 있습니다. 내 광고에서 관리하세요.",
              fallbackEn: "You already have a current banner ad. Manage it from My ads.",
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

  const filledCreatives = creatives.filter((c) => c.imageUrl.trim());
  const canSubmit =
    !busy &&
    !uploading &&
    !currentBanner &&
    Boolean(selected) &&
    filledCreatives.length >= 1 &&
    !allUnaffordable &&
    (balance == null || (selected != null && selected.pointCost <= balance)) &&
    (placement !== "TRADE_CATEGORY" || Boolean(categoryId.trim())) &&
    (placement !== "COMMUNITY_TOPIC" || Boolean(topicSlug.trim())) &&
    (destMode !== "own_content" || Boolean(ownId.trim())) &&
    (destMode !== "external_url" || /^https?:\/\//i.test(destUrl.trim()));

  if (currentBanner) {
    const statusLabel =
      currentBanner.displayStatus === "pending_review"
        ? safeT("revenue_hub_status_pending", {
            fallbackKo: "심사중",
            fallbackEn: "Under review",
          })
        : currentBanner.displayStatus === "scheduled"
          ? safeT("revenue_hub_status_scheduled", {
              fallbackKo: "예약됨",
              fallbackEn: "Scheduled",
            })
          : safeT("revenue_hub_status_active", {
              fallbackKo: "광고중",
              fallbackEn: "Active",
            });
    return (
      <div className="min-h-screen bg-background">
        <MySubpageHeader
          title={safeT("feed_ad_req_title", {
            fallbackKo: "배너 광고 만들기",
            fallbackEn: "Create banner ad",
          })}
        />
        <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
          <p className="sam-text-body text-sam-fg">
            {safeT("feed_ad_req_current_exists", {
              fallbackKo: "현재 진행 중인 배너 광고가 있습니다. 내 광고에서 관리하세요.",
              fallbackEn: "You already have a current banner ad. Manage it from My ads.",
            })}
          </p>
          <p className="sam-text-helper text-sam-muted" data-testid="feed-ad-current-status">
            {statusLabel}
          </p>
          <Link
            href="/mypage/ads#feed-ad-status"
            className="block w-full rounded-ui-rect bg-signature px-4 py-2.5 text-center sam-text-body font-semibold text-white"
          >
            {safeT("revenue_hub_banner_manage_cta", {
              fallbackKo: "현재 광고 관리",
              fallbackEn: "Manage current ad",
            })}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <SupportContextProvider
      value={buildMemberSupportContext({
        enabled: true,
        category: "AD",
        sourceSurface: "mypage_feed_ad_request",
      })}
    >
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={safeT("feed_ad_req_title", {
          fallbackKo: "배너 광고 만들기",
          fallbackEn: "Create banner ad",
        })}
        subtitle={safeT("feed_ad_req_subtitle", {
          fallbackKo:
            "신청 시 포인트가 보류되고, 관리자 승인 시 최종 사용됩니다. 반려 시 포인트가 반환됩니다.",
          fallbackEn:
            "Point is held on submit and captured on approval. Rejected requests return Point.",
        })}
        backHref="/mypage/ads"
        hideCtaStrip
      />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-4 pb-28">
        <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-semibold">
            {safeT("feed_ad_req_domain", { fallbackKo: "1. 광고 영역", fallbackEn: "1. Ad area" })}
          </h2>
          <div className="flex gap-2">
            {(["community", "trade"] as const).map((d) => (
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
                  setShowSample(true);
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
            {safeT("feed_ad_req_place", {
              fallbackKo: "2. 광고 위치 / 대상",
              fallbackEn: "2. Placement / target",
            })}
          </h2>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 rounded-ui-rect border border-sam-border px-3 py-2">
              <input
                type="radio"
                name="surface"
                checked={surface === "home"}
                onChange={() => {
                  setSurface("home");
                  setCategoryId("");
                  setTopicSlug("");
                }}
              />
              <span>
                {domain === "trade"
                  ? safeT("feed_ad_req_trade_home", {
                      fallbackKo: "거래 홈",
                      fallbackEn: "Trade home",
                    })
                  : safeT("feed_ad_req_community_home", {
                      fallbackKo: "커뮤니티 홈",
                      fallbackEn: "Community home",
                    })}
              </span>
            </label>
            <label className="flex items-center gap-2 rounded-ui-rect border border-sam-border px-3 py-2">
              <input
                type="radio"
                name="surface"
                checked={surface === "targeted"}
                onChange={() => setSurface("targeted")}
              />
              <span>
                {domain === "trade"
                  ? safeT("feed_ad_req_trade_cat_feed", {
                      fallbackKo: "카테고리별 피드",
                      fallbackEn: "Category feed",
                    })
                  : safeT("feed_ad_req_community_topic_feed", {
                      fallbackKo: "주제별 피드",
                      fallbackEn: "Topic feed",
                    })}
              </span>
            </label>
          </div>
          {surface === "targeted" && domain === "trade" ? (
            <label className="block space-y-1">
              <span className="sam-text-helper font-medium">
                {safeT("feed_ad_req_pick_category", {
                  fallbackKo: "광고할 카테고리 *",
                  fallbackEn: "Category *",
                })}
              </span>
              <select
                className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
              >
                <option value="">{en ? "Select category" : "카테고리 선택"}</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {en && c.nameEn ? c.nameEn : c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {surface === "targeted" && domain === "community" ? (
            <label className="block space-y-1">
              <span className="sam-text-helper font-medium">
                {safeT("feed_ad_req_pick_topic", {
                  fallbackKo: "광고할 주제 *",
                  fallbackEn: "Topic *",
                })}
              </span>
              <select
                className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
                value={topicSlug}
                onChange={(e) => setTopicSlug(e.target.value)}
                required
              >
                <option value="">{en ? "Select topic" : "주제 선택"}</option>
                {topics.map((tp) => (
                  <option key={tp.slug} value={tp.slug}>
                    {en && tp.nameEn ? tp.nameEn : tp.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <p className="sam-text-helper text-sam-muted" data-testid="feed-ad-slot-explain">
            {placementExplain}
          </p>
        </section>

        <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-semibold">
            {safeT("feed_ad_req_images", {
              fallbackKo: "3. 배너 이미지 (1~3장)",
              fallbackEn: "3. Banner images (1–3)",
            })}
          </h2>
          <p className="sam-text-helper text-sam-muted">
            {safeT("feed_ad_req_pixel", {
              fallbackKo: `권장 이미지 크기 ${pixelLabel}`,
              fallbackEn: `Recommended size ${pixelLabel}`,
            })}
          </p>
          <p className="sam-text-helper text-sam-muted">
            JPG · PNG · WebP · {en ? "max 2MB each · 2–3 images auto-slide in feed" : "장당 최대 2MB · 2~3장은 피드에서 자동 슬라이드"}
          </p>

          <div className="space-y-2">
            <p className="sam-text-helper font-medium">
              {safeT("feed_ad_req_sample_title", {
                fallbackKo: "배너 이미지 예시",
                fallbackEn: "Banner image example",
              })}
            </p>
            <button
              type="button"
              className="sam-text-helper text-sam-primary underline"
              onClick={() => setShowSample((v) => !v)}
            >
              {showSample
                ? safeT("feed_ad_req_sample_hide", { fallbackKo: "샘플 숨기기", fallbackEn: "Hide sample" })
                : safeT("feed_ad_req_sample_show", { fallbackKo: "샘플 보기", fallbackEn: "Show sample" })}
            </button>
            {showSample ? (
              <div data-testid="feed-ad-sample-preview">
                <FeedAdFramePreview
                  density={density}
                  imageUrl={sample.path}
                  headline={en ? sample.headlineEn : sample.headlineKo}
                  alt={en ? "Sample banner" : "샘플 배너"}
                />
                <p className="mt-1 sam-text-helper text-sam-muted">
                  {sample.widthPx} × {sample.heightPx} px
                </p>
              </div>
            ) : null}
          </div>

          {creatives.map((slot, idx) => (
            <div key={`creative-slot-${idx}`} className="space-y-2 rounded-ui-rect border border-sam-border-soft p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="sam-text-helper font-medium">
                  {en ? `Image ${idx + 1}` : `이미지 ${idx + 1}`}
                  {idx === 0 ? (en ? " (required)" : " (필수)") : ""}
                </p>
                {slot.imageUrl && creatives.length > 1 ? (
                  <button
                    type="button"
                    className="sam-text-helper text-sam-warning"
                    onClick={() => {
                      setCreatives((prev) => {
                        const next = prev.filter((_, i) => i !== idx);
                        return next.length > 0 ? next : [{ ...EMPTY_CREATIVE }];
                      });
                    }}
                  >
                    {en ? "Remove" : "삭제"}
                  </button>
                ) : null}
              </div>
              <label className="block cursor-pointer rounded-ui-rect border border-dashed border-sam-border px-3 py-3 text-center sam-text-helper">
                {uploading && uploadSlot === idx
                  ? t("common_loading")
                  : slot.imageUrl
                    ? en
                      ? "Replace image"
                      : "이미지 바꾸기"
                    : safeT("feed_ad_req_pick_image", {
                        fallbackKo: "이미지 불러오기",
                        fallbackEn: "Choose image",
                      })}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f, idx);
                    e.target.value = "";
                  }}
                />
              </label>
              {slot.imageUrl ? (
                <div className="space-y-2" data-testid={idx === 0 ? "feed-ad-member-preview" : `feed-ad-member-preview-${idx}`}>
                  <FeedAdFramePreview
                    density={density}
                    imageUrl={slot.previewUrl || slot.imageUrl}
                    headline={slot.headline}
                  />
                  {slot.width != null && slot.height != null ? (
                    <p className="sam-text-helper text-sam-muted">
                      {en ? "Current" : "현재"}: {slot.width} × {slot.height} px
                    </p>
                  ) : null}
                  <input
                    className="w-full rounded-ui-rect border border-sam-border px-2 py-1 sam-text-helper"
                    placeholder={en ? "Headline (optional)" : "헤드라인 (선택)"}
                    value={slot.headline}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCreatives((prev) =>
                        prev.map((c, i) => (i === idx ? { ...c, headline: v } : c))
                      );
                    }}
                  />
                </div>
              ) : null}
            </div>
          ))}

          {imgWarn ? <p className="sam-text-helper text-sam-warning">{imgWarn}</p> : null}

          {creatives.length < 3 && creatives.some((c) => c.imageUrl.trim()) ? (
            <button
              type="button"
              className="w-full rounded-ui-rect border border-dashed border-sam-border px-3 py-2 sam-text-helper text-sam-primary"
              onClick={() => setCreatives((prev) => [...prev, { ...EMPTY_CREATIVE }].slice(0, 3))}
              data-testid="feed-ad-add-creative"
            >
              {en ? `Add image (${creatives.length}/3)` : `이미지 추가 (${creatives.length}/3)`}
            </button>
          ) : null}
        </section>

        <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-semibold">
            {safeT("feed_ad_req_dest", { fallbackKo: "4. 연결 대상", fallbackEn: "4. Destination" })}
          </h2>
          <div className="flex flex-col gap-2">
            {(
              [
                ["none", en ? "No link" : "연결 없음"],
                ["own_content", en ? "My post / listing" : "내 게시글/상품"],
                ["external_url", en ? "External link" : "외부 링크"],
              ] as const
            ).map(([mode, label]) => (
              <label
                key={mode}
                className={`flex items-center gap-2 rounded-ui-rect border px-3 py-2 ${
                  destMode === mode ? "border-sam-primary bg-sam-primary/5" : "border-sam-border"
                }`}
              >
                <input
                  type="radio"
                  name="dest"
                  checked={destMode === mode}
                  onChange={() => {
                    setDestMode(mode);
                    setDestUrl("");
                    setOwnId("");
                    setOwnTitle("");
                    setOwnKind(domain === "trade" ? "trade_listing" : "community_post");
                  }}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {destMode === "external_url" ? (
            <input
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
              value={destUrl}
              onChange={(e) => setDestUrl(e.target.value)}
              placeholder="https://…"
              inputMode="url"
            />
          ) : null}
          {destMode === "own_content" ? (
            <div className="space-y-2" data-testid="feed-ad-own-picker">
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 rounded-ui-rect border px-2 py-1.5 sam-text-helper ${
                    ownKind === "community_post"
                      ? "border-sam-primary bg-sam-primary/5"
                      : "border-sam-border"
                  }`}
                  onClick={() => {
                    setOwnKind("community_post");
                    setOwnId("");
                    setOwnTitle("");
                  }}
                >
                  {en ? "Community" : "커뮤니티"}
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-ui-rect border px-2 py-1.5 sam-text-helper ${
                    ownKind === "trade_listing"
                      ? "border-sam-primary bg-sam-primary/5"
                      : "border-sam-border"
                  }`}
                  onClick={() => {
                    setOwnKind("trade_listing");
                    setOwnId("");
                    setOwnTitle("");
                  }}
                >
                  {en ? "Trade" : "거래"}
                </button>
              </div>
              {ownLoading ? (
                <p className="sam-text-helper text-sam-muted">{t("common_loading")}</p>
              ) : ownKind === "community_post" ? (
                ownCommunity.length === 0 ? (
                  <p className="sam-text-helper text-sam-muted">
                    {en ? "No eligible community posts." : "연결 가능한 커뮤니티 글이 없습니다."}
                  </p>
                ) : (
                  <ul className="max-h-56 space-y-1 overflow-y-auto">
                    {ownCommunity.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className={`w-full rounded-ui-rect border px-3 py-2 text-left ${
                            ownId === p.id
                              ? "border-sam-primary bg-sam-primary/5"
                              : "border-sam-border"
                          }`}
                          onClick={() => {
                            setOwnId(p.id);
                            setOwnTitle(p.title);
                          }}
                        >
                          <span className="line-clamp-2 sam-text-body">{p.title}</span>
                          {p.createdAt ? (
                            <span className="block sam-text-helper text-sam-muted">
                              {new Date(p.createdAt).toLocaleDateString(en ? "en-US" : "ko-KR")}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : ownTrade.length === 0 ? (
                <p className="sam-text-helper text-sam-muted">
                  {en ? "No eligible trade listings." : "연결 가능한 거래 상품이 없습니다."}
                </p>
              ) : (
                <ul className="max-h-56 space-y-1 overflow-y-auto">
                  {ownTrade.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={`w-full rounded-ui-rect border px-3 py-2 text-left ${
                          ownId === p.id
                            ? "border-sam-primary bg-sam-primary/5"
                            : "border-sam-border"
                        }`}
                        onClick={() => {
                          setOwnId(p.id);
                          setOwnTitle(p.title);
                        }}
                      >
                        <span className="line-clamp-2 sam-text-body">{p.title}</span>
                        <span className="block sam-text-helper text-sam-muted">
                          ₱{Number(p.price).toLocaleString()}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </section>

        <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-semibold">
            {safeT("feed_ad_req_product", {
              fallbackKo: "5. 기간 / 포인트",
              fallbackEn: "5. Period / Point",
            })}
          </h2>
          <p className="sam-text-body font-medium" data-testid="feed-ad-balance">
            {safeT("feed_ad_req_my_points", {
              fallbackKo: "내 포인트",
              fallbackEn: "My Point",
            })}
            {": "}
            {balance == null ? "—" : `${balance.toLocaleString()}P`}
          </p>
          <div className="space-y-2">
            {catalog.map((p) => {
              const unaffordable = balance != null && p.pointCost > balance;
              const shortfall =
                balance != null && unaffordable ? p.pointCost - balance : null;
              const after = balance != null && !unaffordable ? balance - p.pointCost : null;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={unaffordable}
                  aria-disabled={unaffordable}
                  onClick={() => {
                    if (!unaffordable) setProductId(p.id);
                  }}
                  data-testid={`feed-ad-product-${p.id}`}
                  className={`relative w-full overflow-hidden rounded-ui-rect border px-3 py-2 text-left disabled:cursor-not-allowed ${
                    productId === p.id && !unaffordable
                      ? "border-sam-primary bg-sam-primary/5"
                      : "border-sam-border"
                  }`}
                  style={
                    unaffordable
                      ? {
                          backgroundImage:
                            "repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(0,0,0,0.06) 6px, rgba(0,0,0,0.06) 12px)",
                        }
                      : undefined
                  }
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-sam-fg">
                      {p.durationDays}
                      {en ? " days" : "일"} · {p.pointCost.toLocaleString()}P
                    </span>
                    {unaffordable ? (
                      <span className="sam-text-helper font-medium text-sam-warning">
                        {en ? "Insufficient points" : "포인트 부족"}
                      </span>
                    ) : null}
                  </div>
                  {balance != null ? (
                    <p className="sam-text-helper text-sam-muted">
                      {en ? "Current" : "현재"} {balance.toLocaleString()}P
                      {" · "}
                      {en ? "Required" : "필요"} {p.pointCost.toLocaleString()}P
                      {shortfall != null
                        ? ` · ${en ? "Short" : "부족"} ${shortfall.toLocaleString()}P`
                        : after != null
                          ? ` · ${en ? "After" : "신청 후"} ${after.toLocaleString()}P`
                          : ""}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
          {allUnaffordable || (balance != null && catalog.some((p) => p.pointCost > balance)) ? (
            <div className="space-y-2 rounded-ui-rect border border-sam-border-soft p-3">
              <p className="sam-text-helper text-sam-muted">
                {safeT("feed_ad_req_need_charge", {
                  fallbackKo: "포인트가 부족합니다.",
                  fallbackEn: "Not enough Point.",
                })}
              </p>
              <Link
                href="/mypage/points/charge"
                className="inline-flex w-full items-center justify-center rounded-ui-rect bg-signature px-4 py-2.5 sam-text-body font-medium text-white"
                data-testid="feed-ad-charge-cta"
              >
                {safeT("feed_ad_req_charge_cta", {
                  fallbackKo: "포인트 충전",
                  fallbackEn: "Charge Point",
                })}
              </Link>
              <Link
                href="/mypage/inquiries"
                className="inline-flex w-full items-center justify-center rounded-ui-rect border border-sam-border px-4 py-2 sam-text-helper text-sam-fg"
                data-testid="feed-ad-inquiry-cta"
              >
                {safeT("feed_ad_req_ask_admin", {
                  fallbackKo: "광고 문의",
                  fallbackEn: "Ad inquiry",
                })}
              </Link>
            </div>
          ) : null}
        </section>

        <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-semibold">
            {safeT("feed_ad_req_preview", {
              fallbackKo: "6. 미리보기 + 신청 확인",
              fallbackEn: "6. Preview + confirm",
            })}
          </h2>
          {filledCreatives.length > 0 ? (
            <div className="space-y-2" data-testid="feed-ad-final-preview">
              {filledCreatives.map((c, i) => (
                <FeedAdFramePreview
                  key={`final-prev-${i}`}
                  density={density}
                  imageUrl={c.previewUrl || c.imageUrl}
                  headline={c.headline}
                />
              ))}
              {filledCreatives.length >= 2 ? (
                <p className="sam-text-helper text-sam-muted">
                  {en
                    ? `${filledCreatives.length} images · auto-slide in feed (same campaign)`
                    : `${filledCreatives.length}장 · 피드에서 같은 캠페인만 자동 슬라이드`}
                </p>
              ) : null}
            </div>
          ) : showSample ? (
            <FeedAdFramePreview
              density={density}
              imageUrl={sample.path}
              headline={en ? sample.headlineEn : sample.headlineKo}
            />
          ) : (
            <p className="sam-text-helper text-sam-muted">
              {safeT("feed_ad_req_preview_empty", {
                fallbackKo: "이미지를 올리면 피드와 같은 미리보기가 표시됩니다.",
                fallbackEn: "Upload an image to see a feed-style preview.",
              })}
            </p>
          )}

          <dl
            className="mt-2 space-y-1 rounded-ui-rect border border-sam-border-soft p-3 sam-text-helper"
            data-testid="feed-ad-final-summary"
          >
            <div className="flex justify-between gap-2">
              <dt className="text-sam-muted">{en ? "Ad area" : "광고 영역"}</dt>
              <dd className="font-medium">
                {domain === "trade" ? (en ? "Trade" : "거래") : en ? "Community" : "커뮤니티"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-sam-muted">{en ? "Placement" : "광고 위치"}</dt>
              <dd className="max-w-[60%] text-right font-medium">{targetSummary}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-sam-muted">{en ? "Images" : "이미지"}</dt>
              <dd className="font-medium">
                {filledCreatives.length > 0
                  ? en
                    ? `${filledCreatives.length} / 3`
                    : `${filledCreatives.length}장 / 최대 3장`
                  : pixelLabel}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-sam-muted">{en ? "Destination" : "연결 대상"}</dt>
              <dd className="max-w-[60%] text-right font-medium">{destSummary}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-sam-muted">{en ? "Period" : "기간"}</dt>
              <dd className="font-medium">
                {selected
                  ? `${selected.durationDays}${en ? " days" : "일"}`
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-sam-muted">{en ? "Use Point" : "사용 포인트"}</dt>
              <dd className="font-medium">
                {selected ? `${selected.pointCost.toLocaleString()}P` : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-sam-muted">{en ? "Current Point" : "현재 포인트"}</dt>
              <dd className="font-medium">
                {balance == null ? "—" : `${balance.toLocaleString()}P`}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-sam-muted">{en ? "After submit" : "신청 후"}</dt>
              <dd className="font-medium">
                {afterBalance == null ? "—" : `${afterBalance.toLocaleString()}P`}
              </dd>
            </div>
            <p className="pt-1 text-sam-muted">
              {feedAdPlacementHumanLabel(placement, en ? "en" : "ko")}
            </p>
          </dl>

          <p className="sam-text-helper text-sam-muted">
            {safeT("feed_ad_req_hold_note", {
              fallbackKo:
                "신청 시 포인트가 보류되고, 관리자 승인 시 최종 사용됩니다. 반려 시 포인트가 반환됩니다.",
              fallbackEn:
                "Point is held on submit, captured on approval, and returned if rejected.",
            })}
          </p>
        </section>

        {err ? <p className="text-sam-warning">{err}</p> : null}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void submit()}
          className="w-full rounded-ui-rect bg-signature py-3 font-medium text-white disabled:opacity-50"
          data-testid="feed-ad-submit"
        >
          {busy
            ? t("common_loading")
            : safeT("feed_ad_req_submit", {
                fallbackKo: "광고 신청",
                fallbackEn: "Submit ad request",
              })}
        </button>
      </div>
    </div>
    </SupportContextProvider>
  );
}
