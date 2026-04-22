import { normalizeUserIdForCompare } from "@/lib/auth/same-user-id";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { ensureMeetingMessengerParticipant } from "@/lib/community-messenger/meeting-chat-sync";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dedupeIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const t = id.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function roleRankForMeeting(m: "host" | "co_host" | "member"): number {
  if (m === "host") return 2;
  if (m === "co_host") return 1;
  return 0;
}

/**
 * `meetings.community_messenger_room_id` 로 엮인 오픈그룹(모임 방)에 대해,
 * `meeting_members` 기준으로 목록에 「모임장 / 회원」 뱃지·부제를 넣는다.
 */
export async function enrichOpenGroupSummariesWithPhilifeMeetingLabels(
  userId: string,
  rooms: CommunityMessengerRoomSummary[]
): Promise<void> {
  const openIds = dedupeIds(rooms.filter((r) => r.roomType === "open_group").map((r) => r.id));
  if (openIds.length === 0) return;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return;
  }

  const chunk = 100;
  const roomToMeeting = new Map<string, { meetingId: string; hostKeySet: Set<string> }>();
  for (let i = 0; i < openIds.length; i += chunk) {
    const slice = openIds.slice(i, i + chunk);
    const { data: meetingRows, error } = await sb
      .from("meetings")
      .select("id, host_user_id, created_by, community_messenger_room_id, post_id")
      .in("community_messenger_room_id", slice);
    if (error) continue;
    for (const row of (meetingRows ?? []) as Array<{
      id?: unknown;
      host_user_id?: unknown;
      created_by?: unknown;
      community_messenger_room_id?: unknown;
    }>) {
      const rid = trimText(row.community_messenger_room_id);
      const mid = trimText(row.id);
      if (!rid || !mid) continue;
      const hostKeySet = new Set<string>();
      for (const k of [row.host_user_id, row.created_by]) {
        const n = normalizeUserIdForCompare(String(k ?? ""));
        if (n) hostKeySet.add(n);
      }
      roomToMeeting.set(rid, { meetingId: mid, hostKeySet });
    }
  }
  if (roomToMeeting.size === 0) return;

  const meetingIds = dedupeIds([...roomToMeeting.values()].map((m) => m.meetingId));
  if (meetingIds.length === 0) return;

  const byMeeting = new Map<string, "host" | "co_host" | "member">();
  for (let i = 0; i < meetingIds.length; i += chunk) {
    const slice = meetingIds.slice(i, i + chunk);
    const { data: mrows } = await sb
      .from("meeting_members")
      .select("meeting_id, role, status, user_id")
      .eq("user_id", userId)
      .in("meeting_id", slice)
      .eq("status", "joined");
    for (const row of (mrows ?? []) as Array<{
      meeting_id?: unknown;
      role?: unknown;
    }>) {
      const mid = trimText(row.meeting_id);
      if (!mid) continue;
      const r = String(row.role ?? "member");
      const normalized: "host" | "co_host" | "member" =
        r === "host" ? "host" : r === "co_host" ? "co_host" : "member";
      const prev = byMeeting.get(mid);
      if (!prev || roleRankForMeeting(normalized) > roleRankForMeeting(prev)) {
        byMeeting.set(mid, normalized);
      }
    }
  }

  const selfKey = normalizeUserIdForCompare(userId);

  for (const s of rooms) {
    if (s.roomType !== "open_group") continue;
    const link = roomToMeeting.get(s.id);
    if (!link) {
      s.philifeMeetingMemberLabel = undefined;
      continue;
    }

    const mm = byMeeting.get(link.meetingId);
    let label: "모임장" | "회원";
    if (mm === "host" || mm === "co_host") {
      label = "모임장";
    } else if (mm) {
      label = "회원";
    } else if (selfKey && link.hostKeySet.has(selfKey)) {
      label = "모임장";
    } else if (selfKey && s.ownerUserId && normalizeUserIdForCompare(s.ownerUserId) === selfKey) {
      label = "모임장";
    } else {
      s.philifeMeetingMemberLabel = undefined;
      continue;
    }

    s.philifeMeetingMemberLabel = label;
    if (!s.subtitle.includes(label)) {
      s.subtitle = s.subtitle.includes("모임")
        ? `${s.subtitle} · ${label}`
        : `모임 · ${label} · ${s.subtitle}`;
    }
  }
}

export type PhilifeMeetingMessengerSyncRole = "owner" | "admin" | "member";

/**
 * `meetings` + `meeting_members` 를 기준으로 `community_messenger_participants` 역할을 맞춘다.
 * 커뮤니티에서만 모임·메신저가 갈리는 케이스를 제거 (단일 idempotent upsert).
 */
export function pickMessengerRoleForPhilifeMeeting(
  userId: string,
  input: { hostUserId: string; createdBy: string; postAuthorId?: string | null; memberRole: "host" | "co_host" | "member" }
): PhilifeMeetingMessengerSyncRole {
  const self = normalizeUserIdForCompare(userId);
  if (!self) return "member";
  const isOrganizer = [input.hostUserId, input.createdBy, input.postAuthorId ?? null].some(
    (id) => normalizeUserIdForCompare(String(id ?? "")) === self
  );
  if (input.memberRole === "host" || isOrganizer) return "owner";
  if (input.memberRole === "co_host") return "admin";
  return "member";
}

export type PhilifeMeetingEnsureForRoomResult =
  | { ok: true; synced: true }
  | { ok: true; skipped: "not_messenger_room" | "not_approved_meeting" | "not_meeting_member" }
  | { ok: false; error: string };

/**
 * 커뮤니티(Philife) 모임·메신저 동기: 승인된 `meeting_members`(또는 개설자 식별)이면
 * `community_messenger_participants` 에 upsert — 목록/방 입장에 **단일** 연결.
 */
export async function ensurePhilifeMeetingMessengerForRoomId(
  userId: string,
  roomId: string
): Promise<PhilifeMeetingEnsureForRoomResult> {
  const rid = roomId?.trim() ?? "";
  const uid = userId?.trim() ?? "";
  if (!rid || !uid) return { ok: true, skipped: "not_approved_meeting" };

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return { ok: false, error: "server_config" };
  }

  const { data: meeting, error: mErr } = await sb
    .from("meetings")
    .select("id, host_user_id, created_by, post_id, community_messenger_room_id, platform_approval_status")
    .eq("community_messenger_room_id", rid)
    .maybeSingle();

  if (mErr || !meeting) {
    return { ok: true, skipped: "not_messenger_room" };
  }
  const m = meeting as {
    id?: string;
    host_user_id?: string | null;
    created_by?: string | null;
    post_id?: string | null;
    community_messenger_room_id?: string | null;
    platform_approval_status?: string | null;
  };
  if (m.platform_approval_status === "pending_approval") {
    return { ok: true, skipped: "not_approved_meeting" };
  }
  const mid = String(m.id ?? "").trim();
  if (!mid) return { ok: true, skipped: "not_messenger_room" };

  let postAuthor: string | null = null;
  if (m.post_id) {
    const { data: p } = await sb.from("community_posts").select("user_id").eq("id", String(m.post_id)).maybeSingle();
    const u = (p as { user_id?: string } | null)?.user_id;
    if (u) postAuthor = String(u);
  }

  const { data: mm } = await sb
    .from("meeting_members")
    .select("role, status, user_id")
    .eq("meeting_id", mid)
    .eq("user_id", uid)
    .eq("status", "joined")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const selfKey = normalizeUserIdForCompare(uid);
  const isOrganizer =
    (selfKey && m.host_user_id && normalizeUserIdForCompare(m.host_user_id) === selfKey) ||
    (selfKey && m.created_by && normalizeUserIdForCompare(m.created_by) === selfKey) ||
    (selfKey && postAuthor && normalizeUserIdForCompare(postAuthor) === selfKey);

  if (!mm) {
    if (isOrganizer) {
      await ensureMeetingMessengerParticipant({
        roomId: rid,
        userId: uid,
        role: "owner",
      });
      return { ok: true, synced: true };
    }
    return { ok: true, skipped: "not_meeting_member" };
  }

  const mr = (mm as { role?: string }).role;
  const memberRole: "host" | "co_host" | "member" =
    mr === "host" ? "host" : mr === "co_host" ? "co_host" : "member";

  const r = pickMessengerRoleForPhilifeMeeting(uid, {
    hostUserId: String(m.host_user_id ?? ""),
    createdBy: String(m.created_by ?? ""),
    postAuthorId: postAuthor,
    memberRole: isOrganizer && memberRole === "member" ? "host" : memberRole,
  });
  await ensureMeetingMessengerParticipant({ roomId: rid, userId: uid, role: r });
  return { ok: true, synced: true };
}
