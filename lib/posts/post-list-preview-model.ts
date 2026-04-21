/**
 * 홈 피드 PostCard 본문과 동일한 문자열·순서 — 채팅 목록/상단 카드와 단일 소스
 */

import { formatPrice, formatTimeAgo, parseMetaAmount } from "@/lib/utils/format";
import { getLocationLabel } from "@/lib/products/form-options";
import { TRADE_SKIN_LABELS } from "@/lib/types/category";
import {
  JOB_LISTING_KIND_LABELS,
  PAY_TYPE_LABELS,
} from "@/lib/jobs/form-options";
import { CURRENCY_SYMBOLS } from "@/lib/exchange/form-options";
import { getExchangeFeedLines } from "@/lib/exchange/exchange-feed-lines";
import {
  hasRealEstateMeta,
  hasUsedCarMeta,
  hasJobsMeta,
  hasExchangeMeta,
} from "@/lib/posts/post-variant";
import { getCarTradeLabelKo } from "@/lib/posts/car-trade-label";
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
export const POST_LIST_CHIP_GRAY_SM = POST_LIST_CHIP_GRAY;
export const POST_LIST_CHIP_AMBER = `${POST_LIST_ROW1_CHIP_BASE} bg-amber-100 text-amber-800`;
export const POST_LIST_CHIP_BLUE = `${POST_LIST_ROW1_CHIP_BASE} bg-blue-50 text-blue-700`;

/** 피드 카드 본문 타이포 — 알바·환전·부동산 등(제목 강조) */
export const POST_LIST_TITLE_CLASS =
  "mt-0.5 line-clamp-2 sam-text-body-lg font-bold leading-snug tracking-tight text-gray-900";
/**
 * 일반 중고 2단(제목)·부동산 3단(스펙)·환전 환율(`POST_LIST_SUBLINE_CLASS`) 등
 * 본문 보조 줄 공통 — 13~14px Regular(400) #4E4E4E; 단 사이는 `mt-0.5`(리스트 밀도)
 */
export const POST_LIST_TRADE_TITLE_CLASS =
  "mt-0.5 line-clamp-2 sam-text-body font-normal leading-snug text-[#4E4E4E]";
/**
 * 환전 1단 `페소 팝니다|삽니다` — 배지와 인라인, `POST_LIST_TRADE_TITLE_CLASS`와 동일 타이포(마진 없음)
 */
export const POST_LIST_EXCHANGE_HEADLINE_CLASS =
  "line-clamp-2 shrink-0 sam-text-body font-normal leading-snug text-[#4E4E4E]";
/**
 * 중고차 리스트 2단(차량명·연식) — 일반 중고와 동일 `mt-0.5` 간격
 */
export const POST_LIST_USED_CAR_SPEC_CLASS =
  "mt-0.5 line-clamp-2 sam-text-body font-normal leading-snug text-[#4E4E4E]";
/**
 * 리스트 3단 금액 본문(마진 없음) — 15~16px Bold(700) `#1A1A1A`.
 * 알바 급여·일반/중고차 가격·환전 페소·부동산 금액(매매/보증금|월세) 등 공통.
 */
export const POST_LIST_PRICE_TEXT_CLASS =
  "sam-text-body-lg font-bold leading-tight text-[#1A1A1A]";

/** 3단 금액 줄 — 윗 단과 간격 `mt-0.5` */
export const POST_LIST_PRICE_CLASS = `mt-0.5 ${POST_LIST_PRICE_TEXT_CLASS}`;
/** 부동산 3단(스펙)·환전 환율 줄 — `POST_LIST_TRADE_TITLE_CLASS`와 동일 타이포 */
export const POST_LIST_SUBLINE_CLASS = POST_LIST_TRADE_TITLE_CLASS;
/** 환전 리스트 3단(환율) — 13~14px Regular(400) #4E4E4E (`POST_LIST_SUBLINE_CLASS`와 동일) */
export const POST_LIST_EXCHANGE_RATE_CLASS = POST_LIST_SUBLINE_CLASS;
/**
 * 리스트 4단 메타 본문(마진 없음) — 11~12px Regular(400) `#9E9E9E`.
 * 알바(근무지|시간)·부동산(위치|시간)·환전(위치|시간)·중고 푸터 `ul` 등 공통.
 */
export const POST_LIST_META_LINE_CLASS =
  "sam-text-helper font-normal leading-snug text-[#9E9E9E]";

/** 리스트 4단 메타 줄 — 윗 단과 간격 `mt-0.5` */
export const POST_LIST_META_TEXT_CLASS = `mt-0.5 ${POST_LIST_META_LINE_CLASS}`;
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
  row?: "seller";
}

export interface PostListPreviewModel {
  thumbnailMode: PostListThumbMode;
  listKind: PostListPreviewListKind;
  /** TradeListingStatusBadge + 칩 (+ 부동산은 금액은 body 2단) */
  listingRowClassName: string;
  listingChips: ListingChip[];
  listingBold: string | null;
  bodyBlocks: PostListBodyBlock[];
  /**
   * PostCard 하단 — 환전만 null.
   * `sellerLine`: 주소·시간 줄(ul) **위** — `profiles`/author_nickname 기반 **닉네임만**(숫자 ID 미표시).
   */
  listFooter: { sellerLine?: string | null; ulClassName: string; items: string[] } | null;
  /** 알바: 1단 `판매중 | 구인유형` — 배지 직후 `|` */
  showPipeAfterListingBadge?: boolean;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
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
): { sellerLine: string | null; ulClassName: string; items: string[] } {
  const sellerLine = sellerNicknameOnlyFromPost(post);
  const t = createdAt && !Number.isNaN(Date.parse(createdAt)) ? formatTimeAgo(createdAt, locale) : "";
  const chatCount = post.comment_count;
  const favCount = post.favorite_count;
  const items: string[] = [];
  if (variant === "uc") {
    if (locationLabel) items.push(locationLabel);
    if (t) items.push(t);
    if (typeof chatCount === "number" && chatCount > 0) items.push(`채팅 ${chatCount}`);
    if (typeof favCount === "number" && favCount > 0) items.push(`관심 ${favCount}`);
  } else {
    if (variant === "trade" && locationLabel) items.push(locationLabel);
    if (t) items.push(t);
    if (typeof chatCount === "number" && chatCount > 0) items.push(`채팅 ${chatCount}`);
    if (typeof favCount === "number" && favCount > 0) items.push(`관심 ${favCount}`);
  }
  /** ul 은 `sellerLine` 아래 두 번째 줄 — 블록 전체 `mt-1` 은 PostListPreviewColumn 래퍼에서 */
  const ulClassName = `flex flex-wrap items-center gap-x-2 gap-y-0.5 ${POST_LIST_META_LINE_CLASS}`;
  return { sellerLine, ulClassName, items };
}

/** 부동산 리스트 2단 — 매매가 또는 보증금 | 월세(리스트는 `POST_LIST_PRICE_CLASS`로 표시) */
function getRealEstateRow2PriceLabel(
  price: number | null | undefined,
  meta: Record<string, unknown>,
  currency: string
): string {
  const dealType = str(meta.deal_type);
  if (dealType === "판매" && price != null) return `매매 ${formatPrice(price, currency)}`;
  if (dealType === "임대") {
    const d = meta.deposit != null ? String(meta.deposit).trim() : "";
    const m = meta.monthly != null ? String(meta.monthly).trim() : "";
    if (d || m) {
      return `보증금 ${formatPrice(parseMetaAmount(meta.deposit), currency)} | 월세 ${formatPrice(parseMetaAmount(meta.monthly), currency)}`;
    }
  }
  if (price != null) return formatPrice(price, currency);
  return "";
}

/** 일반 중고거래: API에 type이 비어 있거나 다르게 와도 price가 있으면 금액 표시 */
function rowPriceLabel(
  price: number | null | undefined,
  isFree: boolean,
  currency: string
): string | null {
  if (isFree) return "무료나눔";
  if (price != null && !Number.isNaN(price)) return formatPrice(price, currency);
  return null;
}

export function buildPostListPreviewModel(
  post: Record<string, unknown> | undefined,
  opts: { currency: string; locale: string; skinKey?: string }
): PostListPreviewModel | null {
  if (!post) return null;

  const skinKey = opts.skinKey;
  const meta = (post.meta && typeof post.meta === "object" && !Array.isArray(post.meta)
    ? (post.meta as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const region = str(post.region);
  const city = str(post.city);
  const locationLabel = region && city ? getLocationLabel(region, city) : null;
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

  const skinLabel = skinKey ? TRADE_SKIN_LABELS[skinKey] ?? skinKey : null;
  const isDirectDeal = isTradePost && meta.direct_deal === true;

  const isRealEstate = skinKey === "real-estate" || (!skinKey && hasRealEstateMeta(meta));
  const isUsedCar = skinKey === "used-car" || (!skinKey && hasUsedCarMeta(meta));
  const isJobs = skinKey === "jobs" || skinKey === "job" || (!skinKey && hasJobsMeta(meta));
  const isExchange = skinKey === "exchange" || (!skinKey && hasExchangeMeta(meta));

  /** PostCard와 동일: 부동산 스킨이어도 meta 비어 있으면 일반 거래 블록으로 */
  if (isRealEstate && Object.keys(meta).length > 0) {
    const dealType = str(meta.deal_type);
    const row2Price = getRealEstateRow2PriceLabel(priceOk, meta, currency);
    const estateType = str(meta.estate_type);
    const sizeSq = meta.size_sq ?? meta.area_sqm;
    const sizeSqStr =
      sizeSq != null && String(sizeSq).trim() ? `${String(sizeSq).trim()} sq` : "";
    const room = str(meta.room_count);
    const bath = str(meta.bathroom_count);
    const parts3 = [
      estateType,
      sizeSqStr,
      room && `방 ${room}개`,
      bath && `욕실 ${bath}개`,
    ].filter(Boolean);
    const row3 = parts3.join(" · ");

    const timePart =
      createdAt && !Number.isNaN(Date.parse(createdAt))
        ? formatTimeAgo(createdAt, locale)
        : "";
    const row4 = `${locationLabel || "위치 미입력"}${timePart ? ` | ${timePart}` : ""}`.trim();

    const listingChips: ListingChip[] = [];
    if (dealType) listingChips.push({ text: dealType, className: POST_LIST_CHIP_GRAY });

    const blocks: PostListBodyBlock[] = [
      {
        className: POST_LIST_PRICE_CLASS,
        text: row2Price || "금액 문의",
      },
    ];
    if (row3)
      blocks.push({
        className: POST_LIST_SUBLINE_CLASS,
        text: row3,
      });
    const sellerNick = sellerNicknameOnlyFromPost(post);
    if (sellerNick) {
      blocks.push({
        className: `mt-0.5 ${POST_LIST_META_LINE_CLASS}`,
        text: sellerNick,
        row: "seller",
      });
    }
    blocks.push({
      className: POST_LIST_META_TEXT_CLASS,
      text: row4,
    });

    return {
      thumbnailMode: "none",
      listKind: "real-estate",
      listingRowClassName: "flex flex-wrap items-center gap-1.5",
      listingChips,
      listingBold: null,
      bodyBlocks: blocks,
      listFooter: null,
      showPipeAfterListingBadge: listingChips.length > 0,
    };
  }

  if (isUsedCar) {
    const carModel = str(meta.car_model);
    const yearRaw = str(meta.car_year_max) || str(meta.car_year);
    const yearPart =
      yearRaw && /^\d{4}$/.test(yearRaw) ? `${yearRaw}년` : yearRaw;
    const carSpecLine = [carModel, yearPart].filter(Boolean).join(" · ");
    const usedCarPriceLabel = isFree
      ? "무료나눔"
      : priceOk != null
        ? formatPrice(priceOk, currency)
        : null;

    const tradeLabel = getCarTradeLabelKo(meta);
    const listingChips: ListingChip[] = [];
    if (tradeLabel) listingChips.push({ text: tradeLabel, className: POST_LIST_CHIP_GRAY });

    const blocks: PostListBodyBlock[] = [];
    if (carSpecLine) {
      blocks.push({
        className: POST_LIST_USED_CAR_SPEC_CLASS,
        text: carSpecLine,
      });
    }
    blocks.push({
      className: POST_LIST_PRICE_CLASS,
      text: usedCarPriceLabel ?? "가격 문의",
    });

    return {
      thumbnailMode: "none",
      listKind: "used-car",
      listingRowClassName: "flex flex-wrap items-center gap-1.5",
      listingChips,
      listingBold: null,
      bodyBlocks: blocks,
      listFooter: buildListFooter(post, "uc", locationLabel, locale, createdAt),
      showPipeAfterListingBadge: listingChips.length > 0,
    };
  }

  if (isJobs) {
    const kindRaw = str(meta.listing_kind);
    const legacyJobType = str(meta.job_type);
    const listingKindLabel =
      kindRaw && JOB_LISTING_KIND_LABELS[kindRaw]
        ? JOB_LISTING_KIND_LABELS[kindRaw]
        : legacyJobType === "seek"
          ? JOB_LISTING_KIND_LABELS.work
          : JOB_LISTING_KIND_LABELS.hire;
    const payTypeMeta = str(meta.pay_type);
    const payAmountNum =
      meta.pay_amount != null ? Number(meta.pay_amount) : priceOk != null ? priceOk : null;
    const jobsPayLabel =
      payAmountNum != null && !Number.isNaN(payAmountNum)
        ? `${PAY_TYPE_LABELS[payTypeMeta] ?? payTypeMeta} ${formatPrice(payAmountNum, currency)}`
        : null;
    const workAddressLabel = str(meta.work_address) || locationLabel || "";

    const listingChips: ListingChip[] = [];
    if (listingKindLabel) {
      listingChips.push({ text: listingKindLabel, className: POST_LIST_CHIP_AMBER });
    }
    const wt = str(meta.work_term);
    if (wt === "short" || wt === "one_day") {
      listingChips.push({ text: "단기", className: POST_LIST_CHIP_GRAY });
    }
    if (meta.same_day_pay === true) {
      listingChips.push({ text: "당일지급", className: POST_LIST_CHIP_BLUE });
    }

    const timePart =
      createdAt && !Number.isNaN(Date.parse(createdAt))
        ? formatTimeAgo(createdAt, locale)
        : "";
    const row4 = `${workAddressLabel || "위치 미입력"}${timePart ? ` | ${timePart}` : ""}`.trim();

    /** 2단 공고 제목 — 13~14px Regular #4E4E4E (`POST_LIST_TRADE_TITLE_CLASS`) */
    const blocks: PostListBodyBlock[] = [
      {
        className: POST_LIST_TRADE_TITLE_CLASS,
        text: str(post.title) || "상품",
      },
      {
        className: POST_LIST_PRICE_CLASS,
        text: jobsPayLabel ?? "금액 문의",
      },
    ];
    const jobSellerNick = sellerNicknameOnlyFromPost(post);
    if (jobSellerNick) {
      blocks.push({
        className: `mt-0.5 ${POST_LIST_META_LINE_CLASS}`,
        text: jobSellerNick,
        row: "seller",
      });
    }
    blocks.push({
      className: POST_LIST_META_TEXT_CLASS,
      text: row4,
    });

    return {
      thumbnailMode: "none",
      listKind: "jobs",
      listingRowClassName: "flex flex-wrap items-center gap-1.5",
      listingChips,
      listingBold: null,
      bodyBlocks: blocks,
      listFooter: null,
      showPipeAfterListingBadge: listingChips.length > 0,
    };
  }

  if (isExchange) {
    const { phpAmount, rateLine } = getExchangeFeedLines(meta, priceOk);
    const phpText =
      phpAmount != null && !Number.isNaN(phpAmount)
        ? `${CURRENCY_SYMBOLS.PHP} ${phpAmount.toLocaleString()}`
        : "금액 문의";
    const rateText = rateLine ? `환율 ${rateLine}` : "환율 미지정";

    const locTime =
      `${locationLabel || "위치 미입력"} | ${createdAt && !Number.isNaN(Date.parse(createdAt)) ? formatTimeAgo(createdAt, locale) : ""}`.replace(
        /\s*\|\s*$/,
        ""
      );

    /** 1단 `페소 팝니다|삽니다` — 13~14px Regular(400) #4E4E4E */
    const titleStr = str(post.title);
    const isBuy = exchangeListingIsBuy(meta, titleStr);
    const exchangeHeadline = titleStr || (isBuy ? "페소 삽니다" : "페소 팝니다");
    const listingChips: ListingChip[] = [
      {
        text: exchangeHeadline,
        className: POST_LIST_EXCHANGE_HEADLINE_CLASS,
      },
    ];

    /** 2단 페소 금액 — `POST_LIST_PRICE_CLASS` */
    const blocks: PostListBodyBlock[] = [
      {
        className: POST_LIST_PRICE_CLASS,
        text: phpText,
      },
      /** 3단 환율 — 13~14px Regular #4E4E4E (`POST_LIST_EXCHANGE_RATE_CLASS`) */
      {
        className: POST_LIST_EXCHANGE_RATE_CLASS,
        text: rateText,
      },
    ];
    const exSellerNick = sellerNicknameOnlyFromPost(post);
    if (exSellerNick) {
      blocks.push({
        className: `mt-0.5 ${POST_LIST_META_LINE_CLASS}`,
        text: exSellerNick,
        row: "seller",
      });
    }
    /** 4단 위치|시간 — `POST_LIST_EXCHANGE_META_CLASS` */
    blocks.push({ className: POST_LIST_EXCHANGE_META_CLASS, text: locTime });

    return {
      thumbnailMode: "exchange",
      listKind: "exchange",
      listingRowClassName: "flex flex-wrap items-center gap-1.5",
      listingChips,
      listingBold: null,
      bodyBlocks: blocks,
      listFooter: null,
      showPipeAfterListingBadge: true,
    };
  }

  const listingChips: ListingChip[] = [];
  if (skinLabel) listingChips.push({ text: skinLabel, className: POST_LIST_CHIP_GRAY_SM });
  if (isDirectDeal) listingChips.push({ text: "직거래", className: POST_LIST_CHIP_BLUE });

  const tradePriceLabel = rowPriceLabel(priceOk, isFree, currency);

  const blocks: PostListBodyBlock[] = [
    {
      className: POST_LIST_TRADE_TITLE_CLASS,
      text: str(post.title) || "상품",
    },
  ];
  if (priceOk != null || isFree || isTradePost) {
    blocks.push({
      className: POST_LIST_PRICE_CLASS,
      text: tradePriceLabel ?? "가격 문의",
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
