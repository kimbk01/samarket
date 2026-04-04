import { NextResponse } from "next/server";
import { normalizeUserIdForCompare } from "@/lib/auth/same-user-id";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isMeetingJoinable } from "@/lib/community-engine/visibility";
import { verifyMeetingPassword } from "@/lib/neighborhood/meeting-password";
import { getNeighborhoodDevSampleMeeting } from "@/lib/neighborhood/dev-sample-data";
import { ensureAndGetDefaultMeetingOpenChatRoomId } from "@/lib/meeting-open-chat/rooms-service";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";

interface Ctx {
  params: Promise<{ meetingId: string }>;
}

export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  if (process.env.NODE_ENV !== "production") {
    const meeting = getNeighborhoodDevSampleMeeting(id);
    type SampleMember = { user_id: string; label: string; role: "host" | "member"; status: string };
    const state = (globalThis as {
      __samarketNeighborhoodDevSampleState?: {
        meetingMembers?: Map<string, SampleMember[]>;
      };
    }).__samarketNeighborhoodDevSampleState;
    if (meeting && state?.meetingMembers) {
      if (meeting.status !== "open" || meeting.is_closed) {
        return NextResponse.json({ ok: false, error: "closed" }, { status: 400 });
      }
      const members: SampleMember[] = state.meetingMembers.get(id) ?? [];
      const joined = members.filter((m) => m.status === "joined");
      if (joined.length >= meeting.max_members) {
        return NextResponse.json({ ok: false, error: "full" }, { status: 400 });
      }
      const existing = members.find((m) => m.user_id === auth.userId);
      if (existing?.status === "joined") {
        return NextResponse.json({
          ok: true,
          already: true,
          chatRoomId: null,
          fallback: "dev_samples",
        });
      }
      if (existing?.status === "pending") {
        return NextResponse.json({
          ok: true,
          pending: true,
          alreadyPending: true,
          chatRoomId: null,
          fallback: "dev_samples",
        });
      }
      // 승인제이면 pending, 아니면 바로 joined
      const needsApproval =
        meeting.entry_policy === "approve" ||
        meeting.entry_policy === "invite_only" ||
        meeting.requires_approval === true;
      const newStatus = needsApproval ? "pending" : "joined";
      if (existing) {
        existing.status = newStatus;
      } else {
        members.push({ user_id: auth.userId, label: auth.userId.slice(0, 8), role: "member", status: newStatus });
      }
      state.meetingMembers.set(id, members);
      if (needsApproval) {
        return NextResponse.json({ ok: true, pending: true, fallback: "dev_samples" });
      }
      return NextResponse.json({ ok: true, chatRoomId: null, fallback: "dev_samples" });
    }
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const attachOpenChat = async (payload: Record<string, unknown>) => {
    const oc = await ensureAndGetDefaultMeetingOpenChatRoomId(sb, id);
    return NextResponse.json({ ...payload, meetingOpenChatRoomId: oc.ok ? oc.roomId : null });
  };

  const { data: m, error: qErr } = await sb
    .from("meetings")
    .select(
      "id, title, is_closed, max_members, post_id, status, entry_policy, requires_approval, password_hash, host_user_id, created_by"
    )
    .eq("id", id)
    .maybeSingle();
  const meeting = m as {
    id?: string;
    title?: string;
    is_closed?: boolean;
    max_members?: number;
    post_id?: string;
    status?: string;
    entry_policy?: string | null;
    requires_approval?: boolean | null;
    password_hash?: string | null;
    host_user_id?: string | null;
    created_by?: string | null;
  } | null;
  if (qErr || !meeting?.id) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!isMeetingJoinable({ status: meeting.status, is_closed: meeting.is_closed })) {
    return NextResponse.json({ ok: false, error: "closed" }, { status: 400 });
  }

  const { count } = await sb
    .from("meeting_members")
    .select("id", { count: "exact", head: true })
    .eq("meeting_id", id)
    .eq("status", "joined");

  const joined = count ?? 0;

  const { data: existing } = await sb
    .from("meeting_members")
    .select("id, status, status_reason, approved_at, approved_by, role, created_at")
    .eq("meeting_id", id)
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ex = existing as {
    id?: string;
    status?: string;
    status_reason?: string | null;
    approved_at?: string | null;
    approved_by?: string | null;
    role?: string | null;
  } | null;

  const entryPolicy = String(meeting.entry_policy ?? "open").trim() || "open";
  const needsApproval =
    meeting.requires_approval === true || entryPolicy === "approve" || entryPolicy === "invite_only";

  /** meetings 행과 글 작성자가 어긋난 경우·UUID 대소문자 차이까지 모임장으로 인정 */
  const organizerIds = new Set<string>();
  for (const raw of [meeting.host_user_id, meeting.created_by]) {
    const n = normalizeUserIdForCompare(raw);
    if (n) organizerIds.add(n);
  }
  if (meeting.post_id) {
    const { data: postAuthor } = await sb
      .from("community_posts")
      .select("user_id")
      .eq("id", String(meeting.post_id))
      .maybeSingle();
    const n = normalizeUserIdForCompare((postAuthor as { user_id?: string } | null)?.user_id);
    if (n) organizerIds.add(n);
  }
  const authNorm = normalizeUserIdForCompare(auth.userId);
  const isHostUser = authNorm.length > 0 && organizerIds.has(authNorm);

  /**
   * 개설자는 정원·kicked/banned 막힘보다 먼저 복귀.
   * (DB에 kicked로 박힌 개설자 행이 있으면 기존 순서에서는 403만 나가던 문제)
   */
  const hostMustReinstate =
    isHostUser &&
    (!ex?.id ||
      ex.status === "left" ||
      ex.status === "pending" ||
      ex.status === "rejected" ||
      ex.status === "kicked" ||
      ex.status === "banned");

  if (!hostMustReinstate && joined >= Number(meeting.max_members ?? 0)) {
    return NextResponse.json({ ok: false, error: "full" }, { status: 400 });
  }

  if (hostMustReinstate) {
    const now = new Date().toISOString();
    if (ex?.id) {
      const { error: upErr } = await sb
        .from("meeting_members")
        .update({
          status: "joined",
          role: "host",
          approved_at: ex.approved_at ?? now,
          approved_by: auth.userId,
          status_reason: null,
        })
        .eq("id", ex.id);
      if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    } else {
      const { error: insErr } = await sb.from("meeting_members").insert({
        meeting_id: id,
        user_id: auth.userId,
        status: "joined",
        role: "host",
        approved_at: now,
        approved_by: auth.userId,
      });
      if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }
    return await attachOpenChat({ ok: true, chatRoomId: null, hostRejoined: true });
  }

  if (ex?.status === "kicked" || ex?.status === "banned") {
    return NextResponse.json({ ok: false, error: "meeting_banned" }, { status: 403 });
  }

  if (ex?.status === "joined") {
    return await attachOpenChat({ ok: true, already: true, chatRoomId: null });
  }

  const canSilentMemberRejoin =
    !isHostUser &&
    ex?.status === "left" &&
    ex.approved_at != null &&
    (ex.role === "member" || ex.role === "co_host");

  if (canSilentMemberRejoin && ex?.id) {
    const now = new Date().toISOString();
    const { error: upErr } = await sb
      .from("meeting_members")
      .update({
        status: "joined",
        approved_at: ex.approved_at ?? now,
        status_reason: "rejoined",
      })
      .eq("id", ex.id);
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    return await attachOpenChat({ ok: true, chatRoomId: null, rejoined: true });
  }

  if (ex?.status === "pending") {
    if (entryPolicy === "invite_only" && ex.status_reason === "host_invited") {
      const { data: hostRow } = await sb.from("meetings").select("host_user_id, created_by").eq("id", id).maybeSingle();
      const hostId = String(
        (hostRow as { host_user_id?: string | null; created_by?: string | null } | null)?.host_user_id ??
          (hostRow as { host_user_id?: string | null; created_by?: string | null } | null)?.created_by ??
          ""
      ).trim();
      const now = new Date().toISOString();
      const { error: upErr } = await sb
        .from("meeting_members")
        .update({
          status: "joined",
          approved_at: now,
          approved_by: hostId || auth.userId,
          status_reason: "invite_accepted",
        })
        .eq("id", ex.id);
      if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

      return await attachOpenChat({ ok: true, invited: true, chatRoomId: null });
    }
    return NextResponse.json({ ok: true, pending: true, alreadyPending: true, chatRoomId: null });
  }

  /** invite_only 도 승인제와 동일하게 신청서·대기 멤버로 처리 (초대 링크는 동일 화면 유도용) */
  let joinBody: { password?: string; message?: string } = {};
  try {
    joinBody = (await req.json()) as { password?: string; message?: string };
  } catch {
    joinBody = {};
  }

  if (entryPolicy === "password") {
    const password = String(joinBody.password ?? "");
    if (!verifyMeetingPassword(password, meeting.password_hash)) {
      return NextResponse.json({ ok: false, error: "invalid_password" }, { status: 400 });
    }
  }

  const requestMessage = String(joinBody.message ?? "")
    .trim()
    .slice(0, 2000);

  if (needsApproval) {
    if (ex?.id) {
      const { error: upErr } = await sb
        .from("meeting_members")
        .update({ status: "pending", requested_at: new Date().toISOString(), status_reason: null })
        .eq("id", ex.id);
      if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    } else {
      const { error: insErr } = await sb.from("meeting_members").insert({
        meeting_id: id,
        user_id: auth.userId,
        status: "pending",
        role: "member",
      });
      if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }

    const { data: existingRequest } = await sb
      .from("meeting_join_requests")
      .select("id")
      .eq("meeting_id", id)
      .eq("user_id", auth.userId)
      .eq("status", "pending")
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const reqRow = existingRequest as { id?: string } | null;
    const nowIso = new Date().toISOString();
    if (reqRow?.id) {
      const { error: reqUpErr } = await sb
        .from("meeting_join_requests")
        .update({ request_message: requestMessage, requested_at: nowIso })
        .eq("id", reqRow.id);
      if (reqUpErr) {
        return NextResponse.json({ ok: false, error: reqUpErr.message }, { status: 500 });
      }
    } else {
      const { error: reqInsErr } = await sb.from("meeting_join_requests").insert({
        meeting_id: id,
        user_id: auth.userId,
        status: "pending",
        request_message: requestMessage,
        requested_at: nowIso,
      });
      if (reqInsErr) {
        return NextResponse.json({ ok: false, error: reqInsErr.message }, { status: 500 });
      }
    }

    /** 운영자 UUID 집합 중 신청자 제외 — host_user_id 만 비어 있어도 글 작성자에게 알림 */
    let hostNotify = "";
    for (const oid of organizerIds) {
      if (oid && oid !== authNorm) {
        hostNotify = oid;
        break;
      }
    }
    if (!hostNotify) {
      const fb = normalizeUserIdForCompare(meeting.host_user_id ?? meeting.created_by);
      if (fb && fb !== authNorm) hostNotify = fb;
    }
    if (hostNotify) {
      void appendUserNotification(sb, {
        user_id: hostNotify,
        notification_type: "status",
        title: `${String(meeting.title ?? "모임")} 가입 요청`,
        body: requestMessage
          ? requestMessage.length > 180
            ? `${requestMessage.slice(0, 180)}…`
            : requestMessage
          : "새 가입 신청이 있습니다. 멤버 탭에서 확인해 주세요.",
        link_url: `/philife/meetings/${id}?tab=members`,
      });
    }

    return NextResponse.json({ ok: true, pending: true, chatRoomId: null });
  }

  if (ex?.id) {
    const { error: upErr } = await sb
      .from("meeting_members")
      .update({ status: "joined", approved_at: new Date().toISOString(), approved_by: auth.userId, status_reason: null })
      .eq("id", ex.id);
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  } else {
    const { error: insErr } = await sb.from("meeting_members").insert({
      meeting_id: id,
      user_id: auth.userId,
      status: "joined",
      role: "member",
      approved_at: new Date().toISOString(),
      approved_by: auth.userId,
    });
    if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  return await attachOpenChat({ ok: true, chatRoomId: null });
}
