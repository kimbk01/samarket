import "server-only";

import type { SupabaseServer } from "@/lib/chat/supabase-server";
import { lguPublicName } from "@/lib/neighborhood/lgu-location.server";
import {
  MOIM_ACTIONS,
  canMoimAction,
  isMoimRole,
  type MoimAction,
  type MoimMemberStatus,
  type MoimPlatformState,
  type MoimRole,
  type MoimStatus,
} from "@/lib/moim/moim-permission-contract";
import type {
  MoimAuthorDto,
  MoimBannedDto,
  MoimBoardDto,
  MoimCardDto,
  MoimCategoryDto,
  MoimCommentDto,
  MoimDetailDto,
  MoimInviteLinkDto,
  MoimJoinRequestDto,
  MoimMemberDto,
  MoimPostDto,
  MoimReceivedInviteDto,
} from "@/lib/moim/moim-api-types";

/**
 * 모임 읽기 (서버 전용, service_role). 보이는 범위는 여기서 정한다:
 *  - 삭제된 모임: 아무도 못 봄 / 종료된 모임: 멤버(탈퇴 안 한 사람)만
 *  - 비멤버: 소개·공개 글만, 멤버 목록·멤버 전용 글 없음
 *  - 사람 표시: 모임별 프로필만
 */

type MoimRow = {
  id: string;
  name: string;
  intro: string;
  cover_image_url: string | null;
  category_id: string;
  lgu_id: string;
  join_mode: "instant" | "approval";
  capacity: number | null;
  age_min_birth_year: number | null;
  age_max_birth_year: number | null;
  host_user_id: string;
  status: MoimStatus;
  platform_state: MoimPlatformState;
  member_count: number;
  last_activity_at: string;
  main_room_id: string | null;
  created_at: string;
  updated_at: string;
};

const MOIM_COLS =
  "id, name, intro, cover_image_url, category_id, lgu_id, join_mode, capacity, age_min_birth_year, age_max_birth_year, host_user_id, status, platform_state, member_count, last_activity_at, main_room_id, created_at, updated_at";

type MemberRow = {
  moim_id: string;
  user_id: string;
  role: MoimRole;
  status: MoimMemberStatus;
  nickname: string;
  avatar_url: string | null;
  bio: string;
  joined_at: string | null;
  rejoin_count: number;
};

const MEMBER_COLS = "moim_id, user_id, role, status, nickname, avatar_url, bio, joined_at, rejoin_count";

function cityLabel(lguId: string | null | undefined): string | null {
  const id = (lguId ?? "").trim();
  return id ? lguPublicName(id) : null;
}

export async function listMoimCategories(sb: SupabaseServer): Promise<MoimCategoryDto[]> {
  const { data } = await sb
    .from("moim_categories")
    .select("id, slug, label_ko, label_en")
    .eq("is_active", true)
    .eq("is_restricted", false)
    .order("sort_order", { ascending: true });
  return ((data ?? []) as { id: string; slug: string; label_ko: string; label_en: string }[]).map((c) => ({
    id: c.id,
    slug: c.slug,
    labelKo: c.label_ko,
    labelEn: c.label_en,
  }));
}

async function categoryMap(sb: SupabaseServer, ids: string[]): Promise<Map<string, MoimCategoryDto>> {
  const map = new Map<string, MoimCategoryDto>();
  const uniq = [...new Set(ids)].filter(Boolean);
  if (!uniq.length) return map;
  const { data } = await sb.from("moim_categories").select("id, slug, label_ko, label_en").in("id", uniq);
  for (const c of (data ?? []) as { id: string; slug: string; label_ko: string; label_en: string }[]) {
    map.set(c.id, { id: c.id, slug: c.slug, labelKo: c.label_ko, labelEn: c.label_en });
  }
  return map;
}

/** 보는 사람의 대표 주소 시/군 (모임 동네 = 같은 LGU, 설계 §6 P2 · D3) */
export async function loadViewerMoimLgu(sb: SupabaseServer, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await sb
    .from("user_addresses")
    .select("canonical_lgu_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("is_default_master", true)
    .limit(1)
    .maybeSingle();
  const id = ((data as { canonical_lgu_id?: string | null } | null)?.canonical_lgu_id ?? "").trim();
  return id || null;
}

async function viewerMemberships(sb: SupabaseServer, userId: string | null, moimIds: string[]) {
  const map = new Map<string, MemberRow>();
  if (!userId || !moimIds.length) return map;
  const { data } = await sb.from("moim_members").select(MEMBER_COLS).eq("user_id", userId).in("moim_id", moimIds);
  for (const m of (data ?? []) as MemberRow[]) map.set(m.moim_id, m);
  return map;
}

async function toCards(sb: SupabaseServer, rows: MoimRow[], viewerId: string | null): Promise<MoimCardDto[]> {
  const [cats, mine] = await Promise.all([
    categoryMap(sb, rows.map((r) => r.category_id)),
    viewerMemberships(sb, viewerId, rows.map((r) => r.id)),
  ]);
  return rows.map((r) => {
    const me = mine.get(r.id);
    return {
      id: r.id,
      name: r.name,
      intro: r.intro,
      coverImageUrl: r.cover_image_url,
      category: cats.get(r.category_id) ?? null,
      cityLabel: cityLabel(r.lgu_id),
      joinMode: r.join_mode,
      capacity: r.capacity,
      memberCount: r.member_count,
      lastActivityAt: r.last_activity_at,
      viewerStatus: me?.status ?? null,
      viewerRole: me?.status === "active" ? me.role : null,
    };
  });
}

/** 내 모임 (활성 멤버·가입 신청 중) */
export async function listMyMoims(sb: SupabaseServer, userId: string): Promise<MoimCardDto[]> {
  const { data: mem } = await sb
    .from("moim_members")
    .select("moim_id, status, updated_at")
    .eq("user_id", userId)
    .in("status", ["active", "pending"])
    .order("updated_at", { ascending: false })
    .limit(100);
  const ids = ((mem ?? []) as { moim_id: string }[]).map((m) => m.moim_id);
  if (!ids.length) return [];
  const { data } = await sb.from("moims").select(MOIM_COLS).in("id", ids).eq("status", "active");
  const rows = ((data ?? []) as MoimRow[]).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  return toCards(sb, rows, userId);
}

/** 우리 동네 모임 — 같은 LGU · 정상 노출(normal)만 · 최근 활동순 (설계 §6 P2) */
export async function listLocalMoims(
  sb: SupabaseServer,
  viewerId: string | null,
  opts: { lguId: string | null; categoryId?: string | null; q?: string | null; limit?: number; before?: string | null }
): Promise<{ items: MoimCardDto[]; nextBefore: string | null }> {
  if (!opts.lguId) return { items: [], nextBefore: null };
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  let query = sb
    .from("moims")
    .select(MOIM_COLS)
    .eq("lgu_id", opts.lguId)
    .eq("status", "active")
    .eq("platform_state", "normal")
    .order("last_activity_at", { ascending: false })
    .limit(limit + 1);
  if (opts.categoryId) query = query.eq("category_id", opts.categoryId);
  const q = (opts.q ?? "").trim().replace(/[%_,()]/g, " ").slice(0, 40);
  if (q) query = query.or(`name.ilike.%${q}%,intro.ilike.%${q}%`);
  if (opts.before) query = query.lt("last_activity_at", opts.before);
  const { data } = await query;
  const rows = (data ?? []) as MoimRow[];
  const page = rows.slice(0, limit);
  return {
    items: await toCards(sb, page, viewerId),
    nextBefore: rows.length > limit ? page[page.length - 1]?.last_activity_at ?? null : null,
  };
}

async function authorMap(sb: SupabaseServer, moimId: string, userIds: string[]): Promise<Map<string, MoimAuthorDto>> {
  const map = new Map<string, MoimAuthorDto>();
  const uniq = [...new Set(userIds)].filter(Boolean);
  if (!uniq.length) return map;
  const { data } = await sb.from("moim_members").select(MEMBER_COLS).eq("moim_id", moimId).in("user_id", uniq);
  for (const m of (data ?? []) as MemberRow[]) {
    map.set(m.user_id, {
      userId: m.user_id,
      nickname: m.nickname,
      avatarUrl: m.avatar_url,
      role: m.status === "active" ? m.role : null,
      isActiveMember: m.status === "active",
    });
  }
  for (const id of uniq) {
    if (!map.has(id)) map.set(id, { userId: id, nickname: "", avatarUrl: null, role: null, isActiveMember: false });
  }
  return map;
}

type PostRow = {
  id: string;
  moim_id: string;
  board_id: string;
  author_id: string;
  title: string;
  body: string;
  images: unknown;
  visibility: "members" | "public";
  is_pinned: boolean;
  status: string;
  comment_count: number;
  created_at: string;
  updated_at: string;
};
const POST_COLS = "id, moim_id, board_id, author_id, title, body, images, visibility, is_pinned, status, comment_count, created_at, updated_at";

function imagesOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

async function toPosts(sb: SupabaseServer, moimId: string, rows: PostRow[], viewerId: string | null): Promise<MoimPostDto[]> {
  const [authors, boards] = await Promise.all([
    authorMap(sb, moimId, rows.map((r) => r.author_id)),
    sb.from("moim_boards").select("id, kind").eq("moim_id", moimId),
  ]);
  const kindById = new Map(((boards.data ?? []) as { id: string; kind: MoimBoardDto["kind"] }[]).map((b) => [b.id, b.kind]));
  return rows.map((r) => ({
    id: r.id,
    moimId: r.moim_id,
    boardId: r.board_id,
    boardKind: kindById.get(r.board_id) ?? "free",
    title: r.title,
    body: r.body,
    images: imagesOf(r.images),
    visibility: r.visibility,
    isPinned: r.is_pinned,
    commentCount: r.comment_count,
    author: authors.get(r.author_id)!,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    viewerIsAuthor: !!viewerId && viewerId === r.author_id,
  }));
}

async function loadMoimRow(sb: SupabaseServer, moimId: string): Promise<MoimRow | null> {
  const { data } = await sb.from("moims").select(MOIM_COLS).eq("id", moimId).maybeSingle();
  return (data as MoimRow | null) ?? null;
}

async function loadViewerMember(sb: SupabaseServer, moimId: string, viewerId: string | null): Promise<MemberRow | null> {
  if (!viewerId) return null;
  const { data } = await sb.from("moim_members").select(MEMBER_COLS).eq("moim_id", moimId).eq("user_id", viewerId).maybeSingle();
  return (data as MemberRow | null) ?? null;
}

async function loadOverrides(sb: SupabaseServer, moimId: string): Promise<Partial<Record<MoimAction, MoimRole>>> {
  const { data } = await sb.from("moim_permissions").select("action, min_role").eq("moim_id", moimId);
  const out: Partial<Record<MoimAction, MoimRole>> = {};
  for (const r of (data ?? []) as { action: string; min_role: string }[]) {
    if ((MOIM_ACTIONS as readonly string[]).includes(r.action) && isMoimRole(r.min_role)) out[r.action as MoimAction] = r.min_role;
  }
  return out;
}

/** 모임을 볼 수 있는가 (삭제 모임 불가, 종료 모임은 탈퇴 안 한 멤버만) */
function canViewMoim(m: MoimRow, me: MemberRow | null): boolean {
  if (m.status === "deleted") return false;
  if (m.status === "closed") return !!me && me.status === "active";
  return true;
}

export type MoimAccess = { moim: MoimRow; me: MemberRow | null; role: MoimRole | null; overrides: Partial<Record<MoimAction, MoimRole>> };

export async function loadMoimAccess(sb: SupabaseServer, moimId: string, viewerId: string | null): Promise<MoimAccess | null> {
  const [moim, me] = await Promise.all([loadMoimRow(sb, moimId), loadViewerMember(sb, moimId, viewerId)]);
  if (!moim || !canViewMoim(moim, me)) return null;
  const role = me?.status === "active" ? me.role : null;
  return { moim, me, role, overrides: role ? await loadOverrides(sb, moimId) : {} };
}

export function moimCanMap(access: MoimAccess): Record<MoimAction, boolean> {
  const out = {} as Record<MoimAction, boolean>;
  for (const action of MOIM_ACTIONS) {
    out[action] = canMoimAction(
      { moimStatus: access.moim.status, platformState: access.moim.platform_state, viewerRole: access.role, overrides: access.overrides },
      action
    );
  }
  return out;
}

export async function getMoimDetail(sb: SupabaseServer, moimId: string, viewerId: string | null): Promise<MoimDetailDto | null> {
  const access = await loadMoimAccess(sb, moimId, viewerId);
  if (!access) return null;
  const { moim, me, role } = access;
  const isMember = !!role;

  const [cats, host, questions, boards, pendingReq, ban, transfer, pinned, recent] = await Promise.all([
    categoryMap(sb, [moim.category_id]),
    authorMap(sb, moim.id, [moim.host_user_id]),
    sb.from("moim_join_questions").select("question, sort_order").eq("moim_id", moim.id).order("sort_order"),
    sb.from("moim_boards").select("id, kind, name, write_min_role, sort_order, is_active").eq("moim_id", moim.id).order("sort_order"),
    viewerId
      ? sb.from("moim_join_requests").select("id").eq("moim_id", moim.id).eq("user_id", viewerId).eq("status", "pending").maybeSingle()
      : Promise.resolve({ data: null }),
    viewerId
      ? sb.from("moim_bans").select("id").eq("moim_id", moim.id).eq("user_id", viewerId).is("released_at", null).maybeSingle()
      : Promise.resolve({ data: null }),
    viewerId
      ? sb.from("moim_host_transfers").select("id").eq("moim_id", moim.id).eq("to_user_id", viewerId).eq("status", "requested").maybeSingle()
      : Promise.resolve({ data: null }),
    (() => {
      let q = sb.from("moim_posts").select(POST_COLS).eq("moim_id", moim.id).eq("status", "active").eq("is_pinned", true);
      if (!isMember) q = q.eq("visibility", "public");
      return q.order("created_at", { ascending: false }).limit(5);
    })(),
    (() => {
      let q = sb.from("moim_posts").select(POST_COLS).eq("moim_id", moim.id).eq("status", "active");
      if (!isMember) q = q.eq("visibility", "public");
      return q.order("created_at", { ascending: false }).limit(5);
    })(),
  ]);

  const boardRows = ((boards.data ?? []) as { id: string; kind: MoimBoardDto["kind"]; name: string | null; write_min_role: MoimRole; sort_order: number; is_active: boolean }[]).map(
    (b) => ({ id: b.id, kind: b.kind, name: b.name, writeMinRole: b.write_min_role, sortOrder: b.sort_order, isActive: b.is_active })
  );

  return {
    id: moim.id,
    name: moim.name,
    intro: moim.intro,
    coverImageUrl: moim.cover_image_url,
    category: cats.get(moim.category_id) ?? null,
    cityLabel: cityLabel(moim.lgu_id),
    joinMode: moim.join_mode,
    capacity: moim.capacity,
    memberCount: moim.member_count,
    ageMinBirthYear: moim.age_min_birth_year,
    ageMaxBirthYear: moim.age_max_birth_year,
    status: moim.status,
    platformState: moim.platform_state,
    createdAt: moim.created_at,
    updatedAt: moim.updated_at,
    lastActivityAt: moim.last_activity_at,
    host: host.get(moim.host_user_id) ?? null,
    joinQuestions: ((questions.data ?? []) as { question: string }[]).map((q) => q.question),
    boards: isMember ? boardRows.filter((b) => b.isActive) : [],
    pinnedNotices: await toPosts(sb, moim.id, (pinned.data ?? []) as PostRow[], viewerId),
    recentPosts: await toPosts(sb, moim.id, (recent.data ?? []) as PostRow[], viewerId),
    viewer: {
      loggedIn: !!viewerId,
      status: me?.status ?? null,
      role,
      nickname: me?.nickname ?? null,
      avatarUrl: me?.avatar_url ?? null,
      bio: me?.bio ?? null,
      pendingRequestId: (pendingReq.data as { id: string } | null)?.id ?? null,
      banned: !!ban.data,
      incomingHostTransferId: (transfer.data as { id: string } | null)?.id ?? null,
      roomId: isMember ? moim.main_room_id : null,
    },
    can: moimCanMap(access),
    permissionOverrides: access.overrides,
  };
}

/** 멤버 목록 — 멤버만. 재가입 횟수·운영진 메모는 메모 권한(write_note) 있는 사람만 */
export async function listMoimMembers(sb: SupabaseServer, access: MoimAccess): Promise<MoimMemberDto[] | null> {
  if (!access.role) return null;
  const staffView = moimCanMap(access).write_note;
  const { data } = await sb
    .from("moim_members")
    .select(MEMBER_COLS)
    .eq("moim_id", access.moim.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1000);
  const rows = (data ?? []) as MemberRow[];
  let notes = new Map<string, string>();
  if (staffView && rows.length) {
    const { data: n } = await sb.from("moim_member_notes").select("target_user_id, body").eq("moim_id", access.moim.id);
    notes = new Map(((n ?? []) as { target_user_id: string; body: string }[]).map((x) => [x.target_user_id, x.body]));
  }
  const rank: Record<MoimRole, number> = { host: 0, co_host: 1, staff: 2, member: 3 };
  return rows
    .sort((a, b) => rank[a.role] - rank[b.role])
    .map((m) => ({
      userId: m.user_id,
      nickname: m.nickname,
      avatarUrl: m.avatar_url,
      bio: m.bio,
      role: m.role,
      joinedAt: m.joined_at,
      ...(staffView ? { rejoinCount: m.rejoin_count, note: notes.get(m.user_id) ?? null } : {}),
    }));
}

export async function listMoimJoinRequests(sb: SupabaseServer, access: MoimAccess): Promise<MoimJoinRequestDto[] | null> {
  if (!moimCanMap(access).decide_join) return null;
  const moimId = access.moim.id;
  const [{ data: reqs }, { data: qs }] = await Promise.all([
    sb.from("moim_join_requests").select("id, user_id, answers, created_at").eq("moim_id", moimId).eq("status", "pending").order("created_at"),
    sb.from("moim_join_questions").select("question, sort_order").eq("moim_id", moimId).order("sort_order"),
  ]);
  const list = (reqs ?? []) as { id: string; user_id: string; answers: unknown; created_at: string }[];
  const questions = ((qs ?? []) as { question: string }[]).map((q) => q.question);
  const { data: mem } = list.length
    ? await sb.from("moim_members").select(MEMBER_COLS).eq("moim_id", moimId).in("user_id", list.map((r) => r.user_id))
    : { data: [] };
  const byUser = new Map(((mem ?? []) as MemberRow[]).map((m) => [m.user_id, m]));
  return list.map((r) => {
    const m = byUser.get(r.user_id);
    const answers = Array.isArray(r.answers) ? r.answers.map((a) => (typeof a === "string" ? a : "")) : [];
    return {
      id: r.id,
      userId: r.user_id,
      nickname: m?.nickname ?? "",
      avatarUrl: m?.avatar_url ?? null,
      bio: m?.bio ?? "",
      answers: questions.map((q, i) => ({ question: q, answer: answers[i] ?? "" })),
      createdAt: r.created_at,
      rejoinCount: m?.rejoin_count ?? 0,
    };
  });
}

export async function listMoimBans(sb: SupabaseServer, access: MoimAccess): Promise<MoimBannedDto[] | null> {
  if (!moimCanMap(access).ban_member) return null;
  const { data } = await sb
    .from("moim_bans")
    .select("user_id, reason, created_at")
    .eq("moim_id", access.moim.id)
    .is("released_at", null)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as { user_id: string; reason: string | null; created_at: string }[];
  const authors = await authorMap(sb, access.moim.id, rows.map((r) => r.user_id));
  return rows.map((r) => ({
    userId: r.user_id,
    nickname: authors.get(r.user_id)?.nickname ?? "",
    avatarUrl: authors.get(r.user_id)?.avatarUrl ?? null,
    reason: r.reason,
    createdAt: r.created_at,
  }));
}

export async function listMoimInviteLinks(sb: SupabaseServer, access: MoimAccess): Promise<MoimInviteLinkDto[] | null> {
  if (!moimCanMap(access).manage_invite_link) return null;
  const { data } = await sb
    .from("moim_invites")
    .select("id, token, expires_at, usage_count, created_at")
    .eq("moim_id", access.moim.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  const now = Date.now();
  return ((data ?? []) as { id: string; token: string; expires_at: string | null; usage_count: number; created_at: string }[])
    .filter((r) => !r.expires_at || Date.parse(r.expires_at) > now)
    .map((r) => ({ id: r.id, token: r.token, expiresAt: r.expires_at, usageCount: r.usage_count, createdAt: r.created_at }));
}

export async function listMoimPosts(
  sb: SupabaseServer,
  access: MoimAccess,
  viewerId: string | null,
  opts: { boardId?: string | null; before?: string | null; limit?: number }
): Promise<{ items: MoimPostDto[]; nextBefore: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  let q = sb.from("moim_posts").select(POST_COLS).eq("moim_id", access.moim.id).eq("status", "active");
  if (!access.role) q = q.eq("visibility", "public");
  if (opts.boardId) q = q.eq("board_id", opts.boardId);
  if (opts.before) q = q.lt("created_at", opts.before);
  const { data } = await q.order("created_at", { ascending: false }).limit(limit + 1);
  const rows = (data ?? []) as PostRow[];
  const page = rows.slice(0, limit);
  return {
    items: await toPosts(sb, access.moim.id, page, viewerId),
    nextBefore: rows.length > limit ? page[page.length - 1]?.created_at ?? null : null,
  };
}

/** 글 1개 — 볼 수 있는 경우만 (멤버 전용 글은 멤버만) */
export async function getMoimPost(
  sb: SupabaseServer,
  postId: string,
  viewerId: string | null
): Promise<{ post: MoimPostDto; access: MoimAccess } | null> {
  const { data } = await sb.from("moim_posts").select(POST_COLS).eq("id", postId).maybeSingle();
  const row = data as PostRow | null;
  if (!row || row.status !== "active") return null;
  const access = await loadMoimAccess(sb, row.moim_id, viewerId);
  if (!access) return null;
  if (row.visibility !== "public" && !access.role) return null;
  const [post] = await toPosts(sb, row.moim_id, [row], viewerId);
  return { post, access };
}

export async function listMoimComments(sb: SupabaseServer, post: MoimPostDto, viewerId: string | null): Promise<MoimCommentDto[]> {
  const { data } = await sb
    .from("moim_comments")
    .select("id, post_id, author_id, body, created_at")
    .eq("post_id", post.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(500);
  const rows = (data ?? []) as { id: string; post_id: string; author_id: string; body: string; created_at: string }[];
  const authors = await authorMap(sb, post.moimId, rows.map((r) => r.author_id));
  return rows.map((r) => ({
    id: r.id,
    postId: r.post_id,
    body: r.body,
    author: authors.get(r.author_id)!,
    createdAt: r.created_at,
    viewerIsAuthor: !!viewerId && viewerId === r.author_id,
  }));
}

/** 받은 모임 초대 (대기 중) */
export async function listReceivedMoimInvites(sb: SupabaseServer, userId: string): Promise<MoimReceivedInviteDto[]> {
  const { data } = await sb
    .from("moim_invite_targets")
    .select("id, moim_id, inviter_id, created_at")
    .eq("invitee_user_id", userId)
    .eq("status", "sent")
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as { id: string; moim_id: string; inviter_id: string; created_at: string }[];
  if (!rows.length) return [];
  const { data: moims } = await sb.from("moims").select(MOIM_COLS).in("id", rows.map((r) => r.moim_id)).eq("status", "active");
  const cards = new Map((await toCards(sb, (moims ?? []) as MoimRow[], userId)).map((c) => [c.id, c]));
  const out: MoimReceivedInviteDto[] = [];
  for (const r of rows) {
    const card = cards.get(r.moim_id);
    if (!card) continue;
    const inviter = (await authorMap(sb, r.moim_id, [r.inviter_id])).get(r.inviter_id);
    out.push({ id: r.id, moim: card, inviterNickname: inviter?.nickname ?? "", createdAt: r.created_at });
  }
  return out;
}

/** 알림 받는 사람 — 이 모임에서 action 을 할 수 있는 활성 멤버 */
export async function listMoimActorsFor(sb: SupabaseServer, moimId: string, action: MoimAction): Promise<string[]> {
  const access = await loadMoimAccess(sb, moimId, null);
  if (!access) return [];
  const overrides = await loadOverrides(sb, moimId);
  const { data } = await sb.from("moim_members").select("user_id, role").eq("moim_id", moimId).eq("status", "active").neq("role", "member");
  return ((data ?? []) as { user_id: string; role: MoimRole }[])
    .filter((m) =>
      canMoimAction({ moimStatus: access.moim.status, platformState: access.moim.platform_state, viewerRole: m.role, overrides }, action)
    )
    .map((m) => m.user_id);
}

export async function listActiveMoimMemberIds(sb: SupabaseServer, moimId: string): Promise<string[]> {
  const { data } = await sb.from("moim_members").select("user_id").eq("moim_id", moimId).eq("status", "active").limit(5000);
  return ((data ?? []) as { user_id: string }[]).map((m) => m.user_id);
}

export async function loadMoimName(sb: SupabaseServer, moimId: string): Promise<string> {
  const { data } = await sb.from("moims").select("name").eq("id", moimId).maybeSingle();
  return ((data as { name?: string } | null)?.name ?? "").trim();
}
