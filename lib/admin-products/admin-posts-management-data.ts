import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";
import { ADMIN_TRADE_OPEN_REPORT_STATUSES } from "@/lib/admin-products/admin-trade-overview-counts";

/**
 * 게시물 관리용 posts 목록 조회 (클라이언트 Supabase / 서비스 롤 공용)
 * - DB마다 컬럼이 달라 SELECT를 단계별로 시도 (없는 컬럼 요청 시 PostgREST 전체 실패)
 */

import type { Product } from "@/lib/types/product";
import { normalizePostMeta } from "@/lib/posts/post-normalize";
import { pickPreferredTradeChatIds } from "@/lib/admin-products/admin-trade-deep-link";
import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";

export interface AdminProductRow {
  id: string;
  user_id?: string;
  author_id?: string;
  title: string;
  content?: string;
  price: number | null;
  status: string;
  view_count: number;
  thumbnail_url: string | null;
  images: string[] | null;
  region: string | null;
  city: string | null;
  favorite_count?: number;
  chat_count?: number;
  created_at: string;
  updated_at: string;
  trade_category_id?: string | null;
  category_id?: string | null;
  board_id?: string | null;
  service_id?: string | null;
  is_free_share?: boolean;
  visibility?: string;
  /** posts.type — trade | community | service | feature */
  type?: string;
  meta?: unknown;
  seller_listing_state?: string;
  reserved_buyer_id?: string | null;
  sold_buyer_id?: string | null;
}

export interface CategoryMeta {
  name: string;
  slug: string;
  icon_key: string;
  /** public.categories.type (trade | service | …), trade_categories 에는 없음 */
  type?: string;
}

export interface ServiceMeta {
  service_type: string;
  slug: string;
  name: string;
}

function mapRowToProduct(
  row: AdminProductRow,
  labelByUserId: Record<string, string>,
  identityByUserId: Record<string, { display_name?: string | null; username?: string | null }>,
  categoryById?: Record<string, CategoryMeta>,
  serviceById?: Record<string, ServiceMeta>
): Product {
  const userId = (row.user_id ?? row.author_id ?? "") as string;
  const location = [row.region, row.city].filter(Boolean).join(" ") || "";
  const thumbnail = row.thumbnail_url ?? row.images?.[0] ?? "";
  const metaNorm = normalizePostMeta(row.meta);
  const catId = row.trade_category_id ?? row.category_id ?? null;
  const cat = catId ? categoryById?.[catId] : undefined;
  const svcId =
    row.service_id ??
    (metaNorm && typeof metaNorm.service_id === "string" && metaNorm.service_id.trim()
      ? metaNorm.service_id.trim()
      : null);
  const svc = svcId ? serviceById?.[svcId] : undefined;
  const now = new Date().toISOString();
  const categoryName =
    cat?.name ||
    (catId && (!cat || (!cat.name && !cat.slug))
      ? `카테고리 미해석 (${String(catId).slice(0, 8)}…)`
      : undefined);
  const postMeta = metaNorm ?? undefined;
  const visibilityFromMeta =
    metaNorm && typeof metaNorm.visibility === "string" && metaNorm.visibility.trim()
      ? metaNorm.visibility.trim()
      : row.visibility ?? "public";
  const images =
    Array.isArray(row.images) && row.images.length > 0
      ? row.images.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      : undefined;

  return {
    id: row.id,
    title: row.title ?? "",
    price: Number(row.price) ?? 0,
    location,
    createdAt: row.created_at ?? now,
    status: (row.status ?? "active") as Product["status"],
    thumbnail,
    images,
    description: typeof row.content === "string" ? row.content : undefined,
    likesCount: row.favorite_count ?? 0,
    chatCount: row.chat_count ?? 0,
    isBoosted: false,
    sellerId: userId,
    updatedAt: row.updated_at ?? row.created_at ?? now,
    seller: {
      id: userId,
      nickname: String(labelByUserId[userId] ?? userId ?? "—"),
      display_name: identityByUserId[userId]?.display_name ?? null,
      username: identityByUserId[userId]?.username ?? null,
      avatar: "",
      location,
    },
    isFreeShare: row.is_free_share ?? false,
    categoryName,
    tradeCategoryId: catId,
    categorySlug: cat?.slug,
    categoryIconKey: cat?.icon_key,
    categoryType: cat?.type as Product["categoryType"],
    serviceType: svc?.service_type,
    serviceSlug: svc?.slug,
    postKind: row.type,
    postMeta,
    visibility: visibilityFromMeta,
    sellerListingState: normalizeSellerListingState(row.seller_listing_state, row.status),
    reservedBuyerId:
      typeof row.reserved_buyer_id === "string" && row.reserved_buyer_id.trim()
        ? row.reserved_buyer_id.trim()
        : null,
    soldBuyerId:
      typeof row.sold_buyer_id === "string" && row.sold_buyer_id.trim()
        ? row.sold_buyer_id.trim()
        : null,
  };
}

/** Supabase/PostgREST 에러를 터미널에 읽을 수 있게 문자열화 */
function formatSupabaseError(err: unknown): string {
  if (err == null) return "(에러 없음)";
  if (typeof err === "string") return err;
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  const o = err as Record<string, unknown>;
  const code = o.code != null ? String(o.code) : "";
  const message = o.message != null ? String(o.message) : "";
  const details = o.details != null ? String(o.details) : "";
  const hint = o.hint != null ? String(o.hint) : "";
  const parts = [code && `code=${code}`, message && `message=${message}`, details && `details=${details}`, hint && `hint=${hint}`].filter(
    Boolean
  );
  if (parts.length > 0) return parts.join(" | ");
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * 컬럼이 많은 순으로 시도 — OpenAPI `posts` 스키마에 없는 컬럼은 SELECT 에 포함하지 않음
 * (`category_id`, `board_id`, `service_id`, `visibility`, `author_id` 등).
 */
const POSTS_SELECT_TIERS = [
  "id, user_id, title, content, price, status, seller_listing_state, view_count, thumbnail_url, images, region, city, favorite_count, chat_count, created_at, updated_at, trade_category_id, community_topic_id, type, is_free_share, is_price_offer, is_deleted, meta, sold_buyer_id, reserved_buyer_id",
  "id, user_id, title, content, price, status, view_count, thumbnail_url, images, region, city, favorite_count, chat_count, created_at, updated_at, trade_category_id, community_topic_id, type, is_free_share, is_deleted, meta",
  "id, user_id, title, content, price, status, view_count, thumbnail_url, images, region, city, favorite_count, chat_count, created_at, updated_at, trade_category_id, community_topic_id, type, is_free_share, meta",
  "id, user_id, title, content, price, status, view_count, thumbnail_url, images, region, city, favorite_count, chat_count, created_at, updated_at, trade_category_id, type, meta",
  "id, user_id, title, content, price, status, view_count, created_at, updated_at, trade_category_id, type",
  "id, user_id, title, price, status, created_at, updated_at",
  "id, user_id, title, status, created_at",
  /**
   * 명시적 컬럼 티가 모두 실패할 때만 — 전 컬럼(무거움). 정상 스키마에서는 위 티어만 사용.
   */
  "*",
] as const;

export type AdminPostsListQuery = {
  page?: number;
  pageSize?: number;
  /** posts.status exact */
  status?: string;
  /** post id exact (uuid/substring via ilike only if not uuid — use eq when uuid) */
  productId?: string;
  /** title ilike */
  title?: string;
  /** city/region ilike */
  region?: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function queryPostsPage(
  client: any,
  select: string,
  q: Required<Pick<AdminPostsListQuery, "page" | "pageSize">> & AdminPostsListQuery
): Promise<{ data: unknown; error: unknown; count: number | null }> {
  const from = (q.page - 1) * q.pageSize;
  const to = from + q.pageSize - 1;

  const applyFilters = (builder: any, opts?: { skipType?: boolean }) => {
    let b = builder;
    // Cut A / S1 — Trade admin list SSOT = marketplace posts only (align Overview KPI).
    if (!opts?.skipType) b = b.eq("type", "trade");
    if (q.status) b = b.eq("status", q.status);
    if (q.productId) {
      if (UUID_RE.test(q.productId)) b = b.eq("id", q.productId);
      else b = b.ilike("id", `%${q.productId}%`);
    }
    if (q.title) b = b.ilike("title", `%${q.title}%`);
    if (q.region) {
      b = b.or(`city.ilike.%${q.region}%,region.ilike.%${q.region}%`);
    }
    return b;
  };

  let res = await applyFilters(
    client
      .from(POSTS_TABLE_READ)
      .select(select, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to)
  );
  if (res.error) {
    const msg = formatSupabaseError(res.error).toLowerCase();
    if (msg.includes("type") && (msg.includes("column") || msg.includes("42703"))) {
      res = await applyFilters(
        client
          .from(POSTS_TABLE_READ)
          .select(select, { count: "exact" })
          .order("created_at", { ascending: false })
          .range(from, to),
        { skipType: true }
      );
    } else if (msg.includes("created_at") || msg.includes("column") || msg.includes("42703")) {
      res = await applyFilters(
        client
          .from(POSTS_TABLE_READ)
          .select(select, { count: "exact" })
          .order("id", { ascending: false })
          .range(from, to)
      );
    }
  }
  if (res.error) {
    res = await applyFilters(
      client.from(POSTS_TABLE_READ).select(select, { count: "exact" }).range(from, to)
    );
  }
  return { data: res.data, error: res.error, count: typeof res.count === "number" ? res.count : null };
}

function pickNonEmpty(a: string | undefined | null, b: string | undefined | null): string {
  const t = (a ?? "").trim();
  if (t) return t;
  return (b ?? "").trim();
}

function mergeCategoryRow(
  into: Record<string, CategoryMeta>,
  c: {
    id: string;
    name?: string | null;
    slug?: string | null;
    icon_key?: string | null;
    icon?: string | null;
    type?: string | null;
  }
): void {
  const id = c.id;
  if (!id) return;
  const prev = into[id] ?? { name: "", slug: "", icon_key: "" };
  const iconFromRow = pickNonEmpty(c.icon_key, c.icon ?? null);
  const nextType =
    c.type != null && String(c.type).trim()
      ? String(c.type).trim()
      : prev.type;
  into[id] = {
    name: pickNonEmpty(c.name, prev.name),
    slug: pickNonEmpty(c.slug, prev.slug),
    icon_key: pickNonEmpty(iconFromRow, prev.icon_key),
    ...(nextType ? { type: nextType } : {}),
  };
}

/**
 * posts.trade_category_id 가 categories 또는 trade_categories 중 어디를 가리키든 slug·name을 채움
 */
async function loadCategoryMetaByIds(
  client: any,
  categoryIds: string[]
): Promise<Record<string, CategoryMeta>> {
  const categoryById: Record<string, CategoryMeta> = {};
  if (categoryIds.length === 0) return categoryById;

  const fetchTableBatch = async (table: string) => {
    const withType = table === "categories";
    let res = await client
      .from(table)
      .select(withType ? "id, name, slug, icon_key, type" : "id, name, slug, icon_key")
      .in("id", categoryIds);
    if (res.error && res.data == null && withType) {
      res = await client.from(table).select("id, name, slug, icon_key").in("id", categoryIds);
    }
    if (res.error && res.data == null) {
      res = await client.from(table).select("id, name, slug, icon").in("id", categoryIds);
    }
    if (res.error && res.data == null) {
      res = await client.from(table).select("id, name, slug").in("id", categoryIds);
    }
    const cats = res.data;
    if (!Array.isArray(cats)) return;
    cats.forEach(
      (c: {
        id: string;
        name?: string;
        slug?: string;
        icon_key?: string;
        icon?: string;
        type?: string;
      }) => mergeCategoryRow(categoryById, c)
    );
  };

  await fetchTableBatch("categories");
  await fetchTableBatch("trade_categories");

  const stillMissing = categoryIds.filter((id) => {
    const m = categoryById[id];
    return !m || (!m.slug && !m.name && !m.icon_key);
  });

  for (const id of stillMissing.slice(0, 80)) {
    for (const table of ["trade_categories", "categories"]) {
      const sel =
        table === "categories" ? "id, name, slug, icon_key, type" : "id, name, slug, icon_key";
      let r = await client.from(table).select(sel).eq("id", id).maybeSingle();
      if (r.error && table === "categories") {
        r = await client.from(table).select("id, name, slug, icon_key").eq("id", id).maybeSingle();
      }
      if (r.error) {
        r = await client.from(table).select("id, name, slug, icon").eq("id", id).maybeSingle();
      }
      const row = r.data as {
        id: string;
        name?: string;
        slug?: string;
        icon_key?: string;
        icon?: string;
        type?: string;
      } | null;
      if (row?.id) {
        mergeCategoryRow(categoryById, row);
        const m = categoryById[id];
        if (m && (m.slug || m.name || m.icon_key)) break;
      }
    }
  }

  if (process.env.NODE_ENV === "development" && categoryIds.length > 0) {
    const resolved = categoryIds.filter((id) => {
      const m = categoryById[id];
      return m && (m.slug || m.name || m.icon_key);
    }).length;
    if (resolved < categoryIds.length) {
      console.warn(
        `[admin posts-management] 카테고리 메타: ${resolved}/${categoryIds.length}개 id만 해석됨. 나머지는 DB에 행이 없거나 테이블명이 다를 수 있음.`
      );
    }
  }

  return categoryById;
}

/** posts.service_id → 당근형 services (home_trade, real_estate, used_car …) */
async function loadServiceMetaByIds(
  client: any,
  serviceIds: string[]
): Promise<Record<string, ServiceMeta>> {
  const out: Record<string, ServiceMeta> = {};
  if (serviceIds.length === 0) return out;
  try {
    const res = await client
      .from("services")
      .select("id, slug, service_type, name")
      .in("id", serviceIds);
    if (res.error || !Array.isArray(res.data)) return out;
    for (const s of res.data as {
      id: string;
      slug?: string;
      service_type?: string;
      name?: string;
    }[]) {
      if (!s?.id) continue;
      out[s.id] = {
        service_type: String(s.service_type ?? "").trim() || "unknown",
        slug: String(s.slug ?? "").trim(),
        name: String(s.name ?? "").trim(),
      };
    }
  } catch {
    /* services 테이블 없음 */
  }
  return out;
}

async function enrichPostsToProducts(
  supabase: unknown,
  list: AdminProductRow[],
  opts?: { lightList?: boolean }
): Promise<Product[]> {
  const lightList = opts?.lightList === true;
  const client = supabase as any;

  const categoryIds = [
    ...new Set(
      list.map((r) => r.trade_category_id ?? r.category_id).filter(Boolean)
    ),
  ] as string[];

  const categoryById =
    categoryIds.length > 0 ? await loadCategoryMetaByIds(client, categoryIds) : {};

  const serviceIds = [...new Set(list.map((r) => r.service_id).filter(Boolean))] as string[];
  const serviceById =
    serviceIds.length > 0 ? await loadServiceMetaByIds(client, serviceIds) : {};

  const userIds = [...new Set(list.map((r) => r.user_id ?? r.author_id).filter(Boolean))] as string[];
  const labelByUserId: Record<string, string> = {};
  const identityByUserId: Record<string, { display_name?: string | null; username?: string | null }> = {};

  if (userIds.length > 0) {
    const [{ data: profileRows }, { data: testUserRows }] = await Promise.all([
      client.from("profiles").select("id, display_name, nickname, username").in("id", userIds),
      client.from("test_users").select("id, display_name, username").in("id", userIds),
    ]);

    if (Array.isArray(profileRows)) {
      profileRows.forEach(
        (u: { id: string; display_name?: string | null; nickname?: string | null; username?: string | null }) => {
          const id = String(u.id ?? "").trim();
          if (!id) return;
          const display = typeof u.display_name === "string" ? u.display_name : null;
          const uname = typeof u.username === "string" ? u.username : null;
          if (!identityByUserId[id]) identityByUserId[id] = {};
          identityByUserId[id] = { display_name: display, username: uname };
          const legacy = typeof u.nickname === "string" ? u.nickname : null;
          labelByUserId[id] =
            labelFromDisplayAndUsername(display ?? legacy, uname) ||
            (display ?? legacy ?? uname ?? id).trim() ||
            id;
        }
      );
    }

    if (Array.isArray(testUserRows)) {
      testUserRows.forEach((u: { id: string; display_name?: string | null; username?: string | null }) => {
        const id = String(u.id ?? "").trim();
        if (!id) return;
        const display = typeof u.display_name === "string" ? u.display_name : null;
        const uname = typeof u.username === "string" ? u.username : null;
        if (!identityByUserId[id]) identityByUserId[id] = {};
        // test_users only fills gaps — profiles wins when present
        identityByUserId[id] = {
          display_name: identityByUserId[id]?.display_name ?? display,
          username: identityByUserId[id]?.username ?? uname,
        };
        if (!labelByUserId[id]) {
          labelByUserId[id] =
            labelFromDisplayAndUsername(display, uname) || (display ?? uname ?? id).trim() || id;
        }
      });
    }
  }

  const reportCountByTarget: Record<string, number> = {};
  const chatCountByPostId: Record<string, number> = {};
  const promoActiveByTarget: Record<string, true> = {};
  const productChatsByPostId: Record<string, Array<{ id: string; buyer_id: string | null }>> = {};
  const chatRoomsByPostId: Record<string, Array<{ id: string; buyer_id: string | null }>> = {};

  const postIds = list.map((r) => r.id).filter(Boolean);
  const uniquePostIds = [...new Set(postIds)];

  // List: count only (N+1 금지 · page batch). Detail: also preferred room ids.
  try {
    const { data: chatRows } = await client
      .from("product_chats")
      .select(lightList ? "post_id" : "id, post_id, buyer_id")
      .in("post_id", uniquePostIds);

    if (Array.isArray(chatRows)) {
      chatRows.forEach((r: { id?: string; post_id?: string; buyer_id?: string | null }) => {
        if (!r?.post_id) return;
        chatCountByPostId[r.post_id] = (chatCountByPostId[r.post_id] ?? 0) + 1;
        if (!lightList && r.id) {
          (productChatsByPostId[r.post_id] ??= []).push({
            id: r.id,
            buyer_id: typeof r.buyer_id === "string" ? r.buyer_id : null,
          });
        }
      });
    }
  } catch {
    /* product_chats 없을 수 있음 */
  }

  if (!lightList) {
    try {
      const { data: roomRows } = await client
        .from("chat_rooms")
        .select("id, item_id, buyer_id")
        .eq("room_type", "item_trade")
        .in("item_id", uniquePostIds);

      if (Array.isArray(roomRows)) {
        roomRows.forEach((r: { id?: string; item_id?: string | null; buyer_id?: string | null }) => {
          if (!r?.item_id || !r?.id) return;
          (chatRoomsByPostId[r.item_id] ??= []).push({
            id: r.id,
            buyer_id: typeof r.buyer_id === "string" ? r.buyer_id : null,
          });
        });
      }
    } catch {
      /* chat_rooms 없을 수 있음 */
    }
  }

  if (Object.keys(chatCountByPostId).length === 0 && !lightList) {
    for (const [itemId, rooms] of Object.entries(chatRoomsByPostId)) {
      chatCountByPostId[itemId] = rooms.length;
    }
  }
  if (uniquePostIds.length > 0) {
    const reportChunk = 200;
    for (let i = 0; i < uniquePostIds.length; i += reportChunk) {
      const chunk = uniquePostIds.slice(i, i + reportChunk);
      try {
        // Cut A / S2 — open reports only (pending|reviewing), same set as Overview reportsPending.
        const { data: reportRows } = await client
          .from("reports")
          .select("target_id")
          .eq("target_type", "product")
          .in("status", [...ADMIN_TRADE_OPEN_REPORT_STATUSES])
          .in("target_id", chunk);
        if (Array.isArray(reportRows)) {
          reportRows.forEach((r: { target_id: string }) => {
            if (!r?.target_id) return;
            reportCountByTarget[r.target_id] = (reportCountByTarget[r.target_id] ?? 0) + 1;
          });
        }
      } catch {
        /* reports 없을 수 있음 */
      }
    }

    // CUT F Product A — live window only (page batch, no full entitlement dump)
    const nowIso = new Date().toISOString();
    try {
      const { data: promoRows } = await client
        .from("point_promotion_orders")
        .select("target_id")
        .eq("target_type", "product")
        .eq("domain", "trade")
        .eq("order_status", "active")
        .lte("start_at", nowIso)
        .gte("end_at", nowIso)
        .in("target_id", uniquePostIds);
      if (Array.isArray(promoRows)) {
        promoRows.forEach((r: { target_id?: string | null }) => {
          const id = typeof r?.target_id === "string" ? r.target_id.trim() : "";
          if (id) promoActiveByTarget[id] = true;
        });
      }
    } catch {
      /* point_promotion_orders 없을 수 있음 */
    }
  }

  return list.map((row) => {
    const p = mapRowToProduct(row, labelByUserId, identityByUserId, categoryById, serviceById);
    const chatCount = chatCountByPostId[row.id];
    if (chatCount != null) p.chatCount = chatCount;
    const reportCount = reportCountByTarget[row.id];
    if (reportCount != null && reportCount > 0) p.reportCount = reportCount;
    if (promoActiveByTarget[row.id]) p.hasPromotionOverlay = true;
    if (!lightList) {
      const preferredBuyer =
        (typeof p.soldBuyerId === "string" && p.soldBuyerId.trim()) ||
        (typeof p.reservedBuyerId === "string" && p.reservedBuyerId.trim()) ||
        "";
      const ids = pickPreferredTradeChatIds({
        preferredBuyerId: preferredBuyer,
        chatRooms: chatRoomsByPostId[row.id] ?? [],
        productChats: productChatsByPostId[row.id] ?? [],
      });
      if (ids.tradeChatRoomId) p.tradeChatRoomId = ids.tradeChatRoomId;
      if (ids.tradeProductChatId) p.tradeProductChatId = ids.tradeProductChatId;
    }
    return p;
  });
}

export type AdminPostsManagementFetchResult = {
  products: Product[];
  /** posts SELECT 단계가 모두 실패했을 때만 (성공 후 0건이면 null) */
  queryError: string | null;
  total?: number;
  page?: number;
  pageSize?: number;
};

export async function fetchAdminPostsManagementProducts(
  supabase: unknown,
  listQuery?: AdminPostsListQuery
): Promise<AdminPostsManagementFetchResult> {
  const client = supabase as any;
  let lastErrText = "";
  const page = Math.max(1, Math.floor(listQuery?.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(listQuery?.pageSize ?? 40)));
  const q: AdminPostsListQuery & { page: number; pageSize: number } = {
    page,
    pageSize,
    status: listQuery?.status?.trim() || undefined,
    productId: listQuery?.productId?.trim() || undefined,
    title: listQuery?.title?.trim() || undefined,
    region: listQuery?.region?.trim() || undefined,
  };

  for (const select of POSTS_SELECT_TIERS) {
    try {
      const res = await queryPostsPage(client, select, q);

      if (res.error) {
        lastErrText = formatSupabaseError(res.error);
        continue;
      }
      if (!Array.isArray(res.data)) {
        lastErrText = "posts 응답이 배열이 아님";
        continue;
      }
      const list = res.data as AdminProductRow[];
      if (process.env.NODE_ENV === "development") {
        const selLabel =
          select === "*" ? "*" : select.length > 70 ? `${select.slice(0, 70)}…` : select;
        console.info(
          `[admin posts-management] posts page OK — select: ${selLabel} (${list.length}/${res.count ?? "?"} p${page})`
        );
      }
      const products = await enrichPostsToProducts(supabase, list, { lightList: true });
      return {
        products,
        queryError: null,
        total: res.count ?? list.length,
        page,
        pageSize,
      };
    } catch (e) {
      lastErrText = e instanceof Error ? e.message : String(e);
      continue;
    }
  }

  if (process.env.NODE_ENV === "development") {
    console.error(
      "[admin posts-management] posts 조회 실패 — 모든 SELECT 단계에서 오류.\n" +
        "→ Supabase Table Editor에서 public.posts 존재 여부, service_role/sb_secret 키, URL(프로젝트 ref) 일치를 확인하세요.\n" +
        `→ 마지막 오류: ${lastErrText || "(내용 없음 — 키·URL 오타 또는 네트워크 차단 가능)"}`
    );
  }
  return {
    products: [],
    queryError: lastErrText || "posts 조회 실패(모든 SELECT 단계 오류)",
    total: 0,
    page,
    pageSize,
  };
}

/**
 * Admin Control Center — 동일 SELECT 티어·enrich, id 1건만.
 * 목록 limit 1000 window에서 find 하지 않는다.
 */
export async function fetchAdminPostById(
  supabase: unknown,
  postId: string
): Promise<AdminPostsManagementFetchResult> {
  const client = supabase as any;
  const id = String(postId ?? "").trim();
  if (!id) {
    return { products: [], queryError: null };
  }

  let lastErrText = "";

  for (const select of POSTS_SELECT_TIERS) {
    try {
      const res = await client.from(POSTS_TABLE_READ).select(select).eq("id", id).maybeSingle();
      if (res.error) {
        lastErrText = formatSupabaseError(res.error);
        continue;
      }
      if (!res.data) {
        return { products: [], queryError: null };
      }
      const products = await enrichPostsToProducts(supabase, [res.data as AdminProductRow]);
      return { products, queryError: null };
    } catch (e) {
      lastErrText = e instanceof Error ? e.message : String(e);
      continue;
    }
  }

  return {
    products: [],
    queryError: lastErrText || "posts 조회 실패(모든 SELECT 단계 오류)",
  };
}
