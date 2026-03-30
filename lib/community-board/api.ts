/**
 * 커뮤니티 게시판 — Supabase (services / boards / posts / post_images)
 */

import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";
import { isValidLocalTopicId } from "@/lib/community-topics/server";
import { getPhilifeNeighborhoodSectionSlugServer } from "@/lib/community-feed/philife-neighborhood-section";
import type {
  Board,
  CommunityTopicRef,
  PostCreatePayload,
  PostDetail,
  PostImage,
  PostListItem,
} from "./types";
import { mapBoardRow } from "./board-row-mapper";

type Sb = ReturnType<typeof getSupabaseServer>;
type NicknameSb = Parameters<typeof fetchNicknamesForUserIds>[0];

async function resolveCommunityServiceId(sb: Sb): Promise<string | null> {
  const { data, error } = await sb.from("services").select("id").eq("slug", "community").eq("is_active", true).maybeSingle();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

export type BoardCategoryOption = { id: string; slug: string; name: string };

/**
 * 게시판별 활성 카테고리 (board_categories)
 */
export async function listBoardCategoriesForBoard(boardId: string): Promise<BoardCategoryOption[]> {
  let sb: Sb;
  try {
    sb = getSupabaseServer();
  } catch {
    return [];
  }
  const { data, error } = await sb
    .from("board_categories")
    .select("id, slug, name")
    .eq("board_id", boardId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error || !Array.isArray(data)) return [];
  return (data as { id?: string; slug?: string; name?: string }[])
    .filter((r) => r.id && r.slug)
    .map((r) => ({
      id: String(r.id),
      slug: String(r.slug),
      name: String(r.name ?? r.slug),
    }));
}

type ListFilterResolution = {
  boardCategoryId: string | null;
  /** `community_topics.id` — 동일 slug 가 dongnae/philife 에 중복일 수 있어 배열 */
  communityTopicIds: string[];
  categoryRequested: boolean;
  topicRequested: boolean;
};

async function resolvePostListFilters(
  sb: Sb,
  boardId: string,
  options?: { categorySlug?: string; topicSlug?: string }
): Promise<ListFilterResolution> {
  let boardCategoryId: string | null = null;
  const categoryRequested = !!options?.categorySlug?.trim();
  if (categoryRequested) {
    const { data: cat } = await sb
      .from("board_categories")
      .select("id")
      .eq("board_id", boardId)
      .eq("slug", options!.categorySlug!.trim().toLowerCase())
      .eq("is_active", true)
      .maybeSingle();
    boardCategoryId = cat && (cat as { id?: string }).id ? (cat as { id: string }).id : null;
  }

  const communityTopicIds: string[] = [];
  const topicRequested = !!options?.topicSlug?.trim();
  if (topicRequested) {
    const slug = options!.topicSlug!.trim().toLowerCase();
    const philifeSlug = await getPhilifeNeighborhoodSectionSlugServer(sb);
    const { data: secRows } = await sb
      .from("community_sections")
      .select("id")
      .in("slug", [philifeSlug, "philife"])
      .eq("is_active", true);
    const secIds = (secRows ?? [])
      .map((r) => String((r as { id?: string }).id ?? "").trim())
      .filter(Boolean);
    if (secIds.length > 0) {
      const { data: tops } = await sb
        .from("community_topics")
        .select("id")
        .in("section_id", secIds)
        .eq("slug", slug)
        .eq("is_active", true)
        .eq("is_visible", true);
      for (const row of tops ?? []) {
        const id = String((row as { id?: string }).id ?? "").trim();
        if (id) communityTopicIds.push(id);
      }
    }
  }

  return {
    boardCategoryId,
    communityTopicIds,
    categoryRequested,
    topicRequested,
  };
}

function mapCommunityTopic(raw: unknown): CommunityTopicRef | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const id = String(t.id ?? "");
  if (!id) return null;
  return {
    id,
    slug: String(t.slug ?? ""),
    name: String(t.name ?? ""),
  };
}

function mapImages(rows: unknown): PostImage[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => r as Record<string, unknown>)
    .filter((r) => r.id)
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
    .map((r) => ({
      id: String(r.id),
      url: r.url != null ? String(r.url) : null,
      storage_path: String(r.storage_path ?? ""),
      sort_order: Number(r.sort_order ?? 0),
    }));
}

async function enrichAuthors(sb: Sb, posts: { user_id: string }[]): Promise<Map<string, string>> {
  const ids = [...new Set(posts.map((p) => p.user_id).filter(Boolean))];
  return fetchNicknamesForUserIds(sb as unknown as NicknameSb, ids);
}

/** 동네생활 홈 — 활성 게시판 목록 */
export async function listCommunityBoards(): Promise<Board[]> {
  let sb: Sb;
  try {
    sb = getSupabaseServer();
  } catch {
    return [];
  }
  const serviceId = await resolveCommunityServiceId(sb);
  if (!serviceId) return [];

  const { data, error } = await sb
    .from("boards")
    .select("*")
    .eq("service_id", serviceId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error || !data?.length) return [];
  return (data as Record<string, unknown>[]).map(mapBoardRow);
}

export async function getBoardBySlug(slug: string): Promise<Board | null> {
  let sb: Sb;
  try {
    sb = getSupabaseServer();
  } catch {
    return null;
  }
  const serviceId = await resolveCommunityServiceId(sb);
  if (!serviceId) return null;

  const { data, error } = await sb
    .from("boards")
    .select("*")
    .eq("service_id", serviceId)
    .eq("slug", slug.trim().toLowerCase())
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;
  return mapBoardRow(data as Record<string, unknown>);
}

export async function getPostsByBoardId(
  boardId: string,
  options?: { categorySlug?: string; topicSlug?: string; limit?: number; offset?: number }
): Promise<PostListItem[]> {
  let sb: Sb;
  try {
    sb = getSupabaseServer();
  } catch {
    return [];
  }

  const filters = await resolvePostListFilters(sb, boardId, options);
  if (filters.categoryRequested && !filters.boardCategoryId) return [];
  if (filters.topicRequested && filters.communityTopicIds.length === 0) return [];

  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const offset = Math.max(options?.offset ?? 0, 0);

  let q = sb
    .from("posts")
    .select(
      "id, board_id, title, content, created_at, updated_at, view_count, status, visibility, user_id, is_deleted, community_topic_id, community_topics ( id, slug, name ), post_images ( id, url, storage_path, sort_order )"
    )
    .eq("board_id", boardId)
    .eq("status", "active")
    .eq("visibility", "public")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.boardCategoryId) q = q.eq("board_category_id", filters.boardCategoryId);
  if (filters.communityTopicIds.length === 1) {
    q = q.eq("community_topic_id", filters.communityTopicIds[0]!);
  } else if (filters.communityTopicIds.length > 1) {
    q = q.in("community_topic_id", filters.communityTopicIds);
  }

  const { data, error } = await q;
  if (error || !data) return [];

  const rows = data as Record<string, unknown>[];
  const nickMap = await enrichAuthors(
    sb,
    rows.map((r) => ({ user_id: String(r.user_id ?? "") }))
  );

  return rows.map((r) => {
    const uid = String(r.user_id ?? "");
    return {
      id: String(r.id),
      board_id: String(r.board_id ?? boardId),
      title: String(r.title ?? ""),
      content: String(r.content ?? ""),
      created_at: String(r.created_at ?? ""),
      updated_at: String(r.updated_at ?? ""),
      view_count: Number(r.view_count ?? 0),
      status: String(r.status ?? "active"),
      visibility: String(r.visibility ?? "public"),
      author: uid
        ? {
            id: uid,
            name: nickMap.get(uid) ?? uid.slice(0, 8),
            avatar_url: null,
          }
        : null,
      images: mapImages(r.post_images),
      community_topic: mapCommunityTopic(r.community_topics),
    };
  });
}

/** 동일 필터 기준 공개 글 총계 (목록 상단 카운트용) */
export async function countPostsByBoardId(
  boardId: string,
  options?: { categorySlug?: string; topicSlug?: string }
): Promise<number | null> {
  let sb: Sb;
  try {
    sb = getSupabaseServer();
  } catch {
    return null;
  }

  const filters = await resolvePostListFilters(sb, boardId, options);
  if (filters.categoryRequested && !filters.boardCategoryId) return 0;
  if (filters.topicRequested && filters.communityTopicIds.length === 0) return 0;

  let q = sb
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("board_id", boardId)
    .eq("status", "active")
    .eq("visibility", "public")
    .eq("is_deleted", false);

  if (filters.boardCategoryId) q = q.eq("board_category_id", filters.boardCategoryId);
  if (filters.communityTopicIds.length === 1) {
    q = q.eq("community_topic_id", filters.communityTopicIds[0]!);
  } else if (filters.communityTopicIds.length > 1) {
    q = q.in("community_topic_id", filters.communityTopicIds);
  }

  const { count, error } = await q;
  if (error) return null;
  return typeof count === "number" ? count : 0;
}

export async function getPostById(postId: string, boardId?: string): Promise<PostDetail | null> {
  let sb: Sb;
  try {
    sb = getSupabaseServer();
  } catch {
    return null;
  }

  const q = sb
    .from("posts")
    .select(
      "id, board_id, title, content, created_at, updated_at, view_count, status, visibility, user_id, is_deleted, community_topic_id, community_topics ( id, slug, name ), post_images ( id, url, storage_path, sort_order )"
    )
    .eq("id", postId)
    .eq("is_deleted", false)
    .maybeSingle();

  const { data, error } = await q;
  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  if (row.is_deleted === true) return null;
  if (boardId && String(row.board_id ?? "") !== boardId) return null;

  const uid = String(row.user_id ?? "");
  const nickMap = await enrichAuthors(sb, [{ user_id: uid }]);

  return {
    id: String(row.id),
    board_id: String(row.board_id ?? ""),
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    view_count: Number(row.view_count ?? 0),
    status: String(row.status ?? "active"),
    visibility: String(row.visibility ?? "public"),
    author: uid
      ? {
          id: uid,
          name: nickMap.get(uid) ?? uid.slice(0, 8),
          avatar_url: null,
        }
      : null,
    images: mapImages(row.post_images),
    community_topic: mapCommunityTopic(row.community_topics),
  };
}

/**
 * 글 등록 — 서버에서 authorUserId 필수 (본인 확인 후 호출)
 */
export async function createPost(payload: PostCreatePayload, authorUserId: string): Promise<{ id: string }> {
  const sb = getSupabaseServer();
  const access = await assertVerifiedMemberForAction(sb as any, authorUserId);
  if (!access.ok) throw new Error(access.error);
  const commId = await resolveCommunityServiceId(sb);
  if (!commId) throw new Error("동네생활 서비스가 설정되지 않았습니다.");

  const { data: boardRow, error: boardErr } = await sb
    .from("boards")
    .select("id, service_id, category_mode")
    .eq("id", payload.board_id)
    .eq("is_active", true)
    .maybeSingle();

  if (boardErr || !boardRow) throw new Error("게시판을 찾을 수 없습니다.");
  const b = boardRow as { id: string; service_id: string; category_mode?: string };
  if (b.service_id !== commId) throw new Error("커뮤니티 게시판이 아닙니다.");

  if (!authorUserId?.trim()) throw new Error("로그인이 필요합니다.");
  if (!payload.title?.trim()) throw new Error("제목을 입력하세요.");

  const boardCategoryIdTrim = payload.board_category_id?.trim() || null;
  if (boardCategoryIdTrim) {
    const { data: catOk } = await sb
      .from("board_categories")
      .select("id")
      .eq("id", boardCategoryIdTrim)
      .eq("board_id", b.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!catOk) throw new Error("유효하지 않은 카테고리입니다.");
  } else if (b.category_mode === "board_category") {
    const { count, error: cErr } = await sb
      .from("board_categories")
      .select("id", { count: "exact", head: true })
      .eq("board_id", b.id)
      .eq("is_active", true);
    const n = !cErr && typeof count === "number" ? count : 0;
    if (n > 0) throw new Error("카테고리를 선택하세요.");
  }

  let communityTopicId: string | null = null;
  const rawTopic = payload.community_topic_id?.trim();
  if (rawTopic) {
    if (!(await isValidLocalTopicId(rawTopic))) throw new Error("유효하지 않은 주제입니다.");
    communityTopicId = rawTopic;
  }

  const insertRow: Record<string, unknown> = {
    service_id: commId,
    board_id: payload.board_id,
    user_id: authorUserId.trim(),
    title: payload.title.trim(),
    content: (payload.content ?? "").trim(),
    trade_category_id: null,
    board_category_id: boardCategoryIdTrim,
    community_topic_id: communityTopicId,
    status: "active",
    visibility: "public",
  };

   
  const { data: inserted, error: insErr } = await (sb as any).from("posts").insert(insertRow).select("id").single();

  if (insErr || !inserted?.id) {
    throw new Error(insErr?.message ?? "글 저장에 실패했습니다.");
  }

  const newId = String(inserted.id);
  const imgs = payload.images?.filter((x) => x.storage_path?.trim()) ?? [];
  if (imgs.length > 0) {
    const rows = imgs.map((im, i) => ({
      post_id: newId,
      storage_path: im.storage_path.trim(),
      url: im.url?.trim() || null,
      sort_order: i,
    }));
    await (sb as any).from("post_images").insert(rows);
  }

  return { id: newId };
}
