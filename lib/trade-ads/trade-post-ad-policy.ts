import type { TradeAdProductRow } from "@/lib/trade-ads/load-trade-ad-product";

type TradeAdPostLike = {
  type?: string | null;
  status?: string | null;
  title?: string | null;
  content?: string | null;
  price?: number | null;
  is_free_share?: boolean | null;
  category_id?: string | null;
  trade_category_id?: string | null;
  region?: string | null;
  thumbnail_url?: string | null;
  images?: unknown;
};

export type TradeAdEligibilityCheck = {
  key: string;
  pass: boolean;
  label: string;
  detail: string;
  blocking: boolean;
};

export type TradeAdEligibilityResult = {
  eligible: boolean;
  checks: TradeAdEligibilityCheck[];
  blockingReason: string | null;
};

export const TRADE_PAID_AD_FORMAT_GUIDE = [
  "광고 배지를 붙이되 일반 매물 카드와 동일 형태로 노출합니다.",
  "기간형 상품(3일/7일)으로 운영하고 만료 시 자동 종료합니다.",
  "지역·카테고리·서비스 타입 타겟 조건을 먼저 통과한 상품만 신청됩니다.",
  "판매중(active) 매물만 신청 가능하며, 품질 기준(제목·이미지·본문)을 검사합니다.",
] as const;

function hasTradeImage(post: TradeAdPostLike): boolean {
  if (typeof post.thumbnail_url === "string" && post.thumbnail_url.trim().length > 0) return true;
  if (!Array.isArray(post.images)) return false;
  return post.images.some((u) => typeof u === "string" && u.trim().length > 0);
}

function normalizeRegion(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function postCategoryId(post: TradeAdPostLike): string {
  return String(post.category_id ?? post.trade_category_id ?? "").trim();
}

export function evaluateTradePostAdEligibility(input: {
  post: TradeAdPostLike;
  product: TradeAdProductRow;
  serviceSegment: string;
}): TradeAdEligibilityResult {
  const post = input.post;
  const product = input.product;
  const status = String(post.status ?? "").trim().toLowerCase();
  const title = String(post.title ?? "").trim();
  const content = String(post.content ?? "").trim();
  const checks: TradeAdEligibilityCheck[] = [];

  const push = (
    key: string,
    pass: boolean,
    label: string,
    detail: string,
    blocking = true
  ) => checks.push({ key, pass, label, detail, blocking });

  push(
    "trade_post",
    post.type !== "community",
    "거래 글 여부",
    post.type === "community" ? "커뮤니티 글은 거래 광고를 신청할 수 없습니다." : "거래 글입니다."
  );
  push(
    "status_active",
    status === "active",
    "판매 상태",
    status === "active" ? "판매중 상태입니다." : "판매중(active) 상태의 글만 광고 신청할 수 있습니다."
  );
  push(
    "title_quality",
    title.length >= 6,
    "제목 품질",
    title.length >= 6 ? "제목 길이 기준을 통과했습니다." : "제목은 6자 이상으로 작성해 주세요."
  );
  push(
    "image_exists",
    hasTradeImage(post),
    "대표 이미지",
    hasTradeImage(post) ? "대표 이미지가 있습니다." : "대표 이미지(썸네일 또는 이미지 1장 이상)가 필요합니다."
  );
  push(
    "content_quality",
    content.length >= 10,
    "본문 품질",
    content.length >= 10 ? "본문 길이 기준을 통과했습니다." : "본문을 10자 이상 작성해 주세요."
  );
  const hasPrice = post.is_free_share === true || (typeof post.price === "number" && post.price > 0);
  push(
    "price_or_share",
    hasPrice,
    "가격/나눔 정보",
    hasPrice ? "가격 또는 무료나눔 정보가 있습니다." : "가격을 입력하거나 무료나눔 설정이 필요합니다."
  );

  const placement = (product.placement ?? "").trim();
  const tradePlacement =
    product.board_key === "trade" ||
    placement === "detail_bottom" ||
    placement === "list_top" ||
    placement === "home_featured" ||
    placement === "premium_all";
  push(
    "product_trade_board",
    tradePlacement,
    "광고 상품 위치",
    tradePlacement ? "거래 마켓용 광고 상품입니다." : "거래 마켓용 광고 상품이 아닙니다."
  );

  const serviceMatched =
    !product.service_type || product.service_type.trim().length === 0 || product.service_type === input.serviceSegment;
  push(
    "service_segment",
    serviceMatched,
    "서비스 타입",
    serviceMatched ? "서비스 타입 조건을 통과했습니다." : "현재 글의 서비스 타입과 광고 상품이 맞지 않습니다."
  );

  const categoryMatched = !product.category_id || product.category_id === postCategoryId(post);
  push(
    "category_target",
    categoryMatched,
    "카테고리 타겟",
    categoryMatched ? "카테고리 조건을 통과했습니다." : "광고 상품 카테고리 타겟과 글 카테고리가 다릅니다."
  );

  const productRegion = normalizeRegion(product.region_target);
  const region = normalizeRegion(post.region);
  const regionMatched =
    !productRegion ||
    (region.length > 0 && (region === productRegion || region.includes(productRegion)));
  push(
    "region_target",
    regionMatched,
    "지역 타겟",
    regionMatched ? "지역 타겟 조건을 통과했습니다." : "광고 상품의 지역 타겟과 글 지역이 맞지 않습니다."
  );

  const failing = checks.find((check) => check.blocking && !check.pass) ?? null;
  return {
    eligible: failing == null,
    checks,
    blockingReason: failing?.detail ?? null,
  };
}
