"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PostWithMeta } from "@/lib/posts/schema";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { getCategoryBySlugOrId } from "@/lib/categories/getCategoryById";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import { formatPrice, formatTimeAgo, parseMetaAmount, sqToPyeong } from "@/lib/utils/format";
import { getLocationLabel } from "@/lib/products/form-options";
import { getUserProfile } from "@/lib/users/getUserProfile";
import { getPostsByAuthor } from "@/lib/posts/getPostsByAuthor";
import { getSimilarPosts } from "@/lib/posts/getSimilarPosts";
import { getFavoriteStatus } from "@/lib/favorites/getFavoriteStatus";
import { toggleFavorite } from "@/lib/favorites/toggleFavorite";
import { createReport } from "@/lib/reports/createReport";
import { createOrGetChatRoom } from "@/lib/chat/createOrGetChatRoom";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import { startCommunityInquiry } from "@/lib/chat/startCommunityInquiry";
import { PostCommunityCommentsSection } from "@/components/post/PostCommunityCommentsSection";
import { incrementPostViewCount } from "@/lib/posts/incrementViewCount";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getAppSettings } from "@/lib/app-settings";
import { TRADE_SKIN_LABELS } from "@/lib/types/category";
import { JOB_TYPE_LABELS, WORK_TERM_LABELS, PAY_TYPE_LABELS } from "@/lib/jobs/form-options";
import { CURRENCY_SYMBOLS, formatPrepKeysForDisplay } from "@/lib/exchange/form-options";
import { useWriteCategory } from "@/contexts/WriteCategoryContext";
import { PostCard } from "./PostCard";
import { ProductImageGallery } from "@/components/product/detail/ProductImageGallery";
import {
  PRODUCT_DETAIL_BOTTOM_BAR,
  PRODUCT_DETAIL_CTA_BUTTON,
} from "@/components/product/detail/product-detail-bottom-constants";
import { TradeListingStatusBadge } from "@/components/post/TradeListingStatusBadge";
import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";
import { getCarTradeLabelKo } from "@/lib/posts/car-trade-label";
import { PostSellerTradeStrip } from "@/components/trade/PostSellerTradeStrip";
import { SELLER_CANCEL_SALE_CONFIRM_MESSAGE } from "@/lib/posts/seller-cancel-sale-ui";
import { shouldBlockNewItemChatForBuyer } from "@/lib/trade/reserved-item-chat";
import { MannerBatteryInline } from "@/components/trust/MannerBatteryDisplay";
import { PostDetailMoreBottomSheet } from "@/components/post/PostDetailMoreBottomSheet";
import { PostDetailSellerMoreSheet } from "@/components/post/PostDetailSellerMoreSheet";
import {
  PostDetailStickyNavBar,
  POST_DETAIL_IMAGE_INSET_BELOW_MAIN_TOP_PX,
  POST_DETAIL_NAV_STACK_BOTTOM_PX,
} from "@/components/post/PostDetailStickyNavBar";

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
    meta.job_type != null ||
    meta.work_category != null ||
    meta.work_term != null ||
    meta.pay_type != null ||
    meta.company_name != null
  );
}

function JobsMetaBlock({
  meta,
  price,
  currency,
}: {
  meta: Record<string, unknown>;
  price?: number | null;
  currency: string;
}) {
  const jobType = (meta.job_type as string)?.trim();
  const workCategory = (meta.work_category as string)?.trim();
  const workTerm = (meta.work_term as string)?.trim();
  const workDateStart = (meta.work_date_start as string)?.trim();
  const workDateEnd = (meta.work_date_end as string)?.trim();
  const workTimeStart = (meta.work_time_start as string)?.trim();
  const workTimeEnd = (meta.work_time_end as string)?.trim();
  const workNegotiable = meta.work_negotiable === true;
  const payType = (meta.pay_type as string)?.trim();
  const payAmount = meta.pay_amount != null ? Number(meta.pay_amount) : price ?? null;
  const sameDayPay = meta.same_day_pay === true;
  const noMinors = meta.no_minors === true;
  const companyName = (meta.company_name as string)?.trim();
  const workAddress = (meta.work_address as string)?.trim();
  const contactPhone = (meta.contact_phone as string)?.trim();
  const noPhoneCalls = meta.no_phone_calls === true;

  const payLabel =
    payAmount != null && !Number.isNaN(payAmount)
      ? `${PAY_TYPE_LABELS[payType] ?? payType} ${formatPrice(payAmount, currency)}${sameDayPay ? " (당일 지급)" : ""}`
      : null;

  const dateRange =
    workDateStart && workDateEnd
      ? `${workDateStart} ~ ${workDateEnd}`
      : workDateStart
        ? workDateStart
        : null;
  const timeRange =
    workTimeStart && workTimeEnd ? `${workTimeStart} ~ ${workTimeEnd}` : workTimeStart ? workTimeStart : null;

  const rows: { label: string; value: string }[] = [];
  if (jobType) rows.push({ label: "구인 유형", value: JOB_TYPE_LABELS[jobType] ?? jobType });
  if (workCategory) rows.push({ label: "업종", value: workCategory });
  if (workTerm) rows.push({ label: "근무 조건", value: WORK_TERM_LABELS[workTerm] ?? workTerm });
  if (dateRange) rows.push({ label: "일하는 날짜", value: dateRange });
  if (timeRange) rows.push({ label: "일하는 시간", value: timeRange + (workNegotiable ? " (협의 가능)" : "") });
  if (payLabel) rows.push({ label: "급여", value: payLabel });
  if (noMinors) rows.push({ label: "미성년자", value: "불가" });
  if (companyName) rows.push({ label: "업체명", value: companyName });
  if (workAddress) rows.push({ label: "일하는 장소", value: workAddress });
  if (contactPhone) rows.push({ label: "연락처", value: noPhoneCalls ? "전화 안 받기" : contactPhone });

  if (rows.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/80 p-4">
      <h3 className="mb-3 text-[15px] font-semibold text-gray-700">알바 정보</h3>
      <dl className="space-y-2.5 text-[14px]">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="shrink-0 text-gray-500">{label}</dt>
            <dd className="min-w-0 text-right font-medium text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
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
        ? <>1 PHP = {rateBase.toLocaleString(undefined, { maximumFractionDigits: 2 })} KRW <span className="font-bold text-gray-900">+{ratePlus}</span></>
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
    <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/80 p-4">
      <h3 className="mb-3 text-[15px] font-semibold text-gray-700">환전 정보</h3>
      <dl className="space-y-2.5 text-[14px]">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex justify-between gap-3 items-center">
            <dt className="shrink-0 text-gray-500">{label}</dt>
            <dd className="min-w-0 text-right font-medium text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
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
    if (meta.car_model != null && String(meta.car_model).trim())
      rows.push({ label: "차종", value: String(meta.car_model).trim() });
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
    <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/80 p-4">
      <h3 className="mb-3 text-[15px] font-semibold text-gray-700">차량 정보</h3>
      <dl className="space-y-2.5 text-[14px]">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="shrink-0 text-gray-500">{label}</dt>
            <dd className="min-w-0 text-right font-medium text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
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
  compactTop,
}: {
  meta: Record<string, unknown>;
  salePrice: number | null;
  currency: string;
  regionId?: string | null;
  cityId?: string | null;
  compactTop?: boolean;
}) {
  const dealType = (meta.deal_type as string | undefined)?.trim();
  const regionLabel = regionId && cityId ? getLocationLabel(regionId, cityId) : null;

  const rows: { label: string; value: string }[] = [];

  if (regionLabel) rows.push({ label: "지역", value: regionLabel });
  if (meta.neighborhood != null && String(meta.neighborhood).trim())
    rows.push({ label: "동네", value: String(meta.neighborhood) });
  if (meta.building_name != null && String(meta.building_name).trim())
    rows.push({ label: "건물명", value: String(meta.building_name) });
  if (meta.estate_type != null && String(meta.estate_type).trim())
    rows.push({ label: "타입", value: String(meta.estate_type) });
  if (meta.deal_type != null && String(meta.deal_type).trim())
    rows.push({ label: "거래유형", value: String(meta.deal_type) });

  if (dealType === "판매" && salePrice != null)
    rows.push({ label: "판매가", value: formatPrice(salePrice, currency) });
  if (dealType === "임대") {
    if (meta.deposit != null && String(meta.deposit).trim())
      rows.push({ label: "보증금", value: formatPrice(parseMetaAmount(meta.deposit), currency) });
    if (meta.monthly != null && String(meta.monthly).trim())
      rows.push({ label: "월세", value: formatPrice(parseMetaAmount(meta.monthly), currency) });
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

  const half = Math.ceil(rows.length / 2);
  const leftRows = rows.slice(0, half);
  const rightRows = rows.slice(half);

  return (
    <div className={`rounded-xl border border-gray-200 bg-gray-50/80 p-4 ${compactTop ? "mt-1" : "mt-4"}`}>
      <h3 className="mb-3 text-[15px] font-semibold text-gray-700">부동산 정보</h3>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-x-0 gap-y-4 text-[14px] items-stretch">
        <dl className="space-y-4 pr-6">
          {leftRows.map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="shrink-0 text-gray-500">{label}</dt>
              <dd className="min-w-0 text-right font-medium text-gray-900 truncate" title={value}>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="w-px bg-gray-200 self-stretch" aria-hidden />
        <dl className="space-y-4 pl-6">
          {rightRows.map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="shrink-0 text-gray-500">{label}</dt>
              <dd className="min-w-0 text-right font-medium text-gray-900 truncate" title={value}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
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
    <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <span className="text-[11px] font-medium text-gray-500">
        {TRADE_SKIN_LABELS[skinKey] ?? skinKey}
      </span>
      <ul className="mt-2 space-y-1 text-[13px] text-gray-700">
        {entries.map(([key, label, value]) => (
          <li key={key}>
            <span className="text-gray-500">{label}</span> {value}
          </li>
        ))}
      </ul>
    </div>
  );
}

const LOGIN_REDIRECT = "/my/account";

function postMatchesAuthorSalesTab(
  p: PostWithMeta,
  tab: "all" | "trading" | "done"
): boolean {
  const st = (p.status ?? "").toLowerCase();
  const ls = normalizeSellerListingState(p.seller_listing_state, p.status);
  if (tab === "all") return true;
  if (tab === "done") return st === "sold" || ls === "completed";
  return st !== "sold" && ls !== "completed";
}

interface PostDetailViewProps {
  post: PostWithMeta;
}

export function PostDetailView({ post }: PostDetailViewProps) {
  const router = useRouter();
  const user = getCurrentUser();

  const [backHref, setBackHref] = useState("/home");
  const [category, setCategory] = useState<CategoryWithSettings | null>(null);
  const [author, setAuthor] = useState<{
    nickname: string | null;
    avatar_url: string | null;
    temperature?: number;
    speed?: number;
  } | null>(null);
  const [otherPosts, setOtherPosts] = useState<PostWithMeta[]>([]);
  const [authorSalesTab, setAuthorSalesTab] = useState<"all" | "trading" | "done">("all");
  const [similarPosts, setSimilarPosts] = useState<PostWithMeta[]>([]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteCount, setFavoriteCount] = useState(() => {
    const n = post.favorite_count;
    return typeof n === "number" && Number.isFinite(n) ? n : 0;
  });
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  /** 거래 글: 이 글·본인·판매자 기준으로 이미 열린 채팅방 (상품↔채팅 연동) */
  const [existingTradeRoomId, setExistingTradeRoomId] = useState<string | null>(null);
  const [detailMoreOpen, setDetailMoreOpen] = useState(false);
  const [sellerMoreOpen, setSellerMoreOpen] = useState(false);
  const [cancelSaleBusy, setCancelSaleBusy] = useState(false);

  /** 일반 글 상세: 이미지 히어로가 RegionBar 아래 네비 줄을 지나면 배경·구분선 표시 */
  const detailHeroRef = useRef<HTMLDivElement>(null);
  const [detailNavSolid, setDetailNavSolid] = useState(false);
  const updateDetailNavSolid = useCallback(() => {
    const el = detailHeroRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const navBottom = POST_DETAIL_NAV_STACK_BOTTOM_PX;
    setDetailNavSolid(rect.bottom < navBottom + 10);
  }, []);

  useEffect(() => {
    updateDetailNavSolid();
    window.addEventListener("scroll", updateDetailNavSolid, { passive: true });
    window.addEventListener("resize", updateDetailNavSolid);
    return () => {
      window.removeEventListener("scroll", updateDetailNavSolid);
      window.removeEventListener("resize", updateDetailNavSolid);
    };
  }, [updateDetailNavSolid]);

  useLayoutEffect(() => {
    const el = detailHeroRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateDetailNavSolid());
    ro.observe(el);
    updateDetailNavSolid();
    return () => ro.disconnect();
  }, [updateDetailNavSolid, post.id]);

  const appSettings = getAppSettings();
  const chatEnabled = appSettings.chatEnabled !== false;
  const allowChatAfterSold = appSettings.allowChatAfterSold === true;
  const reportEnabled = appSettings.reportEnabled !== false;
  const defaultCurrency = appSettings.defaultCurrency || "KRW";

  const listingOwnerId = postAuthorUserId(post as unknown as Record<string, unknown>);

  useEffect(() => {
    incrementPostViewCount(post.id);
  }, [post.id]);

  useEffect(() => {
    if (!user?.id || post.type === "community") {
      setExistingTradeRoomId(null);
      return;
    }
    if (listingOwnerId && user.id === listingOwnerId) {
      setExistingTradeRoomId(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/chat/item/room-id?itemId=${encodeURIComponent(post.id)}`)
      .then((res) => (res.ok ? res.json() : { roomId: null }))
      .then((data) => {
        if (!cancelled) setExistingTradeRoomId(typeof data?.roomId === "string" ? data.roomId : null);
      })
      .catch(() => {
        if (!cancelled) setExistingTradeRoomId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [post.id, post.type, user?.id, listingOwnerId]);

  const writeCtx = useWriteCategory();

  useEffect(() => {
    getCategoryBySlugOrId(post.category_id).then((c) => {
      if (c) {
        setCategory(c);
        setBackHref(getCategoryHref(c));
      }
    });
  }, [post.category_id]);

  useEffect(() => {
    if (!category || !writeCtx) return;
    const segment = category.slug?.trim() || String(category.id);
    writeCtx.setWriteCategorySlug(segment);
    return () => writeCtx.setWriteCategorySlug(null);
  }, [category, writeCtx]);

  useEffect(() => {
    getUserProfile(post.author_id).then(setAuthor);
  }, [post.author_id]);

  useEffect(() => {
    getPostsByAuthor(post.author_id).then((list) =>
      setOtherPosts(list.filter((p) => p.id !== post.id).slice(0, 36))
    );
  }, [post.author_id, post.id]);

  const filteredAuthorPosts = useMemo(
    () => otherPosts.filter((p) => postMatchesAuthorSalesTab(p, authorSalesTab)),
    [otherPosts, authorSalesTab]
  );

  useEffect(() => {
    getSimilarPosts(post.id, post.category_id, 6).then(setSimilarPosts);
  }, [post.id, post.category_id]);

  useEffect(() => {
    getFavoriteStatus(post.id).then(setIsFavorite);
  }, [post.id]);

  useEffect(() => {
    const n = post.favorite_count;
    setFavoriteCount(typeof n === "number" && Number.isFinite(n) ? n : 0);
  }, [post.id, post.favorite_count]);

  const isOwnPost = Boolean(user?.id && listingOwnerId && user.id === listingOwnerId);

  const handleFavorite = useCallback(async () => {
    if (!user?.id) {
      router.push(LOGIN_REDIRECT);
      return;
    }
    if (listingOwnerId && user.id === listingOwnerId) return;
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
  }, [post.id, listingOwnerId, user, router, isFavorite, favoriteCount]);

  const handleReport = useCallback(async () => {
    if (!user?.id) {
      router.push(LOGIN_REDIRECT);
      return;
    }
    if (!reportReason.trim()) return;
    setReportError("");
    setReportSubmitting(true);
    try {
      const res = await createReport(post.id, reportReason.trim());
      if (res.ok) {
        setReportOpen(false);
        setReportReason("");
        setReportError("");
      } else {
        setReportError(res.error ?? "신고 접수에 실패했습니다.");
      }
    } finally {
      setReportSubmitting(false);
    }
  }, [post.id, reportReason, user, router]);

  const chatBlockedByOtherReservation = useMemo(() => {
    if (post.type === "community") return false;
    if (!user?.id) return false;
    if (listingOwnerId && user.id === listingOwnerId) return false;
    if (existingTradeRoomId) return false;
    return shouldBlockNewItemChatForBuyer(post as unknown as Record<string, unknown>, user.id);
  }, [post, user?.id, listingOwnerId, existingTradeRoomId]);

  const handleChat = useCallback(async () => {
    setChatError("");
    if (!user?.id) {
      router.push(LOGIN_REDIRECT);
      return;
    }
    if (post.type !== "community" && existingTradeRoomId) {
      router.push(`/chats/${existingTradeRoomId}`);
      return;
    }
    const authorId = postAuthorUserId(post as unknown as Record<string, unknown>)?.trim();
    if (post.type === "community") {
      if (!authorId) {
        setChatError("작성자 정보를 찾을 수 없습니다.");
        return;
      }
      if (user.id === authorId) {
        setChatError("본인 글에는 문의하기를 사용할 수 없습니다.");
        return;
      }
      setChatLoading(true);
      const res = await startCommunityInquiry(post.id, authorId, null);
      setChatLoading(false);
      if (res.ok) {
        router.push(`/chats/${res.roomId}`);
      } else {
        setChatError(res.error ?? "채팅방을 열 수 없습니다.");
      }
      return;
    }
    const tradeOwnerId = postAuthorUserId(post as unknown as Record<string, unknown>);
    if (tradeOwnerId && user.id === tradeOwnerId) {
      setChatError("내 상품에는 채팅할 수 없습니다.");
      return;
    }
    if (chatBlockedByOtherReservation) {
      setChatError("다른 분과 예약이 진행 중인 상품입니다. 예약자가 아니면 새 채팅을 열 수 없어요.");
      return;
    }
    setChatLoading(true);
    const res = await createOrGetChatRoom(post.id);
    setChatLoading(false);
    if (res.ok) {
      router.push(`/chats/${res.roomId}`);
    } else {
      setChatError(res.error ?? "채팅방을 열 수 없습니다.");
    }
  }, [post.id, post.type, post.author_id, user, router, existingTradeRoomId, chatBlockedByOtherReservation]);

  const showSellerCancelBar =
    isOwnPost &&
    post.type !== "community" &&
    !["hidden", "sold", "deleted", "blinded"].includes(String(post.status ?? "").toLowerCase());

  const runCancelOwnSale = useCallback(async () => {
    setCancelSaleBusy(true);
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
      setCancelSaleBusy(false);
    }
  }, [post.id, router]);

  const isSold = post.status === "sold";
  const showPrice =
    (post.type === "trade" || post.price != null || post.is_free_share === true) &&
    (category == null || category.settings?.has_price !== false);
  const showChat =
    chatEnabled && (category == null || category.settings?.has_chat !== false);
  const chatCtaLabel = post.type === "community" ? "문의하기" : "채팅하기";
  const tradeChatCtaLabel =
    post.type !== "community" && existingTradeRoomId ? "채팅 이어가기" : chatCtaLabel;

  const showLocation =
    (category == null || category.settings?.has_location !== false) &&
    !!(post.region && post.city);

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

  if (isRealEstateDetail) {
    const imgList =
      Array.isArray(post.images) && post.images.length > 0
        ? post.images.filter((s): s is string => typeof s === "string")
        : post.thumbnail_url
          ? [post.thumbnail_url]
          : [];
    return (
      <div className="max-w-lg mx-auto pb-24">
        <PostDetailStickyNavBar
          detailNavSolid={detailNavSolid}
          backHref={backHref}
          isOwnPost={isOwnPost}
          onOpenMore={() => setDetailMoreOpen(true)}
          onOpenSellerMore={showSellerCancelBar ? () => setSellerMoreOpen(true) : undefined}
        />

        {/* 1. 이미지 — 1단~이미지 2px(패딩), 스크롤 판별은 갤러리 래퍼 ref */}
        <div className="bg-white">
          <div
            className="relative w-full bg-gray-100"
            style={{ paddingTop: POST_DETAIL_IMAGE_INSET_BELOW_MAIN_TOP_PX }}
          >
            <div ref={detailHeroRef} className="relative w-full">
              {imgList.length > 0 ? (
                <ProductImageGallery images={imgList} title={post.title ?? ""} />
              ) : (
                <div className="flex aspect-square max-h-[320px] w-full items-center justify-center text-gray-400">
                  이미지
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. 프로필 카드 */}
        <div className="border-b border-gray-100 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 overflow-hidden bg-gray-200">
              {author?.avatar_url ? <img src={author?.avatar_url} alt="" className="h-full w-full object-cover" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-gray-900">{author?.nickname ?? "사용자"}</p>
              {(post.region || post.city) && (
                <p className="text-[12px] text-gray-500">{getLocationLabel(post.region!, post.city!)}</p>
              )}
            </div>
            <div className="shrink-0 flex justify-end">
              <MannerBatteryInline
                raw={author?.speed ?? author?.temperature ?? 50}
                size="sm"
                align="end"
              />
            </div>
          </div>
        </div>

        {/* 3. 부동산 정보: 제목 → 매물 설명 → 테이블, 좌우 여백 0 (하단 흰색 제거) */}
        <div className="border-t border-gray-100 bg-white px-0 pt-2 pb-0">
          <div className="mb-2 px-4">
            <TradeListingStatusBadge post={post} size="detail" />
          </div>
          <h2 className="mb-2 text-[16px] font-bold text-gray-900 px-4">{post.title}</h2>
          {post.content && (
            <div className="mt-2 mb-0 rounded-xl border border-gray-200 bg-gray-50/80 p-4">
              <h3 className="mb-2 text-[15px] font-semibold text-gray-700">매물 설명</h3>
              <p className="text-[14px] text-gray-700 whitespace-pre-wrap">{post.content}</p>
            </div>
          )}
          <RealEstateMetaBlock
            meta={reMeta}
            salePrice={post.price ?? null}
            currency={defaultCurrency}
            regionId={post.region}
            cityId={post.city}
            compactTop
          />
          <ul className="mt-2 space-y-1 border-t border-gray-100 px-4 py-3 text-[13px] text-gray-600">
            {(() => {
              const s = [post.view_count != null && `조회 ${post.view_count}`, !isOwnPost && `관심 ${favoriteCount}`].filter(Boolean).join(" · ");
              return s ? <li>{s}</li> : null;
            })()}
          </ul>
        </div>

        {/* 4. 비슷한 조건의 매물 더보기 (하단 고정바 바로 위) */}
        {similarPosts.length > 0 && (
          <div className="mt-4 border-t border-gray-100 bg-white px-4 py-4">
            <Link
              href={backHref}
              className="flex items-center justify-between text-[14px] font-medium text-gray-800"
            >
              <span>비슷한 조건의 매물 더보기</span>
              <span className="text-gray-400">›</span>
            </Link>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {similarPosts.slice(0, 6).map((p) => {
                const pMeta = (p.meta as Record<string, unknown> | undefined) ?? {};
                const pDeal = (pMeta.deal_type as string)?.trim();
                const pEstateType = (pMeta.estate_type as string)?.trim() ?? "";
                const pSize = pMeta.size_sq ?? pMeta.area_sqm;
                const pSizeStr = pSize != null && String(pSize).trim() ? `${String(pSize).trim()}㎡` : "";
                const pRoom = (pMeta.room_count as string)?.trim() || "";
                const pBath = (pMeta.bathroom_count as string)?.trim() || "";
                const pRoomBath = [pRoom && `방 ${pRoom}개`, pBath && `욕실 ${pBath}개`].filter(Boolean).join(" / ");
                const pMgmtFee = (pMeta.management_fee as string)?.trim();
                const pMgmtText = !pMgmtFee || pMgmtFee === "0" ? "관리비 없음" : `관리비 ${pMgmtFee}만원`;
                const pLocationLabel = p.region && p.city ? getLocationLabel(p.region, p.city) : null;
                const pBuildingName = (pMeta.building_name as string)?.trim() || "";
                const pLocationBuilding = [pLocationLabel, pBuildingName].filter(Boolean).join(" ");
                const pPriceLabel =
                  pDeal === "판매" && p.price != null
                    ? `매매 ${formatPrice(p.price, defaultCurrency)}`
                    : pDeal === "임대"
                      ? `보증금 ${formatPrice(parseMetaAmount(pMeta.deposit), defaultCurrency)} | 월세 ${formatPrice(parseMetaAmount(pMeta.monthly), defaultCurrency)}`
                      : p.price != null
                        ? formatPrice(p.price, defaultCurrency)
                        : "";
                const thumb = p.thumbnail_url || (Array.isArray(p.images) && p.images[0] ? p.images[0] : null);
                const pIsExchange = hasExchangeMeta(pMeta);
                return (
                  <Link key={p.id} href={`/post/${p.id}`} className="block">
                    <div className="overflow-hidden border border-gray-100 bg-gray-50">
                      <div className="aspect-[4/3] w-full bg-gray-100">
                        {thumb ? (
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        ) : pIsExchange ? (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-emerald-50 text-2xl font-semibold text-gray-700" aria-hidden><span>₱</span><span className="text-[10px] text-gray-500">↔</span><span>₩</span></div>
                        ) : (
                          <div className="flex h-full items-center justify-center text-[11px] text-gray-400">이미지</div>
                        )}
                      </div>
                      <div className="p-2">
                        <p className="text-[12px] text-gray-600">
                          {[pEstateType, pSizeStr, pRoomBath].filter(Boolean).join(" · ") || p.title}
                        </p>
                        {pPriceLabel && <p className="mt-0.5 text-[13px] font-bold text-gray-900">{pPriceLabel}</p>}
                        <p className="mt-0.5 line-clamp-1 text-[12px] text-gray-500">
                          {pMgmtText}
                          {pLocationBuilding && <> · <span className="font-semibold text-gray-700">{pLocationBuilding}</span></>}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* 하단 고정: 상품 상세와 동일 규격(찜 + 가격 + 채팅) — 본인 글은 찜 숨김 */}
        <div className={`${PRODUCT_DETAIL_BOTTOM_BAR} z-30`}>
          {!isOwnPost && (
            <button
              type="button"
              onClick={handleFavorite}
              className="flex shrink-0 flex-col items-center justify-center gap-0.5 border-r border-gray-100 px-3 py-2 text-gray-600"
              aria-label={isFavorite ? "관심 해제" : "관심"}
            >
              <span className={isFavorite ? "text-red-500" : ""}>{isFavorite ? "♥" : "♡"}</span>
              <span className="text-[11px]">관심</span>
            </button>
          )}
          {reFooterPrice && (
            <div className="flex min-w-0 max-w-[38%] shrink flex-col justify-center px-2 py-1">
              <p className="truncate text-[13px] font-bold text-gray-900">{reDealType === "판매" ? `판매가 ${reFooterPrice}` : reFooterPrice}</p>
              <p className="text-[10px] text-gray-500">예상 중개수수료</p>
            </div>
          )}
          {!isOwnPost && (
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={handleChat}
                disabled={
                  !showChat ||
                  (isSold && !allowChatAfterSold) ||
                  chatLoading ||
                  chatBlockedByOtherReservation
                }
                className={PRODUCT_DETAIL_CTA_BUTTON}
                title={
                  chatBlockedByOtherReservation
                    ? "다른 구매자와 예약이 진행 중입니다"
                    : !showChat
                      ? "채팅이 비활성화되어 있습니다"
                      : undefined
                }
              >
                {chatLoading ? "이동 중..." : tradeChatCtaLabel}
              </button>
            </div>
          )}
          {showSellerCancelBar && (
            <div className="min-w-0 flex-1">
              <button
                type="button"
                disabled={cancelSaleBusy}
                onClick={() => {
                  if (!window.confirm(SELLER_CANCEL_SALE_CONFIRM_MESSAGE)) return;
                  void runCancelOwnSale();
                }}
                className={`${PRODUCT_DETAIL_CTA_BUTTON} border-red-200 bg-red-600 text-white hover:bg-red-700`}
              >
                {cancelSaleBusy ? "처리 중…" : "물품 판매 취소"}
              </button>
            </div>
          )}
        </div>
        {chatError && (
          <p className="fixed bottom-[52px] left-0 right-0 z-20 bg-red-50 px-4 py-2 text-center text-[13px] text-red-600 max-w-lg mx-auto">
            {chatError}
          </p>
        )}

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
          onCancelSale={() => void runCancelOwnSale()}
          busy={cancelSaleBusy}
        />

        {reportOpen && (
          <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50">
            <div className="w-full max-w-lg rounded-t-2xl bg-white px-4 py-4">
              <h2 className="text-[16px] font-semibold text-gray-900">신고하기</h2>
              <input
                type="text"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="신고 사유"
                className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-[14px]"
              />
              {reportError ? (
                <p className="mt-2 text-[13px] text-red-600">{reportError}</p>
              ) : null}
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setReportOpen(false)} className="flex-1 rounded-lg border border-gray-300 py-2 text-[14px] text-gray-700">취소</button>
                <button type="button" onClick={handleReport} disabled={!reportReason.trim() || reportSubmitting} className="flex-1 rounded-lg bg-red-600 py-2 text-[14px] font-medium text-white disabled:opacity-50">신고</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pb-24 max-w-lg mx-auto">
      <PostDetailStickyNavBar
        detailNavSolid={detailNavSolid}
        backHref={backHref}
        isOwnPost={isOwnPost}
        onOpenMore={() => setDetailMoreOpen(true)}
        onOpenSellerMore={showSellerCancelBar ? () => setSellerMoreOpen(true) : undefined}
      />

      {/* 1. 이미지 — 1단~이미지 2px */}
      <div className="bg-white">
        <div
          className="relative w-full bg-gray-100"
          style={{ paddingTop: POST_DETAIL_IMAGE_INSET_BELOW_MAIN_TOP_PX }}
        >
          <div ref={detailHeroRef} className="relative w-full">
            {(() => {
              const imgArr = Array.isArray(post.images)
                ? post.images.filter((s): s is string => typeof s === "string")
                : [];
              const list: string[] =
                imgArr.length > 0
                  ? imgArr
                  : post.thumbnail_url
                    ? [post.thumbnail_url]
                    : [];
              if (list.length === 0) {
                const isExchange = hasExchangeMeta(post.meta ?? {});
                return (
                  <div className="relative flex aspect-square max-h-[320px] w-full items-center justify-center bg-gray-100">
                    {isExchange ? (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-emerald-50 text-6xl font-semibold text-gray-700" aria-hidden>
                        <span>₱</span>
                        <span className="text-2xl text-gray-500">↔</span>
                        <span>₩</span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">이미지</span>
                    )}
                  </div>
                );
              }
              return <ProductImageGallery images={list} title={post.title ?? ""} />;
            })()}
          </div>
        </div>
      </div>

      {/* 2. 판매자(프로필) 카드 */}
      <div className="border-b border-gray-100 bg-white px-4 py-3">
        <p className="mb-2 text-[12px] font-medium text-gray-500">판매자</p>
        <div className="flex items-center justify-between gap-3 min-w-0">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="h-10 w-10 shrink-0 overflow-hidden bg-gray-200">
              {author?.avatar_url ? <img src={author?.avatar_url} alt="" className="h-full w-full object-cover" /> : null}
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-gray-900 truncate">{author?.nickname ?? "사용자"}</p>
              {(post.region || post.city) && (
                <p className="text-[12px] text-gray-500 truncate">{[post.region, post.city].filter(Boolean).join(" ")}</p>
              )}
            </div>
          </div>
          <div className="shrink-0 flex justify-end">
            <MannerBatteryInline
              raw={author?.speed ?? author?.temperature ?? 50}
              size="md"
              align="end"
            />
          </div>
        </div>
      </div>

      {isOwnPost ? <PostSellerTradeStrip postId={post.id} isSeller={isOwnPost} /> : null}

      {/* 3. 제목 + 가격 + 메타 — 상품 상세(/products) 타이포와 통일 */}
      <div className="border-b border-gray-100 bg-white px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <TradeListingStatusBadge post={post} size="detail" />
          {category?.icon_key === "used-car" &&
            (() => {
              const lab = getCarTradeLabelKo(post.meta as Record<string, unknown> | undefined);
              if (!lab) return null;
              return (
                <>
                  <span className="text-[12px] font-medium text-gray-300" aria-hidden>
                    |
                  </span>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-[12px] font-semibold text-gray-800">
                    {lab}
                  </span>
                </>
              );
            })()}
        </div>
        <h2 className={`mt-2 text-[20px] font-bold leading-7 text-gray-900 ${isSold ? "opacity-80" : ""}`}>{post.title}</h2>
        {showPrice && (() => {
          const isRealEstate = category?.icon_key === "real-estate";
          const meta = post.meta as Record<string, unknown> | undefined;
          const dealType = meta?.deal_type as string | undefined;
          if (isRealEstate && dealType === "임대") return null;
          return (
            <p className="mt-1 text-[22px] font-bold text-gray-900">
              {post.is_free_share ? "무료나눔" : post.price != null ? formatPrice(post.price, defaultCurrency) : ""}
            </p>
          );
        })()}
        {(post.is_free_share || (post.meta as Record<string, unknown> | undefined)?.direct_deal === true) && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {post.is_free_share && (
              <span className="rounded bg-gray-100 px-2 py-0.5 text-[12px] font-medium text-gray-700">나눔</span>
            )}
            {(post.meta as Record<string, unknown> | undefined)?.direct_deal === true && (
              <span className="rounded bg-blue-50 px-2 py-0.5 text-[12px] font-medium text-blue-700">직거래</span>
            )}
          </div>
        )}
        <ul className="mt-3 space-y-1 text-[13px] text-gray-600">
          {showLocation && (
            <li>지역 · {getLocationLabel(post.region!, post.city!)}</li>
          )}
          {author?.nickname && <li>{author.nickname}</li>}
          <li>등록 · {formatTimeAgo(post.created_at)}</li>
          {(() => {
            const s = [post.view_count != null && `조회 ${post.view_count}`, !isOwnPost && `관심 ${favoriteCount}`].filter(Boolean).join(" · ");
            return s ? <li>{s}</li> : null;
          })()}
        </ul>
        {(() => {
          const meta = (post.meta as Record<string, unknown> | undefined) ?? {};
          const hasUsedCarMeta =
            meta &&
            (meta.car_model != null ||
              meta.car_year != null ||
              meta.car_year_max != null ||
              meta.mileage != null ||
              meta.car_trade != null ||
              typeof meta.has_accident === "boolean");
          const isUsedCarCategory = category?.icon_key === "used-car";
          if (hasUsedCarMeta || isUsedCarCategory) {
            return (
              <div className="-mx-4">
                <UsedCarMetaBlock
                  meta={meta}
                  salePrice={post.price ?? null}
                  currency={defaultCurrency}
                />
              </div>
            );
          }
          return null;
        })()}
        {((category?.icon_key === "jobs" || category?.icon_key === "job") || hasJobsMeta((post.meta as Record<string, unknown>) ?? {})) && (
          <div className="-mx-4 mt-4">
            <JobsMetaBlock
              meta={(post.meta as Record<string, unknown>) ?? {}}
              price={post.price ?? null}
              currency={defaultCurrency}
            />
          </div>
        )}
        {((category?.icon_key === "exchange") || hasExchangeMeta((post.meta as Record<string, unknown>) ?? {})) && (
          <div className="-mx-4 mt-4">
            <ExchangeMetaBlock
              meta={(post.meta as Record<string, unknown>) ?? {}}
              amount={post.price ?? null}
              currency={defaultCurrency}
            />
          </div>
        )}
        {category?.icon_key && category.icon_key !== "used-car" && category.icon_key !== "jobs" && category.icon_key !== "job" && category.icon_key !== "exchange" && post.meta && Object.keys(post.meta).length > 0 && (
          <TradeMetaBlock
            skinKey={category.icon_key}
            meta={post.meta as Record<string, unknown>}
            post={post}
            defaultCurrency={defaultCurrency}
          />
        )}
      </div>

      {/* 4. 내용 / 상세 설명 (알바는 상세 설명 라벨) */}
      {post.content && (
        <div className="px-4">
          <div className="-mx-4 mt-0">
            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4">
              <h3 className="mb-2 text-[15px] font-semibold text-gray-700">
                {(category?.icon_key === "jobs" || category?.icon_key === "job") ? "상세 설명" : "내용"}
              </h3>
              <p className="text-[14px] text-gray-700 whitespace-pre-wrap">{post.content}</p>
            </div>
          </div>
        </div>
      )}

      {post.type === "community" && (
        <PostCommunityCommentsSection
          postId={post.id}
          authorUserId={post.author_id}
          currentUserId={user?.id ?? null}
        />
      )}

      {otherPosts.length > 0 && (
        <div className="mt-4 border-t border-gray-100 bg-white px-4 py-4">
          <div className="flex items-center justify-between text-[14px] font-medium text-gray-800">
            <span>{author?.nickname ?? "판매자"}님의 판매 물품</span>
            <span className="text-gray-400">›</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["all", "trading", "done"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setAuthorSalesTab(t)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                  authorSalesTab === t
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {t === "all" ? "전체" : t === "trading" ? "판매중" : "거래완료"}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-gray-500">
            판매중: 판매·문의·예약 단계 물품 · 거래완료: 판매된 물품
          </p>
          {filteredAuthorPosts.length === 0 ? (
            <p className="mt-4 text-center text-[13px] text-gray-500">이 조건에 맞는 물품이 없어요.</p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {filteredAuthorPosts.slice(0, 12).map((p) => {
                const thumb = p.thumbnail_url || (Array.isArray(p.images) && p.images[0] ? p.images[0] : null);
                const isExchange = hasExchangeMeta((p.meta as Record<string, unknown>) ?? {});
                return (
                  <Link key={p.id} href={`/post/${p.id}`} className="block">
                    <div className="overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                      <div className="aspect-square w-full bg-gray-100">
                        {thumb ? (
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        ) : isExchange ? (
                          <div
                            className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-emerald-50 text-xl font-semibold text-gray-700"
                            aria-hidden
                          >
                            <span>₱</span>
                            <span className="text-[8px] text-gray-500">↔</span>
                            <span>₩</span>
                          </div>
                        ) : (
                          <div className="flex h-full items-center justify-center text-[11px] text-gray-400">이미지</div>
                        )}
                      </div>
                      <div className="p-2">
                        <div className="mb-1">
                          <TradeListingStatusBadge post={p} size="list" />
                        </div>
                        <p className="line-clamp-2 text-[12px] font-medium text-gray-900">{p.title}</p>
                        <p className="mt-0.5 text-[13px] font-bold text-gray-900">
                          {p.price != null
                            ? formatPrice(p.price, defaultCurrency)
                            : p.is_free_share
                              ? "무료나눔"
                              : ""}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {similarPosts.length > 0 && (
        <div className="mt-4 border-t border-gray-100 bg-white px-4 py-4">
          <Link
            href={backHref}
            className="flex items-center justify-between text-[14px] font-medium text-gray-800"
          >
            <span>보고 있는 물품과 비슷한 물품</span>
            <span className="text-gray-400">›</span>
          </Link>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {similarPosts.slice(0, 6).map((p) => {
              const thumb = p.thumbnail_url || (Array.isArray(p.images) && p.images[0] ? p.images[0] : null);
              const isExchange = hasExchangeMeta((p.meta as Record<string, unknown>) ?? {});
              return (
              <Link key={p.id} href={`/post/${p.id}`} className="block">
                <div className="overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                  <div className="aspect-square w-full bg-gray-100">
                    {thumb ? (
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    ) : isExchange ? (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-emerald-50 text-xl font-semibold text-gray-700" aria-hidden><span>₱</span><span className="text-[8px] text-gray-500">↔</span><span>₩</span></div>
                    ) : (
                      <div className="flex h-full items-center justify-center text-[11px] text-gray-400">이미지</div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="line-clamp-2 text-[12px] font-medium text-gray-900">
                      {p.title}
                    </p>
                    <p className="mt-0.5 text-[13px] font-bold text-gray-900">
                      {p.price != null
                        ? formatPrice(p.price, defaultCurrency)
                        : p.is_free_share
                          ? "무료나눔"
                          : ""}
                    </p>
                  </div>
                </div>
              </Link>
            ); })}
          </div>
        </div>
      )}

      {/* 하단 고정: 상품 상세와 동일 규격 — 본인 글은 찜 숨김 */}
      <div className={`${PRODUCT_DETAIL_BOTTOM_BAR} z-30`}>
        {!isOwnPost && (
          <button
            type="button"
            onClick={handleFavorite}
            className="flex shrink-0 flex-col items-center justify-center gap-0.5 border-r border-gray-100 px-3 py-2 text-gray-600"
            aria-label={isFavorite ? "관심 해제" : "관심"}
          >
            <span className={isFavorite ? "text-red-500" : ""}>{isFavorite ? "♥" : "♡"}</span>
            <span className="text-[11px]">관심</span>
          </button>
        )}
        {!isOwnPost && (
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={handleChat}
              disabled={
                !showChat ||
                (isSold && !allowChatAfterSold) ||
                chatLoading ||
                chatBlockedByOtherReservation
              }
              className={PRODUCT_DETAIL_CTA_BUTTON}
              title={
                chatBlockedByOtherReservation
                  ? "다른 구매자와 예약이 진행 중입니다"
                  : !showChat
                    ? "채팅이 비활성화되어 있습니다"
                    : undefined
              }
            >
              {chatLoading ? "이동 중..." : tradeChatCtaLabel}
            </button>
          </div>
        )}
        {showSellerCancelBar && (
          <div className="min-w-0 flex-1">
            <button
              type="button"
              disabled={cancelSaleBusy}
              onClick={() => {
                if (!window.confirm(SELLER_CANCEL_SALE_CONFIRM_MESSAGE)) return;
                void runCancelOwnSale();
              }}
              className={`${PRODUCT_DETAIL_CTA_BUTTON} border-red-200 bg-red-600 text-white hover:bg-red-700`}
            >
              {cancelSaleBusy ? "처리 중…" : "물품 판매 취소"}
            </button>
          </div>
        )}
      </div>
      {chatError && (
        <p className="fixed bottom-[52px] left-0 right-0 z-20 bg-red-50 px-4 py-2 text-center text-[13px] text-red-600 max-w-lg mx-auto">
          {chatError}
        </p>
      )}

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
        onCancelSale={() => void runCancelOwnSale()}
        busy={cancelSaleBusy}
      />

      {reportOpen && (
        <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-t-2xl bg-white px-4 py-4">
            <h2 className="text-[16px] font-semibold text-gray-900">신고하기</h2>
            <input
              type="text"
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="신고 사유"
              className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-[14px]"
            />
            {reportError ? (
              <p className="mt-2 text-[13px] text-red-600">{reportError}</p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                className="flex-1 rounded-lg border border-gray-300 py-2 text-[14px] text-gray-700"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleReport}
                disabled={!reportReason.trim() || reportSubmitting}
                className="flex-1 rounded-lg bg-red-600 py-2 text-[14px] font-medium text-white disabled:opacity-50"
              >
                신고
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
