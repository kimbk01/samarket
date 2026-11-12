import "server-only";

import type { SupabaseServer } from "@/lib/chat/supabase-server";
import { lguPublicName } from "@/lib/neighborhood/lgu-location.server";
import { isUuidString } from "@/lib/shared/uuid-string";
import { manilaDayStartMs } from "@/lib/admin/community-admin/community-admin-period";
import { resolveMoimRooms } from "@/lib/admin/moim/moim-room-ref.server";
import {
  MOIM_ADMIN_PAGE_DEFAULT,
  MOIM_ADMIN_PAGE_MAX,
  type MoimAdminActivityFilter,
  type MoimAdminCategoryRow,
  type MoimAdminDetailSection,
  type MoimAdminHostRequestStatus,
  type MoimAdminListRow,
  type MoimAdminListTab,
  type MoimAdminPerson,
  type MoimAdminReportStatus,
  type MoimAdminReportTargetType,
  type MoimAdminSanctionFilter,
} from "@/lib/admin/moim/moim-admin-contract";

/**
 * 모임 어드민 읽기 (서버 전용 · service_role · 설계 moim §8). 쓰기는 `lib/moim/server/moim-rpc.server.ts` 의 어드민 RPC 만.
 * 집계용 SQL 함수를 새로 만들지 않고 PostgREST 질의로 읽는다 — 신고 수 필터는 신고 행(최대 MOIM_REPORT_SCAN_CAP)을 세어 거른다.
 */

type Sb = SupabaseServer;

const DAY_MS = 86_400_000;
/** 신고 수 필터·묶음 보기에서 읽는 신고 행 상한 */
export const MOIM_REPORT_SCAN_CAP = 10_000;

export function parseMoimAdminPage(sp: URLSearchParams): { limit: number; offset: number } {
  const l = Math.floor(Number(sp.get("limit")));
  const o = Math.floor(Number(sp.get("offset")));
  return {
    limit: Number.isFinite(l) && l > 0 ? Math.min(l, MOIM_ADMIN_PAGE_MAX) : MOIM_ADMIN_PAGE_DEFAULT,
    offset: Number.isFinite(o) && o > 0 ? o : 0,
  };
}

/** PostgREST or() 안에 넣을 검색어 — 구분 문자 제거 */
export function sanitizeMoimAdminSearch(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/[,()*%\\"'`:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export async function loadAdminPeople(sb: Sb, ids: (string | null | undefined)[]): Promise<Map<string, MoimAdminPerson>> {
  const uniq = [...new Set(ids.filter((x): x is string => typeof x === "string" && isUuidString(x)))];
  const map = new Map<string, MoimAdminPerson>();
  if (!uniq.length) return map;
  for (let i = 0; i < uniq.length; i += 200) {
    const { data } = await sb
      .from("profiles")
      .select("id, nickname, username, dibay_id, last_login_at")
      .in("id", uniq.slice(i, i + 200));
    for (const p of (data ?? []) as { id: string; nickname: string | null; username: string | null; dibay_id: string | null; last_login_at: string | null }[]) {
      map.set(p.id, { userId: p.id, nickname: p.nickname, username: p.username, dibayId: p.dibay_id, lastLoginAt: p.last_login_at });
    }
  }
  return map;
}

function person(map: Map<string, MoimAdminPerson>, id: string | null | undefined): MoimAdminPerson | null {
  if (!id) return null;
  return map.get(id) ?? { userId: id, nickname: null, username: null, dibayId: null, lastLoginAt: null };
}

async function loadMoimNames(sb: Sb, ids: string[]): Promise<Map<string, { name: string; status: string; platformState: string }>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, { name: string; status: string; platformState: string }>();
  for (let i = 0; i < uniq.length; i += 200) {
    const { data } = await sb.from("moims").select("id, name, status, platform_state").in("id", uniq.slice(i, i + 200));
    for (const m of (data ?? []) as { id: string; name: string; status: string; platform_state: string }[]) {
      map.set(m.id, { name: m.name, status: m.status, platformState: m.platform_state });
    }
  }
  return map;
}

/** 모임별 별명 (모임 안 프로필) */
async function loadMemberNicknames(sb: Sb, moimId: string, userIds: (string | null | undefined)[]): Promise<Map<string, { nickname: string; role: string; status: string }>> {
  const uniq = [...new Set(userIds.filter((x): x is string => !!x))];
  const map = new Map<string, { nickname: string; role: string; status: string }>();
  if (!uniq.length) return map;
  const { data } = await sb.from("moim_members").select("user_id, nickname, role, status").eq("moim_id", moimId).in("user_id", uniq);
  for (const r of (data ?? []) as { user_id: string; nickname: string; role: string; status: string }[]) {
    map.set(r.user_id, { nickname: r.nickname, role: r.role, status: r.status });
  }
  return map;
}

async function countReportsByMoim(sb: Sb, moimIds?: string[]): Promise<Map<string, number> | null> {
  let q = sb.from("moim_reports").select("moim_id").limit(MOIM_REPORT_SCAN_CAP);
  if (moimIds) {
    if (!moimIds.length) return new Map();
    q = q.in("moim_id", moimIds);
  }
  const { data, error } = await q;
  if (error) return null;
  const map = new Map<string, number>();
  for (const r of (data ?? []) as { moim_id: string }[]) map.set(r.moim_id, (map.get(r.moim_id) ?? 0) + 1);
  return map;
}

// ── 모임 목록 ───────────────────────────────────────────────────────────────

export type MoimAdminListFilter = {
  tab: MoimAdminListTab;
  lguId: string | null;
  categoryId: string | null;
  createdFromIso: string | null;
  createdToIso: string | null;
  minReports: number | null;
  activity: MoimAdminActivityFilter | null;
  q: string;
  limit: number;
  offset: number;
};

const LIST_COLS =
  "id, name, status, platform_state, category_id, lgu_id, member_count, capacity, host_user_id, last_activity_at, created_at";

type ListRow = {
  id: string;
  name: string;
  status: string;
  platform_state: string;
  category_id: string;
  lgu_id: string;
  member_count: number;
  capacity: number | null;
  host_user_id: string;
  last_activity_at: string;
  created_at: string;
};

export async function listAdminMoims(
  sb: Sb,
  f: MoimAdminListFilter,
  now: Date = new Date()
): Promise<{ ok: true; total: number; rows: MoimAdminListRow[] } | { ok: false; error: string }> {
  // 검색 — 모임 id(정확히) · 모임 이름 · 모임장 닉네임/DIBAY ID/아이디
  let orFilter: string | null = null;
  let idEq: string | null = null;
  if (f.q) {
    if (isUuidString(f.q)) idEq = f.q;
    else {
      const like = `%${f.q}%`;
      const { data: hosts } = await sb
        .from("profiles")
        .select("id")
        .or(`nickname.ilike.${like},dibay_id.ilike.${like},username.ilike.${like}`)
        .limit(200);
      const hostIds = ((hosts ?? []) as { id: string }[]).map((h) => h.id);
      orFilter = `name.ilike.${like}${hostIds.length ? `,host_user_id.in.(${hostIds.join(",")})` : ""}`;
    }
  }
  let reportIds: string[] | null = null;
  if (f.minReports && f.minReports > 0) {
    const counts = await countReportsByMoim(sb);
    if (!counts) return { ok: false, error: "reports_unavailable" };
    reportIds = [...counts.entries()].filter(([, n]) => n >= (f.minReports as number)).map(([id]) => id);
    if (!reportIds.length) return { ok: true, total: 0, rows: [] };
  }

  let q = sb.from("moims").select(LIST_COLS, { count: "exact" });
  switch (f.tab) {
    case "all":
      q = q.neq("status", "deleted");
      break;
    case "normal":
      q = q.eq("status", "active").eq("platform_state", "normal");
      break;
    case "unlisted":
    case "warned":
    case "blocked":
      q = q.neq("status", "deleted").eq("platform_state", f.tab);
      break;
    case "closed":
      q = q.eq("status", "closed");
      break;
    case "deleted":
      q = q.eq("status", "deleted");
      break;
  }
  if (idEq) q = q.eq("id", idEq);
  if (orFilter) q = q.or(orFilter);
  if (reportIds) q = q.in("id", reportIds.slice(0, 1000));
  if (f.lguId) q = q.eq("lgu_id", f.lguId);
  if (f.categoryId) q = q.eq("category_id", f.categoryId);
  if (f.createdFromIso) q = q.gte("created_at", f.createdFromIso);
  if (f.createdToIso) q = q.lt("created_at", f.createdToIso);
  if (f.activity) {
    const ms = now.getTime();
    if (f.activity === "7d") q = q.gte("last_activity_at", new Date(ms - 7 * DAY_MS).toISOString());
    if (f.activity === "30d") q = q.gte("last_activity_at", new Date(ms - 30 * DAY_MS).toISOString());
    if (f.activity === "idle30") q = q.lt("last_activity_at", new Date(ms - 30 * DAY_MS).toISOString());
    if (f.activity === "idle90") q = q.lt("last_activity_at", new Date(ms - 90 * DAY_MS).toISOString());
  }
  const { data, error, count } = await q.order("created_at", { ascending: false }).range(f.offset, f.offset + f.limit - 1);
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as ListRow[];
  const [people, cats, reports] = await Promise.all([
    loadAdminPeople(sb, rows.map((r) => r.host_user_id)),
    loadCategoryMap(sb, rows.map((r) => r.category_id)),
    countReportsByMoim(sb, rows.map((r) => r.id)),
  ]);
  return {
    ok: true,
    total: count ?? rows.length,
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      platformState: r.platform_state,
      categoryLabelKo: cats.get(r.category_id)?.labelKo ?? null,
      categoryLabelEn: cats.get(r.category_id)?.labelEn ?? null,
      lguId: r.lgu_id,
      lguLabel: lguPublicName(r.lgu_id),
      memberCount: r.member_count,
      capacity: r.capacity,
      host: person(people, r.host_user_id),
      reportCount: reports?.get(r.id) ?? 0,
      lastActivityAt: r.last_activity_at,
      createdAt: r.created_at,
    })),
  };
}

/** 목록 필터 선택지 — 동네(모임이 있는 LGU) · 카테고리 전체 */
export async function loadAdminMoimFacets(sb: Sb): Promise<{ lgus: { id: string; label: string }[]; categories: MoimAdminCategoryRow[] }> {
  const [{ data: lguRows }, categories] = await Promise.all([
    sb.from("moims").select("lgu_id").neq("status", "deleted").limit(5000),
    listAdminMoimCategories(sb),
  ]);
  const ids = [...new Set(((lguRows ?? []) as { lgu_id: string }[]).map((r) => r.lgu_id).filter(Boolean))];
  const lgus = ids.map((id) => ({ id, label: lguPublicName(id) ?? id })).sort((a, b) => a.label.localeCompare(b.label));
  return { lgus, categories };
}

async function loadCategoryMap(sb: Sb, ids: string[]): Promise<Map<string, { labelKo: string; labelEn: string }>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, { labelKo: string; labelEn: string }>();
  if (!uniq.length) return map;
  const { data } = await sb.from("moim_categories").select("id, label_ko, label_en").in("id", uniq);
  for (const c of (data ?? []) as { id: string; label_ko: string; label_en: string }[]) map.set(c.id, { labelKo: c.label_ko, labelEn: c.label_en });
  return map;
}

/** "YYYY-MM-DD"(PHT) 범위 → [fromIso, toIso) — 잘못된 값은 null */
export function manilaDateRangeIso(from: string | null, to: string | null): { fromIso: string | null; toIso: string | null } {
  const f = from ? manilaDayStartMs(from) : null;
  const t = to ? manilaDayStartMs(to) : null;
  return {
    fromIso: f == null ? null : new Date(f).toISOString(),
    toIso: t == null ? null : new Date(t + DAY_MS).toISOString(),
  };
}

// ── 모임 상세 ───────────────────────────────────────────────────────────────

export async function loadAdminMoimInfo(sb: Sb, moimId: string) {
  const { data: m, error } = await sb.from("moims").select("*").eq("id", moimId).maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!m) return { ok: false as const, error: "moim_not_found" };
  const moim = m as Record<string, unknown> & {
    id: string;
    host_user_id: string;
    created_by: string;
    deleted_by: string | null;
    lgu_id: string;
    main_room_id: string | null;
  };
  const [questions, categories, people, sanctions, warnCount, openTransfer, reportCount] = await Promise.all([
    sb.from("moim_join_questions").select("question, sort_order").eq("moim_id", moimId).order("sort_order"),
    listAdminMoimCategories(sb),
    loadAdminPeople(sb, [moim.host_user_id, moim.created_by, moim.deleted_by]),
    sb
      .from("moim_sanctions")
      .select("id, level, reason_code, reason, starts_at, ends_at")
      .eq("moim_id", moimId)
      .eq("target_kind", "moim")
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    sb.from("moim_sanctions").select("id", { count: "exact", head: true }).eq("moim_id", moimId).eq("level", "warn"),
    sb
      .from("moim_host_transfers")
      .select("id, kind, to_user_id, created_at")
      .eq("moim_id", moimId)
      .eq("status", "requested")
      .maybeSingle(),
    sb.from("moim_reports").select("id", { count: "exact", head: true }).eq("moim_id", moimId),
  ]);
  const nowMs = Date.now();
  const activeSanctions = ((sanctions.data ?? []) as { id: string; level: string; reason_code: string; reason: string; starts_at: string; ends_at: string | null }[]).filter(
    (s) => Date.parse(s.starts_at) <= nowMs && (!s.ends_at || Date.parse(s.ends_at) > nowMs)
  );
  return {
    ok: true as const,
    moim: {
      id: moim.id,
      name: moim.name as string,
      intro: moim.intro as string,
      coverImageUrl: (moim.cover_image_url as string | null) ?? null,
      categoryId: moim.category_id as string,
      lguId: moim.lgu_id,
      lguLabel: lguPublicName(moim.lgu_id),
      joinMode: moim.join_mode as string,
      capacity: (moim.capacity as number | null) ?? null,
      memberCount: moim.member_count as number,
      status: moim.status as string,
      platformState: moim.platform_state as string,
      mainRoomId: moim.main_room_id,
      lastActivityAt: moim.last_activity_at as string,
      createdAt: moim.created_at as string,
      updatedAt: moim.updated_at as string,
      closedAt: (moim.closed_at as string | null) ?? null,
      deletedAt: (moim.deleted_at as string | null) ?? null,
      host: person(people, moim.host_user_id),
      createdBy: person(people, moim.created_by),
      deletedBy: person(people, moim.deleted_by),
      questions: ((questions.data ?? []) as { question: string }[]).map((q) => q.question),
    },
    categories,
    activeSanctions,
    warnCount: warnCount.count ?? null,
    reportCount: reportCount.count ?? null,
    openTransfer: (openTransfer.data as { id: string; kind: string; to_user_id: string; created_at: string } | null) ?? null,
  };
}

export async function loadAdminMoimSection(
  sb: Sb,
  moimId: string,
  section: Exclude<MoimAdminDetailSection, "info">,
  page: { limit: number; offset: number },
  opts: { userId?: string | null; postId?: string | null } = {}
): Promise<{ ok: true; total: number | null; rows: unknown[] } | { ok: false; error: string }> {
  const range = [page.offset, page.offset + page.limit - 1] as const;
  switch (section) {
    case "members": {
      const { data, error, count } = await sb
        .from("moim_members")
        .select("user_id, role, status, nickname, avatar_url, joined_at, left_at, rejoin_count, role_changed_at, created_at", { count: "exact" })
        .eq("moim_id", moimId)
        .order("status", { ascending: true })
        .order("joined_at", { ascending: false, nullsFirst: false })
        .range(...range);
      if (error) return { ok: false, error: error.message };
      const rows = (data ?? []) as { user_id: string }[];
      const [people, bans] = await Promise.all([
        loadAdminPeople(sb, rows.map((r) => r.user_id)),
        sb.from("moim_bans").select("user_id, reason, created_at").eq("moim_id", moimId).is("released_at", null),
      ]);
      const banned = new Map(((bans.data ?? []) as { user_id: string; reason: string | null; created_at: string }[]).map((b) => [b.user_id, b]));
      // 멤버 행이 없는 차단(비멤버 차단)도 보여 준다
      const extraBans = [...banned.values()].filter((b) => !rows.some((r) => r.user_id === b.user_id));
      const extraPeople = await loadAdminPeople(sb, extraBans.map((b) => b.user_id));
      return {
        ok: true,
        total: count ?? null,
        rows: [
          ...rows.map((r) => ({ ...r, account: person(people, r.user_id), ban: banned.get(r.user_id) ?? null })),
          ...(page.offset === 0
            ? extraBans.map((b) => ({ user_id: b.user_id, role: null, status: "banned", nickname: null, account: person(extraPeople, b.user_id), ban: b }))
            : []),
        ],
      };
    }
    case "requests": {
      const { data, error, count } = await sb
        .from("moim_join_requests")
        .select("id, user_id, answers, status, reason, decided_by, decided_at, created_at", { count: "exact" })
        .eq("moim_id", moimId)
        .order("created_at", { ascending: false })
        .range(...range);
      if (error) return { ok: false, error: error.message };
      const rows = (data ?? []) as { user_id: string; decided_by: string | null }[];
      const [people, nick] = await Promise.all([
        loadAdminPeople(sb, rows.flatMap((r) => [r.user_id, r.decided_by])),
        loadMemberNicknames(sb, moimId, rows.map((r) => r.user_id)),
      ]);
      return {
        ok: true,
        total: count ?? null,
        rows: rows.map((r) => ({ ...r, account: person(people, r.user_id), decider: person(people, r.decided_by), moimNickname: nick.get(r.user_id)?.nickname ?? null })),
      };
    }
    case "posts": {
      const { data, error, count } = await sb
        .from("moim_posts")
        .select("id, board_id, author_id, title, body, images, visibility, is_pinned, status, hidden_reason, comment_count, created_at", { count: "exact" })
        .eq("moim_id", moimId)
        .order("created_at", { ascending: false })
        .range(...range);
      if (error) return { ok: false, error: error.message };
      const rows = (data ?? []) as { author_id: string; board_id: string }[];
      const [nick, boards] = await Promise.all([
        loadMemberNicknames(sb, moimId, rows.map((r) => r.author_id)),
        sb.from("moim_boards").select("id, kind, name").eq("moim_id", moimId),
      ]);
      const boardMap = new Map(((boards.data ?? []) as { id: string; kind: string; name: string | null }[]).map((b) => [b.id, b]));
      return {
        ok: true,
        total: count ?? null,
        rows: rows.map((r) => ({ ...r, authorNickname: nick.get(r.author_id)?.nickname ?? null, board: boardMap.get(r.board_id) ?? null })),
      };
    }
    case "comments": {
      let q = sb
        .from("moim_comments")
        .select("id, post_id, author_id, body, status, created_at", { count: "exact" })
        .eq("moim_id", moimId);
      if (opts.postId) q = q.eq("post_id", opts.postId);
      const { data, error, count } = await q.order("created_at", { ascending: false }).range(...range);
      if (error) return { ok: false, error: error.message };
      const rows = (data ?? []) as { author_id: string }[];
      const nick = await loadMemberNicknames(sb, moimId, rows.map((r) => r.author_id));
      return { ok: true, total: count ?? null, rows: rows.map((r) => ({ ...r, authorNickname: nick.get(r.author_id)?.nickname ?? null })) };
    }
    case "schedules": {
      const { data, error, count } = await sb
        .from("moim_schedules")
        .select("id, host_user_id, title, starts_at, ends_at, place_text, capacity, confirmed_count, join_mode, status, room_id, created_at", { count: "exact" })
        .eq("moim_id", moimId)
        .order("starts_at", { ascending: false })
        .range(...range);
      if (error) return { ok: false, error: error.message };
      const rows = (data ?? []) as { host_user_id: string }[];
      const nick = await loadMemberNicknames(sb, moimId, rows.map((r) => r.host_user_id));
      return { ok: true, total: count ?? null, rows: rows.map((r) => ({ ...r, hostNickname: nick.get(r.host_user_id)?.nickname ?? null })) };
    }
    case "album": {
      const { data, error, count } = await sb
        .from("moim_album_items")
        .select("id, uploader_id, url, schedule_id, is_pinned, status, created_at", { count: "exact" })
        .eq("moim_id", moimId)
        .order("created_at", { ascending: false })
        .range(...range);
      if (error) return { ok: false, error: error.message };
      const rows = (data ?? []) as { uploader_id: string }[];
      const nick = await loadMemberNicknames(sb, moimId, rows.map((r) => r.uploader_id));
      return { ok: true, total: count ?? null, rows: rows.map((r) => ({ ...r, uploaderNickname: nick.get(r.uploader_id)?.nickname ?? null })) };
    }
    case "chats": {
      const [{ data: m }, { data: sch }] = await Promise.all([
        sb.from("moims").select("main_room_id").eq("id", moimId).maybeSingle(),
        sb.from("moim_schedules").select("id, title, status, starts_at, room_id").eq("moim_id", moimId).not("room_id", "is", null).order("starts_at", { ascending: false }).limit(200),
      ]);
      const mainRoom = (m as { main_room_id: string | null } | null)?.main_room_id ?? null;
      const schedules = (sch ?? []) as { id: string; title: string; status: string; starts_at: string; room_id: string }[];
      const roomIds = [mainRoom, ...schedules.map((s) => s.room_id)].filter((x): x is string => !!x);
      const { data: rooms } = roomIds.length
        ? await sb.from("community_messenger_rooms").select("id, title, is_readonly, updated_at").in("id", roomIds)
        : { data: [] };
      const roomMap = new Map(((rooms ?? []) as { id: string; title: string | null; is_readonly: boolean; updated_at: string }[]).map((r) => [r.id, r]));
      const rows = [
        ...(mainRoom ? [{ kind: "main", roomId: mainRoom, scheduleId: null, title: roomMap.get(mainRoom)?.title ?? null, scheduleStatus: null, startsAt: null, isReadonly: roomMap.get(mainRoom)?.is_readonly ?? null }] : []),
        ...schedules.map((s) => ({ kind: "schedule", roomId: s.room_id, scheduleId: s.id, title: s.title, scheduleStatus: s.status, startsAt: s.starts_at, isReadonly: roomMap.get(s.room_id)?.is_readonly ?? null })),
      ];
      return { ok: true, total: rows.length, rows };
    }
    case "reports": {
      const { data, error, count } = await sb
        .from("moim_reports")
        .select("id, reporter_id, target_type, target_id, reason_code, detail, status, handled_by, handled_at, created_at", { count: "exact" })
        .eq("moim_id", moimId)
        .order("created_at", { ascending: false })
        .range(...range);
      if (error) return { ok: false, error: error.message };
      const rows = (data ?? []) as { reporter_id: string }[];
      const people = await loadAdminPeople(sb, rows.map((r) => r.reporter_id));
      return { ok: true, total: count ?? null, rows: rows.map((r) => ({ ...r, reporter: person(people, r.reporter_id) })) };
    }
    case "sanctions": {
      const { data, error, count } = await sb
        .from("moim_sanctions")
        .select("id, target_kind, target_id, level, reason_code, reason, source_report_id, actor_id, starts_at, ends_at, revoked_at, revoked_by, created_at", { count: "exact" })
        .eq("moim_id", moimId)
        .order("created_at", { ascending: false })
        .range(...range);
      if (error) return { ok: false, error: error.message };
      const rows = (data ?? []) as { actor_id: string; revoked_by: string | null }[];
      const people = await loadAdminPeople(sb, rows.flatMap((r) => [r.actor_id, r.revoked_by]));
      return { ok: true, total: count ?? null, rows: rows.map((r) => ({ ...r, actor: person(people, r.actor_id), revoker: person(people, r.revoked_by) })) };
    }
    case "events": {
      const { data, error, count } = await sb
        .from("moim_events")
        .select("id, actor_id, actor_kind, type, target_id, payload, created_at", { count: "exact" })
        .eq("moim_id", moimId)
        .order("id", { ascending: false })
        .range(...range);
      if (error) return { ok: false, error: error.message };
      const rows = (data ?? []) as { actor_id: string | null; target_id: string | null }[];
      const people = await loadAdminPeople(sb, rows.flatMap((r) => [r.actor_id]));
      return { ok: true, total: count ?? null, rows: rows.map((r) => ({ ...r, actor: person(people, r.actor_id) })) };
    }
    case "profile_history": {
      let q = sb
        .from("moim_member_profile_history")
        .select("id, user_id, nickname, avatar_url, bio, changed_at", { count: "exact" })
        .eq("moim_id", moimId);
      if (opts.userId) q = q.eq("user_id", opts.userId);
      const { data, error, count } = await q.order("changed_at", { ascending: false }).range(...range);
      if (error) return { ok: false, error: error.message };
      const rows = (data ?? []) as { user_id: string }[];
      const people = await loadAdminPeople(sb, rows.map((r) => r.user_id));
      return { ok: true, total: count ?? null, rows: rows.map((r) => ({ ...r, account: person(people, r.user_id) })) };
    }
  }
}

// ── 모임 신고 큐 (M5 = 읽기 전용, 처리는 M6) ──────────────────────────────

export async function listAdminMoimReports(
  sb: Sb,
  f: { status: MoimAdminReportStatus | null; targetType: MoimAdminReportTargetType | null; moimId: string | null; limit: number; offset: number }
) {
  let q = sb
    .from("moim_reports")
    .select("id, reporter_id, moim_id, target_type, target_id, reason_code, detail, status, handled_by, handled_at, created_at", { count: "exact" });
  if (f.status) q = q.eq("status", f.status);
  if (f.targetType) q = q.eq("target_type", f.targetType);
  if (f.moimId) q = q.eq("moim_id", f.moimId);
  const { data, error, count } = await q.order("created_at", { ascending: false }).range(f.offset, f.offset + f.limit - 1);
  if (error) return { ok: false as const, error: error.message };
  const rows = (data ?? []) as { reporter_id: string; moim_id: string }[];
  const [people, moims] = await Promise.all([loadAdminPeople(sb, rows.map((r) => r.reporter_id)), loadMoimNames(sb, rows.map((r) => r.moim_id))]);
  return {
    ok: true as const,
    total: count ?? rows.length,
    rows: rows.map((r) => ({ ...r, reporter: person(people, r.reporter_id), moim: moims.get(r.moim_id) ?? null })),
  };
}

/** 같은 모임 신고 묶음 — 상태·유형 조건에 맞는 신고(최대 MOIM_REPORT_SCAN_CAP)를 모임별로 센다 */
export async function groupAdminMoimReports(
  sb: Sb,
  f: { status: MoimAdminReportStatus | null; targetType: MoimAdminReportTargetType | null; limit: number; offset: number }
) {
  let q = sb.from("moim_reports").select("moim_id, target_type, created_at").limit(MOIM_REPORT_SCAN_CAP);
  if (f.status) q = q.eq("status", f.status);
  if (f.targetType) q = q.eq("target_type", f.targetType);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) return { ok: false as const, error: error.message };
  const groups = new Map<string, { moimId: string; count: number; latestAt: string; types: Record<string, number> }>();
  for (const r of (data ?? []) as { moim_id: string; target_type: string; created_at: string }[]) {
    const g = groups.get(r.moim_id) ?? { moimId: r.moim_id, count: 0, latestAt: r.created_at, types: {} };
    g.count += 1;
    g.types[r.target_type] = (g.types[r.target_type] ?? 0) + 1;
    if (r.created_at > g.latestAt) g.latestAt = r.created_at;
    groups.set(r.moim_id, g);
  }
  const all = [...groups.values()].sort((a, b) => b.count - a.count || b.latestAt.localeCompare(a.latestAt));
  const page = all.slice(f.offset, f.offset + f.limit);
  const moims = await loadMoimNames(sb, page.map((g) => g.moimId));
  return {
    ok: true as const,
    total: all.length,
    capped: ((data ?? []) as unknown[]).length >= MOIM_REPORT_SCAN_CAP,
    rows: page.map((g) => ({ ...g, moim: moims.get(g.moimId) ?? null })),
  };
}

/** 신고 상세 — 대상 미리보기 · 신고자 · 같은 대상 신고 이력 */
export async function loadAdminMoimReportDetail(sb: Sb, reportId: string) {
  const { data: r, error } = await sb.from("moim_reports").select("*").eq("id", reportId).maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!r) return { ok: false as const, error: "report_not_found" };
  const report = r as {
    id: string;
    reporter_id: string;
    moim_id: string;
    target_type: string;
    target_id: string;
    status: string;
    action_id: string | null;
    handled_by: string | null;
  };
  const [history, moims, target, openSame, warns, moimRow, sanctions] = await Promise.all([
    sb
      .from("moim_reports")
      .select("id, reporter_id, reason_code, detail, status, created_at")
      .eq("target_type", report.target_type)
      .eq("target_id", report.target_id)
      .order("created_at", { ascending: false })
      .limit(50),
    loadMoimNames(sb, [report.moim_id]),
    loadReportTargetPreview(sb, report.moim_id, report.target_type, report.target_id),
    // M6: 같은 대상의 다른 열린 신고 수 (「같은 대상 신고 함께 처리」)
    sb
      .from("moim_reports")
      .select("id", { count: "exact", head: true })
      .eq("target_type", report.target_type)
      .eq("target_id", report.target_id)
      .in("status", ["received", "reviewing"])
      .neq("id", report.id),
    // M6: 경고 누적 (설계 P14 — 자동 차단 없음, 사람이 판단)
    sb.from("moim_sanctions").select("id", { count: "exact", head: true }).eq("moim_id", report.moim_id).eq("level", "warn"),
    sb.from("moims").select("host_user_id").eq("id", report.moim_id).maybeSingle(),
    // M6: 처리 결과 — 이 신고가 근거인 조치 + 함께 닫힌 신고면 근거 신고의 조치(action_id)
    sb
      .from("moim_sanctions")
      .select("id, target_kind, target_id, level, reason, source_report_id, actor_id, starts_at, ends_at, revoked_at, created_at")
      .or(report.action_id && isUuidString(report.action_id) ? `source_report_id.eq.${report.id},id.eq.${report.action_id}` : `source_report_id.eq.${report.id}`)
      .order("created_at", { ascending: true }),
  ]);
  const historyRows = (history.data ?? []) as { reporter_id: string }[];
  let sanctionRows = (sanctions.data ?? []) as { id: string; source_report_id: string | null; actor_id: string; target_id: string; target_kind: string }[];
  // 함께 닫힌 신고: action_id 로 근거 신고를 찾아 그 신고의 조치 전체를 보여 준다
  const sourceId = sanctionRows.find((x) => x.id === report.action_id)?.source_report_id;
  if (sourceId && sourceId !== report.id) {
    const { data } = await sb
      .from("moim_sanctions")
      .select("id, target_kind, target_id, level, reason, source_report_id, actor_id, starts_at, ends_at, revoked_at, created_at")
      .eq("source_report_id", sourceId)
      .order("created_at", { ascending: true });
    sanctionRows = (data ?? sanctionRows) as typeof sanctionRows;
  }
  const hostUserId = (moimRow.data as { host_user_id?: string } | null)?.host_user_id ?? null;
  const people = await loadAdminPeople(sb, [
    report.reporter_id,
    report.handled_by,
    hostUserId,
    ...historyRows.map((h) => h.reporter_id),
    ...sanctionRows.flatMap((x) => [x.actor_id, x.target_kind === "host" || x.target_kind === "member" ? x.target_id : null]),
  ]);
  return {
    ok: true as const,
    report: { ...report, reporter: person(people, report.reporter_id), handler: person(people, report.handled_by), moim: moims.get(report.moim_id) ?? null },
    target,
    history: historyRows.map((h) => ({ ...h, reporter: person(people, h.reporter_id) })),
    openSameTargetCount: openSame.count ?? null,
    warnCount: warns.count ?? null,
    host: person(people, hostUserId),
    resultActions: sanctionRows.map((x) => ({
      ...x,
      actor: person(people, x.actor_id),
      targetPerson: x.target_kind === "host" || x.target_kind === "member" ? person(people, x.target_id) : null,
    })),
  };
}

// ── M6: 모임 채팅방(owner_domain='moim')의 메신저 신고 — 읽기 전용, 처리는 기존 메신저 신고 화면 ─────────

/** 모임 하나의 방 id 목록 (전체 방 + 일정 방) */
async function moimRoomIds(sb: Sb, moimId: string): Promise<string[]> {
  const { data: sch } = await sb.from("moim_schedules").select("id").eq("moim_id", moimId);
  const refs = [moimId, ...((sch ?? []) as { id: string }[]).map((x) => x.id)];
  const ids: string[] = [];
  for (let i = 0; i < refs.length; i += 200) {
    const { data } = await sb.from("community_messenger_rooms").select("id").eq("owner_domain", "moim").in("owner_ref_id", refs.slice(i, i + 200));
    ids.push(...((data ?? []) as { id: string }[]).map((x) => x.id));
  }
  return ids;
}

export async function listAdminMoimMessengerReports(
  sb: Sb,
  f: { messengerStatuses: readonly string[] | null; moimId: string | null; limit: number; offset: number }
) {
  let q = sb
    .from("community_messenger_reports")
    .select(
      "id, report_type, room_id, message_id, reported_user_id, reporter_user_id, reason_type, reason_detail, status, handled_at, created_at, community_messenger_rooms!inner(owner_domain)",
      { count: "exact" }
    )
    .eq("community_messenger_rooms.owner_domain", "moim");
  if (f.moimId) {
    const ids = await moimRoomIds(sb, f.moimId);
    if (!ids.length) return { ok: true as const, total: 0, rows: [] };
    q = q.in("room_id", ids.slice(0, 1000));
  }
  if (f.messengerStatuses) q = q.in("status", [...f.messengerStatuses]);
  const { data, error, count } = await q.order("created_at", { ascending: false }).range(f.offset, f.offset + f.limit - 1);
  if (error) return { ok: false as const, error: error.message };
  type Row = {
    id: string;
    report_type: string;
    room_id: string | null;
    message_id: string | null;
    reported_user_id: string | null;
    reporter_user_id: string;
    reason_type: string;
    reason_detail: string;
    status: string;
    handled_at: string | null;
    created_at: string;
  };
  const rows = (data ?? []) as unknown as Row[];
  const rooms = await resolveMoimRooms(sb, rows.map((x) => x.room_id ?? ""));
  const [people, moims] = await Promise.all([
    loadAdminPeople(sb, rows.flatMap((x) => [x.reporter_user_id, x.reported_user_id])),
    loadMoimNames(sb, [...rooms.values()].map((x) => x.moimId)),
  ]);
  return {
    ok: true as const,
    total: count ?? rows.length,
    rows: rows.map((x) => {
      const ref = x.room_id ? rooms.get(x.room_id) ?? null : null;
      return {
        ...x,
        moimId: ref?.moimId ?? null,
        scheduleId: ref?.scheduleId ?? null,
        moim: ref ? moims.get(ref.moimId) ?? null : null,
        reporter: person(people, x.reporter_user_id),
        reported: person(people, x.reported_user_id),
      };
    }),
  };
}

async function loadReportTargetPreview(sb: Sb, moimId: string, type: string, id: string): Promise<Record<string, unknown> | null> {
  switch (type) {
    case "moim": {
      const { data } = await sb.from("moims").select("id, name, intro, cover_image_url, status, platform_state").eq("id", id).maybeSingle();
      return data ? { type, ...(data as Record<string, unknown>) } : null;
    }
    case "post": {
      const { data } = await sb.from("moim_posts").select("id, author_id, title, body, images, status, created_at").eq("id", id).maybeSingle();
      if (!data) return null;
      const nick = await loadMemberNicknames(sb, moimId, [(data as { author_id: string }).author_id]);
      return { type, ...(data as Record<string, unknown>), authorNickname: nick.get((data as { author_id: string }).author_id)?.nickname ?? null };
    }
    case "comment": {
      const { data } = await sb.from("moim_comments").select("id, post_id, author_id, body, status, created_at").eq("id", id).maybeSingle();
      if (!data) return null;
      const nick = await loadMemberNicknames(sb, moimId, [(data as { author_id: string }).author_id]);
      return { type, ...(data as Record<string, unknown>), authorNickname: nick.get((data as { author_id: string }).author_id)?.nickname ?? null };
    }
    case "album": {
      const { data } = await sb.from("moim_album_items").select("id, uploader_id, url, status, created_at").eq("id", id).maybeSingle();
      if (!data) return null;
      const nick = await loadMemberNicknames(sb, moimId, [(data as { uploader_id: string }).uploader_id]);
      return { type, ...(data as Record<string, unknown>), authorNickname: nick.get((data as { uploader_id: string }).uploader_id)?.nickname ?? null };
    }
    case "schedule": {
      const { data } = await sb
        .from("moim_schedules")
        .select("id, host_user_id, title, description, starts_at, ends_at, place_text, status, created_at")
        .eq("id", id)
        .maybeSingle();
      return data ? { type, ...(data as Record<string, unknown>) } : null;
    }
    case "member": {
      // 신고 대상 id = 회원 id (moim_report_create 가 받는 target_id)
      const [{ data: mem }, { data: hist }] = await Promise.all([
        sb.from("moim_members").select("user_id, nickname, avatar_url, bio, role, status, joined_at").eq("moim_id", moimId).eq("user_id", id).maybeSingle(),
        sb.from("moim_member_profile_history").select("nickname, avatar_url, bio, changed_at").eq("moim_id", moimId).eq("user_id", id).order("changed_at", { ascending: false }).limit(5),
      ]);
      if (!mem) return null;
      const people = await loadAdminPeople(sb, [id]);
      return { type, ...(mem as Record<string, unknown>), account: person(people, id), profileHistory: hist ?? [] };
    }
    case "chat_message": {
      const { data } = await sb
        .from("community_messenger_messages")
        .select("id, room_id, sender_id, message_type, content, created_at, deleted_at, is_hidden_by_admin")
        .eq("id", id)
        .maybeSingle();
      if (!data) return null;
      const nick = await loadMemberNicknames(sb, moimId, [(data as { sender_id: string }).sender_id]);
      return { type, ...(data as Record<string, unknown>), authorNickname: nick.get((data as { sender_id: string }).sender_id)?.nickname ?? null };
    }
    default:
      return null;
  }
}

// ── 모임장 변경 요청 큐 (P8 미접속 위임) ──────────────────────────────────

export async function listAdminMoimHostRequests(sb: Sb, f: { status: MoimAdminHostRequestStatus; limit: number; offset: number }) {
  let q = sb
    .from("moim_host_transfers")
    .select("id, moim_id, from_user_id, to_user_id, kind, status, reason, actor_id, created_at, decided_at", { count: "exact" })
    .eq("kind", "inactive_request");
  if (f.status !== "all") q = q.eq("status", f.status);
  const { data, error, count } = await q.order("created_at", { ascending: f.status === "requested" }).range(f.offset, f.offset + f.limit - 1);
  if (error) return { ok: false as const, error: error.message };
  const rows = (data ?? []) as { id: string; moim_id: string; from_user_id: string; to_user_id: string; actor_id: string | null }[];
  const [people, moims, members] = await Promise.all([
    loadAdminPeople(sb, rows.flatMap((r) => [r.from_user_id, r.to_user_id, r.actor_id])),
    loadMoimNames(sb, rows.map((r) => r.moim_id)),
    rows.length
      ? sb
          .from("moim_members")
          .select("moim_id, user_id, nickname, role, status")
          .in("moim_id", [...new Set(rows.map((r) => r.moim_id))])
          .in("user_id", [...new Set(rows.flatMap((r) => [r.from_user_id, r.to_user_id, r.actor_id].filter((x): x is string => !!x)))])
      : Promise.resolve({ data: [] }),
  ]);
  const memberKey = (moimId: string, userId: string | null) => `${moimId}:${userId}`;
  const memberMap = new Map(
    ((members.data ?? []) as { moim_id: string; user_id: string; nickname: string; role: string; status: string }[]).map((m) => [memberKey(m.moim_id, m.user_id), m])
  );
  return {
    ok: true as const,
    total: count ?? rows.length,
    rows: rows.map((r) => ({
      ...r,
      moim: moims.get(r.moim_id) ?? null,
      host: person(people, r.from_user_id),
      hostMember: memberMap.get(memberKey(r.moim_id, r.from_user_id)) ?? null,
      candidate: person(people, r.to_user_id),
      candidateMember: memberMap.get(memberKey(r.moim_id, r.to_user_id)) ?? null,
      requester: person(people, r.actor_id),
      requesterMember: memberMap.get(memberKey(r.moim_id, r.actor_id)) ?? null,
    })),
  };
}

// ── 제재 이력 ───────────────────────────────────────────────────────────────

export async function listAdminMoimSanctions(
  sb: Sb,
  f: { filter: MoimAdminSanctionFilter; moimId: string | null; limit: number; offset: number },
  now: Date = new Date()
) {
  const nowIso = now.toISOString();
  let q = sb
    .from("moim_sanctions")
    .select("id, moim_id, target_kind, target_id, level, reason_code, reason, source_report_id, actor_id, starts_at, ends_at, revoked_at, revoked_by, created_at", { count: "exact" })
    .eq("target_kind", "moim");
  if (f.moimId) q = q.eq("moim_id", f.moimId);
  if (f.filter === "active") q = q.is("revoked_at", null).or(`ends_at.is.null,ends_at.gt.${nowIso}`);
  if (f.filter === "expiring")
    q = q.is("revoked_at", null).gt("ends_at", nowIso).lte("ends_at", new Date(now.getTime() + 7 * DAY_MS).toISOString());
  if (f.filter === "expired") q = q.is("revoked_at", null).lte("ends_at", nowIso);
  if (f.filter === "revoked") q = q.not("revoked_at", "is", null);
  const order = f.filter === "expiring" ? { col: "ends_at", asc: true } : { col: "created_at", asc: false };
  const { data, error, count } = await q.order(order.col, { ascending: order.asc }).range(f.offset, f.offset + f.limit - 1);
  if (error) return { ok: false as const, error: error.message };
  const rows = (data ?? []) as { moim_id: string; actor_id: string; revoked_by: string | null }[];
  const [people, moims] = await Promise.all([
    loadAdminPeople(sb, rows.flatMap((r) => [r.actor_id, r.revoked_by])),
    loadMoimNames(sb, rows.map((r) => r.moim_id)),
  ]);
  return {
    ok: true as const,
    total: count ?? rows.length,
    rows: rows.map((r) => ({ ...r, moim: moims.get(r.moim_id) ?? null, actor: person(people, r.actor_id), revoker: person(people, r.revoked_by) })),
  };
}

// ── 카테고리 · 정책 ─────────────────────────────────────────────────────────

export async function listAdminMoimCategories(sb: Sb): Promise<MoimAdminCategoryRow[]> {
  const { data } = await sb
    .from("moim_categories")
    .select("id, slug, label_ko, label_en, sort_order, is_active, is_restricted, updated_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  return ((data ?? []) as { id: string; slug: string; label_ko: string; label_en: string; sort_order: number; is_active: boolean; is_restricted: boolean; updated_at: string }[]).map((c) => ({
    id: c.id,
    slug: c.slug,
    labelKo: c.label_ko,
    labelEn: c.label_en,
    sortOrder: c.sort_order,
    isActive: c.is_active,
    isRestricted: c.is_restricted,
    updatedAt: c.updated_at,
  }));
}

export async function loadAdminMoimPolicies(sb: Sb) {
  const { data, error } = await sb.from("moim_policies").select("*").eq("id", 1).maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!data) return { ok: false as const, error: "policies_missing" };
  return { ok: true as const, policies: data as Record<string, unknown> & { updated_at: string; banned_words: string[] | null } };
}

/** 알림용 — 모임 이름 */
export async function loadAdminMoimName(sb: Sb, moimId: string): Promise<string> {
  const { data } = await sb.from("moims").select("name").eq("id", moimId).maybeSingle();
  return ((data as { name?: string } | null)?.name ?? "").trim();
}
