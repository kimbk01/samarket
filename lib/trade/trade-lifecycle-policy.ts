import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";

/** 거래 글 통합 라이프사이클 (posts + meta + seller_listing_state 기반) */
export type TradeLifecycleStatus =
  | "draft"
  | "active"
  | "negotiating"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "hidden";

const LIFECYCLE_SET = new Set<string>([
  "draft",
  "active",
  "negotiating",
  "in_progress",
  "completed",
  "cancelled",
  "hidden",
]);

/** 카테고리 슬러그·icon_key → 정책용 키 */
export type TradeKind = "used" | "car" | "realestate" | "exchange" | "job";

/** DB·폼 필드와 맞춘 핵심 필드 (변경 시 잠금 구간에서 차단) */
export const CORE_FIELDS: Record<TradeKind, string[]> = {
  used: [
    "title",
    "price",
    "trade_category_id",
    "region",
    "city",
    "barangay",
    "images",
    "thumbnail_url",
    "content",
    "is_free_share",
    "is_price_offer",
  ],
  car: [
    "title",
    "price",
    "trade_category_id",
    "content",
    "car_model",
    "car_year",
    "mileage",
    "has_accident",
    "car_trade",
    "images",
    "thumbnail_url",
  ],
  realestate: [
    "title",
    "price",
    "trade_category_id",
    "content",
    "neighborhood",
    "building_name",
    "estate_type",
    "deal_type",
    "deposit",
    "monthly",
    "size_sq",
    "room_count",
    "bathroom_count",
    "images",
    "thumbnail_url",
  ],
  exchange: ["title", "price", "trade_category_id", "content", "currency", "exchange_rate", "images", "thumbnail_url"],
  job: [
    "title",
    "price",
    "trade_category_id",
    "content",
    "images",
    "thumbnail_url",
    "pay_amount",
    "pay_type",
    "work_term",
    "listing_kind",
    "job_type",
    "work_category",
    "work_category_other",
    "region",
    "city",
  ],
};

/** 협의/진행 단계에서만 조정 가능한 부가 필드 (meta·별도 컬럼 매핑) */
export const ALLOWED_AUX_META_KEYS = [
  "meeting_place",
  "meeting_time",
  "memo",
  "chat_notice",
] as const;

export function resolveTradeKindFromCategory(category: {
  slug?: string | null;
  icon_key?: string | null;
}): TradeKind {
  const s = (category.slug ?? "").trim().toLowerCase();
  const ik = (category.icon_key ?? "").trim().toLowerCase();
  if (s === "exchange" || ik === "exchange") return "exchange";
  if (s === "car" || ik === "car") return "car";
  if (s === "realty" || s === "real-estate" || ik === "realty") return "realestate";
  if (s === "job" || ik === "job" || ik === "jobs") return "job";
  if (s === "market" || s === "used" || ik === "market") return "used";
  return "used";
}

/** DB seller_listing_state → 통합 라이프사이클 (posts.status 와 조합 전 단계 표시용) */
export function tradeLifecycleFromSellerListingState(
  sellerListingState: string | null | undefined
): TradeLifecycleStatus | null {
  const s = String(sellerListingState ?? "").trim().toLowerCase();
  if (s === "negotiating") return "negotiating";
  if (s === "reserved") return "in_progress";
  if (s === "completed") return "completed";
  if (s === "inquiry" || s === "") return "active";
  return null;
}

/** 판매자 단계 버튼 다음 통합 상태 (meta.trade_lifecycle_status 동기화용) */
export function mapSellerListingTransitionToLifecycle(
  nextSellerState: "inquiry" | "negotiating" | "reserved" | "completed"
): TradeLifecycleStatus {
  if (nextSellerState === "completed") return "completed";
  if (nextSellerState === "reserved") return "in_progress";
  if (nextSellerState === "negotiating") return "negotiating";
  return "active";
}

export function deriveTradeLifecycleStatus(post: {
  status?: string | null;
  seller_listing_state?: string | null;
  meta?: Record<string, unknown> | null;
}): TradeLifecycleStatus {
  const meta = post.meta && typeof post.meta === "object" ? (post.meta as Record<string, unknown>) : {};
  const raw = typeof meta.trade_lifecycle_status === "string" ? meta.trade_lifecycle_status.trim().toLowerCase() : "";
  if (raw && LIFECYCLE_SET.has(raw)) {
    return raw as TradeLifecycleStatus;
  }
  const st = String(post.status ?? "active").toLowerCase();
  if (["hidden", "blinded"].includes(st)) return "hidden";
  if (st === "deleted") return "hidden";
  if (st === "sold") return "completed";
  if (meta.trade_cancelled === true || st === "cancelled") return "cancelled";
  if (meta.is_draft === true) return "draft";

  const ls = normalizeSellerListingState(post.seller_listing_state, st);
  if (ls === "completed") return "completed";
  if (ls === "reserved") return "in_progress";
  if (ls === "negotiating") return "negotiating";
  if (st === "reserved") return "in_progress";
  return "active";
}

export function tradeLifecycleHint(status: TradeLifecycleStatus): string | null {
  switch (status) {
    case "negotiating":
      return "협의중 상태입니다. 주요 정보 수정이 제한됩니다.";
    case "in_progress":
      return "거래 진행중입니다. 가격 및 조건 수정이 불가능합니다.";
    case "completed":
      return "거래 완료된 게시글입니다.";
    default:
      return null;
  }
}

export function allowEditCoreFields(status: TradeLifecycleStatus): boolean {
  return status === "draft" || status === "active";
}

export function allowSoftDelete(status: TradeLifecycleStatus): boolean {
  return status === "draft" || status === "active";
}

export function allowAnyPostUpdate(status: TradeLifecycleStatus): boolean {
  if (status === "completed" || status === "hidden") return false;
  return true;
}

/** 협의·진행: 본문은 append 만 */
export function allowsRestrictedPartialEdit(status: TradeLifecycleStatus): boolean {
  return status === "negotiating" || status === "in_progress";
}

export function allowsCancelledPartialEdit(status: TradeLifecycleStatus): boolean {
  return status === "cancelled";
}

function stableStringifyMeta(meta: Record<string, unknown> | null | undefined): string {
  if (!meta || typeof meta !== "object") return "{}";
  try {
    const keys = Object.keys(meta).sort();
    const o: Record<string, unknown> = {};
    for (const k of keys) {
      o[k] = meta[k];
    }
    return JSON.stringify(o);
  } catch {
    return "{}";
  }
}

function imagesFingerprint(images: unknown): string {
  if (!Array.isArray(images)) return "";
  return JSON.stringify(images.map((x) => String(x)));
}

export type FlatPostShape = {
  title: string;
  trade_category_id: string;
  price: number | null;
  region: string | null;
  city: string | null;
  barangay: string | null;
  content: string;
  images: string[] | null;
  thumbnail_url: string | null;
  is_free_share: boolean;
  is_price_offer: boolean;
  meta: Record<string, unknown>;
};

export function flattenPostForTradeCompare(row: Record<string, unknown>): FlatPostShape {
  const meta =
    row.meta && typeof row.meta === "object" && row.meta !== null ? (row.meta as Record<string, unknown>) : {};
  return {
    title: String(row.title ?? ""),
    trade_category_id: String(row.trade_category_id ?? row.category_id ?? ""),
    price: row.price != null ? Number(row.price) : null,
    region: row.region != null ? String(row.region) : null,
    city: row.city != null ? String(row.city) : null,
    barangay: row.barangay != null ? String(row.barangay) : null,
    content: String(row.content ?? ""),
    images: Array.isArray(row.images) ? (row.images as string[]) : null,
    thumbnail_url: row.thumbnail_url != null ? String(row.thumbnail_url) : null,
    is_free_share: row.is_free_share === true,
    is_price_offer: row.is_price_offer === true,
    meta,
  };
}

function metaCarFingerprint(m: Record<string, unknown>): Record<string, unknown> {
  return {
    car_model: m.car_model,
    car_year: m.car_year,
    car_year_max: m.car_year_max,
    mileage: m.mileage,
    has_accident: m.has_accident,
    car_trade: m.car_trade,
  };
}

function metaRealestateFingerprint(m: Record<string, unknown>): Record<string, unknown> {
  return {
    neighborhood: m.neighborhood,
    building_name: m.building_name,
    estate_type: m.estate_type,
    deal_type: m.deal_type,
    deposit: m.deposit,
    monthly: m.monthly,
    size_sq: m.size_sq,
    room_count: m.room_count,
    bathroom_count: m.bathroom_count,
  };
}

export function coreFingerprintForKind(kind: TradeKind, flat: FlatPostShape): Record<string, unknown> {
  const m = flat.meta;
  switch (kind) {
    case "used":
      return {
        title: flat.title,
        price: flat.price,
        trade_category_id: flat.trade_category_id,
        region: flat.region,
        city: flat.city,
        barangay: flat.barangay,
        images: imagesFingerprint(flat.images),
        thumbnail_url: flat.thumbnail_url,
        content: flat.content,
        is_free_share: flat.is_free_share,
        is_price_offer: flat.is_price_offer,
      };
    case "car":
      return {
        title: flat.title,
        price: flat.price,
        trade_category_id: flat.trade_category_id,
        content: flat.content,
        images: imagesFingerprint(flat.images),
        thumbnail_url: flat.thumbnail_url,
        ...metaCarFingerprint(m),
      };
    case "realestate":
      return {
        title: flat.title,
        price: flat.price,
        trade_category_id: flat.trade_category_id,
        content: flat.content,
        images: imagesFingerprint(flat.images),
        thumbnail_url: flat.thumbnail_url,
        ...metaRealestateFingerprint(m),
      };
    case "exchange":
      return {
        title: flat.title,
        price: flat.price,
        trade_category_id: flat.trade_category_id,
        content: flat.content,
        currency: m.currency,
        exchange_rate: m.exchange_rate,
        images: imagesFingerprint(flat.images),
        thumbnail_url: flat.thumbnail_url,
      };
    case "job":
      return {
        title: flat.title,
        price: flat.price,
        trade_category_id: flat.trade_category_id,
        content: flat.content,
        images: imagesFingerprint(flat.images),
        thumbnail_url: flat.thumbnail_url,
        pay_amount: m.pay_amount,
        pay_type: m.pay_type,
        work_term: m.work_term,
        listing_kind: m.listing_kind,
        job_type: m.job_type,
        work_category: m.work_category,
        work_category_other: m.work_category_other,
        region: flat.region,
        city: flat.city,
      };
    default:
      return {};
  }
}

export function diffCoreFingerprint(
  kind: TradeKind,
  before: FlatPostShape,
  after: FlatPostShape
): boolean {
  const a = JSON.stringify(coreFingerprintForKind(kind, before));
  const b = JSON.stringify(coreFingerprintForKind(kind, after));
  return a !== b;
}

/** 본문 제외 핵심 변경 여부 (협의·진행 단계) */
export function diffCoreExceptDescription(kind: TradeKind, before: FlatPostShape, after: FlatPostShape): boolean {
  const fa = { ...coreFingerprintForKind(kind, before) } as Record<string, unknown>;
  const fb = { ...coreFingerprintForKind(kind, after) } as Record<string, unknown>;
  delete fa.content;
  delete fb.content;
  return JSON.stringify(fa) !== JSON.stringify(fb);
}

export function contentChangeIsAppendOnly(beforeContent: string, afterContent: string): boolean {
  if (afterContent === beforeContent) return true;
  const prefix = `${beforeContent}\n\n[추가 안내]\n`;
  return afterContent.startsWith(prefix) && afterContent.length > beforeContent.length;
}

export function validateRestrictedMetaPatch(
  kind: TradeKind,
  before: FlatPostShape,
  after: FlatPostShape
): { ok: true } | { ok: false; error: string } {
  if (diffCoreExceptDescription(kind, before, after)) {
    return { ok: false, error: "지금 단계에서는 가격·제목·핵심 조건을 바꿀 수 없습니다." };
  }
  if (!contentChangeIsAppendOnly(before.content, after.content)) {
    return { ok: false, error: "본문은 기존 내용을 유지한 채 추가 안내만 붙일 수 있습니다." };
  }
  const keys = new Set([...Object.keys(before.meta), ...Object.keys(after.meta)]);
  for (const k of keys) {
    const bv = stableStringifyMeta({ [k]: before.meta[k] });
    const av = stableStringifyMeta({ [k]: after.meta[k] });
    if (bv === av) continue;
    if ((ALLOWED_AUX_META_KEYS as readonly string[]).includes(k)) continue;
    return { ok: false, error: `허용되지 않은 필드 변경: ${k}` };
  }
  return { ok: true };
}

export function mergeTradePostFromPatch(
  before: FlatPostShape,
  body: {
    categoryId?: string;
    title?: string;
    content?: string;
    price?: number | null;
    region?: string;
    city?: string;
    barangay?: string;
    imageUrls?: string[] | null;
    meta?: Record<string, unknown> | null;
    isFreeShare?: boolean;
    isPriceOfferEnabled?: boolean;
    descriptionAppend?: string | null;
  },
  _kind: TradeKind
): FlatPostShape {
  const append = typeof body.descriptionAppend === "string" ? body.descriptionAppend.trim() : "";
  let content: string;
  if (append) {
    content = `${before.content}\n\n[추가 안내]\n${append}`;
  } else if (typeof body.content === "string") {
    content = body.content;
  } else {
    content = before.content;
  }

  const meta =
    body.meta != null && typeof body.meta === "object"
      ? { ...before.meta, ...body.meta }
      : { ...before.meta };

  const images = body.imageUrls !== undefined ? body.imageUrls : before.images;
  const thumbnail_url =
    Array.isArray(images) && images.length > 0 && typeof images[0] === "string"
      ? images[0]
      : before.thumbnail_url;

  return {
    title: body.title !== undefined ? String(body.title).trim() : before.title,
    trade_category_id: body.categoryId !== undefined ? String(body.categoryId).trim() : before.trade_category_id,
    price: body.price !== undefined ? body.price : before.price,
    region: body.region !== undefined ? body.region : before.region,
    city: body.city !== undefined ? body.city : before.city,
    barangay: body.barangay !== undefined ? body.barangay : before.barangay,
    content,
    images,
    thumbnail_url,
    is_free_share: body.isFreeShare !== undefined ? body.isFreeShare : before.is_free_share,
    is_price_offer: body.isPriceOfferEnabled !== undefined ? body.isPriceOfferEnabled : before.is_price_offer,
    meta,
  };
}

export function buildListingSnapshotJson(flat: FlatPostShape, kind: TradeKind): Record<string, unknown> {
  return {
    kind,
    captured_at: new Date().toISOString(),
    title: flat.title,
    price: flat.price,
    trade_category_id: flat.trade_category_id,
    region: flat.region,
    city: flat.city,
    barangay: flat.barangay,
    thumbnail_url: flat.thumbnail_url,
    images: flat.images,
    core: coreFingerprintForKind(kind, flat),
    meta: flat.meta,
  };
}
