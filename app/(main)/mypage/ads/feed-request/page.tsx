"use client";

import { resolveMyStickyCtaBodyClearanceClass } from "@/lib/mypage/my-sticky-cta-placement";
import { useBottomNavOccupiesClearance } from "@/lib/layout/bottom-nav-scroll-chrome-context";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FeedAdFramePreview } from "@/components/ads/FeedAdBannerCarousel";
import { useAppBootProfile } from "@/components/app/AppBootProvider";
import { MyScreen } from "@/components/mypage/ds/MyScreen";
import { SupportContextProvider } from "@/components/support/SupportContextProvider";
import { buildMemberSupportContext } from "@/lib/support/support-context";
import { navigateToSupportCenter } from "@/lib/support/open-support-center";
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
import { feedAdUploadRejectMessage } from "@/lib/ads/feed-ad-upload-geometry";
import type { FeedAdMemberDisplayStatus } from "@/lib/ads/feed-ad-member-presentation";
import { FEED_AD_SAMPLE_ASSET } from "@/lib/ads/feed-ad-sample-assets";
import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";
import { MyStickyCta } from "@/components/mypage/ds/MyStickyCta";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { invalidateMypageSummary } from "@/lib/mypage/mypage-home-summary-client";
import { useMypageSubmitGuard } from "@/lib/mypage/use-mypage-submit-guard";
import { formatMypageDate, formatMypageMoney, formatMypagePoint } from "@/lib/mypage/format-mypage-date";
import { useReleaseDroppedBlobUrls } from "@/lib/media/use-release-dropped-blob-urls";

type Cat = { id: string; name: string; nameEn: string | null };
type Topic = { id: string; slug: string; name: string; nameEn: string | null };
/** DS-3 · C-1 (2026-11-04): 「연결 없음」 없음 — 목적지 필수 */
type DestMode = "own_content" | "external_url";
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
  /** 하단탭 실제 마운트 기준 CTA 본문 여백 — 탭 있음/없음 safe 1회 (M-04) */
  const stickyCtaBodyClearanceClass = resolveMyStickyCtaBodyClearanceClass(useBottomNavOccupiesClearance());
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
  /** P0-D: 소재 미리보기 URL 주인 = 이 화면 — 교체·삭제·언마운트 시 빠진 URL 해제. */
  useReleaseDroppedBlobUrls(creatives.map((c) => c.previewUrl));
  const [uploadSlot, setUploadSlot] = useState(0);
  const [showSample, setShowSample] = useState(false);
  const [currentBanner, setCurrentBanner] = useState<{
    requestId: string;
    displayStatus: FeedAdMemberDisplayStatus | string;
  } | null>(null);
  const [destMode, setDestMode] = useState<DestMode>("own_content");
  /** D-7 ①②: 남은 자리 안내(위치+업종/주제 · 서버 신청 재검사와 같은 함수) — null = 아직 모름 */
  const [poolRemaining, setPoolRemaining] = useState<{ remaining: number; capacity: number } | null>(null);
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
  /** 연타해도 신청 1회 (S46 T3 제출 방지) */
  const submitGuard = useMypageSubmitGuard();
  const [imgWarn, setImgWarn] = useState("");

  /** FA-5: 미리보기 머리줄 = 고객 화면과 같은 광고주 이름(내 닉네임 · 없으면 「광고」만) */
  const myNickname = useAppBootProfile()?.nickname?.trim() || undefined;
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
            title: String(p.title ?? "").trim() || t("mypage_ads_untitled"),
            createdAt: String(p.createdAt ?? p.created_at ?? ""),
          }))
          .filter((p) => p.id)
      );
      setOwnTrade(
        (Array.isArray(tj.posts) ? tj.posts : [])
          .filter(isTradeListingDestEligible)
          .map((p) => ({
            id: String(p.id),
            title: String(p.title ?? "").trim() || t("mypage_ads_untitled"),
            price: Number(p.price) || 0,
            status: String(p.status ?? "active"),
            sellerListingState: p.sellerListingState,
            createdAt: String(p.createdAt ?? ""),
          }))
      );
    } finally {
      setOwnLoading(false);
    }
  }, [t]);

  /**
   * 광고하기 창(시안 v3)에서 옴: `?domain=trade&targetPostId=…&productId=…` → 거래 · 내 글 연결 · 그 글 · 고른 기간을 미리 선택.
   * 주소 값은 미리 고르기만 한다 — 내 매물 목록에 있는 글일 때만 연결하고, 신청 검증은 서버 그대로.
   */
  const [prefillPostId, setPrefillPostId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("domain") !== "trade") return;
    setDomain("trade");
    const pid = (q.get("productId") ?? "").trim();
    if (pid) setProductId(pid);
    const target = (q.get("targetPostId") ?? "").trim();
    if (target) {
      setDestMode("own_content");
      setOwnKind("trade_listing");
      setPrefillPostId(target);
    }
  }, []);
  useEffect(() => {
    if (!prefillPostId) return;
    const hit = ownTrade.find((p) => p.id === prefillPostId);
    if (!hit) return;
    setOwnId(hit.id);
    setOwnTitle(hit.title);
    setPrefillPostId(null);
  }, [prefillPostId, ownTrade]);

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

  /** D-7 ①: 위치·업종/주제가 바뀌면 남은 자리를 다시 묻는다 (`GET /api/me/feed-ad-requests?pool=`) */
  useEffect(() => {
    if (placement === "TRADE_CATEGORY" && !categoryId.trim()) {
      setPoolRemaining(null);
      return;
    }
    if (placement === "COMMUNITY_TOPIC" && !topicSlug.trim()) {
      setPoolRemaining(null);
      return;
    }
    let cancelled = false;
    const qs = new URLSearchParams({ pool: placement });
    if (placement === "TRADE_CATEGORY") qs.set("categoryId", categoryId.trim());
    if (placement === "COMMUNITY_TOPIC") qs.set("topicSlug", topicSlug.trim());
    fetch(`/api/me/feed-ad-requests?${qs.toString()}`, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; pool?: { remaining?: number; capacity?: number } };
        if (cancelled) return;
        if (res.ok && j.ok && j.pool && typeof j.pool.remaining === "number") {
          setPoolRemaining({ remaining: j.pool.remaining, capacity: Number(j.pool.capacity ?? 3) });
        } else {
          setPoolRemaining(null);
        }
      })
      .catch(() => {
        if (!cancelled) setPoolRemaining(null);
      });
    return () => {
      cancelled = true;
    };
  }, [placement, categoryId, topicSlug]);

  const selectedTopic = topics.find((tp) => tp.slug === topicSlug) ?? null;
  const selectedCat = cats.find((c) => c.id === categoryId) ?? null;

  const placementExplain = useMemo(() => {
    return t("mypage_ads_placement_explain", { min: FEED_AD_SLOT_GAP_MIN, max: FEED_AD_SLOT_GAP_MAX });
  }, [t]);

  const targetSummary = useMemo(() => {
    if (placement === "COMMUNITY_HOME") {
      return t("mypage_ads_community_home_feed");
    }
    if (placement === "COMMUNITY_TOPIC") {
      const name = selectedTopic
        ? en && selectedTopic.nameEn
          ? selectedTopic.nameEn
          : selectedTopic.name
        : t("mypage_ads_select_topic_paren");
      return t("mypage_ads_topic_feed", { name });
    }
    if (placement === "TRADE_HOME") {
      return t("mypage_ads_trade_home_feed");
    }
    const name = selectedCat
      ? en && selectedCat.nameEn
        ? selectedCat.nameEn
        : selectedCat.name
      : t("mypage_ads_select_category_paren");
    return t("mypage_ads_category_feed", { name });
  }, [placement, selectedTopic, selectedCat, en, t]);

  const destSummary = useMemo(() => {
    if (destMode === "external_url") return destUrl.trim() || t("mypage_ads_external_url");
    if (!ownId) return t("mypage_ads_own_content_select");
    const kindLabel =
      ownKind === "community_post"
        ? t("mypage_ads_my_community_post")
        : t("mypage_ads_my_trade_listing");
    return `${kindLabel} — "${ownTitle || ownId}"`;
  }, [destMode, destUrl, ownId, ownKind, ownTitle, t]);

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
            safeT("feed_ad_req_file_too_large")
          );
        } else if (check.error === "invalid_type") {
          setErr(
            safeT("feed_ad_req_invalid_type")
          );
        } else if (check.error === "aspect_mismatch" || check.error === "below_min_pixels") {
          // FA-3: 3:1 · 최소 1200×400 — 서버와 같은 거부 문구
          setErr(feedAdUploadRejectMessage(check.error, en ? "en" : "ko"));
        } else {
          setErr(
            safeT("feed_ad_req_upload_failed")
          );
        }
        return;
      }
      if (check.belowStandard) {
        setImgWarn(
          t("mypage_ads_image_below_standard", { pixel: pixelLabel, width: check.width, height: check.height })
        );
      }
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/me/feed-ad-requests/upload", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok || !j.ok || !j.url) {
        // FA-3: 서버 거부 사유(비율·최소 크기·읽기 실패)는 같은 문구 함수로 — 오류 코드값은 보이지 않는다
        const geomCode =
          j.error === "aspect_mismatch" || j.error === "below_min_pixels" || j.error === "image_decode_failed"
            ? j.error
            : null;
        setErr(
          geomCode
            ? feedAdUploadRejectMessage(geomCode, en ? "en" : "ko")
            : safeT("feed_ad_req_upload_failed")
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
        safeT("feed_ad_req_need_image")
      );
      return;
    }
    if (placement === "TRADE_CATEGORY" && !categoryId.trim()) {
      setErr(
        safeT("feed_ad_req_need_category")
      );
      return;
    }
    if (placement === "COMMUNITY_TOPIC" && !topicSlug.trim()) {
      setErr(
        safeT("feed_ad_req_need_topic")
      );
      return;
    }
    if (destMode === "external_url" && !/^https?:\/\//i.test(destUrl.trim())) {
      setErr(
        safeT("feed_ad_req_need_https")
      );
      return;
    }
    if (destMode === "own_content" && !ownId.trim()) {
      setErr(
        safeT("feed_ad_req_need_own")
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

      let destinationType: string = "";
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
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !j.ok) {
        const code = j.error ?? "failed";
        if (code === "capacity_full" || code === "destination_required" || code === "capacity_check_failed") {
          // D-7 ③ · DS-3: 서버 한국어 안내 (자리 없음 = 신청 안 됨 · 포인트 그대로)
          setErr(
            en
              ? code === "destination_required"
                ? "Choose where the banner should link."
                : "This ad spot is full. Not submitted; your points are unchanged."
              : (j.message ?? t("points_ui_request_failed"))
          );
          if (code === "capacity_full") setPoolRemaining((p) => (p ? { ...p, remaining: 0 } : { remaining: 0, capacity: 3 }));
        } else if (code === "insufficient_balance") {
          setErr(t("points_ui_insufficient"));
        } else if (code === "invalid_url_scheme" || code === "invalid_url") {
          setErr(
            safeT("feed_ad_req_invalid_dest")
          );
        } else if (code === "creatives_max_three" || code === "creatives_max_one") {
          setErr(
            safeT("feed_ad_req_need_image")
          );
        } else if (code === "current_banner_exists") {
          setErr(
            safeT("feed_ad_req_current_exists")
          );
        } else {
          // 서버 오류 코드 원문 노출 금지
          setErr(t("points_ui_request_failed"));
        }
        showMypageToast(t("points_ui_request_failed"), "error");
        return;
      }
      showMypageToast(t("mypage_oa_ad_request_submitted"), "success");
      invalidateMypageSummary();
      // 신청 후 내 광고 — [대기] 탭 선택
      router.push("/mypage/ads?tab=pending");
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
    (destMode !== "external_url" || /^https?:\/\//i.test(destUrl.trim())) &&
    // D-7 ②: 가득 차면 신청 버튼을 막는다 (서버도 보류 전에 다시 센다)
    !(poolRemaining != null && poolRemaining.remaining <= 0);

  if (currentBanner) {
    const statusLabel =
      currentBanner.displayStatus === "pending_review"
        ? safeT("revenue_hub_status_pending")
        : currentBanner.displayStatus === "scheduled"
          ? safeT("revenue_hub_status_scheduled")
          : safeT("revenue_hub_status_active");
    return (
      <MyScreen title={safeT("feed_ad_req_title")} backHref={"/mypage/ads"} template="form">
      <div className="space-y-4">
          <p className="sam-text-body text-sam-fg">
            {safeT("feed_ad_req_current_exists")}
          </p>
          <p className="sam-text-helper text-sam-muted" data-testid="feed-ad-current-status">
            {statusLabel}
          </p>
          <Link
            href="/mypage/ads#feed-ad-status"
            className="block w-full rounded-ui-rect bg-signature px-4 py-2.5 text-center sam-text-body font-semibold text-white"
          >
            {safeT("revenue_hub_banner_manage_cta")}
          </Link>
        </div>
    </MyScreen>
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
    <MyScreen title={safeT("feed_ad_req_title")} backHref={"/mypage/ads"} template="form">
      <div className={`space-y-4 ${stickyCtaBodyClearanceClass}`}>
        <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-semibold">
            {safeT("feed_ad_req_domain")}
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
                  ? safeT("feed_ad_req_trade")
                  : safeT("feed_ad_req_community")}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-semibold">
            {safeT("feed_ad_req_place")}
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
                  ? safeT("feed_ad_req_trade_home")
                  : safeT("feed_ad_req_community_home")}
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
                  ? safeT("feed_ad_req_trade_cat_feed")
                  : safeT("feed_ad_req_community_topic_feed")}
              </span>
            </label>
          </div>
          {surface === "targeted" && domain === "trade" ? (
            <label className="block space-y-1">
              <span className="sam-text-helper font-medium">
                {safeT("feed_ad_req_pick_category")}
              </span>
              <select
                className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
              >
                <option value="">{t("mypage_ads_select_category")}</option>
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
                {safeT("feed_ad_req_pick_topic")}
              </span>
              <select
                className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
                value={topicSlug}
                onChange={(e) => setTopicSlug(e.target.value)}
                required
              >
                <option value="">{t("mypage_ads_select_topic")}</option>
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
          {/* D-7 ①: 남은 자리 N (안내용 · 최종 판정은 승인 때) */}
          {poolRemaining ? (
            <p
              data-testid="feed-ad-pool-remaining"
              data-remaining={String(poolRemaining.remaining)}
              className={`sam-text-helper font-medium ${poolRemaining.remaining > 0 ? "text-sam-fg" : "text-sam-danger"}`}
            >
              {poolRemaining.remaining > 0
                ? t("mypage_ads_spots_left", { remaining: poolRemaining.remaining, capacity: poolRemaining.capacity })
                : t("mypage_ads_spot_full_apply_later")}
            </p>
          ) : null}
          <p className="sam-text-helper text-sam-muted" data-testid="feed-ad-pool-refund-note">
            {t("mypage_ads_pool_refund_note")}
          </p>
        </section>

        <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-semibold">
            {safeT("feed_ad_req_images")}
          </h2>
          <p className="sam-text-helper text-sam-muted">
            {safeT("feed_ad_req_pixel")}
          </p>
          <p className="sam-text-helper text-sam-muted">
            JPG · PNG · WebP · {t("mypage_ads_image_limits")}
          </p>

          <div className="space-y-2">
            <p className="sam-text-helper font-medium">
              {safeT("feed_ad_req_sample_title")}
            </p>
            <button
              type="button"
              className="sam-text-helper text-sam-primary underline"
              onClick={() => setShowSample((v) => !v)}
            >
              {showSample
                ? safeT("feed_ad_req_sample_hide")
                : safeT("feed_ad_req_sample_show")}
            </button>
            {showSample ? (
              <div data-testid="feed-ad-sample-preview">
                <FeedAdFramePreview
                  advertiserName={myNickname}
                  density={density}
                  imageUrl={sample.path}
                  headline={en ? sample.headlineEn : sample.headlineKo}
                  alt={t("mypage_ads_sample_banner")}
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
                  {idx === 0
                    ? t("mypage_ads_image_n_required", { n: idx + 1 })
                    : t("mypage_ads_image_n", { n: idx + 1 })}
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
                    {t("mypage_ads_remove")}
                  </button>
                ) : null}
              </div>
              <label className="block cursor-pointer rounded-ui-rect border border-dashed border-sam-border px-3 py-3 text-center sam-text-helper">
                {uploading && uploadSlot === idx
                  ? t("common_loading")
                  : slot.imageUrl
                    ? t("mypage_ads_replace_image")
                    : safeT("feed_ad_req_pick_image")}
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
                    advertiserName={myNickname}
                    density={density}
                    imageUrl={slot.previewUrl || slot.imageUrl}
                    headline={slot.headline}
                  />
                  {slot.width != null && slot.height != null ? (
                    <p className="sam-text-helper text-sam-muted">
                      {t("mypage_ads_current")}: {slot.width} × {slot.height} px
                    </p>
                  ) : null}
                  <input
                    className="w-full rounded-ui-rect border border-sam-border px-2 py-1 sam-text-helper"
                    placeholder={t("mypage_ads_headline_optional")}
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
              {t("mypage_ads_add_image", { count: creatives.length })}
            </button>
          ) : null}
        </section>

        <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-semibold">
            {safeT("feed_ad_req_dest")}
          </h2>
          <div className="flex flex-col gap-2">
            {(
              [
                ["own_content", t("mypage_ads_dest_my_post_listing")],
                ["external_url", t("mypage_ads_dest_external_link")],
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
                  {t("mypage_ads_community")}
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
                  {t("mypage_ads_trade")}
                </button>
              </div>
              {ownLoading ? (
                <p className="sam-text-helper text-sam-muted">{t("common_loading")}</p>
              ) : ownKind === "community_post" ? (
                ownCommunity.length === 0 ? (
                  <p className="sam-text-helper text-sam-muted">
                    {t("mypage_ads_no_eligible_community_posts")}
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
                              {formatMypageDate(p.createdAt, { lang: language })}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : ownTrade.length === 0 ? (
                <p className="sam-text-helper text-sam-muted">
                  {t("mypage_ads_no_eligible_trade_listings")}
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
                          {formatMypageMoney(p.price)}
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
            {safeT("feed_ad_req_product")}
          </h2>
          <p className="sam-text-body font-medium" data-testid="feed-ad-balance">
            {safeT("feed_ad_req_my_points")}
            {": "}
            {balance == null ? "—" : formatMypagePoint(balance, { lang: language })}
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
                      {t("mypage_ads_days", { n: p.durationDays })} · {formatMypagePoint(p.pointCost, { lang: language })}
                    </span>
                    {unaffordable ? (
                      <span className="sam-text-helper font-medium text-sam-warning">
                        {t("mypage_ads_insufficient_points")}
                      </span>
                    ) : null}
                  </div>
                  {balance != null ? (
                    <p className="sam-text-helper text-sam-muted">
                      {t("mypage_ads_current")} {formatMypagePoint(balance, { lang: language })}
                      {" · "}
                      {t("mypage_ads_required")} {formatMypagePoint(p.pointCost, { lang: language })}
                      {shortfall != null
                        ? ` · ${t("mypage_ads_short")} ${formatMypagePoint(shortfall, { lang: language })}`
                        : after != null
                          ? ` · ${t("mypage_ads_after")} ${formatMypagePoint(after, { lang: language })}`
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
                {safeT("feed_ad_req_need_charge")}
              </p>
              <Link
                href="/mypage/points/charge"
                className="inline-flex w-full items-center justify-center rounded-ui-rect bg-signature px-4 py-2.5 sam-text-body font-medium text-white"
                data-testid="feed-ad-charge-cta"
              >
                {safeT("feed_ad_req_charge_cta")}
              </Link>
              <button
                type="button"
                className="inline-flex w-full items-center justify-center rounded-ui-rect border border-sam-border px-4 py-2 sam-text-helper text-sam-fg"
                data-testid="feed-ad-inquiry-cta"
                onClick={() => {
                  navigateToSupportCenter(
                    buildMemberSupportContext({
                      enabled: true,
                      category: "AD",
                      sourceSurface: "mypage_ads_feed_request",
                    })
                  );
                }}
              >
                {safeT("feed_ad_req_ask_admin")}
              </button>
            </div>
          ) : null}
        </section>

        <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-semibold">
            {safeT("feed_ad_req_preview")}
          </h2>
          {filledCreatives.length > 0 ? (
            <div className="space-y-2" data-testid="feed-ad-final-preview">
              {filledCreatives.map((c, i) => (
                <FeedAdFramePreview
                  advertiserName={myNickname}
                  key={`final-prev-${i}`}
                  density={density}
                  imageUrl={c.previewUrl || c.imageUrl}
                  headline={c.headline}
                />
              ))}
              {filledCreatives.length >= 2 ? (
                <p className="sam-text-helper text-sam-muted">
                  {t("mypage_ads_images_auto_slide", { count: filledCreatives.length })}
                </p>
              ) : null}
            </div>
          ) : showSample ? (
            <FeedAdFramePreview
              advertiserName={myNickname}
              density={density}
              imageUrl={sample.path}
              headline={en ? sample.headlineEn : sample.headlineKo}
            />
          ) : (
            <p className="sam-text-helper text-sam-muted">
              {safeT("feed_ad_req_preview_empty")}
            </p>
          )}

          <dl
            className="mt-2 space-y-1 rounded-ui-rect border border-sam-border-soft p-3 sam-text-helper"
            data-testid="feed-ad-final-summary"
          >
            <div className="flex justify-between gap-2">
              <dt className="text-sam-muted">{t("mypage_ads_ad_area")}</dt>
              <dd className="font-medium">
                {domain === "trade" ? t("mypage_ads_trade") : t("mypage_ads_community")}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-sam-muted">{t("mypage_ads_placement")}</dt>
              <dd className="max-w-[60%] text-right font-medium">{targetSummary}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-sam-muted">{t("mypage_ads_images")}</dt>
              <dd className="font-medium">
                {filledCreatives.length > 0
                  ? t("mypage_ads_images_count", { count: filledCreatives.length })
                  : pixelLabel}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-sam-muted">{t("mypage_ads_destination")}</dt>
              <dd className="max-w-[60%] text-right font-medium">{destSummary}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-sam-muted">{t("mypage_ads_period")}</dt>
              <dd className="font-medium">
                {selected
                  ? t("mypage_ads_days", { n: selected.durationDays })
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-sam-muted">{t("mypage_ads_use_point")}</dt>
              <dd className="font-medium">
                {selected ? formatMypagePoint(selected.pointCost, { lang: language }) : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-sam-muted">{t("mypage_ads_current_point")}</dt>
              <dd className="font-medium">
                {balance == null ? "—" : formatMypagePoint(balance, { lang: language })}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-sam-muted">{t("mypage_ads_after_submit")}</dt>
              <dd className="font-medium">
                {afterBalance == null ? "—" : formatMypagePoint(afterBalance, { lang: language })}
              </dd>
            </div>
            <p className="pt-1 text-sam-muted">
              {feedAdPlacementHumanLabel(placement, en ? "en" : "ko")}
            </p>
          </dl>

          <p className="sam-text-helper text-sam-muted">
            {safeT("feed_ad_req_hold_note")}
          </p>
        </section>

        {err ? (
          <p role="alert" className="rounded-ui-rect bg-sam-warning-soft px-3 py-2 sam-text-body-secondary text-sam-fg">
            {err}
          </p>
        ) : null}
      </div>

      {/* S46 T3 — 하단 고정 [광고 신청] (제출 방지: 진행 중 비활성+스피너, 계약 testid 유지) */}
      <MyStickyCta
        dirty={canSubmit}
        primary={{
          label: safeT("feed_ad_req_submit"),
          onPress: () => void submitGuard.run(() => submit()),
          loading: busy || submitGuard.pending,
          disabled: busy || submitGuard.pending,
          testId: "feed-ad-submit",
        }}
      />
    </MyScreen>
    </SupportContextProvider>
  );
}
