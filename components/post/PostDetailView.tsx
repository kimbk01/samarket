"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ChatRoomSource } from "@/lib/types/chat";
import type { PostWithMeta } from "@/lib/posts/schema";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { getCategoryBySlugOrId } from "@/lib/categories/getCategoryById";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import { peekTradeListReturnHref } from "@/lib/trade/location/trade-list-return-href";
import { formatPrice, formatTimeAgo, parseMetaAmount } from "@/lib/utils/format";
import { getUserProfile } from "@/lib/users/getUserProfile";
import { getFavoriteStatus } from "@/lib/favorites/getFavoriteStatus";
import { toggleFavorite } from "@/lib/favorites/toggleFavorite";
import {
  POST_FAVORITE_CHANGED_EVENT,
  type PostFavoriteChangedDetail,
} from "@/lib/favorites/post-favorite-events";
import { postOwnedByUserId, postTradeListingOwnerUserId } from "@/lib/chats/resolve-author-nickname";
import { PostCommunityCommentsSection } from "@/components/post/PostCommunityCommentsSection";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { incrementPostViewCount } from "@/lib/posts/incrementViewCount";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getAppSettings } from "@/lib/app-settings";
import { resolveJobDetailDirection } from "@/lib/jobs/resolve-job-detail-direction";
import { JobDetailHeader, JobDetailTypeStatusChips } from "@/components/jobs/JobDetailHeader";
import { JobDetailContextNote } from "@/components/jobs/JobDetailContextNote";
import { JobsExtendedDetailExtras } from "@/components/jobs/JobsExtendedDetailExtras";
import { useWriteCategory } from "@/contexts/WriteCategoryContext";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { ProductImageGallery } from "@/components/product/detail/ProductImageGallery";
import {
  imageResolveTradePostDetailImageUrls,
} from "@/lib/image";
import { TRADE_POST_DETAIL_BOTTOM_PRIMARY_CTA } from "@/components/product/detail/product-detail-bottom-constants";
import { TradeListingStatusBadge } from "@/components/post/TradeListingStatusBadge";
import { getCarTradeLabel } from "@/lib/posts/car-trade-label";
import {
  isReDealTypeRent,
  isReDealTypeSale,
  tradeDetailReRentSummary,
  tradeDetailReSaleSummary,
  tradeDetailChatBlockTitle,
  tradeDetailViewsLine,
} from "@/lib/trade/post-detail-i18n";
import { resolveTradeCompositionProfileId } from "@/lib/trade/category-form/composition-seeds";
import { resolveTradeCompositionRootRow } from "@/lib/trade/category-form/resolve-for-category";
import {
  REAL_ESTATE_HERO_SKIP_FIELD_IDS,
  detailSpecSectionTitleKey,
  resolveDetailSpecProfileId,
} from "@/lib/trade/category-form/detail-spec-route";
import { resolveTradeDetailCtaPolicy } from "@/lib/trade/category-form/cta-policy";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayAlert } from "@/components/ui/dibay-overlay";
import { shouldBlockNewItemChatForBuyer } from "@/lib/trade/reserved-item-chat";
import { POST_DETAIL_SELLER_ANCHOR_ID } from "@/lib/posts/post-detail-anchors";
import {
  ownerDeleteLockHintKey,
  ownerDeleteLockedFromPost,
  ownerEditLockHintKey,
  ownerEditLockedFromPost,
} from "@/lib/posts/post-list-owner-menu";
import { resolveTradePostListingLocationLine } from "@/lib/posts/post-listing-location-label";
import type { PublicSellerProfileDTO } from "@/lib/users/map-profile-to-public-seller";
import { incomingCallPeerNicknameLabel } from "@/lib/users/user-label";
import { PostDetailMoreBottomSheet } from "@/components/post/PostDetailMoreBottomSheet";
import { ReportReasonModal } from "@/components/post/ReportReasonModal";
import { PostDetailSellerMoreSheet } from "@/components/post/PostDetailSellerMoreSheet";
import { PostDetailRelatedSections } from "@/components/post/PostDetailRelatedSections";
import { TradeCompositionDetailSection } from "@/components/post/TradeCompositionDetailSection";
import { MemberPostPromoteSheet } from "@/components/post/MemberPostPromoteSheet";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { TradeDetailInlineChatCard } from "@/components/post/TradeDetailInlineChatCard";
import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";
import { clearTradeChatPrepareTimer } from "@/lib/chats/clear-trade-chat-prepare-timer";
import {
  openCreateTradeChat,
  openExistingTradeChat,
  prefetchTradeChatEntry,
} from "@/lib/chats/trade-chat-entry-navigation";
import {
  KASAMA_TRADE_CHAT_ROOM_RESOLVED,
  type TradeChatRoomResolvedDetail,
} from "@/lib/chats/trade-chat-room-resolved-event";
import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";
import {
  recordRouteEntryFetchNetworkFromResources,
  recordRouteEntryFirstContentRender,
  recordRouteEntryFirstInteractive,
  recordRouteEntryFullRender,
  recordRouteEntryJsonParseComplete,
  recordRouteEntryRouteTotalMs,
  scheduleRouteEntryToPaint,
} from "@/lib/runtime/samarket-runtime-debug";
import { recordTradeDetailTotalMs } from "@/lib/trade/trade-c2c-perf-metrics";
import { canonicalTradeDetailUrl, shareOrCopyTradeListing } from "@/lib/trade/share-trade-listing";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { PHILIFE_FEED_INSET_X_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import {
  TRADE_WRITE_FB_SECTION,
  TRADE_WRITE_FB_FIELD_HEAD,
  TRADE_FB_DETAIL_HERO_TITLE,
  TRADE_FB_DETAIL_PRICE,
  TRADE_FB_DETAIL_BODY,
  TRADE_FB_DETAIL_FOOTNOTE,
  TRADE_FB_DETAIL_META_HELP,
  TRADE_FB_DETAIL_IMAGE_SECTION,
  TRADE_FB_DETAIL_SELLER_NAME,
  TRADE_FB_DETAIL_PLACEHOLDER_TEXT,
  TRADE_FB_DETAIL_CHIP,
} from "@/lib/ui/trade-write-fb-ui";
import { MannerBatteryDisplay } from "@/components/trust/MannerBatteryDisplay";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";
import { useTradePostDetailSlideHost } from "@/components/community-messenger/room/phase2/TradePostDetailSlideHostContext";

/** 거래 상세 — FB형 연속 섹션 스택(글쓰기와 동일 밀도) */
const TRADE_POST_DETAIL_FB_STACK_CLASS = `${PHILIFE_FEED_INSET_X_CLASS} space-y-0 pt-0`;
/** 상세 제목 줄 `TradeListingStatusBadge` — 목록·상세 규격 단일화 */
const TRADE_DETAIL_STATUS_BADGE_CLASS =
  `!inline-flex !h-6 !items-center !rounded-[4px] !border-0 !bg-sam-surface-muted !px-2 !py-0 !text-[12px] !font-medium !leading-none !text-sam-muted`;
/** 댓글·오버플로 잠금 해제 — `sam-card` 단일 규격 */
const POST_DETAIL_COMMUNITY_CARD_CLASS = "sam-card !overflow-visible";

/** 하단 구분 뱃지와 중복되지 않게 헤더 제목에서만 제거 */
function stripUsedCarTradeDirectionFromDetailTitle(title: string): string {
  const t = title.trim();
  const stripped = t.replace(/^(삽니다|팝니다)\s*·\s*/u, "").trim();
  return stripped || t;
}

type PostDetailSellerAuthor = {
  id: string;
  nickname: string | null;
  username?: string | null;
  display_name?: string | null;
  avatar_url: string | null;
  trustScore: number;
};

function PostDetailSellerProfileRow({
  author,
  regionLine,
}: {
  author: PostDetailSellerAuthor | null;
  regionLine: React.ReactNode;
}) {
  const { t } = useI18n();
  /** Member Identity: nickname only (no @dibay_id on trade detail) */
  const displayName =
    incomingCallPeerNicknameLabel(author?.nickname) || t("trade_detail_seller_fallback");
  const label = displayName;
  const initial = label.charAt(0).toUpperCase() || "?";
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center">
        <SamarketThumbnail
          src={author?.avatar_url}
          size={38}
          roundedClassName="rounded-full"
          className="mr-2.5 bg-sam-surface-muted text-[13px] font-bold text-sam-muted"
          fallbackSrc=""
          fallbackNode={<span aria-hidden>{initial}</span>}
        />
        <div className="min-w-0 flex-1">
          <p className={TRADE_FB_DETAIL_SELLER_NAME}>{displayName}</p>
          {regionLine}
        </div>
      </div>
      <MannerBatteryDisplay raw={author?.trustScore ?? 50} layout="inline" size="sm" className="shrink-0" />
    </div>
  );
}

/** 거래 상세 본문 — 본인 글 포인트 홍보 CTA (sticky 하단 바 금지 · 홍보 시트와 겹침 방지) */
function TradePostDetailInlinePromoteCta({ onTradeAdOpen }: { onTradeAdOpen: () => void }) {
  const { safeT } = useI18n();
  const promoteLabel = safeT("trade_promo_detail_cta", {
    fallbackKo: "더 알리기",
    fallbackEn: "Promote",
  });
  return (
    <button type="button" className={`w-full ${TRADE_POST_DETAIL_BOTTOM_PRIMARY_CTA}`} onClick={onTradeAdOpen}>
      {promoteLabel}
    </button>
  );
}

interface PostDetailViewProps {
  post: PostWithMeta;
  sellerProfile?: PublicSellerProfileDTO | null;
  related?: {
    sellerItems: PostWithMeta[];
    similarItems: PostWithMeta[];
    ads: PostWithMeta[];
  };
  /** RSC `Suspense` 슬롯 — related 를 본문 이후 스트리밍할 때(거래 상세 핫패스). */
  relatedSectionsSlot?: ReactNode;
  /** RSC에서 시드 — 동일 세션이면 `room-id` GET 생략 */
  viewerTradeRoomBootstrap?: {
    viewerUserId: string;
    roomId: string | null;
    source: ChatRoomSource | null;
    messengerRoomId?: string | null;
  };
  initialRouteTotalMs?: number;
  /** RSC 세션 UUID — 클라 세션보다 먼저 소유자 UI 표시 */
  serverViewerUserId?: string;
}

export function PostDetailView({
  post,
  sellerProfile = null,
  related,
  relatedSectionsSlot,
  viewerTradeRoomBootstrap,
  initialRouteTotalMs,
  serverViewerUserId,
}: PostDetailViewProps) {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const tradePostDetailSlideHost = useTradePostDetailSlideHost();
  const requireAction = useRequireAuthAction();
  const rootRef = useRef<HTMLDivElement | null>(null);
  /** `undefined`: 세션 확인 전 — 동기 프로필 캐시만 쓰면 유휴 후 캐시가 비어 로그아웃으로 오인될 수 있음 */
  const [resolvedViewerId, setResolvedViewerId] = useState<string | null | undefined>(() => {
    const s = typeof serverViewerUserId === "string" ? serverViewerUserId.trim() : "";
    return s ? s : undefined;
  });

  useEffect(() => {
    let cancelled = false;
    const resolveViewer = async () => {
      const id = (await getCurrentUserIdForDb())?.trim() || null;
      if (!cancelled) {
        setResolvedViewerId((prev) => (prev === id ? prev : id));
      }
    };
    void resolveViewer();
    const onTestAuthChange = () => {
      void resolveViewer();
    };
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onTestAuthChange);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void resolveViewer();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const sb = getSupabaseClient();
    const authSub = sb?.auth.onAuthStateChange(() => {
      void resolveViewer();
    });
    return () => {
      cancelled = true;
      window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onTestAuthChange);
      document.removeEventListener("visibilitychange", onVisibility);
      authSub?.data.subscription.unsubscribe();
    };
  }, []);

  /** 카테고리 로드 전 폴백 — 거래 상세는 `/market` 이 안전 */
  const [backHref, setBackHref] = useState("/market");
  const [category, setCategory] = useState<CategoryWithSettings | null>(null);
  /** Option SSOT — ROOT topic. Child category is list narrowing only. */
  const [compositionRoot, setCompositionRoot] = useState<CategoryWithSettings | null>(null);
  const [author, setAuthor] = useState<PostDetailSellerAuthor | null>(() =>
    sellerProfile?.id
      ? {
          id: sellerProfile.id,
          nickname: sellerProfile.nickname,
          username: sellerProfile.username ?? null,
          display_name: sellerProfile.display_name ?? null,
          avatar_url: sellerProfile.avatar_url,
          trustScore: sellerProfile.trustScore,
        }
      : null
  );
  /** `/api/users/.../public-profile` — 기본 거래 주소 동네(글 지역이 비었을 때) */
  const [sellerTradeLocationLine, setSellerTradeLocationLine] = useState<string | null>(
    () => sellerProfile?.tradeLocationLine?.trim() || null
  );
  const [isFavorite, setIsFavorite] = useState(false);
  const [jobApplyBusy, setJobApplyBusy] = useState(false);
  const [jobApplyDone, setJobApplyDone] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  /**
   * 채팅 CTA navigation once-guard.
   * 연타 시 `openCreateTradeChat`/`openExistingTradeChat` 이 replace·push 를 반복하지 않게 한다.
   * API create-or-get inflight 와 별개 — 네비만 1회.
   */
  const [chatCtaBusy, setChatCtaBusy] = useState(false);
  const chatNavStartedRef = useRef(false);
  const tradeChatPrepareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chatError, setChatError] = useState("");
  /** 거래 글: 이 글·본인·판매자 기준으로 이미 열린 채팅방 (상품↔채팅 연동) */
  const [existingTradeRoomId, setExistingTradeRoomId] = useState<string | null>(() =>
    viewerTradeRoomBootstrap ? viewerTradeRoomBootstrap.roomId : null
  );
  const [existingTradeRoomSource, setExistingTradeRoomSource] = useState<ChatRoomSource | null>(() =>
    viewerTradeRoomBootstrap ? viewerTradeRoomBootstrap.source : null
  );
  const [existingTradeMessengerId, setExistingTradeMessengerId] = useState<string | null>(() =>
    viewerTradeRoomBootstrap?.messengerRoomId && typeof viewerTradeRoomBootstrap.messengerRoomId === "string"
      ? viewerTradeRoomBootstrap.messengerRoomId.trim() || null
      : null
  );
  const [detailMoreOpen, setDetailMoreOpen] = useState(false);
  const [sellerMoreOpen, setSellerMoreOpen] = useState(false);
  const [promoteSheetOpen, setPromoteSheetOpen] = useState(false);
  const [sellerSheetBusy, setSellerSheetBusy] = useState(false);

  const appSettings = getAppSettings();
  const chatEnabled = appSettings.chatEnabled !== false;
  const allowChatAfterSold = appSettings.allowChatAfterSold === true;
  const reportEnabled = appSettings.reportEnabled !== false;
  const defaultCurrency = appSettings.defaultCurrency || "KRW";

  const tradeListingOwnerUserId = useMemo(
    () => postTradeListingOwnerUserId(post as unknown as Record<string, unknown>),
    [post.author_id, post.user_id]
  );

  const isOwnPost =
    resolvedViewerId !== undefined &&
    resolvedViewerId !== null &&
    postOwnedByUserId(post as unknown as Record<string, unknown>, resolvedViewerId);
  const postStatusLower = String(post.status ?? "").toLowerCase();
  const listingState = normalizeSellerListingState(post.seller_listing_state, post.status);
  const canApplyTradeAd = isOwnPost && post.type !== "community" && postStatusLower === "active";
  const showSellerMoreMenu =
    isOwnPost && post.type !== "community" && !["deleted", "blinded"].includes(postStatusLower);
  const isTradeDetail = post.type !== "community";
  const promoteBuyerPrimaryActions = !isOwnPost && isTradeDetail;

  const ownerMenuPost = useMemo(
    () => ({
      author_id: post.author_id,
      status: post.status,
      seller_listing_state: post.seller_listing_state,
      meta: (post.meta as Record<string, unknown> | null) ?? null,
    }),
    [post.author_id, post.status, post.seller_listing_state, post.meta]
  );
  const sellerSheetEditLocked = ownerEditLockedFromPost(ownerMenuPost);
  const sellerSheetDeleteLocked = ownerDeleteLockedFromPost(ownerMenuPost);

  useEffect(() => {
    incrementPostViewCount(post.id);
  }, [post.id]);

  useEffect(() => {
    if (resolvedViewerId === undefined) return;
    if (resolvedViewerId === null || post.type === "community") {
      setExistingTradeRoomId(null);
      setExistingTradeRoomSource(null);
      setExistingTradeMessengerId(null);
      return;
    }
    if (postOwnedByUserId(post as unknown as Record<string, unknown>, resolvedViewerId)) {
      setExistingTradeRoomId(null);
      setExistingTradeRoomSource(null);
      setExistingTradeMessengerId(null);
      return;
    }
    if (
      viewerTradeRoomBootstrap &&
      resolvedViewerId === viewerTradeRoomBootstrap.viewerUserId
    ) {
      setExistingTradeRoomId(viewerTradeRoomBootstrap.roomId);
      setExistingTradeRoomSource(viewerTradeRoomBootstrap.source);
      const mid =
        typeof viewerTradeRoomBootstrap.messengerRoomId === "string"
          ? viewerTradeRoomBootstrap.messengerRoomId.trim()
          : "";
      setExistingTradeMessengerId(mid || null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await runSingleFlight(`trade:item-room-id:get:${post.id}`, () =>
          fetch(`/api/chat/item/room-id?itemId=${encodeURIComponent(post.id)}`, {
            credentials: "include",
            cache: "no-store",
          })
        );
        if (cancelled) return;
        if (!res.ok) {
          setExistingTradeRoomId(null);
          setExistingTradeRoomSource(null);
          setExistingTradeMessengerId(null);
          return;
        }
        const data = (await res.clone().json().catch(() => ({}))) as {
          roomId?: unknown;
          source?: unknown;
          messengerRoomId?: unknown;
        };
        if (cancelled) return;
        setExistingTradeRoomId(typeof data?.roomId === "string" ? data.roomId : null);
        setExistingTradeRoomSource(
          data?.source === "chat_room" || data?.source === "product_chat" ? data.source : null
        );
        const mid = typeof data?.messengerRoomId === "string" ? data.messengerRoomId.trim() : "";
        setExistingTradeMessengerId(mid || null);
      } catch {
        if (!cancelled) {
          setExistingTradeRoomId(null);
          setExistingTradeRoomSource(null);
          setExistingTradeMessengerId(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [post, post.id, post.type, resolvedViewerId, viewerTradeRoomBootstrap]);

  useEffect(() => {
    const onRoomResolved = (ev: Event) => {
      const d = (ev as CustomEvent<TradeChatRoomResolvedDetail>).detail;
      if (!d?.productId || d.productId !== post.id) return;
      setExistingTradeRoomId(d.roomId.trim());
      setExistingTradeRoomSource(d.roomSource === "product_chat" ? "product_chat" : "chat_room");
      const mid = typeof d.messengerRoomId === "string" ? d.messengerRoomId.trim() : "";
      setExistingTradeMessengerId(mid || null);
    };
    window.addEventListener(KASAMA_TRADE_CHAT_ROOM_RESOLVED, onRoomResolved);
    return () => window.removeEventListener(KASAMA_TRADE_CHAT_ROOM_RESOLVED, onRoomResolved);
  }, [post.id]);

  const writeCtx = useWriteCategory();

  useEffect(() => {
    let cancelled = false;
    setCompositionRoot(null);
    void (async () => {
      const c = await getCategoryBySlugOrId(post.category_id);
      if (cancelled || !c) return;
      setCategory(c);
      const remembered = peekTradeListReturnHref();
      setBackHref(remembered || getCategoryHref(c));
      const parentId = typeof c.parent_id === "string" ? c.parent_id.trim() : "";
      if (!parentId) {
        setCompositionRoot(c);
        return;
      }
      const parent = await getCategoryBySlugOrId(parentId);
      if (cancelled) return;
      const byId = new Map<string, CategoryWithSettings>();
      byId.set(c.id, c);
      if (parent?.id) byId.set(parent.id, parent);
      setCompositionRoot(resolveTradeCompositionRootRow(c.id, byId) ?? c);
    })();
    return () => {
      cancelled = true;
    };
  }, [post.category_id]);

  const setMainTier1Extras = useSetMainTier1ExtrasOptional();
  const tradeDetailHeaderTitle = category?.name?.trim() || t("trade_detail_header_fallback");

  useLayoutEffect(() => {
    if (!setMainTier1Extras) return;
    if (tradePostDetailSlideHost) {
      setMainTier1Extras({
        tier1: {
          titleText: tradeDetailHeaderTitle,
          preferHistoryBack: false,
          ariaLabel: t("tier1_back"),
          showHubQuickActions: false,
          leftSlot: (
            <AppBackButton
              onBack={tradePostDetailSlideHost.closeSlide}
              ariaLabelKey="tier1_back"
              className="text-[#111]"
            />
          ),
        },
      });
      return () => setMainTier1Extras(null);
    }
    const showBuyerMore = !isOwnPost;
    const showSellerMore = showSellerMoreMenu;
    setMainTier1Extras({
      tier1: {
        titleText: tradeDetailHeaderTitle,
        /** 항상 해당 카테고리 목록(`/market/{id}`)으로 — 히스토리 백 미사용 */
        preferHistoryBack: false,
        ariaLabel: t("trade_detail_back_to_list"),
        showHubQuickActions: false,
        leftSlot: (
          <AppBackButton
            preferHistoryBack={false}
            backHref={backHref}
            ariaLabel={t("trade_detail_back_to_list")}
            className="text-[#111]"
          />
        ),
        rightSlot: (
          <div className="flex shrink-0 items-center justify-end">
            {showBuyerMore ? (
              <button
                type="button"
                onClick={() => setDetailMoreOpen(true)}
                className="flex h-10 w-10 shrink-0 items-center justify-center text-[#111]"
                aria-label={t("ui_product_more_aria")}
              >
                <svg className="h-[22px] w-[22px] shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="12" cy="19" r="2" />
                </svg>
              </button>
            ) : showSellerMore ? (
              <button
                type="button"
                onClick={() => setSellerMoreOpen(true)}
                className="flex h-10 w-10 shrink-0 items-center justify-center text-[#111]"
                aria-label={t("ui_product_more_aria")}
              >
                <svg className="h-[22px] w-[22px] shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="12" cy="19" r="2" />
                </svg>
              </button>
            ) : null}
          </div>
        ),
      },
    });
    return () => setMainTier1Extras(null);
  }, [
    setMainTier1Extras,
    tradeDetailHeaderTitle,
    backHref,
    isOwnPost,
    showSellerMoreMenu,
    tradePostDetailSlideHost,
    t,
  ]);

  useLayoutEffect(() => {
    recordRouteEntryRouteTotalMs("product_detail", initialRouteTotalMs);
    if (typeof initialRouteTotalMs === "number" && Number.isFinite(initialRouteTotalMs)) {
      recordTradeDetailTotalMs(initialRouteTotalMs);
    }
    if (typeof window !== "undefined") {
      recordRouteEntryFetchNetworkFromResources("product_detail", [
        window.location.pathname,
        encodeURIComponent(window.location.pathname),
        "_rsc=",
      ]);
    }
    recordRouteEntryJsonParseComplete("product_detail");
  }, [initialRouteTotalMs]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const title = root.querySelector("h2");
    const sellerBlock = root.querySelector('[data-post-detail-seller="true"]');
    if (title && sellerBlock) {
      recordRouteEntryFirstContentRender("product_detail");
      scheduleRouteEntryToPaint("product_detail");
    }
    const enabledChatButton = root.querySelector(
      '[data-post-detail-action-bar="true"] button:not([disabled]), [data-post-detail-action-bar="true"] a[href]'
    );
    if (enabledChatButton instanceof HTMLElement) {
      recordRouteEntryFirstInteractive("product_detail");
    }
    const descriptionBlock = root.querySelector("h3 + p, ul, [data-post-detail-seller=\"true\"]");
    const chatButton = root.querySelector('[data-post-detail-action-bar="true"] button, [data-post-detail-action-bar="true"] a[href]');
    const firstImage = root.querySelector("img");
    const imageReady =
      !firstImage || (firstImage instanceof HTMLImageElement && firstImage.complete && firstImage.naturalWidth > 0);
    if (title && descriptionBlock && chatButton && imageReady) {
      recordRouteEntryFullRender("product_detail");
    }
    if (firstImage instanceof HTMLImageElement && !imageReady) {
      const onLoad = () => recordRouteEntryFullRender("product_detail");
      firstImage.addEventListener("load", onLoad, { once: true });
      return () => firstImage.removeEventListener("load", onLoad);
    }
    return;
  }, [author, category?.id, post.content, post.id, resolvedViewerId]);

  useEffect(() => {
    if (!category || !writeCtx) return;
    const segment = category.slug?.trim() || String(category.id);
    writeCtx.setWriteCategorySlug(segment);
    return () => writeCtx.setWriteCategorySlug(null);
  }, [category, writeCtx]);

  useEffect(() => {
    const sellerUserId = tradeListingOwnerUserId?.trim();
    if (!sellerUserId) {
      setAuthor(null);
      setSellerTradeLocationLine(null);
      return;
    }
    if (sellerProfile?.id && sellerProfile.id === sellerUserId) {
      setAuthor({
        id: sellerProfile.id,
        nickname: sellerProfile.nickname,
        username: sellerProfile.username ?? null,
        display_name: sellerProfile.display_name ?? null,
        avatar_url: sellerProfile.avatar_url,
        trustScore: sellerProfile.trustScore,
      });
      setSellerTradeLocationLine(sellerProfile.tradeLocationLine?.trim() || null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const encodedSellerId = encodeURIComponent(sellerUserId);
        const res = await runSingleFlight(`users:${encodedSellerId}:public-profile`, () =>
          fetch(`/api/users/${encodedSellerId}/public-profile`, {
            cache: "no-store",
          })
        );
        const data = (await res.clone().json().catch(() => ({}))) as {
          ok?: boolean;
          profile?: PublicSellerProfileDTO;
        };
        if (cancelled) return;
        if (res.ok && data?.ok && data.profile?.id) {
          setAuthor({
            id: data.profile.id,
            nickname: data.profile.nickname,
            username: data.profile.username ?? null,
            display_name: data.profile.display_name ?? null,
            avatar_url: data.profile.avatar_url,
            trustScore: data.profile.trustScore,
          });
          const tradeLine = data.profile.tradeLocationLine?.trim();
          setSellerTradeLocationLine(tradeLine || null);
          return;
        }
      } catch {
        /* fallback below */
      }
      if (cancelled) return;
      const p = await getUserProfile(sellerUserId);
      if (cancelled) return;
      if (p) {
        setAuthor({
          id: p.id,
          nickname: p.nickname,
          avatar_url: p.avatar_url,
          trustScore: p.trustScore ?? p.speed ?? p.temperature ?? 50,
        });
        setSellerTradeLocationLine(null);
      } else {
        setAuthor(null);
        setSellerTradeLocationLine(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    tradeListingOwnerUserId,
    sellerProfile?.avatar_url,
    sellerProfile?.id,
    sellerProfile?.nickname,
    sellerProfile?.tradeLocationLine,
    sellerProfile?.trustScore,
  ]);

  useEffect(() => {
    getFavoriteStatus(post.id).then(setIsFavorite);
  }, [post.id]);

  useEffect(() => {
    const onFav = (event: Event) => {
      const detail = (event as CustomEvent<PostFavoriteChangedDetail>).detail;
      if (detail?.postId !== post.id || typeof detail.isFavorite !== "boolean") return;
      setIsFavorite(detail.isFavorite);
    };
    window.addEventListener(POST_FAVORITE_CHANGED_EVENT, onFav);
    return () => window.removeEventListener(POST_FAVORITE_CHANGED_EVENT, onFav);
  }, [post.id]);

  const handleFavorite = useCallback(async () => {
    await requireAction("trade_favorite", async () => {
      const uid = (await getCurrentUserIdForDb())?.trim() || null;
      if (!uid) return;
      if (postOwnedByUserId(post as unknown as Record<string, unknown>, uid)) return;
      const prevFavorite = isFavorite;
      setIsFavorite(!prevFavorite);
      const res = await toggleFavorite(post.id);
      if (!res.ok) {
        setIsFavorite(prevFavorite);
      } else {
        setIsFavorite(res.isFavorite);
      }
    });
  }, [post, post.id, requireAction, isFavorite]);

  const handleShare = useCallback(async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = canonicalTradeDetailUrl(origin, post.id);
    const result = await shareOrCopyTradeListing({ title: post.title ?? "", url });
    if (result === "copied") {
      await dibayAlert({
        title: safeT("trade_detail_share_copied", {
          fallbackKo: "링크를 복사했어요.",
          fallbackEn: "Link copied.",
        }),
      });
      return;
    }
    if (result === "failed") {
      await dibayAlert({
        title: safeT("trade_detail_share_failed", {
          fallbackKo: "공유하지 못했습니다.",
          fallbackEn: "Could not share.",
        }),
      });
    }
  }, [post.id, post.title, safeT]);

  const chatBlockedByOtherReservation = useMemo(() => {
    if (post.type === "community") return false;
    if (resolvedViewerId === undefined || resolvedViewerId === null) return false;
    if (postOwnedByUserId(post as unknown as Record<string, unknown>, resolvedViewerId)) return false;
    if (existingTradeRoomId) return false;
    return shouldBlockNewItemChatForBuyer(post as unknown as Record<string, unknown>, resolvedViewerId);
  }, [post, resolvedViewerId, existingTradeRoomId]);
  const chatBlockedByCompleted = listingState === "completed";
  const chatBlockedByReservedState = listingState === "reserved" && !existingTradeRoomId;
  const chatBlockedByListingState = chatBlockedByCompleted || chatBlockedByReservedState;

  const prefetchTradeChatShell = useCallback(() => {
    prefetchTradeChatEntry(router, {
      productId: post.id,
      existingRoomId: existingTradeRoomId,
      existingRoomSource: existingTradeRoomSource,
      existingMessengerRoomId: existingTradeMessengerId,
    });
  }, [router, existingTradeRoomId, existingTradeRoomSource, existingTradeMessengerId, post.id]);

  const handleChat = useCallback(async () => {
    if (chatNavStartedRef.current) return;
    chatNavStartedRef.current = true;
    setChatCtaBusy(true);
    setChatError("");
    let navigated = false;
    try {
      await requireAction("trade_chat", async () => {
        if (navigated) return;
        const uid = (await getCurrentUserIdForDb())?.trim() || null;
        if (!uid) return;
        if (chatBlockedByCompleted) {
          setChatError(t("trade_detail_chat_blocked_completed"));
          return;
        }
        if (chatBlockedByReservedState) {
          setChatError(t("trade_detail_chat_blocked_reserved"));
          return;
        }
        if (existingTradeRoomId) {
          openExistingTradeChat(router, {
            productId: post.id,
            roomId: existingTradeRoomId,
            messengerRoomId: existingTradeMessengerId,
            sourceHint: existingTradeRoomSource,
          });
          navigated = true;
          return;
        }
        if (postOwnedByUserId(post as unknown as Record<string, unknown>, uid)) {
          setChatError(t("trade_detail_chat_error_own_product"));
          return;
        }
        if (chatBlockedByOtherReservation) {
          setChatError(t("trade_detail_chat_error_reserved_buyer"));
          return;
        }
        const thumbs = imageResolveTradePostDetailImageUrls(post);
        const productThumbnail = thumbs[0] ?? "";
        const productTitle = (post.title ?? t("trade_detail_product_fallback")).trim();
        const priceText = post.is_free_share
          ? t("trade_detail_free_share")
          : post.price != null
            ? formatPrice(post.price, defaultCurrency)
            : t("trade_detail_price_inquiry");
        const sellerName = author?.nickname?.trim() || t("trade_detail_seller_fallback");
        const sellerNameDisplay = sellerName;
        openCreateTradeChat(router, {
          productId: post.id,
          composePreview: {
            productTitle,
            productThumbnail,
            priceText,
            sellerName: sellerNameDisplay,
          },
        });
        navigated = true;
      });
    } finally {
      if (!navigated) {
        chatNavStartedRef.current = false;
        setChatCtaBusy(false);
      }
    }
  }, [
    post,
    post.id,
    router,
    author,
    defaultCurrency,
    existingTradeRoomId,
    existingTradeRoomSource,
    existingTradeMessengerId,
    chatBlockedByOtherReservation,
    chatBlockedByCompleted,
    chatBlockedByReservedState,
    requireAction,
    t,
  ]);

  const runCancelOwnSale = useCallback(async () => {
    setSellerSheetBusy(true);
    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(post.id)}/owner-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ status: "hidden" }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        await dibayAlert({ title: data.error ?? t("trade_detail_owner_action_failed") });
        return;
      }
      setSellerMoreOpen(false);
      router.push("/my/products");
      router.refresh();
    } catch {
      await dibayAlert({ title: t("mypage_comp_product_network_error_short") });
    } finally {
      setSellerSheetBusy(false);
    }
  }, [post.id, router, t]);

  const handleOwnerEdit = useCallback(() => {
    setSellerMoreOpen(false);
    router.push(`/products/${encodeURIComponent(post.id)}/edit`);
  }, [post.id, router]);

  const runOwnerDelete = useCallback(async () => {
    setSellerSheetBusy(true);
    try {
      const res = await runSingleFlight(`trade:post:owner-delete:${post.id}`, () =>
        fetch(`/api/posts/${encodeURIComponent(post.id)}/owner-delete`, {
          method: "POST",
          credentials: "include",
        })
      );
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        await dibayAlert({ title: data.error ?? t("trade_detail_delete_failed") });
        return;
      }
      setSellerMoreOpen(false);
      router.push(backHref || "/my/products");
      router.refresh();
    } catch {
      await dibayAlert({ title: t("ui_post_delete_network_error") });
    } finally {
      setSellerSheetBusy(false);
    }
  }, [post.id, router, backHref, t]);

  const isSold = post.status === "sold";
  const showPrice =
    (post.type === "trade" || post.price != null || post.is_free_share === true) &&
    (category == null || category.settings?.has_price !== false);
  const showChat =
    post.type !== "community" && chatEnabled && (category == null || category.settings?.has_chat !== false);

  const detailMetaJob =
    post.meta && typeof post.meta === "object" && !Array.isArray(post.meta)
      ? (post.meta as Record<string, unknown>)
      : {};
  const listingKindJob = String(detailMetaJob.listing_kind ?? "").trim();
  const isJobTradePost =
    post.trade_type === "job" ||
    String(detailMetaJob.trade_chat_kind ?? "").toLowerCase() === "job";
  const jobDetailDirection = resolveJobDetailDirection(detailMetaJob);
  const jobDetailListingKind = jobDetailDirection === "hiring" ? "hire" : "work";
  const compositionOwner = compositionRoot;
  const detailCompositionProfileId = resolveTradeCompositionProfileId({
    icon_key: compositionOwner?.icon_key ?? category?.icon_key,
    slug: compositionOwner?.slug ?? category?.slug,
  });
  const detailSpecProfileId = resolveDetailSpecProfileId({
    icon_key: compositionOwner?.icon_key ?? category?.icon_key,
    slug: compositionOwner?.slug ?? category?.slug,
    meta: detailMetaJob,
  });
  /** CTA/process only — spec presentation uses detailSpecProfileId → projector */
  const isJobsDetailUi = detailSpecProfileId === "jobs" || post.trade_type === "job";

  const ctaPolicy = resolveTradeDetailCtaPolicy({
    isOwnPost,
    postStatusLower,
    categoryHasChat: showChat,
    isJobsDetailUi,
    jobDirection: jobDetailDirection,
    listingKind: listingKindJob,
    existingTradeRoomId,
    compositionProfileId: detailCompositionProfileId,
  });
  const uiTradeChatEnabled = ctaPolicy.uiTradeChatEnabled;
  const showJobApplyBtn = ctaPolicy.showJobApplyBtn;
  const showJobHireMergedApplyChatBtn = ctaPolicy.jobHireMergedApplyChatBtn;

  /** 채팅 버튼에 잠시 머물면 POST 선행 — 탭 시 inflight/캐시로 체감 지연 감소 */
  const scheduleTradeChatPrepare = useCallback(() => {
    if (!uiTradeChatEnabled) return;
    if (existingTradeRoomId) return;
    if (chatBlockedByListingState) return;
    if (chatBlockedByOtherReservation) return;
    if (isSold && !allowChatAfterSold) return;
    clearTradeChatPrepareTimer(tradeChatPrepareTimerRef);
    tradeChatPrepareTimerRef.current = setTimeout(() => {
      tradeChatPrepareTimerRef.current = null;
      prefetchTradeChatEntry(router, {
        productId: post.id,
        existingRoomId: existingTradeRoomId,
        existingRoomSource: existingTradeRoomSource,
        existingMessengerRoomId: existingTradeMessengerId,
        prepareIfCreate: true,
      });
    }, 72);
  }, [
    uiTradeChatEnabled,
    existingTradeRoomId,
    existingTradeRoomSource,
    existingTradeMessengerId,
    chatBlockedByListingState,
    chatBlockedByOtherReservation,
    isSold,
    allowChatAfterSold,
    post.id,
    router,
  ]);

  const cancelTradeChatPrepare = useCallback(() => {
    clearTradeChatPrepareTimer(tradeChatPrepareTimerRef);
  }, []);

  /** unmount·상품 변경 시 hover prepare timer 잔여 callback 차단 */
  useEffect(() => {
    return () => {
      clearTradeChatPrepareTimer(tradeChatPrepareTimerRef);
    };
  }, [post.id]);

  /** 상품 변경 시 CTA once-guard 해제 — 페이지 key remount 외 soft 전환 대비 */
  useEffect(() => {
    chatNavStartedRef.current = false;
    setChatCtaBusy(false);
  }, [post.id]);

  /** 탭 직전에 resolve 선행 — 호버 180ms 없이도 첫 탭 체감 지연 완화 */
  const onTradeChatCtaPointerDown = useCallback(() => {
    cancelTradeChatPrepare();
    if (
      uiTradeChatEnabled &&
      !existingTradeRoomId &&
      !chatBlockedByListingState &&
      !chatBlockedByOtherReservation &&
      (!isSold || allowChatAfterSold)
    ) {
      void prefetchTradeChatEntry(router, {
        productId: post.id,
        existingRoomId: null,
        existingRoomSource: null,
        existingMessengerRoomId: null,
        prepareIfCreate: true,
      });
    } else {
      prefetchTradeChatShell();
    }
  }, [
    cancelTradeChatPrepare,
    uiTradeChatEnabled,
    existingTradeRoomId,
    chatBlockedByListingState,
    chatBlockedByOtherReservation,
    isSold,
    allowChatAfterSold,
    router,
    post.id,
    prefetchTradeChatShell,
  ]);

  /** 상세 진입 직후 채팅 라우트·선행 resolve — 탭 전 호버 없이도 체감 지연 완화 */
  useEffect(() => {
    if (resolvedViewerId === undefined || resolvedViewerId === null) return;
    if (postOwnedByUserId(post as unknown as Record<string, unknown>, resolvedViewerId)) return;
    if (!uiTradeChatEnabled) return;
    prefetchTradeChatEntry(router, {
      productId: post.id,
      existingRoomId: existingTradeRoomId,
      existingRoomSource: existingTradeRoomSource,
      existingMessengerRoomId: existingTradeMessengerId,
      prepareIfCreate: !existingTradeRoomId,
    });
  }, [
    post,
    post.id,
    resolvedViewerId,
    uiTradeChatEnabled,
    router,
    existingTradeRoomId,
    existingTradeRoomSource,
    existingTradeMessengerId,
  ]);

  const handleJobApply = useCallback(async () => {
    if (!resolvedViewerId || jobApplyBusy || jobApplyDone) return;
    setJobApplyBusy(true);
    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(post.id)}/job-apply`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        error?: string;
      };
      if (res.ok && data.ok) {
        setJobApplyDone(true);
        void handleChat();
        return;
      }
      if (res.status === 409 || data.code === "duplicate_application") {
        setJobApplyDone(true);
        void handleChat();
        return;
      }
      setChatError(typeof data.error === "string" ? data.error : t("trade_detail_job_apply_failed"));
    } finally {
      setJobApplyBusy(false);
    }
  }, [resolvedViewerId, jobApplyBusy, jobApplyDone, post.id, handleChat, t]);

  const handleInlineChatSend = useCallback(async () => {
    if (showJobApplyBtn && showJobHireMergedApplyChatBtn && !jobApplyDone) {
      await handleJobApply();
      return;
    }
    await handleChat();
  }, [showJobApplyBtn, showJobHireMergedApplyChatBtn, jobApplyDone, handleJobApply, handleChat]);

  const inlineChatDisabled =
    !uiTradeChatEnabled ||
    chatBlockedByListingState ||
    chatBlockedByOtherReservation ||
    chatCtaBusy;
  const inlineChatBlockTitle = tradeDetailChatBlockTitle(t, {
    completed: chatBlockedByCompleted,
    reserved: chatBlockedByReservedState,
    otherReservation: chatBlockedByOtherReservation,
    chatDisabled: !uiTradeChatEnabled,
  });
  const showInlineChatCard = isTradeDetail && !isOwnPost && showChat;
  const inlineChatSellerName =
    author?.nickname?.trim() || t("trade_detail_seller_fallback");

  const listingLocationLine = useMemo(() => {
    const re =
      post.meta && typeof post.meta === "object" && !Array.isArray(post.meta)
        ? (post.meta as Record<string, unknown>)
        : undefined;
    const fromPost = resolveTradePostListingLocationLine(
      re,
      post.region,
      post.city,
      post.trade_lgu_id
    );
    if (fromPost) return fromPost;
    const t = sellerTradeLocationLine?.trim();
    return t || null;
  }, [post.region, post.city, post.trade_lgu_id, post.meta, sellerTradeLocationLine]);

  const reMeta = (post.meta ?? {}) as Record<string, unknown>;
  const reDealType = (reMeta.deal_type as string)?.trim();
  const rePriceSummary =
    isReDealTypeSale(reDealType) && post.price != null
      ? tradeDetailReSaleSummary(t, formatPrice(post.price, defaultCurrency))
      : isReDealTypeRent(reDealType)
        ? tradeDetailReRentSummary(
            t,
            formatPrice(parseMetaAmount(reMeta.deposit), defaultCurrency),
            formatPrice(parseMetaAmount(reMeta.monthly), defaultCurrency)
          )
        : "";
  const postDetailSharedOverlays = (
    <>
      {chatError ? (
        <p
          className={`fixed bottom-[max(10px,var(--safe-bottom))] left-1/2 z-20 w-full -translate-x-1/2 bg-red-50 px-4 py-2 text-center sam-text-body-secondary text-red-600 ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS}`}
        >
          {chatError}
        </p>
      ) : null}
      <MemberPostPromoteSheet
        postId={post.id}
        postTitle={post.title ?? ""}
        open={promoteSheetOpen}
        onClose={() => setPromoteSheetOpen(false)}
      />
      <PostDetailMoreBottomSheet
        open={detailMoreOpen}
        onClose={() => setDetailMoreOpen(false)}
        onSelectReport={() => {
          setReportOpen(true);
        }}
        onSelectShare={() => {
          void handleShare();
        }}
        authorUserId={post.author_id}
        authorNickname={author?.nickname ?? null}
        reportEnabled={reportEnabled && !promoteBuyerPrimaryActions}
        shareEnabled={!promoteBuyerPrimaryActions}
      />
      <PostDetailSellerMoreSheet
        open={sellerMoreOpen}
        onClose={() => setSellerMoreOpen(false)}
        onEdit={handleOwnerEdit}
        onDelete={() => void runOwnerDelete()}
        onCancelSale={() => void runCancelOwnSale()}
        busy={sellerSheetBusy}
        editLocked={sellerSheetEditLocked}
        deleteLocked={sellerSheetDeleteLocked}
        editLockHint={(() => {
          const key = ownerEditLockHintKey(ownerMenuPost);
          return key ? t(key) : "";
        })()}
        deleteLockHint={(() => {
          const key = ownerDeleteLockHintKey(ownerMenuPost);
          return key ? t(key) : "";
        })()}
      />
      <ReportReasonModal
        postId={post.id}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
      />
    </>
  );

  const detailFooterMetaParts = [
    post.view_count != null && tradeDetailViewsLine(t, post.view_count),
  ].filter(Boolean) as string[];

  const detailImageUrls = imageResolveTradePostDetailImageUrls(post);
  const isUsedCarDetailUi = detailSpecProfileId === "used-car";
  const isRealEstateSpec = detailSpecProfileId === "real-estate";
  const isJobsSpec = detailSpecProfileId === "jobs";
  const isExchangeSpec = detailSpecProfileId === "exchange";
  const usedCarBuyNoImages =
    isUsedCarDetailUi && (reMeta.car_trade as string | undefined) === "buy" && detailImageUrls.length === 0;
  const reHeroBuilding = String(reMeta.building_name ?? "").trim();
  const reHeroTitle = reHeroBuilding || post.title || "";
  const detailHeroTitle = isUsedCarDetailUi
    ? stripUsedCarTradeDirectionFromDetailTitle(post.title ?? "")
    : isRealEstateSpec
      ? reHeroTitle
      : post.title ?? "";

  const jobsSkipImagePlaceholder = isJobsSpec && detailImageUrls.length === 0;

  const specTitle =
    isJobsSpec
      ? jobDetailDirection === "hiring"
        ? t("ui_jobs_detail_recruit_section")
        : t("ui_jobs_detail_seek_section")
      : t(detailSpecSectionTitleKey(detailSpecProfileId, compositionOwner?.icon_key ?? category?.icon_key));

  const specMeta =
    isRealEstateSpec && post.price != null ? { ...reMeta, price: String(post.price) } : (post.meta as Record<string, unknown>) ?? {};
  const specPost = {
    ...(post as unknown as Record<string, unknown>),
    ...(isRealEstateSpec && post.price != null ? { price: post.price } : {}),
    ...(isRealEstateSpec && post.region ? { region: post.region } : {}),
    ...(isRealEstateSpec && post.city ? { city: post.city } : {}),
  };

  const jobsDescriptionHeading =
    jobDetailDirection === "hiring" ? t("ui_jobs_detail_description_heading") : t("ui_jobs_detail_intro_heading");
  const descriptionHeading = isJobsSpec ? jobsDescriptionHeading : t("ui_post_product_description_heading");
  const descriptionBody = (post.content ?? "").trim();
  const ui5ActionBtnClass =
    "flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 border-r border-sam-border-soft text-[13px] font-semibold text-sam-fg last:border-r-0";

  return (
    <div ref={rootRef} className="w-full min-w-0 bg-sam-app pb-[max(10px,var(--safe-bottom))]">
      <div className={TRADE_POST_DETAIL_FB_STACK_CLASS}>
        {!usedCarBuyNoImages && !jobsSkipImagePlaceholder ? (
          <section data-ui5-slot="photos" className={TRADE_FB_DETAIL_IMAGE_SECTION}>
            {detailImageUrls.length === 0 ? (
              <div className="relative flex w-full items-center justify-center overflow-hidden bg-sam-surface-muted">
                {isExchangeSpec ? (
                  <div
                    className="flex w-full flex-col items-center justify-center gap-2 py-12 text-sam-muted"
                    aria-hidden
                  >
                    <span className="text-5xl font-semibold leading-none">₱</span>
                    <span className="text-xl font-normal leading-none text-sam-meta">↔</span>
                    <span className="text-5xl font-semibold leading-none">₩</span>
                  </div>
                ) : (
                  <span className={`py-16 ${TRADE_FB_DETAIL_PLACEHOLDER_TEXT}`}>{t("ui_product_gallery_fallback")}</span>
                )}
              </div>
            ) : (
              <ProductImageGallery images={detailImageUrls} title={detailHeroTitle || post.title || ""} />
            )}
          </section>
        ) : null}

        <section className={TRADE_WRITE_FB_SECTION}>
          {isJobsSpec ? (
            <JobDetailHeader
              post={post}
              meta={(post.meta as Record<string, unknown>) ?? {}}
              currency={defaultCurrency}
              direction={jobDetailDirection}
              isSoldOpacity={isSold}
            />
          ) : (
            <>
              {isRealEstateSpec && rePriceSummary ? (
                <p data-ui5-slot="price" className={TRADE_FB_DETAIL_PRICE}>
                  {rePriceSummary}
                </p>
              ) : showPrice && !(isRealEstateSpec && isReDealTypeRent(reDealType)) ? (
                <p data-ui5-slot="price" className={TRADE_FB_DETAIL_PRICE}>
                  {post.is_free_share
                    ? t("trade_detail_free_share")
                    : post.price != null
                      ? formatPrice(post.price, defaultCurrency)
                      : ""}
                </p>
              ) : null}
              <h2 data-ui5-slot="title" className={`${TRADE_FB_DETAIL_HERO_TITLE} ${isSold ? "opacity-80" : ""}`}>
                {detailHeroTitle}
              </h2>
            </>
          )}
          {listingLocationLine ? (
            <p
              data-ui5-slot="location"
              className={`mt-2 flex min-w-0 items-center gap-1 ${TRADE_FB_DETAIL_META_HELP}`}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
              <span className="truncate">{listingLocationLine}</span>
              {post.created_at ? (
                <>
                  <span className="shrink-0" aria-hidden>
                    ·
                  </span>
                  <span className="shrink-0">{formatTimeAgo(post.created_at)}</span>
                </>
              ) : null}
            </p>
          ) : post.created_at ? (
            <p data-ui5-slot="location" className={`mt-2 ${TRADE_FB_DETAIL_FOOTNOTE}`}>
              {formatTimeAgo(post.created_at)}
            </p>
          ) : null}
        </section>

        <section data-ui5-slot="item" className={TRADE_WRITE_FB_SECTION}>
          <div className={`flex flex-col ${isJobsSpec ? "gap-2" : "gap-3"}`}>
            <div className="flex flex-wrap items-center gap-1.5">
              {isJobsSpec ? (
                <JobDetailTypeStatusChips
                  post={post}
                  meta={(post.meta as Record<string, unknown>) ?? {}}
                  direction={jobDetailDirection}
                />
              ) : (
                <>
                  <TradeListingStatusBadge
                    post={post}
                    size="detail"
                    surface="marketplace"
                    className={TRADE_DETAIL_STATUS_BADGE_CLASS}
                  />
                  {isUsedCarDetailUi
                    ? (() => {
                        const lab = getCarTradeLabel(t, post.meta as Record<string, unknown> | undefined);
                        if (!lab) return null;
                        return <span className={TRADE_FB_DETAIL_CHIP}>{lab}</span>;
                      })()
                    : null}
                  {post.is_free_share ? <span className={TRADE_FB_DETAIL_CHIP}>{t("trade_050")}</span> : null}
                  {(post.meta as Record<string, unknown> | undefined)?.direct_deal === true ? (
                    <span className={TRADE_FB_DETAIL_CHIP}>{t("trade_108")}</span>
                  ) : null}
                </>
              )}
            </div>

            {isJobsSpec ? <JobDetailContextNote direction={jobDetailDirection} /> : null}

            {compositionOwner &&
            (detailSpecProfileId !== "general" ||
              Boolean(compositionOwner.icon_key && post.meta && Object.keys(post.meta).length > 0)) ? (
              <TradeCompositionDetailSection
                iconKey={detailSpecProfileId}
                categorySlug={compositionOwner.slug}
                fieldComposition={compositionOwner.settings?.field_composition}
                title={specTitle}
                meta={specMeta}
                post={specPost}
                currency={defaultCurrency}
                framed={isRealEstateSpec}
                skipFieldIds={isRealEstateSpec ? REAL_ESTATE_HERO_SKIP_FIELD_IDS : undefined}
                adapterCtx={
                  isJobsSpec
                    ? {
                        listingKind: jobDetailListingKind,
                        workCategory: String(detailMetaJob.work_category ?? "").trim() || null,
                      }
                    : undefined
                }
              />
            ) : null}

            {isJobsSpec ? (
              <JobsExtendedDetailExtras
                variant={jobDetailListingKind}
                post={post}
                meta={(post.meta as Record<string, unknown>) ?? {}}
              />
            ) : null}
          </div>
        </section>

        <section data-ui5-slot="description" className={TRADE_WRITE_FB_SECTION}>
          <h3 className={TRADE_WRITE_FB_FIELD_HEAD}>{descriptionHeading}</h3>
          <p className={`mt-0.5 ${TRADE_FB_DETAIL_BODY}`}>{descriptionBody || (isJobsSpec ? "—" : "")}</p>
          {detailFooterMetaParts.length > 0 ? (
            <p className={`mt-3 ${TRADE_FB_DETAIL_FOOTNOTE}`}>{detailFooterMetaParts.join(" · ")}</p>
          ) : null}
        </section>

        {showInlineChatCard ? (
          <section data-ui5-slot="inline-chat" className={`${TRADE_WRITE_FB_SECTION} min-w-0`}>
            <TradeDetailInlineChatCard
              sellerName={inlineChatSellerName}
              continueChat={Boolean(existingTradeRoomId)}
              disabled={inlineChatDisabled}
              busy={chatCtaBusy || jobApplyBusy}
              blockTitle={inlineChatBlockTitle}
              onSend={handleInlineChatSend}
              onContinueChat={handleChat}
              onPointerEnter={scheduleTradeChatPrepare}
              onPointerLeave={cancelTradeChatPrepare}
              onPointerDown={onTradeChatCtaPointerDown}
            />
          </section>
        ) : null}

        {canApplyTradeAd ? (
          <section
            data-ui5-slot="promote"
            data-post-detail-action-bar="true"
            className={`${TRADE_WRITE_FB_SECTION} min-w-0`}
          >
            <TradePostDetailInlinePromoteCta onTradeAdOpen={() => setPromoteSheetOpen(true)} />
          </section>
        ) : null}

        <section
          id={POST_DETAIL_SELLER_ANCHOR_ID}
          data-post-detail-seller="true"
          data-ui5-slot="seller"
          className={`scroll-mt-14 ${TRADE_WRITE_FB_SECTION}`}
        >
          <PostDetailSellerProfileRow author={author} regionLine={null} />
        </section>

        {isTradeDetail ? (
          <section data-ui5-slot="actions" className={TRADE_WRITE_FB_SECTION}>
            {promoteBuyerPrimaryActions ? (
              <div className="-mx-4 -my-3 flex">
                <button type="button" onClick={() => void handleFavorite()} className={ui5ActionBtnClass}>
                  <span className={isFavorite ? "text-red-500" : "text-sam-muted"}>{isFavorite ? "♥" : "♡"}</span>
                  <span>{t("ui_fav_interest")}</span>
                </button>
                {reportEnabled ? (
                  <button type="button" onClick={() => setReportOpen(true)} className={ui5ActionBtnClass}>
                    {t("trade_detail_report_submit")}
                  </button>
                ) : null}
                <button type="button" onClick={() => void handleShare()} className={ui5ActionBtnClass}>
                  {t("trade_detail_share")}
                </button>
              </div>
            ) : isOwnPost ? (
              <div className="-mx-4 -my-3 flex">
                <button type="button" onClick={() => void handleShare()} className={ui5ActionBtnClass}>
                  {t("trade_detail_share")}
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        <div data-ui5-slot="discovery">
          {relatedSectionsSlot ? (
            relatedSectionsSlot
          ) : related ? (
            <PostDetailRelatedSections
              sellerItems={related.sellerItems}
              similarItems={related.similarItems}
              ads={related.ads}
            />
          ) : null}
        </div>

        {post.type === "community" ? (
          <div className={POST_DETAIL_COMMUNITY_CARD_CLASS}>
            <PostCommunityCommentsSection postId={post.id} currentUserId={resolvedViewerId ?? null} />
          </div>
        ) : null}
      </div>

      {postDetailSharedOverlays}
    </div>
  );
}
