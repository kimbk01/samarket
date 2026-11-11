import "server-only";

import type { SupabaseServer } from "@/lib/chat/supabase-server";
import { moimRoleRank, type MoimRole } from "@/lib/moim/moim-permission-contract";
import type {
  MoimAlbumItemDto,
  MoimAuthorDto,
  MoimNotificationPrefsDto,
  MoimScheduleDto,
  MoimScheduleParticipantDto,
  MoimScheduleParticipantStatus,
} from "@/lib/moim/moim-api-types";
import type { MoimAccess } from "@/lib/moim/server/moim-queries.server";

/**
 * 일정·앨범·알림 설정 읽기 (서버 전용). 일정·앨범은 멤버만 본다(설계 §6 P2 — 비멤버는 다가오는 일정 제목만 공개 페이지에서).
 */

type ScheduleRow = {
  id: string;
  moim_id: string;
  host_user_id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  place_text: string;
  description: string;
  images: unknown;
  capacity: number | null;
  join_mode: "first_come" | "approval";
  ask_motivation: boolean;
  status: MoimScheduleDto["status"];
  room_id: string | null;
  confirmed_count: number;
  created_at: string;
  updated_at: string;
};
const SCHEDULE_COLS =
  "id, moim_id, host_user_id, title, starts_at, ends_at, place_text, description, images, capacity, join_mode, ask_motivation, status, room_id, confirmed_count, created_at, updated_at";

async function members(sb: SupabaseServer, moimId: string, ids: string[]): Promise<Map<string, MoimAuthorDto & { status: string }>> {
  const uniq = [...new Set(ids)].filter(Boolean);
  const out = new Map<string, MoimAuthorDto & { status: string }>();
  if (!uniq.length) return out;
  const { data } = await sb.from("moim_members").select("user_id, nickname, avatar_url, role, status").eq("moim_id", moimId).in("user_id", uniq);
  for (const m of (data ?? []) as { user_id: string; nickname: string; avatar_url: string | null; role: MoimRole; status: string }[]) {
    out.set(m.user_id, {
      userId: m.user_id,
      nickname: m.nickname,
      avatarUrl: m.avatar_url,
      role: m.status === "active" ? m.role : null,
      isActiveMember: m.status === "active",
      status: m.status,
    });
  }
  for (const id of uniq) {
    if (!out.has(id)) out.set(id, { userId: id, nickname: "", avatarUrl: null, role: null, isActiveMember: false, status: "" });
  }
  return out;
}

function imagesOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

async function toSchedules(sb: SupabaseServer, access: MoimAccess, viewerId: string | null, rows: ScheduleRow[]): Promise<MoimScheduleDto[]> {
  if (!rows.length) return [];
  const moimId = access.moim.id;
  const [hosts, mine] = await Promise.all([
    members(sb, moimId, rows.map((r) => r.host_user_id)),
    viewerId
      ? sb.from("moim_schedule_participants").select("schedule_id, status").eq("user_id", viewerId).in("schedule_id", rows.map((r) => r.id))
      : Promise.resolve({ data: [] }),
  ]);
  const myStatus = new Map(((mine.data ?? []) as { schedule_id: string; status: MoimScheduleParticipantStatus }[]).map((r) => [r.schedule_id, r.status]));
  const roleManage = moimRoleRank(access.role) >= moimRoleRank("co_host");
  return rows.map((r) => {
    const host = hosts.get(r.host_user_id)!;
    const status = myStatus.get(r.id) ?? null;
    const isHost = !!viewerId && viewerId === r.host_user_id;
    return {
      id: r.id,
      moimId: r.moim_id,
      title: r.title,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      placeText: r.place_text,
      description: r.description,
      images: imagesOf(r.images),
      capacity: r.capacity,
      joinMode: r.join_mode,
      askMotivation: r.ask_motivation,
      status: r.status,
      confirmedCount: r.confirmed_count,
      host: { userId: host.userId, nickname: host.nickname, avatarUrl: host.avatarUrl, role: host.role, isActiveMember: host.isActiveMember },
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      viewer: {
        status,
        isHost,
        canManage: !!access.role && access.moim.status === "active" && access.moim.platform_state !== "blocked" && (isHost || roleManage),
        roomId: status === "confirmed" ? r.room_id : null,
      },
    };
  });
}

/** 일정 목록 — scope=upcoming(다가오는, 시작 순) | past(지난·취소, 최근 순) */
export async function listMoimSchedules(
  sb: SupabaseServer,
  access: MoimAccess,
  viewerId: string | null,
  opts: { scope: "upcoming" | "past"; limit?: number }
): Promise<MoimScheduleDto[] | null> {
  if (!access.role) return null;
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  let q = sb.from("moim_schedules").select(SCHEDULE_COLS).eq("moim_id", access.moim.id);
  q =
    opts.scope === "upcoming"
      ? q.in("status", ["recruiting", "full", "closed"]).order("starts_at", { ascending: true })
      : q.in("status", ["done", "cancelled"]).order("starts_at", { ascending: false });
  const { data } = await q.limit(limit);
  return toSchedules(sb, access, viewerId, (data ?? []) as ScheduleRow[]);
}

/** 공개 페이지용: 다가오는 일정 제목·시간만 (비멤버도) */
export async function listUpcomingScheduleTeasers(sb: SupabaseServer, moimId: string, limit = 3) {
  const { data } = await sb
    .from("moim_schedules")
    .select("id, title, starts_at, confirmed_count, capacity, status")
    .eq("moim_id", moimId)
    .in("status", ["recruiting", "full", "closed"])
    .order("starts_at", { ascending: true })
    .limit(limit);
  return ((data ?? []) as { id: string; title: string; starts_at: string; confirmed_count: number; capacity: number | null; status: string }[]).map((r) => ({
    id: r.id,
    title: r.title,
    startsAt: r.starts_at,
    confirmedCount: r.confirmed_count,
    capacity: r.capacity,
    status: r.status,
  }));
}

export async function getMoimSchedule(
  sb: SupabaseServer,
  access: MoimAccess,
  viewerId: string | null,
  scheduleId: string
): Promise<MoimScheduleDto | null> {
  if (!access.role) return null;
  const { data } = await sb.from("moim_schedules").select(SCHEDULE_COLS).eq("id", scheduleId).eq("moim_id", access.moim.id).maybeSingle();
  if (!data) return null;
  const [s] = await toSchedules(sb, access, viewerId, [data as ScheduleRow]);
  return s ?? null;
}

/** 참여자 — 확정은 멤버 누구나, 신청·지원 동기는 관리권자만 */
export async function listMoimScheduleParticipants(
  sb: SupabaseServer,
  schedule: MoimScheduleDto
): Promise<MoimScheduleParticipantDto[]> {
  const statuses = schedule.viewer.canManage ? ["confirmed", "requested"] : ["confirmed"];
  const { data } = await sb
    .from("moim_schedule_participants")
    .select("user_id, status, motivation, attendance, created_at")
    .eq("schedule_id", schedule.id)
    .in("status", statuses)
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as { user_id: string; status: MoimScheduleParticipantStatus; motivation: string | null; attendance: "unknown" | "present" | "absent" }[];
  const people = await members(sb, schedule.moimId, rows.map((r) => r.user_id));
  return rows.map((r) => {
    const m = people.get(r.user_id)!;
    return {
      userId: r.user_id,
      nickname: m.nickname,
      avatarUrl: m.avatarUrl,
      role: m.role,
      status: r.status,
      motivation: schedule.viewer.canManage ? r.motivation : null,
      attendance: r.attendance,
    };
  });
}

export async function listMoimAlbum(
  sb: SupabaseServer,
  access: MoimAccess,
  viewerId: string | null,
  opts: { before?: string | null; limit?: number; pinnedOnly?: boolean; scheduleId?: string | null }
): Promise<{ items: MoimAlbumItemDto[]; nextBefore: string | null } | null> {
  if (!access.role) return null;
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 60);
  let q = sb
    .from("moim_album_items")
    .select("id, url, is_pinned, schedule_id, uploader_id, created_at")
    .eq("moim_id", access.moim.id)
    .eq("status", "active");
  if (opts.pinnedOnly) q = q.eq("is_pinned", true);
  if (opts.scheduleId) q = q.eq("schedule_id", opts.scheduleId);
  if (opts.before) q = q.lt("created_at", opts.before);
  const { data } = await q.order("created_at", { ascending: false }).limit(limit + 1);
  const rows = (data ?? []) as { id: string; url: string; is_pinned: boolean; schedule_id: string | null; uploader_id: string; created_at: string }[];
  const page = rows.slice(0, limit);
  const people = await members(sb, access.moim.id, page.map((r) => r.uploader_id));
  return {
    items: page.map((r) => {
      const m = people.get(r.uploader_id)!;
      return {
        id: r.id,
        url: r.url,
        isPinned: r.is_pinned,
        scheduleId: r.schedule_id,
        uploader: { userId: m.userId, nickname: m.nickname, avatarUrl: m.avatarUrl, role: m.role, isActiveMember: m.isActiveMember },
        createdAt: r.created_at,
        viewerIsUploader: !!viewerId && viewerId === r.uploader_id,
      };
    }),
    nextBefore: rows.length > limit ? page[page.length - 1]?.created_at ?? null : null,
  };
}

export async function getMoimNotificationPrefs(sb: SupabaseServer, moimId: string, userId: string): Promise<MoimNotificationPrefsDto> {
  const { data } = await sb.from("moim_notification_prefs").select("notice, posts, schedules").eq("moim_id", moimId).eq("user_id", userId).maybeSingle();
  const row = data as MoimNotificationPrefsDto | null;
  return row ?? { notice: true, posts: false, schedules: true };
}
