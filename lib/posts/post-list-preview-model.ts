/**
 * 홈 피드 PostCard 본문과 동일한 문자열·순서 — 채팅 목록/상단 카드와 단일 소스
 */

import { formatPrice, formatTimeAgo, parseMetaAmount } from "@/lib/utils/format";
import { getLocationLabel } from "@/lib/products/form-options";
import { resolveTradePostListingLocationLine } from "@/lib/posts/post-listing-location-label";
import { postPreviewT } from "@/lib/posts/post-list-preview-i18n";
import {
  EXPERIENCE_LEVEL_OPTIONS,
  HIRE_WEEKDAY_OPTIONS,
  jobWorkCategoryDisplay,
} from "@/lib/jobs/form-options";
import {
  jobExperienceLabel,
  jobListingKindLabel,
  jobPayTypeLabel,
  jobPayTypeLabelDefault,
  jobWorkTermLabel,
} from "@/lib/jobs/job-label-keys";
import type { MessageKey } from "@/lib/i18n/messages";
import { translate } from "@/lib/i18n/messages";
import { DEFAULT_APP_LANGUAGE, normalizeAppLanguage } from "@/lib/i18n/config";
import { CURRENCY_SYMBOLS } from "@/lib/exchange/form-options";
import { getExchangeFeedLines } from "@/lib/exchange/exchange-feed-lines";
import {
  hasRealEstateMeta,
  hasUsedCarMeta,
  hasJobsMeta,
  hasExchangeMeta,
} from "@/lib/posts/post-variant";
import { labelForUsedCarBodyTypeKey } from "@/lib/trade/used-car-form-catalog";
import { APP_FEED_LIST_ROW1_PILL_LIST } from "@/lib/ui/app-feed-list-row1";

export type PostListThumbMode = "exchange" | "generic" | "none";

/** 채팅 목록 등에서 미리보기 압축 시 구분 */
export type PostListPreviewListKind =
  | "real-estate"
  | "used-car"
  | "jobs"
  | "exchange"
  | "trade";

/**
 * 피드 1단 칩 — 전 스킨·신규 메뉴 공통(`app-feed-list-row1`).
 * `listTradeStatusBadge` / `TradeListingStatusBadge` 와 동일 pill 베이스.
 */
const POST_LIST_ROW1_CHIP_BASE = APP_FEED_LIST_ROW1_PILL_LIST;

export const POST_LIST_CHIP_GRAY = `${POST_LIST_ROW1_CHIP_BASE} bg-gray-100 text-gray-700`;
export const POST_LIST_CHIP_AMBER = `${POST_LIST_ROW1_CHIP_BASE} bg-amber-100 text-amber-800`;
export const POST_LIST_CHIP_BLUE = `${POST_LIST_ROW1_CHIP_BASE} bg-blue-50 text-blue-700`;
/** 1단 유형 칩 — 중고·중고차·부동산·환전·일자리 공통 모양 */
export const POST_LIST_TYPE_CHIP = POST_LIST_CHIP_BLUE;

/** 피드 카드 본문 타이포 — 커뮤니티 `ListTitleOnly`와 정렬(15px semibold #050505) */
export const POST_LIST_TITLE_CLASS =
  "mt-0.5 line-clamp-2 text-left text-[15px] font-semibold leading-snug text-[#050505]";
/**
 * 일반 중고 2단(제목) 등 — 커뮤니티 카드 제목과 동일
 */
export const POST_LIST_TRADE_TITLE_CLASS =
  "mt-0.5 line-clamp-2 text-left text-[13px] font-medium leading-snug text-[#050505]";
/** 중고차 1단 — 삽니다/팝니다 칩 옆 차종(뱃지 아님·굵은 텍스트) */
export const POST_LIST_USED_CAR_ROW_TRAIL_BOLD_CLASS =
  "min-w-0 text-[13px] font-semibold leading-snug text-[#050505]";
/**
 * 리스트 3단 금액 본문(마진 없음) — 15~16px Bold(700) `#1A1A1A`.
 * 알바 급여·일반/중고차 가격·환전 페소·부동산 금액(매매/보증금|월세) 등 공통.
 */
export const POST_LIST_PRICE_TEXT_CLASS =
  "sam-text-body-lg font-bold leading-tight tabular-nums text-[#1A1A1A]";

/** 3단 금액 줄 — 윗 단과 간격 `mt-0.5` */
export const POST_LIST_PRICE_CLASS = `mt-0.5 ${POST_LIST_PRICE_TEXT_CLASS}`;
/**
 * 거래 리스트 공통 금액 줄(중고거래/중고차/부동산/환전/일자리).
 * 제목과 분리해 금액만 일괄 조정할 때 이 상수만 수정한다.
 */
export const POST_LIST_TRADE_PRICE_CLASS = POST_LIST_PRICE_CLASS;
/** 부동산 금액 줄 래퍼 — 타이포는 PostListPreviewColumn 부동산 금액 렌더에서 지정 */
export const POST_LIST_REAL_ESTATE_PRICE_ROW_CLASS = "mt-0.5 text-left";
/**
 * 리스트 4단 메타 본문(마진 없음) — 커뮤니티 `ListMetaKarrot`(12px #6B7280)
 */
export const POST_LIST_META_LINE_CLASS =
  "text-[12px] font-normal leading-[1.4] text-[#6B7280]";
/**
 * 부동산 리스트 금액 숫자 — 일자리 급여 금액과 동일 (`POST_LIST_PRICE_TEXT_CLASS`).
 */
export const POST_LIST_REAL_ESTATE_PRICE_AMOUNT_CLASS = `shrink-0 ${POST_LIST_PRICE_TEXT_CLASS}`;
/**
 * 매매·보증금·월세 라벨 — 일자리 급여 라벨·주소 줄과 동일 (`POST_LIST_META_LINE_CLASS`).
 */
export const POST_LIST_REAL_ESTATE_PRICE_TOKEN_LABEL_CLASS =
  `shrink-0 ${POST_LIST_META_LINE_CLASS}`;
/** 리스트 작성자(닉네임) 줄 — 메뉴/전체 공통 */
export const POST_LIST_SELLER_LINE_CLASS =
  "text-[11px] font-medium leading-[1.4] text-[#050505]";

/** 리스트 4단 메타 줄 — 윗 단과 간격 `mt-0.5` */
export const POST_LIST_META_TEXT_CLASS = `mt-0.5 ${POST_LIST_META_LINE_CLASS}`;
/** 카드 본문 줄 공통 — 상단 여백·2줄 클램프·flex 자식 `min-w-0` */
export const POST_LIST_BODY_ROW_WRAP_CLASS = "mt-0.5 line-clamp-2 min-w-0";
/**
 * 거래 피드 리스트 보조 본문(부동산 유형·환전 환율·일자리 메타 등).
 * 색·크기는 `POST_LIST_META_LINE_CLASS`와 동일.
 */
export const POST_LIST_TRADE_LIST_SECONDARY_CLASS =
  `${POST_LIST_BODY_ROW_WRAP_CLASS} text-left ${POST_LIST_META_LINE_CLASS}`;
/** 중고차 리스트 차량명·연식 — 일자리 제목 1행과 동일 (`POST_LIST_TRADE_TITLE_CLASS`) */
export const POST_LIST_USED_CAR_SPEC_CLASS = POST_LIST_TRADE_TITLE_CLASS;
/** 부동산 리스트 유형·면적 등 스펙 줄 */
export const POST_LIST_REAL_ESTATE_SPEC_CLASS = POST_LIST_TRADE_LIST_SECONDARY_CLASS;
/** 환전 리스트 환율 줄 */
export const POST_LIST_EXCHANGE_RATE_CLASS = POST_LIST_TRADE_LIST_SECONDARY_CLASS;
/** 알바 리스트 2단: 급여(라벨=메타 타이포·금액 강조) — 래퍼만(`renderPreviewBodyParagraph`에서 타이포 분리) */
export const POST_LIST_JOBS_PAY_ROW_CLASS = POST_LIST_BODY_ROW_WRAP_CLASS;
/** 알바 리스트 3단: 업종·형태·근무 조건 — 거래 리스트 보조 본문 공통 래퍼 */
export const POST_LIST_JOBS_META_ROW_CLASS = POST_LIST_TRADE_LIST_SECONDARY_CLASS;
/** 환전 리스트 4단(위치|시간) — 11~12px Regular(400) #9E9E9E (`POST_LIST_META_TEXT_CLASS`와 동일) */
export const POST_LIST_EXCHANGE_META_CLASS = POST_LIST_META_TEXT_CLASS;

/**
 * 썸네일 열 `flex-1` + `justify-between`에서 세로 간격은 컨테이너가 나누므로
 * 블록 앞쪽 `mt-*`를 제거한다(PostCard·상품 카드 공통).
 */
export function stripPostListBlockTopMargin(className: string): string {
  return className
    .replace(/^\s*mt-1\.5\s+/, "")
    .replace(/^\s*mt-1\s+/, "")
    .replace(/^\s*mt-0\.5\s+/, "");
}

export interface ListingChip {
  text: string;
  className: string;
}

export interface PostListBodyBlock {
  className: string;
  text: string;
  /** 판매자 닉네임 전용 줄 — 부동산·알바·환전 본문·채팅 압축에서 구분 */
  row?: "seller" | "real_estate_price" | "meta_tail" | "jobs_meta_row" | "jobs_pay_row";
  /** `jobs_pay_row`: 급여 라벨(`POST_LIST_META_LINE_CLASS`) + 금액 강조 — `text` 평문 폴백 */
  jobsPayRow?: { label: string; amount: string | null };
}

export interface PostListPreviewModel {
  thumbnailMode: PostListThumbMode;
  listKind: PostListPreviewListKind;
  /** TradeListingStatusBadge + 칩 (+ 부동산은 금액은 body 2단) */
  listingRowClassName: string;
  listingChips: ListingChip[];
  listingBold: string | null;
  /** 칩·파이프 다음 같은 줄 — 중고차 삽니다 차종 등(칩 스타일 없음) */
  listingRowBoldText?: string | null;
  bodyBlocks: PostListBodyBlock[];
  /**
   * PostCard 하단 — 환전만 null.
   * `sellerLine`: 주소·시간 줄(ul) **위** — `profiles`/author_nickname 기반 **닉네임만**(숫자 ID 미표시).
   */
  listFooter: {
    sellerLine?: string | null;
    sellerLineClassName?: string;
    ulClassName: string;
    items: string[];
  } | null;
  /** 알바: 1단 `판매중 | 구인유형` — 배지 직후 `|` */
  showPipeAfterListingBadge?: boolean;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function hireWeekDaysShort(meta: Record<string, unknown>, row: Record<string, unknown>): string {
  const pipe = str(meta.hire_week_days_pipe);
  if (pipe) {
    return pipe
      .split("|")
      .filter(Boolean)
      .map((p) => {
        const opt = HIRE_WEEKDAY_OPTIONS.find((o) => o.value === p);
        return opt ? translate(DEFAULT_APP_LANGUAGE, opt.labelKey) : p;
      })
      .join("/");
  }
  const wd = row.work_days;
  if (Array.isArray(wd) && wd.length > 0) {
    return wd
      .map((x) => {
        const opt = HIRE_WEEKDAY_OPTIONS.find((o) => o.value === String(x));
        return opt ? translate(DEFAULT_APP_LANGUAGE, opt.labelKey) : String(x);
      })
      .join("/");
  }
  if (meta.hire_work_days_discuss === true) {
    return postPreviewT(DEFAULT_APP_LANGUAGE, "post_preview_days_discuss");
  }
  return "";
}

/** `meta.exchange_direction` 우선, 없으면 제목에 삽니다/팝니다 포함 여부 */
function exchangeListingIsBuy(meta: Record<string, unknown>, title: string): boolean {
  const d = str(meta.exchange_direction).toLowerCase();
  if (d === "buy") return true;
  if (d === "sell") return false;
  if (title.includes("삽니다")) return true;
  if (title.includes("팝니다")) return false;
  return false;
}

/** API·프로필에서 채운 `author_nickname` 만 — ID·UUID 축약 미표시 */
function sellerNicknameOnlyFromPost(post: Record<string, unknown>): string | null {
  const nick = str(post.author_nickname);
  return nick || null;
}

function buildListFooter(
  post: Record<string, unknown>,
  variant: "uc" | "jobs" | "trade",
  locationLabel: string | null,
  locale: string,
  createdAt: string
): {
  sellerLine: string | null;
  sellerLineClassName?: string;
  ulClassName: string;
  items: string[];
} {
  const sellerRaw = sellerNicknameOnlyFromPost(post);
  const sellerLine = sellerRaw
    ? variant === "trade"
      ? sellerRaw
      : sellerRaw
    : null;
  const sellerLineClassName =
    variant === "trade" || variant === "uc" ? POST_LIST_SELLER_LINE_CLASS : POST_LIST_META_LINE_CLASS;
  const t = createdAt && !Number.isNaN(Date.parse(createdAt)) ? formatTimeAgo(createdAt, locale) : "";
  const chatCount = post.comment_count;
  const favCount = post.favorite_count;
  const items: string[] = [];
  if (variant === "uc") {
    if (locationLabel) items.push(locationLabel);
    if (t) items.push(t);
    if (typeof chatCount === "number" && chatCount > 0)
      items.push(postPreviewT(locale, "post_preview_chat_count", { count: chatCount }));
    if (typeof favCount === "number" && favCount > 0)
      items.push(postPreviewT(locale, "post_preview_fav_count", { count: favCount }));
  } else {
    if (variant === "trade" && locationLabel) items.push(locationLabel);
    if (t) items.push(t);
    if (typeof chatCount === "number" && chatCount > 0)
      items.push(postPreviewT(locale, "post_preview_chat_count", { count: chatCount }));
    if (typeof favCount === "number" && favCount > 0)
      items.push(postPreviewT(locale, "post_preview_fav_count", { count: favCount }));
  }
  /** ul 은 `sellerLine` 아래 두 번째 줄 — 블록 전체 `mt-1` 은 PostListPreviewColumn 래퍼에서 */
  const ulClassName = `flex flex-wrap items-center gap-x-2 gap-y-0.5 ${POST_LIST_META_LINE_CLASS}`;
  return { sellerLine, sellerLineClassName, ulClassName, items };
}

/** 부동산 리스트 2단 — 매매가 또는 보증금 | 월세(리스트는 `POST_LIST_PRICE_CLASS`로 표시) */
function getRealEstateRow2PriceLabel(
  price: number | null | undefined,
  meta: Record<string, unknown>,
  currency: string,
  locale: string
): string {
  const dealType = str(meta.deal_type);
  if (dealType === "판매" && price != null) {
    return postPreviewT(locale, "post_preview_sale_price", { price: formatPrice(price, currency) });
  }
  if (dealType === "임대") {
    const d = meta.deposit != null ? String(meta.deposit).trim() : "";
    const m = meta.monthly != null ? String(meta.monthly).trim() : "";
    if (d || m) {
      return postPreviewT(locale, "post_preview_deposit_monthly", {
        deposit: formatPrice(parseMetaAmount(meta.deposit), currency),
        monthly: formatPrice(parseMetaAmount(meta.monthly), currency),
      });
    }
  }
  if (price != null) return formatPrice(price, currency);
  return "";
}

type PreviewJobT = (key: MessageKey, vars?: Record<string, string | number>) => string;

function previewJobT(locale: string): PreviewJobT {
  return (key, vars) => postPreviewT(locale, key, vars);
}

/** 일반 중고거래: API에 type이 비어 있거나 다르게 와도 price가 있으면 금액 표시 */
function rowPriceLabel(
  price: number | null | undefined,
  isFree: boolean,
  currency: string,
  locale: string
): string | null {
  if (isFree) return postPreviewT(locale, "post_preview_free_share");
  if (price != null && !Number.isNaN(price)) return formatPrice(price, currency);
  return null;
}

/** 리스트 1줄 헤드라인 — 건물명 우선, 구형 제목(지역 접두)은 호환용으로 정리 */
function realEstateListingHeadline(
  meta: Record<string, unknown>,
  post: Record<string, unknown>,
  region: string,
  city: string
): string {
  const bn = str(meta.building_name);
  if (bn) return bn;
  const title = str(post.title);
  if (!title) return postPreviewT(DEFAULT_APP_LANGUAGE, "post_preview_listing_default");
  const loc = region && city ? getLocationLabel(region, city).trim() : "";
  if (loc) {
    if (title === loc || title.startsWith(`${loc}·`) || title.startsWith(`${loc} ·`)) {
      const rest = title.slice(loc.length).replace(/^\s*·\s*/, "").trim();
      return rest || title;
    }
    if (title.startsWith(`${loc} `)) {
      return title.slice(loc.length).trim() || title;
    }
  }
  return title;
}

export function buildPostListPreviewModel(
  post: Record<string, unknown> | undefined,
  opts: {
    currency: string;
    locale: string;
    skinKey?: string;
    /** `parsePostMetaField(post?.meta)` 와 동일 메타 — 문자열 JSON·빈 케이스와 `post.meta` 직접 읽기 불일치 방지 */
    preParsedMeta?: Record<string, unknown>;
    /** 채팅 카드에서 이미 `getExchangeFeedLines` 한 결과 — 환전 블록 이중 계산 제거 */
    exchangeFeedPrecomputed?: { phpAmount: number | null; rateLine: string | null } | null;
  }
): PostListPreviewModel | null {
  if (!post) return null;

  const skinKey = opts.skinKey;
  const meta =
    opts.preParsedMeta !== undefined
      ? opts.preParsedMeta
      : ((post.meta && typeof post.meta === "object" && !Array.isArray(post.meta)
          ? (post.meta as Record<string, unknown>)
          : {}) as Record<string, unknown>);

  const region = str(post.region);
  const city = str(post.city);
  const locationLabel = resolveTradePostListingLocationLine(meta, region || undefined, city || undefined);
  const currency = opts.currency || "KRW";
  const locale = opts.locale || "ko-KR";
  const createdAt = str(post.created_at) || str(post.updated_at);

  const type = str(post.type) || undefined;
  const isTradePost = (type?.toLowerCase() ?? "") === "trade";
  const priceRaw = post.price;
  const price =
    priceRaw != null && priceRaw !== ""
      ? Number(
          typeof priceRaw === "string"
            ? priceRaw.replace(/,/g, "").trim()
            : priceRaw
        )
      : null;
  const priceOk = price != null && !Number.isNaN(price) ? price : null;
  const isFree = post.is_free_share === true;

  const isRealEstate = skinKey === "real-estate" || (!skinKey && hasRealEstateMeta(meta));
  const isUsedCar = skinKey === "used-car" || (!skinKey && hasUsedCarMeta(meta));
  const isJobs = skinKey === "jobs" || skinKey === "job" || (!skinKey && hasJobsMeta(meta));
  const isExchange = skinKey === "exchange" || (!skinKey && hasExchangeMeta(meta));

  /** PostCard와 동일: 부동산 스킨이어도 meta 비어 있으면 일반 거래 블록으로 */
  if (isRealEstate && Object.keys(meta).length > 0) {
    const dealType = str(meta.deal_type);
    const row1Headline = realEstateListingHeadline(meta, post, region, city);
    const row2Price = getRealEstateRow2PriceLabel(priceOk, meta, currency, locale);
    const estateType = str(meta.estate_type);
    const sizeSq = meta.size_sq ?? meta.area_sqm;
    const sizeSqStr =
      sizeSq != null && String(sizeSq).trim() ? `${String(sizeSq).trim()} sq` : "";
    const parts3 = [estateType, sizeSqStr].filter(Boolean);
    const row3 = parts3.join(" · ");

    const listingChips: ListingChip[] = [];
    if (dealType) {
      listingChips.push({ text: dealType, className: POST_LIST_TYPE_CHIP });
    }

    const blocks: PostListBodyBlock[] = [
      {
        /** 제목 — 일반 거래·중고차·알바 리스트 2단과 동일 (`POST_LIST_TRADE_TITLE_CLASS`) */
        className: POST_LIST_TRADE_TITLE_CLASS,
        text: row1Headline,
      },
      {
        className: POST_LIST_REAL_ESTATE_PRICE_ROW_CLASS,
        text: row2Price || postPreviewT(locale, "post_preview_price_inquiry"),
        row: "real_estate_price",
      },
    ];
    if (row3)
      blocks.push({
        className: POST_LIST_REAL_ESTATE_SPEC_CLASS,
        text: row3,
      });
    return {
      thumbnailMode: "none",
      listKind: "real-estate",
      listingRowClassName: "flex flex-wrap items-center gap-1.5",
      listingChips,
      listingBold: null,
      bodyBlocks: blocks,
      listFooter: buildListFooter(post, "trade", locationLabel, locale, createdAt),
      showPipeAfterListingBadge: listingChips.length > 0,
    };
  }

  if (isUsedCar) {
    const carModel = str(meta.car_model);
    const bodyTypeRaw = str(meta.car_body_type);
    const bodyTypeLabel =
      meta.car_trade === "buy" && bodyTypeRaw ? labelForUsedCarBodyTypeKey(bodyTypeRaw) : "";
    const yearRaw = str(meta.car_year_max) || str(meta.car_year);
    const yearPart =
      yearRaw && /^\d{4}$/.test(yearRaw)
        ? postPreviewT(locale, "post_preview_year_suffix", { year: yearRaw })
        : yearRaw;
    /** 삽니다: 차종은 `listingChips` 줄 — 여기서는 모델·연식만 (팝니다도 동일) */
    const carSpecLine = [carModel, yearPart].filter(Boolean).join(" · ");
    const usedCarPriceLabel = isFree
      ? postPreviewT(locale, "post_preview_free_share")
      : priceOk != null
        ? formatPrice(priceOk, currency)
        : null;

    const tradeLabel =
      meta.car_trade === "buy"
        ? postPreviewT(locale, "post_preview_wanted")
        : meta.car_trade === "sell"
          ? postPreviewT(locale, "post_preview_for_sale")
          : null;
    const listingChips: ListingChip[] = [];
    if (tradeLabel) listingChips.push({ text: tradeLabel, className: POST_LIST_TYPE_CHIP });

    const blocks: PostListBodyBlock[] = [];
    if (carSpecLine) {
      blocks.push({
        className: POST_LIST_USED_CAR_SPEC_CLASS,
        text: carSpecLine,
      });
    }
    blocks.push({
      className: POST_LIST_TRADE_PRICE_CLASS,
      text: usedCarPriceLabel ?? postPreviewT(locale, "post_preview_price_inquiry"),
    });

    return {
      thumbnailMode: "none",
      listKind: "used-car",
      listingRowClassName: "flex flex-wrap items-center gap-1.5",
      listingChips,
      listingBold: null,
      listingRowBoldText:
        meta.car_trade === "buy" && bodyTypeLabel ? bodyTypeLabel : null,
      bodyBlocks: blocks,
      listFooter: buildListFooter(post, "uc", locationLabel, locale, createdAt),
      showPipeAfterListingBadge: listingChips.length > 0,
    };
  }

  if (isJobs) {
    const row = post as Record<string, unknown>;
    const kindRaw = str(meta.listing_kind);
    const legacyJobType = str(meta.job_type);
    const isSeek = kindRaw === "work" || legacyJobType === "seek";
    const jt = previewJobT(locale);
    const listingKindLabel = jobListingKindLabel(
      jt,
      kindRaw || (isSeek ? "work" : "hire")
    );
    const payTypeMeta = str(meta.pay_type) || str(row.pay_type);
    const colPay = row.pay_amount;
    const payAmountNum =
      meta.pay_amount != null
        ? Number(meta.pay_amount)
        : colPay != null && colPay !== ""
          ? Number(colPay)
          : priceOk != null
            ? priceOk
            : null;
    const jobsPayLabel =
      payAmountNum != null && !Number.isNaN(payAmountNum)
        ? `${jobPayTypeLabel(jt, payTypeMeta)} ${formatPrice(payAmountNum, currency)}`
        : null;
    const workAddressLabel = str(meta.work_address) || locationLabel || "";
    const regionId = str(row.region);
    const cityId = str(row.city);
    const geoLabel =
      regionId && cityId ? getLocationLabel(regionId, cityId) : locationLabel || workAddressLabel || "";

    const wt = str(meta.work_term) || str(row.job_employment_type);
    const wtLabel = wt ? jobWorkTermLabel(jt, wt) : "";

    const industryLabel = jobWorkCategoryDisplay(meta, normalizeAppLanguage(locale));

    const listingChips: ListingChip[] = [];
    if (listingKindLabel) {
      listingChips.push({ text: listingKindLabel, className: POST_LIST_TYPE_CHIP });
    }

    const titleLine = str(post.title) || postPreviewT(locale, "post_preview_product_default");
    const blocks: PostListBodyBlock[] = [{ className: POST_LIST_TRADE_TITLE_CLASS, text: titleLine }];

    if (!isSeek) {
      const hirePayNegotiable = meta.hire_pay_negotiable === true || payTypeMeta === "negotiate";
      const ptShort = payTypeMeta ? jobPayTypeLabelDefault(payTypeMeta) : "";
      let payLabel: string;
      let payAmount: string | null = null;
      if (jobsPayLabel != null && payAmountNum != null && !Number.isNaN(payAmountNum)) {
        payLabel = ptShort;
        payAmount = formatPrice(payAmountNum, currency);
      } else if (hirePayNegotiable) {
        payLabel = "협의";
      } else {
        payLabel = postPreviewT(locale, "post_preview_price_inquiry");
      }
      const payPlain = payAmount ? `${payLabel} ${payAmount}` : payLabel;
      blocks.push({
        className: POST_LIST_JOBS_PAY_ROW_CLASS,
        text: payPlain,
        row: "jobs_pay_row",
        jobsPayRow: { label: payLabel, amount: payAmount },
      });

      const industryWt = [industryLabel, wtLabel].filter(Boolean).join(" · ");
      const hts = str(row.work_start_time);
      const hte = str(row.work_end_time);
      const timeRange = hts || hte ? `${hts || "—"} ~ ${hte || "—"}` : "";
      const daysPart = hireWeekDaysShort(meta, row);
      const condTrim = [timeRange, daysPart].filter(Boolean).join(" · ").trim();
      if (industryWt || condTrim) {
        const plainMeta = [industryWt, condTrim].filter(Boolean).join(" · ");
        blocks.push({
          className: POST_LIST_JOBS_META_ROW_CLASS,
          text: plainMeta,
          row: "jobs_meta_row",
        });
      }
    } else {
      const seekNegotiate = payTypeMeta === "negotiate";
      const ptShort = payTypeMeta ? jobPayTypeLabel(jt, payTypeMeta) : "";
      let payLabel: string;
      let payAmount: string | null = null;
      if (jobsPayLabel != null && payAmountNum != null && !Number.isNaN(payAmountNum)) {
        payLabel = postPreviewT(locale, "post_preview_wanted_pay", { pay: ptShort });
        payAmount = formatPrice(payAmountNum, currency);
      } else if (seekNegotiate) {
        payLabel = postPreviewT(locale, "post_preview_wanted_pay_discuss");
      } else {
        payLabel = postPreviewT(locale, "post_preview_wanted_pay_inquiry");
      }
      const payPlain = payAmount ? `${payLabel} ${payAmount}` : payLabel;
      blocks.push({
        className: POST_LIST_JOBS_PAY_ROW_CLASS,
        text: payPlain,
        row: "jobs_pay_row",
        jobsPayRow: { label: payLabel, amount: payAmount },
      });

      const industryWt = [industryLabel, wtLabel].filter(Boolean).join(" · ");
      const avail = str(meta.available_time);
      const expRaw = str(meta.experience_level);
      const expLabel = expRaw ? jobExperienceLabel(jt, expRaw) : "";
      const condTrim = [avail, expLabel].filter(Boolean).join(" · ").trim();
      if (industryWt || condTrim) {
        const plainMeta = [industryWt, condTrim].filter(Boolean).join(" · ");
        blocks.push({
          className: POST_LIST_JOBS_META_ROW_CLASS,
          text: plainMeta,
          row: "jobs_meta_row",
        });
      }
    }

    return {
      thumbnailMode: "none",
      listKind: "jobs",
      listingRowClassName: "flex flex-wrap items-center gap-1.5",
      listingChips,
      listingBold: null,
      bodyBlocks: blocks,
      listFooter: buildListFooter(
        post,
        "trade",
        geoLabel || workAddressLabel || postPreviewT(locale, "post_preview_location_unknown"),
        locale,
        createdAt
      ),
      showPipeAfterListingBadge: listingChips.length > 0,
    };
  }

  if (isExchange) {
    const { phpAmount, rateLine } =
      opts.exchangeFeedPrecomputed ?? getExchangeFeedLines(meta, priceOk);
    const phpText =
      phpAmount != null && !Number.isNaN(phpAmount)
        ? `${CURRENCY_SYMBOLS.PHP} ${phpAmount.toLocaleString()}`
        : postPreviewT(locale, "post_preview_price_inquiry");
    const rateText = rateLine
      ? postPreviewT(locale, "post_preview_rate_line", { rate: rateLine })
      : postPreviewT(locale, "post_preview_rate_unset");

    /** 1단 유형 칩 — 제목이 아니라 환전 방향(페소 팝니다/삽니다) */
    const isBuy = exchangeListingIsBuy(meta, str(post.title));
    const listingChips: ListingChip[] = [
      {
        text: isBuy
          ? postPreviewT(locale, "post_preview_buy_peso")
          : postPreviewT(locale, "post_preview_sell_peso"),
        className: POST_LIST_TYPE_CHIP,
      },
    ];

    /** 2단 페소 금액 — `POST_LIST_TRADE_PRICE_CLASS` */
    const blocks: PostListBodyBlock[] = [
      {
        className: POST_LIST_TRADE_PRICE_CLASS,
        text: phpText,
      },
      /** 3단 환율 — 거래 리스트 보조 본문 공통 (`POST_LIST_EXCHANGE_RATE_CLASS`) */
      {
        className: POST_LIST_EXCHANGE_RATE_CLASS,
        text: rateText,
      },
    ];
    return {
      thumbnailMode: "exchange",
      listKind: "exchange",
      listingRowClassName: "flex flex-wrap items-center gap-1.5",
      listingChips,
      listingBold: null,
      bodyBlocks: blocks,
      listFooter: buildListFooter(post, "trade", locationLabel, locale, createdAt),
      showPipeAfterListingBadge: true,
    };
  }

  const listingChips: ListingChip[] = [];
  /**
   * 일반 중고 유형 칩 — `In-person deal` 대신 팝니다/삽니다.
   * 글쓰기 authority: 일반 폼은 판매 글. 주제/카테고리명에 삽니다가 있으면 구매.
   */
  if (isTradePost) {
    const categoryName = str(post.category_name);
    const isBuyListing = /삽니다/.test(categoryName);
    listingChips.push({
      text: isBuyListing
        ? postPreviewT(locale, "post_preview_wanted")
        : postPreviewT(locale, "post_preview_for_sale"),
      className: POST_LIST_TYPE_CHIP,
    });
  }

  const tradePriceLabel = rowPriceLabel(priceOk, isFree, currency, locale);

  const blocks: PostListBodyBlock[] = [
    {
      className: POST_LIST_TRADE_TITLE_CLASS,
      text: str(post.title) || postPreviewT(locale, "post_preview_product_default"),
    },
  ];
  if (priceOk != null || isFree || isTradePost) {
    blocks.push({
      className: POST_LIST_TRADE_PRICE_CLASS,
      text: tradePriceLabel ?? postPreviewT(locale, "post_preview_price_inquiry"),
    });
  }

  return {
    thumbnailMode: "generic",
    listKind: "trade",
    listingRowClassName: "flex flex-wrap items-center gap-1.5",
    listingChips,
    listingBold: null,
    bodyBlocks: blocks,
    listFooter: buildListFooter(post, "trade", locationLabel, locale, createdAt),
  };
}
