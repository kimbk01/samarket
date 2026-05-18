"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { OPEN_RECEIVED_OFFERS_SEARCH_PARAM } from "@/lib/notifications/resolve-notification-inbox-href";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ChatRoomSource } from "@/lib/types/chat";
import type { PostWithMeta } from "@/lib/posts/schema";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { getCategoryBySlugOrId } from "@/lib/categories/getCategoryById";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import { formatPrice, formatTimeAgo, parseMetaAmount, sqToPyeong } from "@/lib/utils/format";
import { getLocationLabel } from "@/lib/products/form-options";
import { getUserProfile } from "@/lib/users/getUserProfile";
import { getFavoriteStatus } from "@/lib/favorites/getFavoriteStatus";
import { toggleFavorite } from "@/lib/favorites/toggleFavorite";
import { createReport } from "@/lib/reports/createReport";
import { postOwnedByUserId, postTradeListingOwnerUserId } from "@/lib/chats/resolve-author-nickname";
import { PostCommunityCommentsSection } from "@/components/post/PostCommunityCommentsSection";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { incrementPostViewCount } from "@/lib/posts/incrementViewCount";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getAppSettings } from "@/lib/app-settings";
import { TRADE_SKIN_LABELS } from "@/lib/types/category";
import { resolveJobDetailDirection } from "@/lib/jobs/resolve-job-detail-direction";
import { JobDetailHeader } from "@/components/jobs/JobDetailHeader";
import { JobDetailContextNote } from "@/components/jobs/JobDetailContextNote";
import { JobHiringDetailCards } from "@/components/jobs/JobHiringDetailCards";
import { JobSeekingDetailCards } from "@/components/jobs/JobSeekingDetailCards";
import { CURRENCY_SYMBOLS, formatPrepKeysForDisplay } from "@/lib/exchange/form-options";
import { useWriteCategory } from "@/contexts/WriteCategoryContext";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { ProductImageGallery } from "@/components/product/detail/ProductImageGallery";
import {
  TRADE_POST_DETAIL_BOTTOM_ACTIONS_INNER,
  TRADE_POST_DETAIL_BOTTOM_ACTIONS_WRAP,
  TRADE_POST_DETAIL_BOTTOM_FAVORITE_BTN,
  TRADE_POST_DETAIL_BOTTOM_LOADING_PLACEHOLDER,
  TRADE_POST_DETAIL_BOTTOM_MUTED_CTA,
  TRADE_POST_DETAIL_BOTTOM_PRIMARY_CTA,
  TRADE_POST_DETAIL_BOTTOM_PRIMARY_ROW,
  TRADE_POST_DETAIL_BOTTOM_RE_SUMMARY,
  TRADE_POST_DETAIL_BOTTOM_SECONDARY_CTA,
  TRADE_POST_DETAIL_BOTTOM_SELLER_BAND,
  TRADE_POST_DETAIL_BOTTOM_SHELL,
} from "@/components/product/detail/product-detail-bottom-constants";
import { TradeListingStatusBadge } from "@/components/post/TradeListingStatusBadge";
import { getCarTradeLabelKo } from "@/lib/posts/car-trade-label";
import { labelForUsedCarBodyTypeKey } from "@/lib/trade/used-car-form-catalog";
import { shouldBlockNewItemChatForBuyer } from "@/lib/trade/reserved-item-chat";
import { POST_DETAIL_SELLER_ANCHOR_ID } from "@/lib/posts/post-detail-anchors";
import {
  ownerDeleteLockHint,
  ownerDeleteLockedFromPost,
  ownerEditLockHint,
  ownerEditLockedFromPost,
} from "@/lib/posts/post-list-owner-menu";
import { resolveTradePostListingLocationLine } from "@/lib/posts/post-listing-location-label";
import type { PublicSellerProfileDTO } from "@/lib/users/map-profile-to-public-seller";
import { PostDetailMoreBottomSheet } from "@/components/post/PostDetailMoreBottomSheet";
import { PostDetailSellerMoreSheet } from "@/components/post/PostDetailSellerMoreSheet";
import { PostDetailRelatedSections } from "@/components/post/PostDetailRelatedSections";
import { TradePostAdApplySheet } from "@/components/post/TradePostAdApplySheet";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { OfferButton } from "@/components/offers/OfferButton";
import { OfferModal } from "@/components/offers/OfferModal";
import { OfferStatusBuyer } from "@/components/offers/OfferStatusBuyer";
import { OfferListSellerModal } from "@/components/offers/OfferListSellerModal";
import { useMyPriceOffersForProduct } from "@/components/offers/useMyPriceOffersForProduct";
import { pickBuyerPrimaryOffer } from "@/lib/offers/pick-buyer-primary-offer";
import type { PriceOfferListItem } from "@/lib/offers/types";
import { broadcastPriceOfferCreatedForProduct } from "@/lib/offers/normalize-offer-product-id";
import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";
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
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { PHILIFE_FEED_INSET_X_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { formatAtUsername } from "@/lib/users/user-label";
import {
  TRADE_WRITE_FB_SECTION,
  TRADE_WRITE_FB_BLOCK_TITLE,
  TRADE_WRITE_FB_FIELD_HEAD,
  TRADE_FB_DETAIL_HERO_TITLE,
  TRADE_FB_DETAIL_PRICE,
  TRADE_FB_DETAIL_SUBTITLE,
  TRADE_FB_DETAIL_BODY,
  TRADE_FB_DETAIL_FOOTNOTE,
  TRADE_FB_DETAIL_META_ROW,
  TRADE_FB_DETAIL_META_DT,
  TRADE_FB_DETAIL_META_DD,
  TRADE_FB_DETAIL_META_HELP,
  TRADE_FB_DETAIL_IMAGE_SECTION,
  TRADE_FB_DETAIL_SELLER_NAME,
  TRADE_FB_DETAIL_PLACEHOLDER_TEXT,
} from "@/lib/ui/trade-write-fb-ui";
import { MannerBatteryDisplay } from "@/components/trust/MannerBatteryDisplay";

/** 거래 상세 — FB형 연속 섹션 스택(글쓰기와 동일 밀도) */
const TRADE_POST_DETAIL_FB_STACK_CLASS = `${PHILIFE_FEED_INSET_X_CLASS} space-y-0 pt-0`;
/** 상세 제목 줄 `TradeListingStatusBadge` — 목록·상세 규격 단일화 */
const TRADE_DETAIL_STATUS_BADGE_CLASS =
  "!inline-flex !h-6 !items-center !rounded-[4px] !border-0 !bg-[#f1f3f5] !px-2 !py-0 !text-[12px] !font-medium !leading-none !text-[#555555]";
/** 댓글·오버플로 잠금 해제 — `sam-card` 단일 규격 */
const POST_DETAIL_COMMUNITY_CARD_CLASS = "sam-card !overflow-visible";

function resolveTradePostDetailImageUrls(post: PostWithMeta): string[] {
  const imgArr = Array.isArray(post.images)
    ? post.images.filter((s): s is string => typeof s === "string")
    : [];
  if (imgArr.length > 0) return imgArr;
  const t = post.thumbnail_url;
  return typeof t === "string" && t.trim() ? [t.trim()] : [];
}

/** 하단 구분 뱃지와 중복되지 않게 헤더 제목에서만 제거 */
function stripUsedCarTradeDirectionFromDetailTitle(title: string): string {
  const t = title.trim();
  const stripped = t.replace(/^(삽니다|팝니다)\s*·\s*/u, "").trim();
  return stripped || t;
}

const META_LABELS: Record<string, Record<string, string>> = {
  "real-estate": {
    neighborhood: "동네",
    building_name: "건물명",
    estate_type: "타입",
    deal_type: "거래유형",
    deposit: "보증금",
    monthly: "월세",
    management_fee: "관리비",
    size_sq: "크기(sq)",
    room_count: "방수",
    bathroom_count: "욕실수",
    move_in_date: "입주 가능일",
  },
  "used-car": {
    car_trade: "구분",
    car_body_type: "차량 유형",
    car_model: "차종",
    car_year: "연식",
    car_year_max: "년식 (이하)",
    mileage: "주행거리(km)",
    has_accident: "사고 유무",
  },
  jobs: { salary: "급여", work_place: "근무지", work_type: "근무형태" },
  exchange: { currency: "통화", exchange_rate: "환율/비고" },
};

function hasJobsMeta(meta: Record<string, unknown>): boolean {
  return (
    meta.listing_kind != null ||
    meta.trade_chat_kind != null ||
    meta.job_type != null ||
    meta.work_category != null ||
    meta.work_category_other != null ||
    meta.work_term != null ||
    meta.pay_type != null ||
    meta.company_name != null
  );
}

function hasExchangeMeta(meta: Record<string, unknown>): boolean {
  return (
    meta.exchange_direction != null ||
    meta.from_currency != null ||
    meta.to_currency != null ||
    meta.exchange_rate != null
  );
}

function ExchangeMetaBlock({
  meta,
  amount,
  currency,
}: {
  meta: Record<string, unknown>;
  amount?: number | null;
  currency: string;
}) {
  const direction = (meta.exchange_direction as string) === "buy" ? "삽니다" : "팝니다";
  const rateBaseRaw = meta.exchange_rate_base != null ? Number(meta.exchange_rate_base) : null;
  const ratePlus = meta.exchange_rate_plus != null ? Number(meta.exchange_rate_plus) : null;
  const rateSum = meta.exchange_rate != null ? Number(meta.exchange_rate) : null;
  const rateBase = rateBaseRaw != null && !Number.isNaN(rateBaseRaw) && rateBaseRaw > 0 ? rateBaseRaw : (rateSum != null && !Number.isNaN(rateSum) && rateSum > 0 ? rateSum : null);
  const rateCriteriaAt = (meta.rate_criteria_at as string) || null;
  const amountVal = amount ?? (meta.amount != null ? Number(meta.amount) : null);
  const converted = meta.converted_amount != null ? Number(meta.converted_amount) : null;
  const sellerPrepStr = formatPrepKeysForDisplay(meta.seller_prep);
  const buyerPrepStr = formatPrepKeysForDisplay(meta.buyer_prep);

  /** 환율: 1 PHP = (기준) KRW, 가산 있으면 +N 표기만. 기준이 따로 있을 때만 + 표기 */
  const rateDisplay =
    rateBase != null && rateBase > 0
      ? rateBaseRaw != null && rateBaseRaw > 0 && ratePlus != null && !Number.isNaN(ratePlus) && ratePlus !== 0
        ? <>1 PHP = {rateBase.toLocaleString(undefined, { maximumFractionDigits: 2 })} KRW <span className="font-bold text-sam-fg">+{ratePlus}</span></>
        : <>1 PHP = {rateBase.toLocaleString(undefined, { maximumFractionDigits: 2 })} KRW</>
      : null;

  const rows: { label: string; value: React.ReactNode }[] = [];
  rows.push({ label: "거래", value: direction });
  if (rateCriteriaAt) rows.push({ label: "기준", value: `${rateCriteriaAt} 기준 환율` });
  rows.push({ label: "보유 화폐", value: `PHP ${CURRENCY_SYMBOLS.PHP ?? ""}` });
  rows.push({ label: "받을 화폐", value: `KRW ${CURRENCY_SYMBOLS.KRW ?? ""}` });
  if (rateDisplay) rows.push({ label: "환율", value: rateDisplay });
  if (amountVal != null && !Number.isNaN(amountVal)) {
    rows.push({ label: "금액", value: `${CURRENCY_SYMBOLS.PHP ?? ""} ${amountVal.toLocaleString()}` });
  }
  if (converted != null && !Number.isNaN(converted)) rows.push({ label: "환산", value: `${CURRENCY_SYMBOLS.KRW ?? ""} ${converted.toLocaleString()}` });
  if (direction === "삽니다") {
    rows.push({ label: "판매자 준비물", value: sellerPrepStr || "—" });
    rows.push({ label: "구매자 준비물", value: buyerPrepStr || "—" });
  } else {
    rows.push({ label: "구매자 준비물", value: buyerPrepStr || "—" });
  }

  if (rows.length === 0) return null;

  return (
    <>
      <h3 className={TRADE_WRITE_FB_BLOCK_TITLE}>환전 정보</h3>
      <dl className="mt-2 space-y-2 text-[15px] leading-snug">
        {rows.map(({ label, value }) => (
          <div key={label} className={`${TRADE_FB_DETAIL_META_ROW} items-center`}>
            <dt className={TRADE_FB_DETAIL_META_DT}>{label}</dt>
            <dd className={TRADE_FB_DETAIL_META_DD}>{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function UsedCarMetaBlock({
  meta,
  salePrice,
  currency,
}: {
  meta: Record<string, unknown>;
  salePrice?: number | null;
  currency?: string;
}) {
  const rows: { label: string; value: string }[] = [];
  const ct = meta.car_trade;
  if (ct === "buy" || ct === "sell")
    rows.push({ label: "구분", value: ct === "buy" ? "삽니다" : "팝니다" });
  if (ct === "buy") {
    if (meta.car_body_type != null && String(meta.car_body_type).trim())
      rows.push({
        label: "차량 유형",
        value: labelForUsedCarBodyTypeKey(String(meta.car_body_type).trim()),
      });
    if (meta.car_model != null && String(meta.car_model).trim())
      rows.push({ label: "희망 모델", value: String(meta.car_model).trim() });
    if (meta.car_year_max != null && String(meta.car_year_max).trim())
      rows.push({
        label: "년식 (이하)",
        value: `${String(meta.car_year_max).trim()} 이하`,
      });
    if (salePrice != null && currency)
      rows.push({
        label: "희망 금액 (이하)",
        value: `${formatPrice(salePrice, currency)} 이하`,
      });
  } else {
    if (salePrice != null && currency) rows.push({ label: "가격", value: formatPrice(salePrice, currency) });
    if (meta.car_model != null && String(meta.car_model).trim())
      rows.push({ label: "차종", value: String(meta.car_model).trim() });
    if (typeof meta.has_accident === "boolean")
      rows.push({
        label: "사고 유무",
        value: meta.has_accident ? "사고 이력 있음" : "무사고",
      });
    if (meta.car_year != null && String(meta.car_year).trim())
      rows.push({ label: "연식", value: String(meta.car_year).trim() });
    if (meta.mileage != null && String(meta.mileage).trim())
      rows.push({ label: "주행거리(km)", value: String(meta.mileage).trim() });
  }
  if (rows.length === 0) return null;
  return (
    <>
      <h3 className={TRADE_WRITE_FB_BLOCK_TITLE}>차량 정보</h3>
      <dl className="mt-2 space-y-2 text-[15px] leading-snug">
        {rows.map(({ label, value }) => (
          <div key={label} className={TRADE_FB_DETAIL_META_ROW}>
            <dt className={TRADE_FB_DETAIL_META_DT}>{label}</dt>
            <dd className={TRADE_FB_DETAIL_META_DD}>{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

/** YYYY-MM-DD → 2025년 4월 1일 */
function formatMoveInDate(value: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value;
  const [y, m, d] = value.trim().split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

function RealEstateMetaBlock({
  meta,
  salePrice,
  currency,
  regionId,
  cityId,
  /** 상단 헤더에 건물명·지역·거래·금액을 이미 노출한 경우 테이블 중복 제거 */
  detailHeroDedup = false,
}: {
  meta: Record<string, unknown>;
  salePrice: number | null;
  currency: string;
  regionId?: string | null;
  cityId?: string | null;
  detailHeroDedup?: boolean;
}) {
  const dealType = (meta.deal_type as string | undefined)?.trim();
  const regionLabel = regionId && cityId ? getLocationLabel(regionId, cityId) : null;

  const rows: { label: string; value: string }[] = [];

  if (!detailHeroDedup && regionLabel) rows.push({ label: "지역", value: regionLabel });
  if (!detailHeroDedup && meta.neighborhood != null && String(meta.neighborhood).trim())
    rows.push({ label: "지역 세부", value: String(meta.neighborhood).trim() });
  if (!detailHeroDedup && meta.building_name != null && String(meta.building_name).trim())
    rows.push({ label: "건물명", value: String(meta.building_name).trim() });
  if (!detailHeroDedup && meta.estate_type != null && String(meta.estate_type).trim())
    rows.push({ label: "타입", value: String(meta.estate_type).trim() });
  if (!detailHeroDedup && meta.deal_type != null && String(meta.deal_type).trim())
    rows.push({ label: "거래유형", value: String(meta.deal_type).trim() });

  if (!detailHeroDedup && dealType === "판매" && salePrice != null)
    rows.push({ label: "판매가", value: formatPrice(salePrice, currency) });
  if (!detailHeroDedup && dealType === "임대") {
    if (meta.deposit != null && String(meta.deposit).trim())
      rows.push({ label: "보증금", value: formatPrice(parseMetaAmount(meta.deposit), currency) });
    if (meta.monthly != null && String(meta.monthly).trim())
      rows.push({ label: "월세", value: formatPrice(parseMetaAmount(meta.monthly), currency) });
  }
  if (dealType === "임대") {
    if (meta.management_fee != null && String(meta.management_fee).trim())
      rows.push({ label: "관리비", value: formatPrice(parseMetaAmount(meta.management_fee), currency) });
    if (meta.has_premium === true)
      rows.push({ label: "권리금", value: "있음" });
  }

  const sizeSq = meta.size_sq ?? meta.area_sqm;
  if (sizeSq != null && String(sizeSq).trim()) rows.push({ label: "크기(sq)", value: String(sizeSq) });
  if (meta.room_count != null && String(meta.room_count).trim())
    rows.push({ label: "방수", value: String(meta.room_count) });
  if (meta.bathroom_count != null && String(meta.bathroom_count).trim())
    rows.push({ label: "욕실수", value: String(meta.bathroom_count) });
  if (meta.move_in_date != null && String(meta.move_in_date).trim())
    rows.push({ label: "입주 가능일", value: formatMoveInDate(String(meta.move_in_date)) });

  if (rows.length === 0) return null;

  return (
    <div className="mt-3 border-t border-[#e4e6eb] pt-3">
      <h3 className={TRADE_WRITE_FB_BLOCK_TITLE}>부동산 정보</h3>
      <dl className="mt-2 space-y-2 text-[15px] leading-snug">
        {rows.map(({ label, value }) => (
          <div key={label} className={TRADE_FB_DETAIL_META_ROW}>
            <dt className={TRADE_FB_DETAIL_META_DT}>{label}</dt>
            <dd className={`${TRADE_FB_DETAIL_META_DD} truncate`} title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function TradeMetaBlock({
  skinKey,
  meta,
  post,
  defaultCurrency,
}: {
  skinKey: string;
  meta: Record<string, unknown>;
  post?: { price?: number | null; region?: string | null; city?: string | null };
  defaultCurrency?: string;
}) {
  if (skinKey === "real-estate") {
    return (
      <RealEstateMetaBlock
        meta={meta}
        salePrice={post?.price ?? null}
        currency={defaultCurrency ?? "KRW"}
        regionId={post?.region ?? undefined}
        cityId={post?.city ?? undefined}
      />
    );
  }
  const labels = META_LABELS[skinKey];
  if (!labels || Object.keys(meta).length === 0) return null;
  const entries = Object.entries(meta)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => [k, labels[k] ?? k, String(v)]);
  if (entries.length === 0) return null;
  return (
    <>
      <h3 className={TRADE_WRITE_FB_BLOCK_TITLE}>{TRADE_SKIN_LABELS[skinKey] ?? skinKey}</h3>
      <dl className="mt-2 space-y-2 text-[15px] leading-snug">
        {entries.map(([key, label, value]) => (
          <div key={key} className={TRADE_FB_DETAIL_META_ROW}>
            <dt className={TRADE_FB_DETAIL_META_DT}>{label}</dt>
            <dd className={TRADE_FB_DETAIL_META_DD}>{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

const LOGIN_REDIRECT = "/mypage/account";

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
  const displayName = author?.display_name?.trim() || author?.nickname?.trim() || "판매자";
  const atUsername = formatAtUsername(author?.username ?? null);
  const label = displayName;
  const initial = label.charAt(0).toUpperCase() || "?";
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center">
        <SamarketThumbnail
          src={author?.avatar_url}
          size={38}
          roundedClassName="rounded-full"
          className="mr-2.5 bg-[#eeeeee] text-[13px] font-bold text-[#888]"
          fallbackSrc=""
          fallbackNode={<span aria-hidden>{initial}</span>}
        />
        <div className="min-w-0 flex-1">
          <p className={TRADE_FB_DETAIL_SELLER_NAME}>{displayName}</p>
          {atUsername ? (
            <p className="mt-0.5 truncate font-mono sam-text-xxs text-sam-muted tabular-nums">
              {atUsername}
            </p>
          ) : null}
          {regionLine}
        </div>
      </div>
      <MannerBatteryDisplay raw={author?.trustScore ?? 50} layout="inline" size="sm" className="shrink-0" />
    </div>
  );
}

type TradePostDetailReFooterSummary = { priceLine: string; dealType: string } | null;

/** 거래 상세 하단 — FB 마켓플레이스형 셸(구매자 행 + 판매자 밴드) */
function TradePostDetailActionBar({
  isOwnPost,
  isFavorite,
  onFavorite,
  reFooterSummary,
  bottomActionsRowClass,
  buyerPriceOfferFlowActive,
  buyerOfferListHydrating,
  showBuyerOfferPendingDisabled,
  bottomBarHasOfferBtn,
  bottomBarHasChatBtn,
  offerRetry,
  onOfferModalOpen,
  onChat,
  scheduleTradeChatPrepare,
  cancelTradeChatPrepare,
  onTradeChatCtaPointerDown,
  uiTradeChatEnabled,
  chatBlockedByListingState,
  chatCtaBusy,
  chatBlockedByOtherReservation,
  chatBlockedByCompleted,
  chatBlockedByReservedState,
  tradeChatCtaLabel,
  showSellerTradeControls,
  showSellerOfferList,
  canApplyTradeAd,
  onSellerOffersOpen,
  onTradeAdOpen,
  showJobApplyBtn,
  /** 구인: 지원·문의 단일 버튼(채팅 중복 숨김) */
  jobHireMergedApplyChatBtn,
  showJobSeekContactBtn,
  jobApplyBusy,
  jobApplyDone,
  onJobApply,
}: {
  isOwnPost: boolean;
  isFavorite: boolean;
  onFavorite: () => void;
  reFooterSummary: TradePostDetailReFooterSummary;
  bottomActionsRowClass: string;
  buyerPriceOfferFlowActive: boolean;
  buyerOfferListHydrating: boolean;
  showBuyerOfferPendingDisabled: boolean;
  bottomBarHasOfferBtn: boolean;
  bottomBarHasChatBtn: boolean;
  showJobApplyBtn: boolean;
  jobHireMergedApplyChatBtn: boolean;
  /** 구직 글 — 채팅 열기 전 초안 연락 CTA(동일 핸들러) */
  showJobSeekContactBtn: boolean;
  jobApplyBusy: boolean;
  jobApplyDone: boolean;
  onJobApply: () => void | Promise<void>;
  offerRetry: boolean;
  onOfferModalOpen: () => void;
  onChat: () => void | Promise<void>;
  scheduleTradeChatPrepare: () => void;
  cancelTradeChatPrepare: () => void;
  onTradeChatCtaPointerDown: () => void;
  uiTradeChatEnabled: boolean;
  chatBlockedByListingState: boolean;
  chatCtaBusy: boolean;
  chatBlockedByOtherReservation: boolean;
  chatBlockedByCompleted: boolean;
  chatBlockedByReservedState: boolean;
  tradeChatCtaLabel: string;
  showSellerTradeControls: boolean;
  showSellerOfferList: boolean;
  canApplyTradeAd: boolean;
  onSellerOffersOpen: () => void;
  onTradeAdOpen: () => void;
}) {
  return (
    <div data-post-detail-action-bar="true" className={`${TRADE_POST_DETAIL_BOTTOM_SHELL} z-30`}>
      {!isOwnPost ? (
        <div className={TRADE_POST_DETAIL_BOTTOM_PRIMARY_ROW}>
          <button
            type="button"
            onClick={onFavorite}
            className={TRADE_POST_DETAIL_BOTTOM_FAVORITE_BTN}
            aria-label={isFavorite ? "관심 해제" : "관심"}
          >
            <span className={isFavorite ? "text-red-500" : ""}>{isFavorite ? "♥" : "♡"}</span>
            <span className="text-[12px] font-semibold text-[#65676B]">관심</span>
          </button>
          {reFooterSummary ? (
            <div className={TRADE_POST_DETAIL_BOTTOM_RE_SUMMARY}>
              <p className="truncate text-[14px] font-semibold text-[#050505]">
                {reFooterSummary.dealType === "판매"
                  ? `판매가 ${reFooterSummary.priceLine}`
                  : reFooterSummary.priceLine}
              </p>
              <p className="text-[11px] font-medium text-[#65676B]">예상 중개수수료</p>
            </div>
          ) : null}
          <div className={TRADE_POST_DETAIL_BOTTOM_ACTIONS_WRAP}>
            <div className={`${TRADE_POST_DETAIL_BOTTOM_ACTIONS_INNER} ${bottomActionsRowClass}`}>
              {buyerPriceOfferFlowActive && buyerOfferListHydrating ? (
                <div className={TRADE_POST_DETAIL_BOTTOM_LOADING_PLACEHOLDER}>제안 상태 확인 중…</div>
              ) : null}
              {buyerPriceOfferFlowActive && showBuyerOfferPendingDisabled ? (
                <button type="button" disabled className={`${TRADE_POST_DETAIL_BOTTOM_MUTED_CTA} flex-1`}>
                  제안 대기중
                </button>
              ) : null}
              {!buyerOfferListHydrating && !showBuyerOfferPendingDisabled && bottomBarHasOfferBtn ? (
                <OfferButton
                  retry={offerRetry}
                  onClick={onOfferModalOpen}
                  className={`${TRADE_POST_DETAIL_BOTTOM_SECONDARY_CTA} flex-1`}
                />
              ) : null}
              {!buyerOfferListHydrating && !showBuyerOfferPendingDisabled && showJobApplyBtn && jobHireMergedApplyChatBtn ? (
                <button
                  type="button"
                  onClick={() => void (jobApplyDone ? onChat() : onJobApply())}
                  onPointerEnter={jobApplyDone ? scheduleTradeChatPrepare : undefined}
                  onPointerLeave={jobApplyDone ? cancelTradeChatPrepare : undefined}
                  onPointerDown={jobApplyDone ? onTradeChatCtaPointerDown : undefined}
                  disabled={
                    jobApplyBusy ||
                    (jobApplyDone &&
                      (!uiTradeChatEnabled ||
                        chatBlockedByListingState ||
                        chatCtaBusy ||
                        chatBlockedByOtherReservation))
                  }
                  className={`${TRADE_POST_DETAIL_BOTTOM_PRIMARY_CTA} flex-1`}
                  title={
                    jobApplyDone && chatBlockedByCompleted
                      ? "거래완료 상품입니다"
                      : jobApplyDone && chatBlockedByReservedState
                        ? "예약중 입니다."
                        : jobApplyDone && chatBlockedByOtherReservation
                          ? "다른 구매자와 예약이 진행 중입니다"
                          : jobApplyDone && !uiTradeChatEnabled
                            ? "채팅이 비활성화되어 있습니다"
                            : undefined
                  }
                >
                  {jobApplyBusy
                    ? "처리 중…"
                    : jobApplyDone
                      ? chatCtaBusy
                        ? "이동 중…"
                        : tradeChatCtaLabel
                      : "지원·문의하기"}
                </button>
              ) : null}
              {!buyerOfferListHydrating && !showBuyerOfferPendingDisabled && showJobApplyBtn && !jobHireMergedApplyChatBtn ? (
                <button
                  type="button"
                  onClick={() => void onJobApply()}
                  disabled={jobApplyBusy || jobApplyDone}
                  className={`${TRADE_POST_DETAIL_BOTTOM_SECONDARY_CTA} flex-1`}
                >
                  {jobApplyDone ? "지원 완료" : jobApplyBusy ? "처리 중…" : "지원하기"}
                </button>
              ) : null}
              {!buyerOfferListHydrating && !showBuyerOfferPendingDisabled && showJobSeekContactBtn ? (
                <button
                  type="button"
                  onClick={onChat}
                  onPointerEnter={scheduleTradeChatPrepare}
                  onPointerLeave={cancelTradeChatPrepare}
                  onPointerDown={onTradeChatCtaPointerDown}
                  disabled={
                    !uiTradeChatEnabled ||
                    chatBlockedByListingState ||
                    chatCtaBusy ||
                    chatBlockedByOtherReservation
                  }
                  className={`${TRADE_POST_DETAIL_BOTTOM_SECONDARY_CTA} flex-1`}
                >
                  연락하기
                </button>
              ) : null}
              {!buyerOfferListHydrating &&
              !showBuyerOfferPendingDisabled &&
              bottomBarHasChatBtn &&
              !jobHireMergedApplyChatBtn ? (
                <button
                  type="button"
                  onClick={onChat}
                  onPointerEnter={scheduleTradeChatPrepare}
                  onPointerLeave={cancelTradeChatPrepare}
                  onPointerDown={onTradeChatCtaPointerDown}
                  disabled={
                    !uiTradeChatEnabled ||
                    chatBlockedByListingState ||
                    chatCtaBusy ||
                    chatBlockedByOtherReservation
                  }
                  className={
                    bottomBarHasOfferBtn || (showJobApplyBtn && !jobHireMergedApplyChatBtn) || showJobSeekContactBtn
                      ? `${TRADE_POST_DETAIL_BOTTOM_PRIMARY_CTA} flex-1`
                      : TRADE_POST_DETAIL_BOTTOM_PRIMARY_CTA
                  }
                  title={
                    chatBlockedByCompleted
                      ? "거래완료 상품입니다"
                      : chatBlockedByReservedState
                        ? "예약중 입니다."
                        : chatBlockedByOtherReservation
                          ? "다른 구매자와 예약이 진행 중입니다"
                          : !uiTradeChatEnabled
                            ? "채팅이 비활성화되어 있습니다"
                            : undefined
                  }
                >
                  {chatCtaBusy ? "이동 중…" : tradeChatCtaLabel}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {showSellerTradeControls ? (
        <div className={TRADE_POST_DETAIL_BOTTOM_SELLER_BAND}>
          <PostDetailSellerPromoButtons
            showSellerOfferList={showSellerOfferList}
            canApplyTradeAd={canApplyTradeAd}
            onOpenOffers={onSellerOffersOpen}
            onOpenAd={onTradeAdOpen}
          />
        </div>
      ) : null}
    </div>
  );
}

/** 판매자 하단 — 받은 제안(모달) · 유료 광고를 마켓플레이스형으로 나란히 */
function PostDetailSellerPromoButtons({
  showSellerOfferList,
  canApplyTradeAd,
  onOpenOffers,
  onOpenAd,
}: {
  showSellerOfferList: boolean;
  canApplyTradeAd: boolean;
  onOpenOffers: () => void;
  onOpenAd: () => void;
}) {
  if (!showSellerOfferList && !canApplyTradeAd) return null;
  const btnClass = `${TRADE_POST_DETAIL_BOTTOM_SECONDARY_CTA} flex-1 px-2`;
  return (
    <div className="flex w-full gap-2 sm:gap-2.5">
      {showSellerOfferList ? (
        <button type="button" className={btnClass} onClick={onOpenOffers} title="받은 가격 제안">
          받은 제안
        </button>
      ) : null}
      {canApplyTradeAd ? (
        <button type="button" className={btnClass} onClick={onOpenAd}>
          유료 광고 신청
        </button>
      ) : null}
    </div>
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
  /** RSC 세션 UUID — 클라 세션보다 먼저 소유자 UI·제안 목록 표시 */
  serverViewerUserId?: string;
  /** 본인 글 상세 RSC에서 선로드한 받은 제안 */
  initialSellerPriceOffers?: PriceOfferListItem[];
  /** 타인 글·가격제안 — 구매자 제안 목록 RSC 시드(첫 페인트 CTA) */
  initialViewerBuyerOffers?: PriceOfferListItem[];
}

export function PostDetailView({
  post,
  sellerProfile = null,
  related,
  relatedSectionsSlot,
  viewerTradeRoomBootstrap,
  initialRouteTotalMs,
  serverViewerUserId,
  initialSellerPriceOffers,
  initialViewerBuyerOffers,
}: PostDetailViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
  const [favoriteCount, setFavoriteCount] = useState(() => {
    const n = post.favorite_count;
    return typeof n === "number" && Number.isFinite(n) ? n : 0;
  });
  const [jobApplyBusy, setJobApplyBusy] = useState(false);
  const [jobApplyDone, setJobApplyDone] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState("");
  /** 신규 채팅은 `openCreateTradeChat` → compose 에서 방 생성 후 메신저 방으로 이동 */
  const chatCtaBusy = false;
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
  const [tradeAdSheetOpen, setTradeAdSheetOpen] = useState(false);
  const [sellerSheetBusy, setSellerSheetBusy] = useState(false);
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [sellerOffersModalOpen, setSellerOffersModalOpen] = useState(false);
  const [offerRefreshToken, setOfferRefreshToken] = useState(0);

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
  const showSellerTradeControls =
    isOwnPost && post.type !== "community" && !["deleted", "blinded"].includes(postStatusLower);
  const canApplyTradeAd = isOwnPost && post.type !== "community" && postStatusLower === "active";
  const showSellerMoreMenu =
    isOwnPost && post.type !== "community" && !["deleted", "blinded"].includes(postStatusLower);

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
    getCategoryBySlugOrId(post.category_id).then((c) => {
      if (c) {
        setCategory(c);
        setBackHref(getCategoryHref(c));
      }
    });
  }, [post.category_id]);

  const setMainTier1Extras = useSetMainTier1ExtrasOptional();
  const tradeDetailHeaderTitle = category?.name?.trim() || "거래";

  useLayoutEffect(() => {
    if (!setMainTier1Extras) return;
    const showBuyerMore = !isOwnPost;
    const showSellerMore = showSellerMoreMenu;
    setMainTier1Extras({
      tier1: {
        titleText: tradeDetailHeaderTitle,
        /** 항상 해당 카테고리 목록(`/market/{id}`)으로 — 히스토리 백 미사용 */
        preferHistoryBack: false,
        ariaLabel: "목록으로",
        showHubQuickActions: false,
        leftSlot: (
          <AppBackButton
            preferHistoryBack={false}
            backHref={backHref}
            ariaLabel="목록으로"
            className="text-[#111]"
            iconClassName="h-[22px] w-[22px]"
          />
        ),
        rightSlot: (
          <div className="flex shrink-0 items-center justify-end">
            {showBuyerMore ? (
              <button
                type="button"
                onClick={() => setDetailMoreOpen(true)}
                className="flex h-10 w-10 shrink-0 items-center justify-center text-[#111]"
                aria-label="더보기"
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
                aria-label="더보기"
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
  ]);

  useLayoutEffect(() => {
    recordRouteEntryRouteTotalMs("product_detail", initialRouteTotalMs);
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
    const n = post.favorite_count;
    const next = typeof n === "number" && Number.isFinite(n) ? n : 0;
    setFavoriteCount((prev) => (prev === next ? prev : next));
  }, [post.id, post.favorite_count]);

  const handleFavorite = useCallback(async () => {
    const uid = (await getCurrentUserIdForDb())?.trim() || null;
    if (!uid) {
      router.push(LOGIN_REDIRECT);
      return;
    }
    if (postOwnedByUserId(post as unknown as Record<string, unknown>, uid)) return;
    const prevFavorite = isFavorite;
    const prevCount = favoriteCount;
    setIsFavorite(!prevFavorite);
    setFavoriteCount((c) => Math.max(0, c + (prevFavorite ? -1 : 1)));
    const res = await toggleFavorite(post.id);
    if (!res.ok) {
      setIsFavorite(prevFavorite);
      setFavoriteCount(prevCount);
    } else {
      setIsFavorite(res.isFavorite);
    }
  }, [post, post.id, router, isFavorite, favoriteCount]);

  const handleReport = useCallback(async () => {
    const uid = (await getCurrentUserIdForDb())?.trim() || null;
    if (!uid) {
      router.push(LOGIN_REDIRECT);
      return;
    }
    if (!reportReason.trim()) return;
    setReportError((prev) => (prev === "" ? prev : ""));
    setReportSubmitting((prev) => (prev ? prev : true));
    try {
      const res = await createReport(post.id, reportReason.trim());
      if (res.ok) {
        setReportOpen((prev) => (prev ? false : prev));
        setReportReason((prev) => (prev === "" ? prev : ""));
        setReportError((prev) => (prev === "" ? prev : ""));
      } else {
        setReportError(res.error ?? "신고 접수에 실패했습니다.");
      }
    } finally {
      setReportSubmitting((prev) => (prev ? false : prev));
    }
  }, [post.id, reportReason, router]);

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
    setChatError("");
    const uid = (await getCurrentUserIdForDb())?.trim() || null;
    if (!uid) {
      router.push(LOGIN_REDIRECT);
      return;
    }
    if (chatBlockedByCompleted) {
      setChatError("거래완료 상품입니다.");
      return;
    }
    if (chatBlockedByReservedState) {
      setChatError("예약중 입니다.");
      return;
    }
    if (existingTradeRoomId) {
      openExistingTradeChat(router, {
        productId: post.id,
        roomId: existingTradeRoomId,
        messengerRoomId: existingTradeMessengerId,
        sourceHint: existingTradeRoomSource,
      });
      return;
    }
    if (postOwnedByUserId(post as unknown as Record<string, unknown>, uid)) {
      setChatError("내 상품에는 채팅할 수 없습니다.");
      return;
    }
    if (chatBlockedByOtherReservation) {
      setChatError("다른 분과 예약이 진행 중인 상품입니다. 예약자가 아니면 새 채팅을 열 수 없어요.");
      return;
    }
    const thumbs = resolveTradePostDetailImageUrls(post);
    const productThumbnail = thumbs[0] ?? "";
    const productTitle = (post.title ?? "상품").trim();
    const priceText = post.is_free_share
      ? "무료나눔"
      : post.price != null
        ? formatPrice(post.price, defaultCurrency)
        : "가격 문의";
    const sellerName = author?.nickname?.trim() || "판매자";
    const sellerNameDisplay = author?.display_name?.trim() || sellerName;
    openCreateTradeChat(router, {
      productId: post.id,
      composePreview: {
        productTitle,
        productThumbnail,
        priceText,
        sellerName: sellerNameDisplay,
      },
    });
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
        window.alert(data.error ?? "처리하지 못했습니다.");
        return;
      }
      setSellerMoreOpen(false);
      router.push("/my/products");
      router.refresh();
    } catch {
      window.alert("네트워크 오류입니다.");
    } finally {
      setSellerSheetBusy(false);
    }
  }, [post.id, router]);

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
        window.alert(data.error ?? "삭제하지 못했습니다.");
        return;
      }
      setSellerMoreOpen(false);
      router.push(backHref || "/my/products");
      router.refresh();
    } catch {
      window.alert("네트워크 오류로 삭제하지 못했습니다.");
    } finally {
      setSellerSheetBusy(false);
    }
  }, [post.id, router, backHref]);

  const isSold = post.status === "sold";
  const showPrice =
    (post.type === "trade" || post.price != null || post.is_free_share === true) &&
    (category == null || category.settings?.has_price !== false);
  const showChat =
    post.type !== "community" && chatEnabled && (category == null || category.settings?.has_chat !== false);
  const showOfferCta =
    !isOwnPost &&
    post.type !== "community" &&
    post.is_price_offer === true &&
    typeof post.price === "number" &&
    Number.isFinite(post.price) &&
    post.price > 0 &&
    post.status !== "sold" &&
    post.status !== "hidden";
  const showBuyerOfferStatus =
    !isOwnPost &&
    post.type !== "community" &&
    post.is_price_offer === true &&
    typeof post.price === "number" &&
    Number.isFinite(post.price) &&
    post.price > 0;
  const showSellerOfferList =
    isOwnPost &&
    post.type !== "community" &&
    post.is_price_offer === true &&
    typeof post.price === "number" &&
    Number.isFinite(post.price) &&
    post.price > 0;

  /** 가격 제안 상품·구매자 흐름: 수락 전까지 거래 채팅 CTA·프리페치 비활성 */
  const buyerPriceOfferFlowActive =
    !isOwnPost &&
    post.type !== "community" &&
    post.is_price_offer === true &&
    typeof post.price === "number" &&
    Number.isFinite(post.price) &&
    post.price > 0;

  const { offers: myBuyerOffers, loading: myBuyerOffersLoading } = useMyPriceOffersForProduct(
    post.id,
    resolvedViewerId,
    offerRefreshToken,
    buyerPriceOfferFlowActive,
    initialViewerBuyerOffers
  );
  /** CTA·카드 기준 제안 1건 — 수락 건이 있으면 배열 순서와 무관하게 수락 우선 */
  const buyerPrimaryOffer = useMemo(() => pickBuyerPrimaryOffer(myBuyerOffers), [myBuyerOffers]);
  const sessionUnresolved = resolvedViewerId === undefined;
  /** 로그인 확정 후 목록 로딩 중인데 아직 0건이면 [가격 제안하기] 오표시 방지 */
  const buyerOfferListHydrating =
    buyerPriceOfferFlowActive &&
    !isOwnPost &&
    !sessionUnresolved &&
    resolvedViewerId !== null &&
    myBuyerOffersLoading &&
    buyerPrimaryOffer == null;
  const showBuyerOfferPendingDisabled =
    buyerPriceOfferFlowActive &&
    !isOwnPost &&
    resolvedViewerId !== null &&
    buyerPrimaryOffer?.status === "pending";
  const showBuyerOfferPrimaryButton =
    buyerPriceOfferFlowActive &&
    !isOwnPost &&
    !sessionUnresolved &&
    !buyerOfferListHydrating &&
    !showBuyerOfferPendingDisabled &&
    showOfferCta &&
    (!buyerPrimaryOffer ||
      buyerPrimaryOffer.status === "rejected" ||
      buyerPrimaryOffer.status === "expired");
  const uiTradeChatEnabled =
    showChat &&
    (!buyerPriceOfferFlowActive ||
      (resolvedViewerId != null && buyerPrimaryOffer?.status === "accepted"));
  const bottomBarHasOfferBtn = showBuyerOfferPrimaryButton;
  const bottomBarHasChatBtn = uiTradeChatEnabled;

  const detailMetaJob =
    post.meta && typeof post.meta === "object" && !Array.isArray(post.meta)
      ? (post.meta as Record<string, unknown>)
      : {};
  const listingKindJob = String(detailMetaJob.listing_kind ?? "").trim();
  const isJobTradePost =
    post.trade_type === "job" ||
    String(detailMetaJob.trade_chat_kind ?? "").toLowerCase() === "job";
  const isJobsDetailUi =
    post.trade_type === "job" ||
    category?.icon_key === "jobs" ||
    category?.icon_key === "job" ||
    hasJobsMeta(detailMetaJob);

  /** 알림(가격 제안 도착) 진입 — 판매자만 받은 제안 모달 오픈 후 쿼리 제거 (`useLayoutEffect`: 네비 직후 깜빡임·타이밍 이슈 완화) */
  useLayoutEffect(() => {
    const raw = searchParams.get(OPEN_RECEIVED_OFFERS_SEARCH_PARAM);
    if (raw == null || raw === "" || raw === "0" || raw === "false") return;
    if (!showSellerOfferList) return;
    setSellerOffersModalOpen(true);
    const q = new URLSearchParams(searchParams.toString());
    q.delete(OPEN_RECEIVED_OFFERS_SEARCH_PARAM);
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }, [searchParams, pathname, router, showSellerOfferList]);

  /** 제안 수락 직후 초기 `room-id` 조회가 null 이었으면 한 번 더 확보 — 채팅 CTA·라우팅에 필요 */
  useEffect(() => {
    if (!buyerPriceOfferFlowActive) return;
    if (resolvedViewerId === undefined || resolvedViewerId === null) return;
    if (postOwnedByUserId(post as unknown as Record<string, unknown>, resolvedViewerId)) return;
    if (buyerPrimaryOffer?.status !== "accepted") return;
    if (existingTradeRoomId) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await runSingleFlight(`trade:item-room-id:get:${post.id}`, () =>
          fetch(`/api/chat/item/room-id?itemId=${encodeURIComponent(post.id)}`, {
            credentials: "include",
            cache: "no-store",
          })
        );
        if (cancelled || !res.ok) return;
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
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    buyerPriceOfferFlowActive,
    resolvedViewerId,
    buyerPrimaryOffer?.status,
    buyerPrimaryOffer?.id,
    existingTradeRoomId,
    post.id,
    post,
  ]);

  /** 채팅 버튼에 잠시 머물면 POST 선행 — 탭 시 inflight/캐시로 체감 지연 감소 */
  const scheduleTradeChatPrepare = useCallback(() => {
    if (!uiTradeChatEnabled) return;
    if (existingTradeRoomId) return;
    if (chatBlockedByListingState) return;
    if (chatBlockedByOtherReservation) return;
    if (isSold && !allowChatAfterSold) return;
    if (tradeChatPrepareTimerRef.current) {
      clearTimeout(tradeChatPrepareTimerRef.current);
    }
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
    if (tradeChatPrepareTimerRef.current) {
      clearTimeout(tradeChatPrepareTimerRef.current);
      tradeChatPrepareTimerRef.current = null;
    }
  }, []);

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

  const jobTypeForChatCta = String(detailMetaJob.job_type ?? "").trim();
  const isJobSeekForChatCta =
    isJobTradePost && (listingKindJob === "work" || jobTypeForChatCta === "seek");
  const chatCtaLabel = isJobSeekForChatCta
    ? "채팅하기"
    : isJobTradePost
      ? "문의하기"
      : "채팅하기";
  const tradeChatCtaLabel = existingTradeRoomId ? "채팅 이어가기" : chatCtaLabel;

  const jobDetailDirection = resolveJobDetailDirection(detailMetaJob);
  const showJobApplyBtn =
    isJobsDetailUi &&
    jobDetailDirection === "hiring" &&
    String(detailMetaJob.listing_kind ?? "").trim() === "hire" &&
    !isOwnPost &&
    postStatusLower === "active";
  const showJobSeekContactBtn =
    isJobsDetailUi &&
    jobDetailDirection === "seeking" &&
    !isOwnPost &&
    bottomBarHasChatBtn &&
    !existingTradeRoomId;

  /** 구인 글: 지원 API 후 곧바로 동일 거래 채팅으로 이동하므로 별도 「문의하기」 버튼은 두지 않음 */
  const showJobHireMergedApplyChatBtn = showJobApplyBtn;
  const bottomBarHasSeparateChatBtn = bottomBarHasChatBtn && !showJobHireMergedApplyChatBtn;

  const buyerActionsCount =
    Number(bottomBarHasOfferBtn) +
    Number(showJobHireMergedApplyChatBtn) +
    Number(showJobSeekContactBtn) +
    Number(bottomBarHasSeparateChatBtn);
  const bottomActionsRowClass = buyerActionsCount >= 2 ? "flex-row" : "flex-col";

  /**
   * 구인 글 — 지원하기: `job_applications` 행만 추가(API). 문의/채팅/연락은 모두 `handleChat` →
   * 거래 채팅 허브의 상품 연동 방(`openCreateTradeChat`)으로 통일되며 Philife 쪽지 등과 별도다.
   * 지원 처리 직후 같은 채팅으로 이어져 고용주와 바로 대화할 수 있게 한다.
   */
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
      setChatError(typeof data.error === "string" ? data.error : "지원에 실패했습니다.");
    } finally {
      setJobApplyBusy(false);
    }
  }, [resolvedViewerId, jobApplyBusy, jobApplyDone, post.id, handleChat]);

  const listingLocationLine = useMemo(() => {
    const re =
      post.meta && typeof post.meta === "object" && !Array.isArray(post.meta)
        ? (post.meta as Record<string, unknown>)
        : undefined;
    const fromPost = resolveTradePostListingLocationLine(re, post.region, post.city);
    if (fromPost) return fromPost;
    const t = sellerTradeLocationLine?.trim();
    return t || null;
  }, [post.region, post.city, post.meta, sellerTradeLocationLine]);

  const showLocation =
    (category == null || category.settings?.has_location !== false) && !!listingLocationLine;

  const reMeta = (post.meta ?? {}) as Record<string, unknown>;
  const hasRealEstateMeta =
    reMeta.deal_type != null ||
    reMeta.estate_type != null ||
    reMeta.deposit != null ||
    reMeta.monthly != null ||
    reMeta.building_name != null ||
    reMeta.neighborhood != null ||
    reMeta.size_sq != null ||
    reMeta.area_sqm != null ||
    reMeta.move_in_date != null;
  /** 중고차 메타가 있으면 부동산 전용 레이아웃으로 빠지지 않게 (히어로·⋮ 동일 UI) */
  const hasUsedCarMetaEarly =
    reMeta.car_model != null ||
    reMeta.car_body_type != null ||
    reMeta.car_year != null ||
    reMeta.car_year_max != null ||
    reMeta.mileage != null ||
    reMeta.car_trade != null ||
    typeof reMeta.has_accident === "boolean";
  const isRealEstateDetail =
    category?.icon_key !== "used-car" &&
    category?.icon_key !== "exchange" &&
    category?.icon_key !== "jobs" &&
    category?.icon_key !== "job" &&
    !hasUsedCarMetaEarly &&
    (category?.icon_key === "real-estate" || hasRealEstateMeta) &&
    Object.keys(reMeta).length > 0;
  const reDealType = (reMeta.deal_type as string)?.trim();
  const reEstateType = (reMeta.estate_type as string)?.trim();
  const reSizeSq = reMeta.size_sq ?? reMeta.area_sqm;
  const reSizeNum = reSizeSq != null ? parseFloat(String(reSizeSq).replace(/,/g, "")) : NaN;
  const rePyeong = !Number.isNaN(reSizeNum) ? sqToPyeong(reSizeNum) : "";
  const rePriceSummary =
    reDealType === "판매" && post.price != null
      ? `매매 ${formatPrice(post.price, defaultCurrency)}`
      : reDealType === "임대"
        ? `보증금 ${formatPrice(parseMetaAmount(reMeta.deposit), defaultCurrency)} | 월세 ${formatPrice(parseMetaAmount(reMeta.monthly), defaultCurrency)}`
        : "";
  const reFooterPrice =
    reDealType === "판매" && post.price != null
      ? formatPrice(post.price, defaultCurrency)
      : reDealType === "임대"
        ? `보증금 ${formatPrice(parseMetaAmount(reMeta.deposit), defaultCurrency)} | 월세 ${formatPrice(parseMetaAmount(reMeta.monthly), defaultCurrency)}`
        : "";

  const postDetailSharedOverlays = (
    <>
      {chatError ? (
        <p
          className={`fixed bottom-[52px] left-1/2 z-20 w-full -translate-x-1/2 bg-red-50 px-4 py-2 text-center sam-text-body-secondary text-red-600 ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS}`}
        >
          {chatError}
        </p>
      ) : null}
      <TradePostAdApplySheet
        postId={post.id}
        open={tradeAdSheetOpen}
        onClose={() => setTradeAdSheetOpen(false)}
      />
      <PostDetailMoreBottomSheet
        open={detailMoreOpen}
        onClose={() => setDetailMoreOpen(false)}
        onSelectReport={() => {
          setReportError("");
          setReportOpen(true);
        }}
        authorUserId={post.author_id}
        authorNickname={author?.nickname ?? null}
        reportEnabled={reportEnabled}
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
        editLockHint={ownerEditLockHint(ownerMenuPost)}
        deleteLockHint={ownerDeleteLockHint(ownerMenuPost)}
      />
      <OfferModal
        open={offerModalOpen}
        productId={post.id}
        originalPrice={typeof post.price === "number" ? post.price : 0}
        currency={defaultCurrency}
        productTitle={post.title ?? null}
        onClose={() => setOfferModalOpen(false)}
        onSubmitted={() => {
          setOfferRefreshToken((prev) => prev + 1);
          broadcastPriceOfferCreatedForProduct(post.id);
        }}
      />
      <OfferListSellerModal
        open={sellerOffersModalOpen}
        onClose={() => setSellerOffersModalOpen(false)}
        productId={post.id}
        currency={defaultCurrency}
        viewerUserId={resolvedViewerId ?? null}
        refreshToken={offerRefreshToken}
        onOffersChanged={() => setOfferRefreshToken((prev) => prev + 1)}
        initialOffers={initialSellerPriceOffers}
        productTitle={post.title ?? null}
        listPrice={typeof post.price === "number" ? post.price : null}
      />
      {reportOpen ? (
        <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50">
          <div
            className={`mx-auto w-full ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS} rounded-t-[length:var(--ui-radius-rect)] bg-sam-surface px-4 py-4`}
          >
            <h2 className="sam-text-body-lg font-semibold text-sam-fg">신고하기</h2>
            <input
              type="text"
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="신고 사유"
              className="mt-3 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
            />
            {reportError ? (
              <p className="mt-2 sam-text-body-secondary text-red-600">{reportError}</p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                className="flex-1 rounded-ui-rect border border-sam-border py-2 sam-text-body text-sam-fg"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleReport}
                disabled={!reportReason.trim() || reportSubmitting}
                className="flex-1 rounded-ui-rect bg-red-600 py-2 sam-text-body font-medium text-white disabled:opacity-50"
              >
                신고
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  if (isRealEstateDetail) {
    const imgList = resolveTradePostDetailImageUrls(post);
    const reHeroBuilding = String(reMeta.building_name ?? "").trim();
    const reHeroTitle = reHeroBuilding || post.title || "";
    const reHeroSubtitle = [
      [reDealType, reEstateType].filter(Boolean).join(" · "),
      listingLocationLine?.trim(),
    ]
      .filter(Boolean)
      .join(" · ");
    const reDetailFooterMetaParts = [
      formatTimeAgo(post.created_at),
      post.view_count != null && `조회 ${post.view_count}`,
      `관심 ${favoriteCount}`,
    ].filter(Boolean) as string[];
    return (
      <div ref={rootRef} className={`w-full min-w-0 bg-sam-app ${showSellerTradeControls ? "pb-28" : "pb-24"}`}>
        <div className={TRADE_POST_DETAIL_FB_STACK_CLASS}>
          <section className={TRADE_FB_DETAIL_IMAGE_SECTION}>
            {imgList.length > 0 ? (
              <ProductImageGallery images={imgList} title={reHeroTitle || post.title || ""} />
            ) : (
              <div
                className={`flex min-h-[160px] w-full items-center justify-center overflow-hidden bg-[#f0f2f5] ${TRADE_FB_DETAIL_PLACEHOLDER_TEXT}`}
              >
                이미지
              </div>
            )}
          </section>

          <section className={TRADE_WRITE_FB_SECTION}>
            <h2 className={TRADE_FB_DETAIL_HERO_TITLE}>{reHeroTitle}</h2>
            {reHeroSubtitle ? (
              <p className={TRADE_FB_DETAIL_SUBTITLE}>{reHeroSubtitle}</p>
            ) : null}
            {rePriceSummary ? (
              <p className={TRADE_FB_DETAIL_PRICE}>{rePriceSummary}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-1.5">
              <TradeListingStatusBadge post={post} size="detail" className={TRADE_DETAIL_STATUS_BADGE_CLASS} />
              {post.is_price_offer === true ? (
                <span className="inline-flex h-6 items-center rounded-[4px] bg-[#f1f3f5] px-2 text-[12px] font-medium leading-none text-[#555555]">
                  가격 제안 가능
                </span>
              ) : null}
            </div>
            {showBuyerOfferStatus ? (
              <OfferStatusBuyer
                productId={post.id}
                currency={defaultCurrency}
                viewerUserId={resolvedViewerId ?? null}
                refreshToken={offerRefreshToken}
                offers={myBuyerOffers}
                offersLoading={myBuyerOffersLoading}
                onContinueChat={() => void handleChat()}
                onRetryOffer={() => setOfferModalOpen(true)}
              />
            ) : null}
          </section>

          <section
            id={POST_DETAIL_SELLER_ANCHOR_ID}
            data-post-detail-seller="true"
            className={`scroll-mt-14 ${TRADE_WRITE_FB_SECTION}`}
          >
            <PostDetailSellerProfileRow
              author={author}
              regionLine={
                listingLocationLine ? (
                  <p className={`max-w-[190px] truncate text-[12px] leading-[1.2] ${TRADE_FB_DETAIL_META_HELP}`}>
                    {listingLocationLine}
                  </p>
                ) : null
              }
            />
          </section>

          <section className={TRADE_WRITE_FB_SECTION}>
            <h3 className={TRADE_WRITE_FB_FIELD_HEAD}>상품 설명</h3>
            <p className={`mt-0.5 ${TRADE_FB_DETAIL_BODY}`}>{post.content || ""}</p>
            <RealEstateMetaBlock
              meta={reMeta}
              salePrice={post.price ?? null}
              currency={defaultCurrency}
              regionId={post.region ?? undefined}
              cityId={post.city ?? undefined}
              detailHeroDedup
            />
            {reDetailFooterMetaParts.length > 0 ? (
              <p className={`mt-3 ${TRADE_FB_DETAIL_FOOTNOTE}`}>{reDetailFooterMetaParts.join(" · ")}</p>
            ) : null}
          </section>

          {relatedSectionsSlot
            ? relatedSectionsSlot
            : related ? (
                <PostDetailRelatedSections
                  sellerItems={related.sellerItems}
                  similarItems={related.similarItems}
                  ads={related.ads}
                />
              ) : null}

          {post.type === "community" ? (
            <div className={POST_DETAIL_COMMUNITY_CARD_CLASS}>
              <PostCommunityCommentsSection postId={post.id} currentUserId={resolvedViewerId ?? null} />
            </div>
          ) : null}
        </div>

        <TradePostDetailActionBar
          isOwnPost={isOwnPost}
          isFavorite={isFavorite}
          onFavorite={handleFavorite}
          reFooterSummary={
            reFooterPrice ? { priceLine: reFooterPrice, dealType: reDealType ?? "" } : null
          }
          bottomActionsRowClass={bottomActionsRowClass}
          buyerPriceOfferFlowActive={buyerPriceOfferFlowActive}
          buyerOfferListHydrating={buyerOfferListHydrating}
          showBuyerOfferPendingDisabled={showBuyerOfferPendingDisabled}
          bottomBarHasOfferBtn={bottomBarHasOfferBtn}
          bottomBarHasChatBtn={bottomBarHasChatBtn}
          showJobApplyBtn={showJobApplyBtn}
          jobHireMergedApplyChatBtn={showJobHireMergedApplyChatBtn}
          showJobSeekContactBtn={showJobSeekContactBtn}
          jobApplyBusy={jobApplyBusy}
          jobApplyDone={jobApplyDone}
          onJobApply={handleJobApply}
          offerRetry={
            buyerPrimaryOffer?.status === "rejected" || buyerPrimaryOffer?.status === "expired"
          }
          onOfferModalOpen={() => setOfferModalOpen(true)}
          onChat={handleChat}
          scheduleTradeChatPrepare={scheduleTradeChatPrepare}
          cancelTradeChatPrepare={cancelTradeChatPrepare}
          onTradeChatCtaPointerDown={onTradeChatCtaPointerDown}
          uiTradeChatEnabled={uiTradeChatEnabled}
          chatBlockedByListingState={chatBlockedByListingState}
          chatCtaBusy={chatCtaBusy}
          chatBlockedByOtherReservation={chatBlockedByOtherReservation}
          chatBlockedByCompleted={chatBlockedByCompleted}
          chatBlockedByReservedState={chatBlockedByReservedState}
          tradeChatCtaLabel={tradeChatCtaLabel}
          showSellerTradeControls={showSellerTradeControls}
          showSellerOfferList={showSellerOfferList}
          canApplyTradeAd={canApplyTradeAd}
          onSellerOffersOpen={() => setSellerOffersModalOpen(true)}
          onTradeAdOpen={() => setTradeAdSheetOpen(true)}
        />
        {postDetailSharedOverlays}
      </div>
    );
  }

  const detailFooterMetaParts = [
    formatTimeAgo(post.created_at),
    post.view_count != null && `조회 ${post.view_count}`,
    `관심 ${favoriteCount}`,
  ].filter(Boolean) as string[];

  const detailImageUrls = resolveTradePostDetailImageUrls(post);
  const isUsedCarDetailUi = category?.icon_key === "used-car" || hasUsedCarMetaEarly;
  const usedCarBuyNoImages =
    isUsedCarDetailUi && (reMeta.car_trade as string | undefined) === "buy" && detailImageUrls.length === 0;
  const detailHeroTitle = isUsedCarDetailUi
    ? stripUsedCarTradeDirectionFromDetailTitle(post.title ?? "")
    : post.title ?? "";

  const jobsSkipImagePlaceholder = isJobsDetailUi && detailImageUrls.length === 0;

  const detailMetaAny = (() => {
    const meta = (post.meta as Record<string, unknown> | undefined) ?? {};
    const hasUsedCarMeta =
      meta.car_model != null ||
      meta.car_body_type != null ||
      meta.car_year != null ||
      meta.car_year_max != null ||
      meta.mileage != null ||
      meta.car_trade != null ||
      typeof meta.has_accident === "boolean";
    if (hasUsedCarMeta || category?.icon_key === "used-car") return true;
    if ((category?.icon_key === "jobs" || category?.icon_key === "job") || hasJobsMeta(meta)) return true;
    if (category?.icon_key === "exchange" || hasExchangeMeta(meta)) return true;
    if (
      category?.icon_key &&
      category.icon_key !== "used-car" &&
      category.icon_key !== "jobs" &&
      category.icon_key !== "job" &&
      category.icon_key !== "exchange" &&
      post.meta &&
      Object.keys(post.meta).length > 0
    ) {
      return true;
    }
    return false;
  })();

  return (
    <div ref={rootRef} className={`w-full min-w-0 bg-sam-app ${showSellerTradeControls ? "pb-28" : "pb-24"}`}>
      <div className={TRADE_POST_DETAIL_FB_STACK_CLASS}>
        {!usedCarBuyNoImages && !jobsSkipImagePlaceholder ? (
          <section className={TRADE_FB_DETAIL_IMAGE_SECTION}>
            {detailImageUrls.length === 0 ? (
              <div className="relative flex w-full items-center justify-center overflow-hidden bg-[#f0f2f5]">
                {hasExchangeMeta(post.meta ?? {}) ? (
                  <div
                    className="flex w-full flex-col items-center justify-center gap-2 py-12 text-[#65676B]"
                    aria-hidden
                  >
                    <span className="text-5xl font-semibold leading-none">₱</span>
                    <span className="text-xl font-normal leading-none text-[#8a8d91]">↔</span>
                    <span className="text-5xl font-semibold leading-none">₩</span>
                  </div>
                ) : (
                  <span className={`py-16 ${TRADE_FB_DETAIL_PLACEHOLDER_TEXT}`}>이미지</span>
                )}
              </div>
            ) : (
              <ProductImageGallery images={detailImageUrls} title={detailHeroTitle || post.title || ""} />
            )}
          </section>
        ) : null}

        <section className={TRADE_WRITE_FB_SECTION}>
          {isJobsDetailUi ? (
            <JobDetailHeader
              post={post}
              meta={(post.meta as Record<string, unknown>) ?? {}}
              currency={defaultCurrency}
              direction={jobDetailDirection}
              isSoldOpacity={isSold}
            />
          ) : (
            <>
              <h2 className={`${TRADE_FB_DETAIL_HERO_TITLE} ${isSold ? "opacity-80" : ""}`}>{detailHeroTitle}</h2>
              {showPrice ? (() => {
                const isRealEstate = category?.icon_key === "real-estate";
                const meta = post.meta as Record<string, unknown> | undefined;
                const dealType = meta?.deal_type as string | undefined;
                if (isRealEstate && dealType === "임대") return null;
                return (
                  <p className={TRADE_FB_DETAIL_PRICE}>
                    {post.is_free_share ? "무료나눔" : post.price != null ? formatPrice(post.price, defaultCurrency) : ""}
                  </p>
                );
              })() : null}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <TradeListingStatusBadge post={post} size="detail" className={TRADE_DETAIL_STATUS_BADGE_CLASS} />
                {post.is_price_offer === true ? (
                  <span className="inline-flex h-6 items-center rounded-[4px] bg-[#f1f3f5] px-2 text-[12px] font-medium leading-none text-[#555555]">
                    가격 제안 가능
                  </span>
                ) : null}
                {category?.icon_key === "used-car" &&
                  (() => {
                    const lab = getCarTradeLabelKo(post.meta as Record<string, unknown> | undefined);
                    if (!lab) return null;
                    return (
                      <span className="inline-flex h-6 items-center rounded-[4px] bg-[#f1f3f5] px-2 text-[12px] font-medium leading-none text-[#555555]">
                        {lab}
                      </span>
                    );
                  })()}
                {post.is_free_share && (
                  <span className="inline-flex h-6 items-center rounded-[4px] bg-[#f1f3f5] px-2 text-[12px] font-medium leading-none text-[#555555]">
                    나눔
                  </span>
                )}
                {(post.meta as Record<string, unknown> | undefined)?.direct_deal === true && (
                  <span className="inline-flex h-6 items-center rounded-[4px] bg-[#f1f3f5] px-2 text-[12px] font-medium leading-none text-[#555555]">
                    직거래
                  </span>
                )}
              </div>
            </>
          )}
          {showBuyerOfferStatus ? (
            <OfferStatusBuyer
              productId={post.id}
              currency={defaultCurrency}
              viewerUserId={resolvedViewerId ?? null}
              refreshToken={offerRefreshToken}
              offers={myBuyerOffers}
              offersLoading={myBuyerOffersLoading}
              onContinueChat={() => void handleChat()}
              onRetryOffer={() => setOfferModalOpen(true)}
            />
          ) : null}
        </section>

        <section
          id={POST_DETAIL_SELLER_ANCHOR_ID}
          data-post-detail-seller="true"
          className={`scroll-mt-14 ${TRADE_WRITE_FB_SECTION}`}
        >
          <PostDetailSellerProfileRow
            author={author}
            regionLine={
              listingLocationLine ? (
                <p className={`max-w-[190px] truncate text-[12px] leading-[1.2] ${TRADE_FB_DETAIL_META_HELP}`}>
                  {listingLocationLine}
                </p>
              ) : null
            }
          />
        </section>

        <section className={TRADE_WRITE_FB_SECTION}>
          <div className={`flex flex-col ${isJobsDetailUi ? "gap-2" : "gap-3"}`}>
            {(() => {
              const meta = (post.meta as Record<string, unknown> | undefined) ?? {};
              const hasUsedCarMeta =
                meta &&
                (meta.car_model != null ||
                  meta.car_body_type != null ||
                  meta.car_year != null ||
                  meta.car_year_max != null ||
                  meta.mileage != null ||
                  meta.car_trade != null ||
                  typeof meta.has_accident === "boolean");
              const isUsedCarCategory = category?.icon_key === "used-car";
              if (hasUsedCarMeta || isUsedCarCategory) {
                return (
                  <UsedCarMetaBlock
                    meta={meta}
                    salePrice={post.price ?? null}
                    currency={defaultCurrency}
                  />
                );
              }
              return null;
            })()}
            {isJobsDetailUi ? (
              <>
                <JobDetailContextNote direction={jobDetailDirection} />
                {jobDetailDirection === "hiring" ? (
                  <JobHiringDetailCards
                    post={post}
                    meta={(post.meta as Record<string, unknown>) ?? {}}
                    currency={defaultCurrency}
                  />
                ) : (
                  <JobSeekingDetailCards
                    post={post}
                    meta={(post.meta as Record<string, unknown>) ?? {}}
                    currency={defaultCurrency}
                  />
                )}
              </>
            ) : (
              <>
                {((category?.icon_key === "exchange") ||
                  hasExchangeMeta((post.meta as Record<string, unknown>) ?? {})) && (
                  <ExchangeMetaBlock
                    meta={(post.meta as Record<string, unknown>) ?? {}}
                    amount={post.price ?? null}
                    currency={defaultCurrency}
                  />
                )}
                {category?.icon_key &&
                  category.icon_key !== "used-car" &&
                  category.icon_key !== "jobs" &&
                  category.icon_key !== "job" &&
                  category.icon_key !== "exchange" &&
                  post.meta &&
                  Object.keys(post.meta).length > 0 && (
                    <TradeMetaBlock
                      skinKey={category.icon_key}
                      meta={post.meta as Record<string, unknown>}
                      post={post}
                      defaultCurrency={defaultCurrency}
                    />
                  )}

                <div className={detailMetaAny ? "border-t border-[#e4e6eb] pt-3" : ""}>
                  <h3 className={TRADE_WRITE_FB_FIELD_HEAD}>상품 설명</h3>
                  <p className={`mt-0.5 ${TRADE_FB_DETAIL_BODY}`}>{post.content || ""}</p>
                </div>
              </>
            )}
          </div>

          {detailFooterMetaParts.length > 0 ? (
            <p className={`mt-3 ${TRADE_FB_DETAIL_FOOTNOTE}`}>{detailFooterMetaParts.join(" · ")}</p>
          ) : null}
        </section>

        {relatedSectionsSlot
          ? relatedSectionsSlot
          : related ? (
              <PostDetailRelatedSections
                sellerItems={related.sellerItems}
                similarItems={related.similarItems}
                ads={related.ads}
              />
            ) : null}

        {post.type === "community" ? (
          <div className={POST_DETAIL_COMMUNITY_CARD_CLASS}>
            <PostCommunityCommentsSection postId={post.id} currentUserId={resolvedViewerId ?? null} />
          </div>
        ) : null}
      </div>

      <TradePostDetailActionBar
        isOwnPost={isOwnPost}
        isFavorite={isFavorite}
        onFavorite={handleFavorite}
        reFooterSummary={null}
        bottomActionsRowClass={bottomActionsRowClass}
        buyerPriceOfferFlowActive={buyerPriceOfferFlowActive}
        buyerOfferListHydrating={buyerOfferListHydrating}
        showBuyerOfferPendingDisabled={showBuyerOfferPendingDisabled}
        bottomBarHasOfferBtn={bottomBarHasOfferBtn}
        bottomBarHasChatBtn={bottomBarHasChatBtn}
        showJobApplyBtn={showJobApplyBtn}
        jobHireMergedApplyChatBtn={showJobHireMergedApplyChatBtn}
        showJobSeekContactBtn={showJobSeekContactBtn}
        jobApplyBusy={jobApplyBusy}
        jobApplyDone={jobApplyDone}
        onJobApply={handleJobApply}
        offerRetry={
          buyerPrimaryOffer?.status === "rejected" || buyerPrimaryOffer?.status === "expired"
        }
        onOfferModalOpen={() => setOfferModalOpen(true)}
        onChat={handleChat}
        scheduleTradeChatPrepare={scheduleTradeChatPrepare}
        cancelTradeChatPrepare={cancelTradeChatPrepare}
        onTradeChatCtaPointerDown={onTradeChatCtaPointerDown}
        uiTradeChatEnabled={uiTradeChatEnabled}
        chatBlockedByListingState={chatBlockedByListingState}
        chatCtaBusy={chatCtaBusy}
        chatBlockedByOtherReservation={chatBlockedByOtherReservation}
        chatBlockedByCompleted={chatBlockedByCompleted}
        chatBlockedByReservedState={chatBlockedByReservedState}
        tradeChatCtaLabel={tradeChatCtaLabel}
        showSellerTradeControls={showSellerTradeControls}
        showSellerOfferList={showSellerOfferList}
        canApplyTradeAd={canApplyTradeAd}
        onSellerOffersOpen={() => setSellerOffersModalOpen(true)}
        onTradeAdOpen={() => setTradeAdSheetOpen(true)}
      />
      {postDetailSharedOverlays}
    </div>
  );
}
