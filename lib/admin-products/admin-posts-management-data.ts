import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

/**
 * 게시물 관리용 posts 목록 조회 (클라이언트 Supabase / 서비스 롤 공용)
 * - DB마다 컬럼이 달라 SELECT를 단계별로 시도 (없는 컬럼 요청 시 PostgREST 전체 실패)
 */

import type { Product } from "@/lib/types/product";
import { normalizePostMeta } from "@/lib/posts/post-normalize";
import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";

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
  nicknameByUserId: Record<string, string>,
  categoryById?: Record<string, CategoryMeta>,
  serviceById?: Record<string, ServiceMeta>
): Product {
  const userId = (row.user_id ?? row.author_id ?? "") as string;
  const location = [row.region, row.city].filter(Boolean).join(" ") || "";
  const thumbnail = row.thumbnail_url ?? row.images?.[0] ?? "";
  const catId = row.trade_category_id ?? row.category_id ?? null;
  const cat = catId ? categoryById?.[catId] : undefined;
  const svcId = row.service_id ?? null;
  const svc = svcId ? serviceById?.[svcId] : undefined;
  const now = new Date().toISOString();
  const categoryName =
    cat?.name ||
    (catId && (!cat || (!cat.name && !cat.slug))
      ? `카테고리 미해석 (${String(catId).slice(0, 8)}…)`
      : undefined);
  const postMeta = normalizePostMeta(row.meta) ?? undefined;
  return {
    id: row.id,
    title: row.title ?? "",
    price: Number(row.price) ?? 0,
    location,
    createdAt: row.created_at ?? now,
    status: (row.status ?? "active") as Product["status"],
    thumbnail,
    likesCount: row.favorite_count ?? 0,
    chatCount: row.chat_count ?? 0,
    isBoosted: false,
    sellerId: userId,
    updatedAt: row.updated_at ?? row.created_at ?? now,
    seller: {
      id: userId,
      nickname: String(nicknameByUserId[userId] ?? userId ?? "—"),
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
    visibility: row.visibility ?? "public",
    sellerListingState: normalizeSellerListingState(row.seller_listing_state, row.status),
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
 * 컬럼이 많은 순으로 시도. author_id 없는 DB 대응으로 user_id만 사용 (author_id 티어 제거).
 */
const POSTS_SELECT_TIERS = [
  "id, user_id, title, content, price, status, seller_listing_state, view_count, thumbnail_url, images, region, city, favorite_count, chat_count, created_at, updated_at, trade_category_id, category_id, board_id, service_id, is_free_share, visibility, meta",
  "id, user_id, title, content, price, status, view_count, thumbnail_url, images, region, city, favorite_count, chat_count, created_at, updated_at, trade_category_id, category_id, board_id, service_id, is_free_share, visibility",
  "id, user_id, title, content, price, status, view_count, thumbnail_url, images, region, city, favorite_count, chat_count, created_at, updated_at, trade_category_id, category_id, board_id, is_free_share, visibility",
  "id, user_id, title, content, price, status, view_count, thumbnail_url, images, region, city, favorite_count, chat_count, created_at, updated_at, trade_category_id, board_id, is_free_share, visibility",
  "id, user_id, title, content, price, status, view_count, visibility, created_at, updated_at, trade_category_id, board_id",
  "id, user_id, title, content, price, status, view_count, created_at, updated_at, trade_category_id, board_id",
  "id, user_id, title, price, status, created_at, updated_at",
  "id, user_id, title, status, created_at",
  /**
   * 명시적 컬럼 티가 모두 실패할 때만 — 전 컬럼(무거움). 정상 스키마에서는 위 티어만 사용.
   */
  "*",
] as const;

async function queryPostsWithFallbackOrder(
  client: any,
  select: string
): Promise<{ data: unknown; error: unknown }> {
  let res = await client.from(POSTS_TABLE_READ).select(select).order("created_at", { ascending: false }).limit(1000);
  if (res.error) {
    const msg = formatSupabaseError(res.error).toLowerCase();
    if (msg.includes("created_at") || msg.includes("column") || msg.includes("42703")) {
      res = await client.from(POSTS_TABLE_READ).select(select).order("id", { ascending: false }).limit(1000);
    }
  }
  if (res.error) {
    res = await client.from(POSTS_TABLE_READ).select(select).limit(1000);
  }
  return res;
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
  list: AdminProductRow[]
): Promise<Product[]> {
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
  const nicknameByUserId: Record<string, string> = {};

  if (userIds.length > 0) {
    const { data: users } = await client
      .from("test_users")
      .select("id, display_name, username")
      .in("id", userIds);
    if (Array.isArray(users)) {
      users.forEach((u: { id: string; display_name?: string; username?: string }) => {
        nicknameByUserId[u.id] = (u.display_name ?? u.username ?? u.id).trim() || u.id;
      });
    }
  }

  const reportCountByTarget: Record<string, number> = {};
  const chatCountByPostId: Record<string, number> = {};

  const postIds = list.map((r) => r.id).filter(Boolean);
  const uniquePostIds = [...new Set(postIds)];

  // chat_count 컬럼이 트리거로 갱신되지 않는 환경도 있어서,
  // product_chats / chat_rooms를 직접 집계해 정확한 채팅방 수를 표시합니다.
  try {
    const { data: chatRows } = await client
      .from("product_chats")
      .select("post_id")
      .in("post_id", uniquePostIds);

    if (Array.isArray(chatRows)) {
      chatRows.forEach((r: { post_id: string }) => {
        if (!r?.post_id) return;
        chatCountByPostId[r.post_id] = (chatCountByPostId[r.post_id] ?? 0) + 1;
      });
    }
  } catch {
    /* product_chats 없을 수 있음 */
  }

  if (Object.keys(chatCountByPostId).length === 0) {
    try {
      const { data: roomRows } = await client
        .from("chat_rooms")
        .select("item_id")
        .eq("room_type", "item_trade")
        .in("item_id", uniquePostIds);

      if (Array.isArray(roomRows)) {
        roomRows.forEach((r: { item_id: string | null }) => {
          if (!r?.item_id) return;
          chatCountByPostId[r.item_id] = (chatCountByPostId[r.item_id] ?? 0) + 1;
        });
      }
    } catch {
      /* chat_rooms 없을 수 있음 */
    }
  }
  if (uniquePostIds.length > 0) {
    const reportChunk = 200;
    for (let i = 0; i < uniquePostIds.length; i += reportChunk) {
      const chunk = uniquePostIds.slice(i, i + reportChunk);
      try {
        const { data: reportRows } = await client
          .from("reports")
          .select("target_id")
          .eq("target_type", "product")
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
  }

  return list.map((row) => {
    const p = mapRowToProduct(row, nicknameByUserId, categoryById, serviceById);
    const chatCount = chatCountByPostId[row.id];
    if (chatCount != null) p.chatCount = chatCount;
    const reportCount = reportCountByTarget[row.id];
    if (reportCount != null && reportCount > 0) p.reportCount = reportCount;
    return p;
  });
}

export type AdminPostsManagementFetchResult = {
  products: Product[];
  /** posts SELECT 단계가 모두 실패했을 때만 (성공 후 0건이면 null) */
  queryError: string | null;
};

export async function fetchAdminPostsManagementProducts(
  supabase: unknown
): Promise<AdminPostsManagementFetchResult> {
  const client = supabase as any;
  let lastErrText = "";

  for (const select of POSTS_SELECT_TIERS) {
    try {
      const res = await queryPostsWithFallbackOrder(client, select);

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
          `[admin posts-management] posts 조회 OK — select: ${selLabel} (${list.length}건)`
        );
      }
      const products = await enrichPostsToProducts(supabase, list);
      return { products, queryError: null };
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
  };
}
